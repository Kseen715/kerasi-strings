//! One smoke test per export, in a headless browser.

use strings_wasm::{Hasher, ops_meta, run, run_board, version};
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn version_is_the_crate_version() {
    assert_eq!(version(), env!("CARGO_PKG_VERSION"));
}

#[wasm_bindgen_test]
fn ops_meta_lists_operations() {
    assert!(ops_meta().contains(r#""id":"case.snake""#));
}

#[wasm_bindgen_test]
fn run_returns_output_and_trace() {
    let result = run(r#"[{"op":"case.snake"}]"#, b"Foo Bar").unwrap();
    assert_eq!(result.output().unwrap(), b"foo_bar");
    assert!(result.report().contains(r#""status":"ok""#));
}

#[wasm_bindgen_test]
fn run_rejects_a_malformed_recipe() {
    assert!(run("{", b"").is_err());
}

#[wasm_bindgen_test]
fn run_board_returns_rows() {
    let rows = run_board(b"hi", "{}").unwrap();
    assert!(rows.contains(r#""value":"aGk=""#));
    assert!(run_board(b"hi", "[]").is_err());
}

#[wasm_bindgen_test]
fn hasher_hashes_chunks() {
    let mut hasher = Hasher::new(vec!["hash.md5".into()], "hex").unwrap();
    hasher.update(b"a");
    hasher.update(b"bc");
    assert_eq!(hasher.finish(), ["900150983cd24fb0d6963f7d28e17f72"]);
    assert!(Hasher::new(vec!["case.upper".into()], "hex").is_err());
}
