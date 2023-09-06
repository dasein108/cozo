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

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
    #[wasm_bindgen(js_namespace = console)]
    pub fn log(s: &str);
}

#[wasm_bindgen]
pub struct CozoDb {
    db: DbInstance,
}

fn convert_to_vec_of_vecs(arr: Array) -> Vec<Vec<u8>> {
    let mut result = Vec::new();

    for i in 0..arr.length() {
        if let Ok(uint8_array) = arr.get(i).dyn_into::<Uint8Array>() {
            result.push(uint8_array.to_vec());
        } else {
            // Handle error if conversion fails
            // You can log or handle the error as needed
        }
    }

    result
}

#[wasm_bindgen]
impl CozoDb {
    #[allow(clippy::new_without_default)]
    pub fn new( keys: Array, values: Array) -> Self {
        utils::set_panic_hook();
        //TODO: keys: Vec<Vec<u8>>, values: Vec<Vec<u8>>
        log("starting cozodb...");
        let db = DbInstance::new_from_indexed_db(convert_to_vec_of_vecs(keys), convert_to_vec_of_vecs(values)).unwrap();
        Self { db }
    }
    pub fn run(&self, script: &str, params: &str, immutable: bool) -> String {
        log("running script");
        self.db.run_script_str(script, params, immutable)
    }
    pub fn export_relations(&self, data: &str) -> String {
        self.db.export_relations_str(data)
    }
    pub fn import_relations(&self, data: &str) -> String {
        self.db.import_relations_str(data)
    }
}
