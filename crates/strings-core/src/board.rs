//! The board: every operation run once on the same input, for the view
//! that shows all transforms at a glance.

use crate::op::{Group, Op, OpError, Params};
use crate::registry;
use crate::render::{Rendered, show};
use serde::Serialize;
use serde_json::{Map, Value};

/// Extra rows: an operation with other options than its defaults
struct Variant {
    id: &'static str,
    label: &'static str,
    op: &'static str,
    params: &'static str,
}

const VARIANTS: &[Variant] = &[Variant {
    id: "base64.encode.url",
    label: "Base64 URL",
    op: "base64.encode",
    params: r#"{"alphabet":"url","padding":false}"#,
}];

#[derive(Debug, Serialize)]
pub struct Row {
    pub id: &'static str,
    pub group: Group,
    pub label: &'static str,
    pub op: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<Rendered>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<OpError>,
}

/// `shared` holds options for every row whose operation has them, such
/// as the hash output format; rows without such an option ignore it.
pub fn run(input: &[u8], shared: &Map<String, Value>) -> Vec<Row> {
    let mut rows = Vec::new();
    for op in registry::all() {
        rows.push(row(op, op.meta.id, op.meta.name, Map::new(), input, shared));
        for variant in VARIANTS.iter().filter(|v| v.op == op.meta.id) {
            let preset = serde_json::from_str(variant.params)
                .expect("variant params are a JSON object");
            rows.push(row(
                op,
                variant.id,
                variant.label,
                preset,
                input,
                shared,
            ));
        }
    }
    rows
}

fn row(
    op: &'static Op,
    id: &'static str,
    label: &'static str,
    mut params: Map<String, Value>,
    input: &[u8],
    shared: &Map<String, Value>,
) -> Row {
    for spec in op.meta.params {
        if let Some(value) = shared.get(spec.id) {
            params.insert(spec.id.to_owned(), value.clone());
        }
    }

    let result = Params::resolve(op.meta.params, &params)
        .and_then(|params| (op.run)(input, &params));
    let (output, error) = match result {
        Ok(bytes) => (Some(show(&bytes)), None),
        Err(error) => (None, Some(error)),
    };
    Row {
        id,
        group: op.meta.group,
        label,
        op: op.meta.id,
        output,
        error,
    }
}

pub fn run_json(input: &[u8], shared_json: &str) -> Result<String, String> {
    let shared: Map<String, Value> = serde_json::from_str(shared_json)
        .map_err(|error| format!("Bad board options: {error}"))?;
    let rows = run(input, &shared);
    Ok(serde_json::to_string(&rows).expect("rows serialize"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rows(input: &str, shared: Value) -> Vec<Row> {
        run(input.as_bytes(), shared.as_object().unwrap())
    }

    fn value<'a>(rows: &'a [Row], id: &str) -> &'a str {
        let row = rows.iter().find(|row| row.id == id).unwrap();
        &row.output.as_ref().expect("the row has output").value
    }

    #[test]
    fn runs_every_operation_and_every_variant_once() {
        let rows = rows("hi", json!({}));
        assert_eq!(rows.len(), registry::all().count() + VARIANTS.len());
        assert_eq!(value(&rows, "case.upper"), "HI");
        assert_eq!(value(&rows, "base64.encode"), "aGk=");
        let url = rows.iter().position(|r| r.id == "base64.encode.url");
        let plain = rows.iter().position(|r| r.id == "base64.encode");
        assert_eq!(url, plain.map(|i| i + 1));
    }

    #[test]
    fn variants_use_their_own_options() {
        let rows = rows("?>?", json!({}));
        assert_eq!(value(&rows, "base64.encode"), "Pz4/");
        assert_eq!(value(&rows, "base64.encode.url"), "Pz4_");
    }

    #[test]
    fn shared_options_reach_only_the_operations_that_have_them() {
        let rows = rows("ghbdtn", json!({"format": "HEX", "to": "uk"}));
        assert_eq!(
            value(&rows, "hash.md5"),
            "2A3DFA66C2D8E8C67B77F2A25886E3CF"
        );
        assert_eq!(value(&rows, "layout.fix"), "привет");
        assert_eq!(value(&rows, "case.upper"), "GHBDTN");
    }

    #[test]
    fn failing_rows_carry_their_error() {
        let rows = rows("not base64!", json!({}));
        let row = rows.iter().find(|r| r.id == "base64.decode").unwrap();
        assert!(row.output.is_none());
        assert!(row.error.as_ref().unwrap().message.contains("Base64"));
    }

    #[test]
    fn run_json_parses_options_and_serializes_rows() {
        let json = run_json(b"hi", r#"{"format":"base64"}"#).unwrap();
        let rows: Value = serde_json::from_str(&json).unwrap();
        let md5 = rows
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["id"] == "hash.md5")
            .unwrap();
        assert_eq!(md5["group"], "hash");
        assert_eq!(md5["output"]["value"], "SfaKXIST7CwL9ImCHCH8Ow==");
        assert!(run_json(b"hi", "[]").unwrap_err().starts_with("Bad board"));
    }
}
