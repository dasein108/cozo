use std::fmt::{Debug, Formatter};
use std::sync::atomic::Ordering;

use miette::{bail, miette, IntoDiagnostic, Result};
use rmp_serde::Serializer;
use serde::Serialize;
use smartstring::SmartString;

use cozorocks::CfHandle::Snd;
use cozorocks::DbIter;

use crate::data::symb::Symbol;
use crate::data::tuple::{EncodedTuple, Tuple};
use crate::data::value::DataValue;
use crate::runtime::transact::SessionTx;
use crate::utils::swap_option_result;

#[derive(
    Copy,
    Clone,
    Eq,
    PartialEq,
    Debug,
    serde_derive::Serialize,
    serde_derive::Deserialize,
    PartialOrd,
    Ord,
)]
pub(crate) struct RelationId(pub(crate) u64);

impl RelationId {
    pub(crate) fn new(u: u64) -> Result<Self> {
        if u > 2u64.pow(6 * 8) {
            bail!("StoredRelId overflow: {}", u)
        } else {
            Ok(Self(u))
        }
    }
    pub(crate) fn next(&self) -> Result<Self> {
        Self::new(self.0 + 1)
    }
    pub(crate) const SYSTEM: Self = Self(0);
    pub(crate) fn raw_encode(&self) -> [u8; 8] {
        self.0.to_be_bytes()
    }
    pub(crate) fn raw_decode(src: &[u8]) -> Result<Self> {
        if src.len() < 8 {
            bail!("cannot decode bytes as StoredRelId: {:x?}", src)
        } else {
            let u = u64::from_be_bytes([
                src[0], src[1], src[2], src[3], src[4], src[5], src[6], src[7],
            ]);
            Self::new(u)
        }
    }
}

#[derive(Clone, Eq, PartialEq, serde_derive::Serialize, serde_derive::Deserialize)]
pub(crate) struct RelationMetadata {
    pub(crate) name: Symbol,
    pub(crate) id: RelationId,
    pub(crate) arity: usize,
}

impl Debug for RelationMetadata {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "Relation<{}>", self.name)
    }
}

impl RelationMetadata {
    pub(crate) fn scan_all(&self, tx: &SessionTx) -> Result<impl Iterator<Item = Result<Tuple>>> {
        let lower = Tuple::default().encode_as_key(self.id);
        let upper = Tuple::default().encode_as_key(self.id.next()?);
        Ok(RelationIterator::new(tx, &lower, &upper))
    }

    pub(crate) fn scan_prefix(
        &self,
        tx: &SessionTx,
        prefix: &Tuple,
    ) -> impl Iterator<Item = Result<Tuple>> {
        let mut upper = prefix.0.clone();
        upper.push(DataValue::Bot);
        let prefix_encoded = prefix.encode_as_key(self.id);
        let upper_encoded = Tuple(upper).encode_as_key(self.id);
        RelationIterator::new(tx, &prefix_encoded, &upper_encoded)
    }
    pub(crate) fn scan_bounded_prefix(
        &self,
        tx: &SessionTx,
        prefix: &Tuple,
        lower: &[DataValue],
        upper: &[DataValue],
    ) -> impl Iterator<Item = Result<Tuple>> {
        let mut lower_t = prefix.clone();
        lower_t.0.extend_from_slice(lower);
        let mut upper_t = prefix.clone();
        upper_t.0.extend_from_slice(upper);
        upper_t.0.push(DataValue::Bot);
        let lower_encoded = lower_t.encode_as_key(self.id);
        let upper_encoded = upper_t.encode_as_key(self.id);
        RelationIterator::new(tx, &lower_encoded, &upper_encoded)
    }
}

struct RelationIterator {
    inner: DbIter,
    started: bool,
}

impl RelationIterator {
    fn new(sess: &SessionTx, lower: &[u8], upper: &[u8]) -> Self {
        let mut inner = sess.tx.iterator(Snd).upper_bound(upper).start();
        inner.seek(lower);
        Self {
            inner,
            started: false,
        }
    }
    fn next_inner(&mut self) -> Result<Option<Tuple>> {
        if self.started {
            self.inner.next()
        } else {
            self.started = true;
        }
        Ok(match self.inner.key()? {
            None => None,
            Some(k_slice) => Some(EncodedTuple(k_slice).decode()?),
        })
    }
}

impl Iterator for RelationIterator {
    type Item = Result<Tuple>;
    fn next(&mut self) -> Option<Self::Item> {
        swap_option_result(self.next_inner())
    }
}

impl SessionTx {
    pub(crate) fn relation_exists(&self, name: &Symbol) -> Result<bool> {
        let key = DataValue::Str(name.name.clone());
        let encoded = Tuple(vec![key]).encode_as_key(RelationId::SYSTEM);
        Ok(self.tx.exists(&encoded, false, Snd)?)
    }
    pub(crate) fn create_relation(
        &mut self,
        mut meta: RelationMetadata,
    ) -> Result<RelationMetadata> {
        let key = DataValue::Str(meta.name.name.clone());
        let encoded = Tuple(vec![key]).encode_as_key(RelationId::SYSTEM);

        if self.tx.exists(&encoded, true, Snd)? {
            bail!(
                "cannot create relation {}: one with the same name already exists",
                meta.name
            )
        };
        let last_id = self.relation_store_id.fetch_add(1, Ordering::SeqCst);
        meta.id = RelationId::new(last_id + 1)?;
        self.tx.put(&encoded, &meta.id.raw_encode(), Snd)?;
        let name_key =
            Tuple(vec![DataValue::Str(meta.name.name.clone())]).encode_as_key(RelationId::SYSTEM);

        let mut meta_val = vec![];
        meta.serialize(&mut Serializer::new(&mut meta_val)).unwrap();
        self.tx.put(&name_key, &meta_val, Snd)?;

        let tuple = Tuple(vec![DataValue::Null]);
        let t_encoded = tuple.encode_as_key(RelationId::SYSTEM);
        self.tx.put(&t_encoded, &meta.id.raw_encode(), Snd)?;
        Ok(meta)
    }
    pub(crate) fn get_relation(&self, name: &str) -> Result<RelationMetadata> {
        let key = DataValue::Str(SmartString::from(name));
        let encoded = Tuple(vec![key]).encode_as_key(RelationId::SYSTEM);

        let found = self
            .tx
            .get(&encoded, true, Snd)?
            .ok_or_else(|| miette!("cannot find stored relation {}", name))?;
        let metadata: RelationMetadata = rmp_serde::from_slice(&found).into_diagnostic()?;
        Ok(metadata)
    }
    pub(crate) fn destroy_relation(&mut self, name: &str) -> Result<(Vec<u8>, Vec<u8>)> {
        let store = self.get_relation(name)?;
        let key = DataValue::Str(SmartString::from(name));
        let encoded = Tuple(vec![key]).encode_as_key(RelationId::SYSTEM);
        self.tx.del(&encoded, Snd)?;
        let lower_bound = Tuple::default().encode_as_key(store.id);
        let upper_bound = Tuple::default().encode_as_key(store.id.next()?);
        Ok((lower_bound, upper_bound))
    }
}