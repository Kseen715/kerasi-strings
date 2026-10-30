//! What every operation shares: metadata, parameters and errors.

use serde::Serialize;
use serde_json::{Map, Value};
use std::fmt;

pub type OpResult = Result<Vec<u8>, OpError>;

/// One operation: the metadata the UI is built from and its function.
pub struct Op {
    pub meta: OpMeta,
    pub run: fn(&[u8], &Params) -> OpResult,
}

#[derive(Serialize)]
pub struct OpMeta {
    pub id: &'static str,
    pub name: &'static str,
    pub group: Group,
    pub params: &'static [ParamSpec],
    /// A short sample shown next to the name in the operation list
    pub example: &'static str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Group {
    Case,
    Layout,
    Encode,
    Hash,
}

impl Group {
    pub const ALL: [Group; 4] =
        [Group::Case, Group::Layout, Group::Encode, Group::Hash];

    pub fn name(self) -> &'static str {
        match self {
            Group::Case => "Case",
            Group::Layout => "Keyboard layout",
            Group::Encode => "Encode",
            Group::Hash => "Hash",
        }
    }
}

#[derive(Serialize)]
pub struct ParamSpec {
    pub id: &'static str,
    pub name: &'static str,
    #[serde(flatten)]
    pub kind: ParamKind,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ParamKind {
    Choice {
        options: &'static [Choice],
        default: &'static str,
    },
    Flag {
        default: bool,
    },
}

#[derive(Clone, Copy, Serialize)]
pub struct Choice {
    pub id: &'static str,
    pub name: &'static str,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum ParamValue {
    Choice(&'static str),
    Flag(bool),
}

/// The parameters of one step, checked against the operation's specs and
/// completed with their defaults, so an operation never sees bad values.
#[derive(Debug, PartialEq)]
pub struct Params {
    values: Vec<(&'static str, ParamValue)>,
}

impl Params {
    pub fn defaults(specs: &'static [ParamSpec]) -> Self {
        Self::resolve(specs, &Map::new()).expect("defaults are valid")
    }

    pub fn resolve(
        specs: &'static [ParamSpec],
        given: &Map<String, Value>,
    ) -> Result<Self, OpError> {
        if let Some(unknown) =
            given.keys().find(|key| !specs.iter().any(|s| s.id == *key))
        {
            return Err(OpError::new(format!("Unknown option '{unknown}'")));
        }

        let values = specs
            .iter()
            .map(|spec| Ok((spec.id, resolve_one(spec, given.get(spec.id))?)))
            .collect::<Result<_, OpError>>()?;
        Ok(Self { values })
    }

    /// Panics when the operation did not declare `id` as a choice: that is
    /// a bug in the operation, which its tests catch.
    pub fn choice(&self, id: &str) -> &'static str {
        match self.get(id) {
            ParamValue::Choice(value) => value,
            ParamValue::Flag(_) => panic!("option '{id}' is not a choice"),
        }
    }

    pub fn flag(&self, id: &str) -> bool {
        match self.get(id) {
            ParamValue::Flag(value) => value,
            ParamValue::Choice(_) => panic!("option '{id}' is not a flag"),
        }
    }

