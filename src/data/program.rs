use std::collections::btree_map::Entry;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{Debug, Formatter};

use anyhow::{anyhow, bail, ensure, Result};
use itertools::Itertools;
use smallvec::SmallVec;

use crate::algo::AlgoHandle;
use crate::data::aggr::Aggregation;
use crate::data::attr::Attribute;
use crate::data::expr::Expr;
use crate::data::id::{EntityId, Validity};
use crate::data::symb::{Symbol, PROG_ENTRY};
use crate::data::value::DataValue;

#[derive(Default)]
pub(crate) struct TempSymbGen {
    last_id: u32,
}

impl TempSymbGen {
    pub(crate) fn next(&mut self) -> Symbol {
        self.last_id += 1;
        Symbol::from(&format!("*{}", self.last_id) as &str)
    }
}

#[derive(Debug, Clone)]
pub(crate) enum InputRulesOrAlgo {
    Rules(Vec<InputRule>),
    Algo(AlgoApply),
}

#[derive(Clone)]
pub(crate) struct AlgoApply {
    pub(crate) algo: AlgoHandle,
    pub(crate) rule_args: Vec<AlgoRuleArg>,
    pub(crate) options: BTreeMap<Symbol, Expr>,
}

impl Debug for AlgoApply {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AlgoApply")
            .field("algo", &self.algo.name)
            .field("rules", &self.rule_args)
            .field("options", &self.options)
            .finish()
    }
}

#[derive(Clone)]
pub(crate) struct MagicAlgoApply {
    pub(crate) algo: AlgoHandle,
    pub(crate) rule_args: Vec<MagicAlgoRuleArg>,
    pub(crate) options: BTreeMap<Symbol, Expr>,
}

