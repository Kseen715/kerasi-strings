//! Keyboard layout operations: text typed with the wrong layout switched
//! on, retyped as if the same keys were pressed on the right one.

mod tables;

use crate::op::{
    Choice, Group, Op, OpError, OpMeta, OpResult, ParamKind, ParamSpec, Params,
    map_text, text,
};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;
use tables::{KEYS, LAYOUTS, Layout};

pub use tables::LAYOUTS as ALL;

const ENGLISH: usize = 0;
const RUSSIAN: usize = 1;

static FROM: [Choice; LAYOUTS.len() + 1] = with_auto(Choice {
    id: "auto",
    name: "Auto-detect",
});

static TO: [Choice; LAYOUTS.len() + 1] = with_auto(Choice {
    id: "auto",
    name: "Auto (English ↔ Russian)",
});

static FIX_PARAMS: &[ParamSpec] = &[
    ParamSpec {
        id: "from",
        name: "From",
        kind: ParamKind::Choice {
            options: &FROM,
            default: "auto",
        },
    },
    ParamSpec {
        id: "to",
        name: "To",
        kind: ParamKind::Choice {
            options: &TO,
            default: "auto",
        },
    },
];

pub static OPS: &[Op] = &[
    Op {
        meta: OpMeta {
            id: "layout.fix",
            name: "Fix layout",
            group: Group::Layout,
            params: FIX_PARAMS,
            example: "ghbdtn → привет",
        },
        run: fix,
    },
    Op {
        meta: OpMeta {
            id: "layout.detect",
            name: "Detect layout",
            group: Group::Layout,
            params: &[],
            example: "ghbdtn → English",
        },
        run: detect_name,
    },
];

const fn with_auto(auto: Choice) -> [Choice; LAYOUTS.len() + 1] {
    let mut choices = [auto; LAYOUTS.len() + 1];
    let mut i = 0;
    while i < LAYOUTS.len() {
        choices[i + 1] = Choice {
            id: LAYOUTS[i].id,
            name: LAYOUTS[i].name,
        };
        i += 1;
    }
    choices
}

/// A layout's keys by character, built once.
struct Keys {
    by_char: HashMap<char, (usize, bool)>,
    letters: HashSet<char>,
    plain: Vec<char>,
    shifted: Vec<char>,
}

fn keys() -> &'static [Keys] {
    static KEYS_OF: OnceLock<Vec<Keys>> = OnceLock::new();
    KEYS_OF.get_or_init(|| LAYOUTS.iter().map(index).collect())
}

fn index(layout: &Layout) -> Keys {
    let plain: Vec<char> = layout.plain.chars().collect();
    let shifted: Vec<char> = layout.shifted.chars().collect();
    let by_char = (0..KEYS)
        .flat_map(|key| {
            [(plain[key], (key, false)), (shifted[key], (key, true))]
        })
        .collect();
    let letters = plain
        .iter()
        .chain(&shifted)
        .copied()
        .filter(|c| c.is_alphabetic())
        .collect();
    Keys {
        by_char,
        letters,
        plain,
        shifted,
    }
}

/// Characters with no key on the source layout pass through unchanged.
pub fn convert(text: &str, from: usize, to: usize) -> String {
    let (from, to) = (&keys()[from], &keys()[to]);
    text.chars()
        .map(|c| match from.by_char.get(&c) {
            Some(&(key, false)) => to.plain[key],
            Some(&(key, true)) => to.shifted[key],
            None => c,
        })
        .collect()
}

/// The layout with the most of the text's letters; ties go to the layout
/// listed first. `None` when the text has no letter of any layout.
pub fn detect(text: &str) -> Option<usize> {
    let mut scores = [0usize; LAYOUTS.len()];
    for c in text.chars().filter(|c| c.is_alphabetic()) {
        for (score, keys) in scores.iter_mut().zip(keys()) {
            *score += usize::from(keys.letters.contains(&c));
        }
    }

    let best = (0..LAYOUTS.len())
        .fold(0, |best, i| if scores[i] > scores[best] { i } else { best });
    (scores[best] > 0).then_some(best)
}

fn position(id: &str) -> usize {
    LAYOUTS
        .iter()
        .position(|layout| layout.id == id)
        .expect("params only hold layout ids")
}

fn fix(input: &[u8], params: &Params) -> OpResult {
    map_text(input, |text| {
        let from = match params.choice("from") {
            "auto" => match detect(text) {
                Some(found) => found,
                None => return text.to_owned(),
            },
            id => position(id),
        };
        let to = match params.choice("to") {
            "auto" if from == ENGLISH => RUSSIAN,
            "auto" => ENGLISH,
            id => position(id),
        };
        convert(text, from, to)
    })
}