    fn get(&self, id: &str) -> ParamValue {
        self.values
            .iter()
            .find(|(key, _)| *key == id)
            .map(|(_, value)| *value)
            .unwrap_or_else(|| panic!("option '{id}' is not declared"))
    }
}

fn resolve_one(
    spec: &ParamSpec,
    given: Option<&Value>,
) -> Result<ParamValue, OpError> {
    let invalid = || OpError::new(format!("Invalid value for '{}'", spec.id));
    match (&spec.kind, given) {
        (ParamKind::Choice { default, .. }, None) => {
            Ok(ParamValue::Choice(default))
        }
        (ParamKind::Choice { options, .. }, Some(value)) => options
            .iter()
            .find(|option| Some(option.id) == value.as_str())
            .map(|option| ParamValue::Choice(option.id))
            .ok_or_else(invalid),
        (ParamKind::Flag { default }, None) => Ok(ParamValue::Flag(*default)),
        (ParamKind::Flag { .. }, Some(value)) => {
            value.as_bool().map(ParamValue::Flag).ok_or_else(invalid)
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct OpError {
    pub message: String,
    /// Byte offset in the step's input that the error is about
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<usize>,
}

impl OpError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            offset: None,
        }
    }

    pub fn at(message: impl Into<String>, offset: usize) -> Self {
        Self {
            message: message.into(),
            offset: Some(offset),
        }
    }
}

impl fmt::Display for OpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for OpError {}

/// The input of a text operation, which must be valid UTF-8.
pub fn text(input: &[u8]) -> Result<&str, OpError> {
    std::str::from_utf8(input).map_err(|error| {
        let offset = error.valid_up_to();
        OpError::at(
            format!("Input is not valid UTF-8 text (byte {offset})"),
            offset,
        )
    })
}

/// Runs a text-to-text function on the input of a text operation.
pub fn map_text(input: &[u8], f: impl FnOnce(&str) -> String) -> OpResult {
    Ok(f(text(input)?).into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    static SPECS: &[ParamSpec] = &[
        ParamSpec {
            id: "alphabet",
            name: "Alphabet",
            kind: ParamKind::Choice {
                options: &[
                    Choice {
                        id: "standard",
                        name: "Standard",
                    },
                    Choice {
                        id: "url",
                        name: "URL-safe",
                    },
                ],
                default: "standard",
            },
        },
        ParamSpec {
            id: "padding",
            name: "Padding",
            kind: ParamKind::Flag { default: true },
        },
    ];

    fn given(value: Value) -> Map<String, Value> {
        value.as_object().expect("object").clone()
    }

    #[test]
    fn missing_params_take_their_defaults() {
        let params = Params::defaults(SPECS);
        assert_eq!(params.choice("alphabet"), "standard");
        assert!(params.flag("padding"));
    }

    #[test]
    fn given_params_replace_defaults() {
        let given = given(json!({"alphabet": "url", "padding": false}));
        let params = Params::resolve(SPECS, &given).unwrap();
        assert_eq!(params.choice("alphabet"), "url");
        assert!(!params.flag("padding"));
    }

    #[test]
    fn bad_params_are_errors() {
        let cases = [
            (json!({"colour": "red"}), "Unknown option 'colour'"),
            (json!({"alphabet": "hex"}), "Invalid value for 'alphabet'"),
            (json!({"alphabet": 1}), "Invalid value for 'alphabet'"),
            (json!({"padding": "yes"}), "Invalid value for 'padding'"),
        ];
        for (value, message) in cases {
            let error = Params::resolve(SPECS, &given(value)).unwrap_err();
            assert_eq!(error.message, message);
        }
    }

    #[test]
    #[should_panic(expected = "option 'padding' is not a choice")]
    fn reading_a_flag_as_a_choice_panics() {
        Params::defaults(SPECS).choice("padding");
    }

    #[test]
    #[should_panic(expected = "option 'alphabet' is not a flag")]
    fn reading_a_choice_as_a_flag_panics() {
        Params::defaults(SPECS).flag("alphabet");
    }

    #[test]
    #[should_panic(expected = "option 'size' is not declared")]
    fn reading_an_undeclared_param_panics() {
        Params::defaults(SPECS).flag("size");
    }

    #[test]
    fn text_names_the_first_invalid_byte() {
        assert_eq!(text(b"ok").unwrap(), "ok");
        let error = text(b"ab\xffcd").unwrap_err();
        assert_eq!(error.offset, Some(2));
        assert_eq!(error.to_string(), "Input is not valid UTF-8 text (byte 2)");
    }

    #[test]
    fn groups_have_names() {
        let names: Vec<_> = Group::ALL.iter().map(|g| g.name()).collect();
        assert_eq!(names, ["Case", "Keyboard layout", "Encode", "Hash"]);
    }
}
