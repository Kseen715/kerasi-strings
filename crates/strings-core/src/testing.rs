//! Shortcuts for the tests of the operations.

use crate::op::{Op, Params};
use crate::registry;
use serde_json::{Value, json};

pub fn op(id: &str) -> &'static Op {
    registry::find(id).unwrap_or_else(|| panic!("no operation '{id}'"))
}

fn output(id: &str, input: &str, params: Value) -> Result<Vec<u8>, String> {
    let op = op(id);
    let given = params.as_object().expect("params are an object");
    let params = Params::resolve(op.meta.params, given).expect("valid");
    (op.run)(input.as_bytes(), &params).map_err(|error| error.message)
}

pub fn run_with(id: &str, input: &str, params: Value) -> String {
    let bytes = output(id, input, params).expect("the operation succeeds");
    String::from_utf8(bytes).expect("the output is text")
}

pub fn run(id: &str, input: &str) -> String {
    run_with(id, input, json!({}))
}

pub fn run_err(id: &str, input: &str) -> String {
    output(id, input, json!({})).expect_err("the operation fails")
}
