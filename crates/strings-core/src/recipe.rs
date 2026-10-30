//! Runs a recipe, a chain of steps, and records what every step did.

use crate::op::{OpError, Params};
use crate::registry;
use crate::render::{Rendered, render, show};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// How much of each step's output the trace keeps
pub const PREVIEW_CHARS: usize = 120;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub op: String,
    #[serde(default)]
    pub params: Map<String, Value>,
    #[serde(default = "enabled")]
    pub enabled: bool,
}

fn enabled() -> bool {
    true
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Ok,
    Failed,
    /// Turned off by the user; its input passes through unchanged
    Disabled,
    /// Not run because an earlier step failed
    Blocked,
}

#[derive(Debug, Serialize)]
pub struct StepTrace {
    pub status: Status,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<Rendered>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<OpError>,
    pub ms: f64,
}

impl StepTrace {
    fn without_run(status: Status) -> Self {
        Self {
            status,
            preview: None,
            bytes: None,
            error: None,
            ms: 0.0,
        }
    }
}

pub struct Outcome {
    /// `None` when a step failed
    pub output: Option<Vec<u8>>,
    pub steps: Vec<StepTrace>,
}

#[derive(Serialize)]
struct Report<'a> {
    output: Option<Rendered>,
    steps: &'a [StepTrace],
}

impl Outcome {
    /// The trace and the output as the UI shows them, in JSON.
    pub fn report(&self) -> String {
        let report = Report {
            output: self.output.as_deref().map(show),
            steps: &self.steps,
        };
        serde_json::to_string(&report).expect("the report serializes")
    }
}

pub fn parse(json: &str) -> Result<Vec<Step>, String> {
    serde_json::from_str(json).map_err(|error| format!("Bad recipe: {error}"))
}

/// `clock` gives the time in milliseconds; it is passed in because the
/// WebAssembly build has no clock of its own.
pub fn run(steps: &[Step], input: &[u8], clock: &dyn Fn() -> f64) -> Outcome {
    let mut data = Some(input.to_vec());
    let mut trace = Vec::with_capacity(steps.len());

    for step in steps {
        let Some(current) = data.as_deref() else {
            trace.push(StepTrace::without_run(Status::Blocked));
            continue;
        };
        if !step.enabled {
            trace.push(StepTrace::without_run(Status::Disabled));
            continue;
        }

        let start = clock();
        let result = run_step(step, current);
        let ms = clock() - start;
        let (next, step_trace) = traced(result, ms);
        data = next;
        trace.push(step_trace);
    }

    Outcome {
        output: data,
        steps: trace,
    }
}

fn run_step(step: &Step, input: &[u8]) -> Result<Vec<u8>, OpError> {
    let op = registry::find(&step.op).ok_or_else(|| {
        OpError::new(format!("Unknown operation '{}'", step.op))
    })?;
    let params = Params::resolve(op.meta.params, &step.params)?;
    (op.run)(input, &params)
}