impl Debug for MagicAlgoApply {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AlgoApply")
            .field("algo", &self.algo.name)
            .field("rules", &self.rule_args)
            .field("options", &self.options)
            .finish()
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub(crate) enum TripleDir {
    Fwd,
    Bwd,
}

#[derive(Debug, Clone)]
pub(crate) enum AlgoRuleArg {
    InMem(Symbol, Vec<Symbol>),
    Stored(Symbol, Vec<Symbol>),
    Triple(Attribute, Vec<Symbol>, TripleDir),
}

#[derive(Debug, Clone)]
pub(crate) enum MagicAlgoRuleArg {
    InMem(MagicSymbol, Vec<Symbol>),
    Stored(Symbol, Vec<Symbol>),
    Triple(Attribute, Vec<Symbol>, TripleDir),
}

impl MagicAlgoRuleArg {
    pub(crate) fn get_binding_map(&self) -> BTreeMap<Symbol, usize> {
        let bindings = match self {
            MagicAlgoRuleArg::InMem(_, b) => b,
            MagicAlgoRuleArg::Stored(_, b) => b,
            MagicAlgoRuleArg::Triple(_, b, dir) => {
                if *dir == TripleDir::Bwd {
                    return b
                        .iter()
                        .rev()
                        .enumerate()
                        .map(|(idx, symb)| (symb.clone(), idx))
                        .collect();
                } else {
                    b
                }
            }
        };
        bindings
            .iter()
            .enumerate()
            .map(|(idx, symb)| (symb.clone(), idx))
            .collect()
    }
}

#[derive(Debug, Clone)]
pub(crate) struct InputProgram {
    pub(crate) prog: BTreeMap<Symbol, InputRulesOrAlgo>,
}

impl InputProgram {
    pub(crate) fn validate_entry(&self) -> Result<()> {
        match self
            .prog
            .get(&PROG_ENTRY)
            .ok_or_else(|| anyhow!("program entry point not found"))?
        {
            InputRulesOrAlgo::Rules(r) => {
                ensure!(
                    r.iter().map(|e| &e.head).all_equal(),
                    "program entry point must have equal bindings"
                );
            }
            InputRulesOrAlgo::Algo(_) => {}
        }
        Ok(())
    }
    pub(crate) fn get_entry_arity(&self) -> Result<usize> {
        Ok(
            match self
                .prog
                .get(&PROG_ENTRY)
                .ok_or_else(|| anyhow!("program entry point not found"))?
            {
                InputRulesOrAlgo::Rules(rules) => rules[0].head.len(),
                InputRulesOrAlgo::Algo(algo_apply) => algo_apply.algo.arity()?,
            },
        )
    }
    pub(crate) fn get_entry_head(&self) -> Result<&[Symbol]> {
        match self
            .prog
            .get(&PROG_ENTRY)
            .ok_or_else(|| anyhow!("program entry point not found"))?
        {
            InputRulesOrAlgo::Rules(rules) => Ok(&rules.last().unwrap().head),
            InputRulesOrAlgo::Algo(_) => {
                bail!("algo application does not have named entry head")
            }
        }
    }
    pub(crate) fn to_normalized_program(&self) -> Result<NormalFormProgram> {
        let mut prog: BTreeMap<Symbol, _> = Default::default();
        for (k, rules_or_algo) in &self.prog {
            match rules_or_algo {
                InputRulesOrAlgo::Rules(rules) => {
                    let mut collected_rules = vec![];
                    for rule in rules {
                        let mut counter = -1;
                        let mut gen_symb = || {
                            counter += 1;
                            Symbol::from(&format!("***{}", counter) as &str)
                        };
                        let normalized_body =
                            InputAtom::Conjunction(rule.body.clone()).disjunctive_normal_form()?;
                        let mut new_head = Vec::with_capacity(rule.head.len());
                        let mut seen: BTreeMap<&Symbol, Vec<Symbol>> = BTreeMap::default();
                        for symb in rule.head.iter() {
                            match seen.entry(symb) {
                                Entry::Vacant(e) => {
                                    e.insert(vec![]);
                                    new_head.push(symb.clone());
                                }
                                Entry::Occupied(mut e) => {
                                    let new_symb = gen_symb();
                                    e.get_mut().push(new_symb.clone());
                                    new_head.push(new_symb);
                                }
                            }
                        }
                        for conj in normalized_body.0 {
                            let mut body = conj.0;
                            for (old_symb, new_symbs) in seen.iter() {
                                for new_symb in new_symbs.iter() {
                                    body.push(NormalFormAtom::Unification(Unification {
                                        binding: new_symb.clone(),
                                        expr: Expr::Binding((*old_symb).clone(), None),
                                        one_many_unif: false,
                                    }))
                                }
                            }
                            let normalized_rule = NormalFormRule {
                                head: new_head.clone(),
                                aggr: rule.aggr.clone(),
                                body,
                                vld: rule.vld,
                            };
                            collected_rules.push(normalized_rule.convert_to_well_ordered_rule()?);
                        }
                    }
                    prog.insert(k.clone(), NormalFormAlgoOrRules::Rules(collected_rules));
                }
                InputRulesOrAlgo::Algo(algo_apply) => {
                    prog.insert(k.clone(), NormalFormAlgoOrRules::Algo(algo_apply.clone()));
                }
            }
        }
        Ok(NormalFormProgram { prog })
    }
}

#[derive(Debug, Clone)]
pub(crate) struct StratifiedNormalFormProgram(pub(crate) Vec<NormalFormProgram>);

#[derive(Debug, Clone)]
pub(crate) enum NormalFormAlgoOrRules {
    Rules(Vec<NormalFormRule>),
    Algo(AlgoApply),
}

impl NormalFormAlgoOrRules {
    pub(crate) fn rules(&self) -> Option<&[NormalFormRule]> {
        match self {
            NormalFormAlgoOrRules::Rules(r) => Some(r),
            NormalFormAlgoOrRules::Algo(_) => None,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct NormalFormProgram {
    pub(crate) prog: BTreeMap<Symbol, NormalFormAlgoOrRules>,
}

#[derive(Debug, Clone)]
pub(crate) struct StratifiedMagicProgram(pub(crate) Vec<MagicProgram>);

#[derive(Debug, Clone)]
pub(crate) enum MagicRulesOrAlgo {
    Rules(Vec<MagicRule>),
    Algo(MagicAlgoApply),
}

impl Default for MagicRulesOrAlgo {
    fn default() -> Self {
        Self::Rules(vec![])
    }
}

impl MagicRulesOrAlgo {
    pub(crate) fn arity(&self) -> Result<usize> {
        Ok(match self {
            MagicRulesOrAlgo::Rules(r) => r.first().unwrap().head.len(),
            MagicRulesOrAlgo::Algo(algo) => algo.algo.arity()?,
        })
    }
    pub(crate) fn mut_rules(&mut self) -> Option<&mut Vec<MagicRule>> {
        match self {
            MagicRulesOrAlgo::Rules(r) => Some(r),
            MagicRulesOrAlgo::Algo(_) => None,
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct MagicProgram {
    pub(crate) prog: BTreeMap<MagicSymbol, MagicRulesOrAlgo>,
}

#[derive(Clone, Ord, PartialOrd, Eq, PartialEq)]
pub(crate) enum MagicSymbol {
    Muggle {
        inner: Symbol,
    },
    Magic {
        inner: Symbol,
        adornment: SmallVec<[bool; 8]>,
    },
    Input {
        inner: Symbol,
        adornment: SmallVec<[bool; 8]>,
    },
    Sup {
        inner: Symbol,
        adornment: SmallVec<[bool; 8]>,
        rule_idx: u16,
        sup_idx: u16,
    },
}

impl Debug for MagicSymbol {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            MagicSymbol::Muggle { inner } => write!(f, "{}", inner.0),
            MagicSymbol::Magic { inner, adornment } => {
                write!(f, "{}|M", inner.0)?;
                for b in adornment {
                    if *b {
                        write!(f, "b")?
                    } else {
                        write!(f, "f")?
                    }
                }
                Ok(())
            }
            MagicSymbol::Input { inner, adornment } => {
                write!(f, "{}|I", inner.0)?;
                for b in adornment {
                    if *b {
                        write!(f, "b")?
                    } else {
                        write!(f, "f")?
                    }
                }
                Ok(())
            }
            MagicSymbol::Sup {
                inner,
                adornment,
                rule_idx,
                sup_idx,
            } => {
                write!(f, "{}|S.{}.{}", inner.0, rule_idx, sup_idx)?;
                for b in adornment {
                    if *b {
                        write!(f, "b")?
                    } else {
                        write!(f, "f")?
                    }
                }
                Ok(())
            }
        }
    }
}

impl MagicSymbol {
    pub(crate) fn as_plain_symbol(&self) -> &Symbol {
        match self {
            MagicSymbol::Muggle { inner, .. }
            | MagicSymbol::Magic { inner, .. }
            | MagicSymbol::Input { inner, .. }
            | MagicSymbol::Sup { inner, .. } => inner,
        }
    }
    pub(crate) fn magic_adornment(&self) -> &[bool] {
        match self {
            MagicSymbol::Muggle { .. } => &[],
            MagicSymbol::Magic { adornment, .. }
            | MagicSymbol::Input { adornment, .. }
            | MagicSymbol::Sup { adornment, .. } => adornment,
        }
    }
    pub(crate) fn has_bound_adornment(&self) -> bool {
        self.magic_adornment().iter().any(|b| *b)
    }
    pub(crate) fn is_prog_entry(&self) -> bool {
        if let MagicSymbol::Muggle { inner } = self {
            inner.is_prog_entry()
        } else {
            false
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct InputRule {
    pub(crate) head: Vec<Symbol>,
    pub(crate) aggr: Vec<Option<(Aggregation, Vec<DataValue>)>>,
    pub(crate) body: Vec<InputAtom>,
    pub(crate) vld: Validity,
}

#[derive(Debug, Clone)]
pub(crate) struct NormalFormRule {
    pub(crate) head: Vec<Symbol>,
    pub(crate) aggr: Vec<Option<(Aggregation, Vec<DataValue>)>>,
    pub(crate) body: Vec<NormalFormAtom>,
    pub(crate) vld: Validity,
}

#[derive(Debug, Clone)]
pub(crate) struct MagicRule {
    pub(crate) head: Vec<Symbol>,
    pub(crate) aggr: Vec<Option<(Aggregation, Vec<DataValue>)>>,
    pub(crate) body: Vec<MagicAtom>,
    pub(crate) vld: Validity,
}

impl MagicRule {
    pub(crate) fn contained_rules(&self) -> BTreeSet<MagicSymbol> {
        let mut coll = BTreeSet::new();
        for atom in self.body.iter() {
            match atom {
                MagicAtom::Rule(rule) | MagicAtom::NegatedRule(rule) => {
                    coll.insert(rule.name.clone());
                }
                _ => {}
            }
        }
        coll
    }
}

#[derive(Debug, Clone)]
pub(crate) enum InputAtom {
    AttrTriple(InputAttrTripleAtom),
    Rule(InputRuleApplyAtom),
    View(InputViewApplyAtom),
    Predicate(Expr),
    Negation(Box<InputAtom>),
    Conjunction(Vec<InputAtom>),
    Disjunction(Vec<InputAtom>),
    Unification(Unification),
}

#[derive(Debug, Clone)]
pub(crate) enum NormalFormAtom {
    AttrTriple(NormalFormAttrTripleAtom),
    Rule(NormalFormRuleApplyAtom),
    View(NormalFormViewApplyAtom),
    NegatedAttrTriple(NormalFormAttrTripleAtom),
    NegatedRule(NormalFormRuleApplyAtom),
    NegatedView(NormalFormViewApplyAtom),
    Predicate(Expr),
    Unification(Unification),
}

#[derive(Debug, Clone)]
pub(crate) enum MagicAtom {
    AttrTriple(MagicAttrTripleAtom),
    Rule(MagicRuleApplyAtom),
    View(MagicViewApplyAtom),
    Predicate(Expr),
    NegatedAttrTriple(MagicAttrTripleAtom),
    NegatedRule(MagicRuleApplyAtom),
    NegatedView(MagicViewApplyAtom),
    Unification(Unification),
}

#[derive(Clone, Debug)]
pub(crate) struct InputAttrTripleAtom {
    pub(crate) attr: Attribute,
    pub(crate) entity: InputTerm<EntityId>,
    pub(crate) value: InputTerm<DataValue>,
}

#[derive(Debug, Clone)]
pub(crate) struct NormalFormAttrTripleAtom {
    pub(crate) attr: Attribute,
    pub(crate) entity: Symbol,
    pub(crate) value: Symbol,
}

#[derive(Debug, Clone)]
pub(crate) struct MagicAttrTripleAtom {
    pub(crate) attr: Attribute,
    pub(crate) entity: Symbol,
    pub(crate) value: Symbol,
}

#[derive(Clone, Debug)]
pub(crate) struct InputRuleApplyAtom {
    pub(crate) name: Symbol,
    pub(crate) args: Vec<InputTerm<DataValue>>,
}

#[derive(Clone, Debug)]
pub(crate) struct InputViewApplyAtom {
    pub(crate) name: Symbol,
    pub(crate) args: Vec<InputTerm<DataValue>>,
}

#[derive(Clone, Debug)]
pub(crate) struct NormalFormRuleApplyAtom {
    pub(crate) name: Symbol,
    pub(crate) args: Vec<Symbol>,
}

#[derive(Clone, Debug)]
pub(crate) struct NormalFormViewApplyAtom {
    pub(crate) name: Symbol,
    pub(crate) args: Vec<Symbol>,
}

#[derive(Clone, Debug)]
pub(crate) struct MagicRuleApplyAtom {
    pub(crate) name: MagicSymbol,
    pub(crate) args: Vec<Symbol>,
}

#[derive(Clone, Debug)]
pub(crate) struct MagicViewApplyAtom {
    pub(crate) name: Symbol,
    pub(crate) args: Vec<Symbol>,
}

#[derive(Clone, Debug)]
pub(crate) enum InputTerm<T> {
    Var(Symbol),
    Const(T),
}

#[derive(Clone, Debug)]
pub(crate) struct Unification {
    pub(crate) binding: Symbol,
    pub(crate) expr: Expr,
    pub(crate) one_many_unif: bool,
}

impl Unification {
    pub(crate) fn is_const(&self) -> bool {
        matches!(self.expr, Expr::Const(_))
    }
    pub(crate) fn bindings_in_expr(&self) -> BTreeSet<Symbol> {
        self.expr.bindings()
    }
}
