/*
 * Copyright 2022, The Cozo Project Authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/.
 */

use wasm_bindgen::prelude::*;

use cozo::*;
use js_sys::{Uint8Array, Array};

mod utils;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;
use std::collections::BTreeMap;
use wasm_bindgen_futures::JsFuture;
// use cozo::storage::mem::new_cozo_indexed_db;

// use indexed_db_futures::prelude::*;
// use indexed_db_futures::web_sys::DomException;


#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    pub fn log(s: &str);
}

// Next let's define a macro that's like `println!`, only it works for
// `console.log`. Note that `println!` doesn't actually work on the wasm target
// because the standard library currently just eats all output. To get
// `println!`-like behavior in your app you'll likely want a macro like this.
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen]
pub struct CozoDb {
    db: DbInstance,
}

#[wasm_bindgen(raw_module = "./indexeddb.js")]
extern "C" {
    fn loadAllFromIndexedDb(db_name: &str, db_value: &str) -> js_sys::Promise;
    fn waitForPendingWrites() -> js_sys::Promise;
}

fn array_to_vec_of_vecs(arr: Array) -> Vec<Vec<u8>> {
    let mut result = Vec::new();

    for i in 0..arr.length() {
        if let Ok(uint8_array) = arr.get(i).dyn_into::<Uint8Array>() {
            result.push(uint8_array.to_vec());
        } else {
            panic!("Failed to convert Uint8Array to Vec<u8>")
        }
    }

    result
}

#[wasm_bindgen]
impl CozoDb {
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        utils::set_panic_hook();
        let db = DbInstance::new("mem", "", "").unwrap();
        Self { db }
    }

    pub async fn wait_for_indexed_db_writes() -> Result<(), JsValue> {
        JsFuture::from(waitForPendingWrites()).await?;
        Ok(())
    }

    /// Create CozoDb from IndexedDB
    pub async fn new_from_indexed_db(db_name: &str, store_name: &str) -> Result<CozoDb, JsValue> {
        utils::set_panic_hook();
        log("starting new_from_indexed_db...Xzzxzzxzx");

        let result = JsFuture::from(loadAllFromIndexedDb(db_name, store_name)).await?;

        match result.dyn_into::<js_sys::Array>() {
            Ok(array) => {
                let keys = array_to_vec_of_vecs(array.get(0).dyn_into()?);
                let values = array_to_vec_of_vecs(array.get(1).dyn_into()?);

                console_log!("CozoDb: Importing {:?} keys  from indexDB", keys.len());

                let mut db_snap: BTreeMap<Vec<u8>, Vec<u8>> = BTreeMap::new();


                for (key, value) in keys.into_iter().zip(values.into_iter()) {
                    db_snap.insert(key, value);
                }

                console_log!("CozoDb: Importing done!");


                let ret = crate::Db::new(MemStorage::new(db_snap)).map_err(|_| {
                    JsValue::from_str("Error creating DbInstance")
                })?;

                ret.initialize().map_err(|_| {
                    JsValue::from_str("Error initializ DbInstance")
                })?;


                let db = DbInstance::Mem(ret);


                Ok(CozoDb { db })
            },
            Err(_) => {
                Err(JsValue::from_str("Unexpected result from loadIndexedDb"))
            }
        }
    }
    // pub async fn new_from_indexed_db(db_name: &str, store_name: &str) -> Result<CozoDb, DomException> {
    //     let store_n = store_name.to_string(); // Convert &str to String

    //     // Open my_db v1
    //     let mut db_req: OpenDbRequest = IdbDatabase::open_u32(db_name, 1)?;
    //     db_req.set_on_upgrade_needed(Some(move |evt: &IdbVersionChangeEvent| -> Result<(), JsValue> {
    //         // Check if the object store exists; create it if it doesn't
    //         if let None = evt.db().object_store_names().find(|n| n == &store_n) {
    //             evt.db().create_object_store(&store_n)?;
    //             log("CozoDb created indexedDb store");
    //         }
    //         Ok(())
    //     }));

    //     let indexedDb: IdbDatabase = db_req.into_future().await?;
    //     let tx = db.transaction_on_one(store_name)?;
    //     let store = tx.object_store(store_name)?;

    //     let keys = store.get_all_keys()?.await?;
    //     let values = store.get_all()?.await?;

    //     console_log!("Database opened successfully");
    //     console_log!("Read from indexDB {:?} {:?}", keys, values);

    //     Ok::<CozoDb, DomException>(CozoDb { db: DbInstance::default()})
    // }

    pub fn run(&self, script: &str, params: &str, immutable: bool) -> String {
        self.db.run_script_str(script, params, immutable)
    }
    pub fn export_relations(&self, data: &str) -> String {
        self.db.export_relations_str(data)
    }
    pub fn import_relations(&self, data: &str) -> String {
        self.db.import_relations_str(data)
    }
}