fn traced(
    result: Result<Vec<u8>, OpError>,
    ms: f64,
) -> (Option<Vec<u8>>, StepTrace) {
    match result {
        Ok(output) => {
            let trace = StepTrace {
                status: Status::Ok,
                preview: Some(render(&output, PREVIEW_CHARS)),
                bytes: Some(output.len()),
                error: None,
                ms,
            };
            (Some(output), trace)
        }
        Err(error) => {
            let trace = StepTrace {
                error: Some(error),
                ms,
                ..StepTrace::without_run(Status::Failed)
            };
            (None, trace)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn ticking_clock() -> impl Fn() -> f64 {
        let now = Cell::new(0.0);
        move || {
            now.set(now.get() + 1.5);
            now.get()
        }
    }

    fn run_json(recipe: &str, input: &str) -> Outcome {
        let steps = parse(recipe).unwrap();
        run(&steps, input.as_bytes(), &ticking_clock())
    }

    #[test]
    fn runs_the_plan_example() {
        let outcome = run_json(
            r#"[{"op":"layout.fix","params":{"to":"ru"}},{"op":"case.title"}]"#,
            "ghbdtn vbh",
        );
        assert_eq!(outcome.output.unwrap(), "Привет Мир".as_bytes());
        assert_eq!(outcome.steps.len(), 2);
        assert_eq!(outcome.steps[0].status, Status::Ok);
        assert_eq!(
            outcome.steps[0].preview.as_ref().unwrap().value,
            "привет мир"
        );
        assert_eq!(outcome.steps[0].bytes, Some(19));
        assert_eq!(outcome.steps[0].ms, 1.5);
    }

    #[test]
    fn an_empty_recipe_returns_the_input() {
        let outcome = run_json("[]", "same");
        assert_eq!(outcome.output.unwrap(), b"same");
        assert!(outcome.steps.is_empty());
    }

    #[test]
    fn a_failing_step_blocks_the_rest() {
        let outcome = run_json(
            r#"[{"op":"base64.decode"},{"op":"case.upper"}]"#,
            "Zm9v!",
        );
        assert!(outcome.output.is_none());
        assert_eq!(outcome.steps[0].status, Status::Failed);
        let error = outcome.steps[0].error.as_ref().unwrap();
        assert_eq!(error.offset, Some(4));
        assert_eq!(outcome.steps[1].status, Status::Blocked);
    }

    #[test]
    fn disabled_steps_pass_their_input_through() {
        let outcome = run_json(
            r#"[{"op":"case.upper","enabled":false},{"op":"case.snake"}]"#,
            "Foo Bar",
        );
        assert_eq!(outcome.output.unwrap(), b"foo_bar");
        assert_eq!(outcome.steps[0].status, Status::Disabled);
        assert_eq!(outcome.steps[0].ms, 0.0);
    }

    #[test]
    fn unknown_ops_and_params_fail_their_step() {
        let outcome = run_json(r#"[{"op":"case.nope"}]"#, "x");
        let error = outcome.steps[0].error.as_ref().unwrap();
        assert_eq!(error.message, "Unknown operation 'case.nope'");

        let outcome =
            run_json(r#"[{"op":"case.title","params":{"x":1}}]"#, "x");
        let error = outcome.steps[0].error.as_ref().unwrap();
        assert_eq!(error.message, "Unknown option 'x'");
    }

    #[test]
    fn malformed_recipes_are_rejected() {
        assert!(parse("{").unwrap_err().starts_with("Bad recipe: "));
        assert!(parse(r#"[{"op":"case.upper","extra":1}]"#).is_err());
        assert!(parse(r#"[{"params":{}}]"#).is_err());
    }

    #[test]
    fn report_shows_text_whole_and_binary_as_hex() {
        let text = "x".repeat(PREVIEW_CHARS + 10);
        let report = run_json("[]", &text).report();
        let json: Value = serde_json::from_str(&report).unwrap();
        assert_eq!(json["output"]["value"], text);
        assert_eq!(json["output"]["truncated"], false);

        let binary = run_json(r#"[{"op":"base64.decode"}]"#, "3q2+7w==");
        let json: Value = serde_json::from_str(&binary.report()).unwrap();
        assert_eq!(json["output"]["text"], false);
        assert_eq!(json["output"]["value"], "de ad be ef");
        assert_eq!(json["steps"][0]["status"], "ok");
        assert_eq!(json["steps"][0]["bytes"], 4);
    }

    #[test]
    fn report_of_a_failed_run_has_no_output() {
        let outcome = run_json(r#"[{"op":"base32.decode"}]"#, "1");
        let json: Value = serde_json::from_str(&outcome.report()).unwrap();
        assert!(json["output"].is_null());
        assert_eq!(json["steps"][0]["status"], "failed");
        assert!(json["steps"][0].get("preview").is_none());
    }
}
