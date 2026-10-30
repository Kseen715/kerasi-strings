//! The WebAssembly exports of the engine. Bindings only: every operation
//! and all logic live in `strings-core`.

use strings_core::{MultiHasher, board, recipe, registry};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = performance)]
    fn now() -> f64;
}

#[wasm_bindgen]
pub fn version() -> String {
    strings_core::VERSION.into()
}

/// The groups and operations with their options, as JSON.
#[wasm_bindgen]
pub fn ops_meta() -> String {
    registry::meta_json()
}

#[wasm_bindgen]
pub struct RunResult {
    output: Option<Vec<u8>>,
    report: String,
}

#[wasm_bindgen]
impl RunResult {
    /// The output bytes; `undefined` when a step failed.
    #[wasm_bindgen(getter)]
    pub fn output(&self) -> Option<Vec<u8>> {
        self.output.clone()
    }

    /// The shown output and the trace of every step, as JSON.
    #[wasm_bindgen(getter)]
    pub fn report(&self) -> String {
        self.report.clone()
    }
}

#[wasm_bindgen]
pub fn run(recipe_json: &str, input: &[u8]) -> Result<RunResult, JsError> {
    let steps = recipe::parse(recipe_json).map_err(|e| JsError::new(&e))?;
    let outcome = recipe::run(&steps, input, &now);
    Ok(RunResult {
        report: outcome.report(),
        output: outcome.output,
    })
}

/// Every operation once on the same input, as JSON rows.
#[wasm_bindgen]
pub fn run_board(input: &[u8], options_json: &str) -> Result<String, JsError> {
    board::run_json(input, options_json).map_err(|e| JsError::new(&e))
}

/// Whether a decode met `\N{...}` since the last call without the name
/// table, which only the `strings-wasm-names` build has.
#[wasm_bindgen]
pub fn take_names_wanted() -> bool {
    strings_core::take_names_wanted()
}

/// Hashes a stream of chunks, for files too large to hold in memory.
#[wasm_bindgen]
pub struct Hasher(MultiHasher);

#[wasm_bindgen]
impl Hasher {
    #[wasm_bindgen(constructor)]
    pub fn new(ops: Vec<String>, format: &str) -> Result<Hasher, JsError> {
        let ids: Vec<&str> = ops.iter().map(String::as_str).collect();
        MultiHasher::new(&ids, format)
            .map(Hasher)
            .map_err(|e| JsError::new(&e.message))
    }

    pub fn update(&mut self, chunk: &[u8]) {
        self.0.update(chunk);
    }

    /// One hash per operation, in the order they were given.
    pub fn finish(self) -> Vec<String> {
        self.0.finish()
    }
}
