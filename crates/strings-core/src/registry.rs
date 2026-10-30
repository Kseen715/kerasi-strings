//! Every operation, and the metadata the UI is built from.

use crate::op::{Group, Op, OpMeta};
use crate::ops::{case, encode, hash, layout};
use serde::Serialize;

pub fn all() -> impl Iterator<Item = &'static Op> {
    case::OPS
        .iter()
        .chain(layout::OPS)
        .chain(encode::OPS)
        .chain(hash::OPS)
}

pub fn find(id: &str) -> Option<&'static Op> {
    all().find(|op| op.meta.id == id)
}

#[derive(Serialize)]
struct Meta {
    version: &'static str,
    groups: Vec<GroupMeta>,
    ops: Vec<&'static OpMeta>,
}

#[derive(Serialize)]
struct GroupMeta {
    id: Group,
    name: &'static str,
}

pub fn meta_json() -> String {
    let meta = Meta {
        version: crate::VERSION,
        groups: Group::ALL
            .iter()
            .map(|&id| GroupMeta {
                id,
                name: id.name(),
            })
            .collect(),
        ops: all().map(|op| &op.meta).collect(),
    };
    serde_json::to_string(&meta).expect("metadata serializes")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::op::Params;
    use serde_json::Value;
    use std::collections::HashSet;

    #[test]
    fn ids_are_unique_and_namespaced() {
        let ids: Vec<&str> = all().map(|op| op.meta.id).collect();
        let unique: HashSet<&&str> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len());
        assert!(ids.iter().all(|id| id.split_once('.').is_some()));
    }

    #[test]
    fn lists_every_operation_of_v0_1() {
        let count = |group| all().filter(|op| op.meta.group == group).count();
        assert_eq!(count(Group::Case), 15);
        assert_eq!(count(Group::Layout), 2);
        assert_eq!(count(Group::Encode), 4);
        assert_eq!(count(Group::Hash), 6);
    }

    #[test]
    fn finds_operations_by_id() {
        assert_eq!(find("case.snake").unwrap().meta.name, "snake_case");
        assert!(find("case.unknown").is_none());
    }

    #[test]
    fn every_operation_runs_with_its_defaults() {
        for op in all() {
            let params = Params::defaults(op.meta.params);
            // Text, Base64 and Base32 at once, so every operation succeeds
            let input = b"MZXW6YQ=";
            assert!((op.run)(input, &params).is_ok(), "{}", op.meta.id);
            assert!(!op.meta.example.is_empty(), "{}", op.meta.id);
        }
    }

    #[test]
    fn meta_json_describes_groups_ops_and_params() {
        let meta: Value = serde_json::from_str(&meta_json()).unwrap();
        assert_eq!(meta["version"], crate::VERSION);
        assert_eq!(meta["groups"][1]["id"], "layout");
        assert_eq!(meta["groups"][1]["name"], "Keyboard layout");
        assert_eq!(meta["ops"].as_array().unwrap().len(), 27);

        let encode = &meta["ops"][17];
        assert_eq!(encode["id"], "base64.encode");
        assert_eq!(encode["group"], "encode");
        assert_eq!(encode["params"][0]["type"], "choice");
        assert_eq!(encode["params"][0]["default"], "standard");
        assert_eq!(encode["params"][0]["options"][1]["id"], "url");
        assert_eq!(encode["params"][1]["type"], "flag");
        assert_eq!(encode["params"][1]["default"], true);
    }
}