fn detect_name(input: &[u8], _: &Params) -> OpResult {
    let found = detect(text(input)?)
        .ok_or_else(|| OpError::new("No letters to detect a layout from"))?;
    Ok(LAYOUTS[found].name.as_bytes().to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{run, run_with};
    use proptest::prelude::*;
    use serde_json::json;

    fn convert_ids(text: &str, from: &str, to: &str) -> String {
        convert(text, position(from), position(to))
    }

    #[test]
    fn fixes_russian_typed_on_english() {
        assert_eq!(run("layout.fix", "Ghbdtn rfr ltkf"), "Привет как дела");
        assert_eq!(run("layout.fix", "ghbdtn"), "привет");
        assert_eq!(run("layout.fix", "GHBDTN, VBH!"), "ПРИВЕТб МИР!");
    }

    #[test]
    fn fixes_english_typed_on_russian() {
        assert_eq!(run("layout.fix", "руддщ цщкдв"), "hello world");
        assert_eq!(run("layout.fix", "Ершы шы ф еуые"), "This is a test");
    }

    #[test]
    fn converts_between_explicit_pairs() {
        let cases = [
            ("en", "uk", "ghbdsn", "привіт"),
            ("en", "de", "y z", "z y"),
            ("de", "en", "Zürich", "Y[rich"),
            ("en", "fr", "qwerty", "azerty"),
            ("fr", "en", "azerty", "qwerty"),
            ("ru", "uk", "ыъэ", "іїє"),
            ("en", "ru", "`~", "ёЁ"),
        ];
        for (from, to, input, expected) in cases {
            let params = json!({"from": from, "to": to});
            assert_eq!(run_with("layout.fix", input, params), expected);
        }
    }

    #[test]
    fn auto_target_is_the_other_side_of_english_and_russian() {
        let params = |from| json!({"from": from});
        assert_eq!(run_with("layout.fix", "q", params("en")), "й");
        assert_eq!(run_with("layout.fix", "й", params("ru")), "q");
        assert_eq!(run_with("layout.fix", "й", params("uk")), "q");
        assert_eq!(run_with("layout.fix", "z", params("de")), "y");
    }

    #[test]
    fn keys_missing_on_the_source_pass_through() {
        assert_eq!(convert_ids("q 日本 ё", "en", "ru"), "й 日本 ё");
    }

    #[test]
    fn auto_source_leaves_text_without_letters_alone() {
        assert_eq!(run("layout.fix", "123 !?"), "123 !?");
    }

    #[test]
    fn detection_picks_the_source_on_a_corpus() {
        let corpus = [
            ("Ghbdtn rfr ltkf", Some("en")),
            ("hello", Some("en")),
            ("руддщ цщкдв", Some("ru")),
            ("съешь же ещё этих мягких булок", Some("ru")),
            ("привіт, як справи", Some("uk")),
            ("ґанок", Some("uk")),
            ("Größe Straße", Some("de")),
            ("garçon à la crème", Some("fr")),
            ("", None),
            ("123 456", None),
            ("日本語", None),
        ];
        for (text, expected) in corpus {
            let found = detect(text).map(|i| LAYOUTS[i].id);
            assert_eq!(found, expected, "{text}");
        }
    }

    #[test]
    fn detect_names_the_layout() {
        assert_eq!(run("layout.detect", "ghbdtn"), "English (US QWERTY)");
        assert_eq!(run("layout.detect", "привет"), "Russian (ЙЦУКЕН)");
        let error = crate::testing::run_err("layout.detect", "42");
        assert_eq!(error, "No letters to detect a layout from");
    }

    #[test]
    fn choices_list_auto_then_every_layout() {
        let ids: Vec<_> = FROM.iter().map(|c| c.id).collect();
        assert_eq!(ids, ["auto", "en", "ru", "uk", "de", "fr"]);
        assert_eq!(TO[0].name, "Auto (English ↔ Russian)");
    }

    fn typed_on(layout: &'static Layout) -> impl Strategy<Value = String> {
        let chars: Vec<char> =
            layout.plain.chars().chain(layout.shifted.chars()).collect();
        prop::collection::vec(prop::sample::select(chars), 0..40)
            .prop_map(|chars| chars.into_iter().collect())
    }

    proptest! {
        #[test]
        fn russian_to_english_and_back_is_identity(
            text in typed_on(&LAYOUTS[RUSSIAN]),
        ) {
            let english = convert(&text, RUSSIAN, ENGLISH);
            prop_assert_eq!(convert(&english, ENGLISH, RUSSIAN), text);
        }

        #[test]
        fn every_pair_round_trips(
            from in 0..LAYOUTS.len(),
            to in 0..LAYOUTS.len(),
            seed in any::<u64>(),
        ) {
            let text: String = LAYOUTS[from]
                .plain
                .chars()
                .chain(LAYOUTS[from].shifted.chars())
                .cycle()
                .skip((seed % 94) as usize)
                .take(30)
                .collect();
            let there = convert(&text, from, to);
            prop_assert_eq!(convert(&there, to, from), text);
        }
    }
}
