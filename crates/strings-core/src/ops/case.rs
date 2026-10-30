//! Case operations: the simple ones change letters in place and keep
//! everything else; the identifier styles rebuild the text from its words.

use super::words;
use crate::op::{
    Group, Op, OpMeta, OpResult, ParamKind, ParamSpec, Params, map_text,
};

static TITLE_PARAMS: &[ParamSpec] = &[ParamSpec {
    id: "lower_rest",
    name: "Lower-case the rest",
    kind: ParamKind::Flag { default: true },
}];

pub static OPS: &[Op] = &[
    op("case.lower", "lower case", "grown slowly", lower),
    op("case.upper", "UPPER CASE", "GROWN SLOWLY", upper),
    Op {
        meta: OpMeta {
            params: TITLE_PARAMS,
            ..meta("case.title", "Title Case", "Grown Slowly")
        },
        run: title,
    },
    op("case.sentence", "Sentence case", "Grown slowly", sentence),
    op("case.invert", "iNVERT cASE", "gROWN SLOWLY", invert),
    op("case.camel", "camelCase", "grownSlowly", camel),
    op("case.pascal", "PascalCase", "GrownSlowly", pascal),
    op("case.snake", "snake_case", "grown_slowly", snake),
    op(
        "case.screaming_snake",
        "SCREAMING_SNAKE_CASE",
        "GROWN_SLOWLY",
        screaming_snake,
    ),
    op("case.kebab", "kebab-case", "grown-slowly", kebab),
    op(
        "case.screaming_kebab",
        "SCREAMING-KEBAB",
        "GROWN-SLOWLY",
        screaming_kebab,
    ),
    op("case.train", "Train-Case", "Grown-Slowly", train),
    op("case.dot", "dot.case", "grown.slowly", dot),
    op("case.path", "path/case", "grown/slowly", path),
    op("case.flat", "flatcase", "grownslowly", flat),
];

const fn meta(
    id: &'static str,
    name: &'static str,
    example: &'static str,
) -> OpMeta {
    OpMeta {
        id,
        name,
        group: Group::Case,
        params: &[],
        example,
    }
}

const fn op(
    id: &'static str,
    name: &'static str,
    example: &'static str,
    run: fn(&[u8], &Params) -> OpResult,
) -> Op {
    Op {
        meta: meta(id, name, example),
        run,
    }
}

fn lower(input: &[u8], _: &Params) -> OpResult {
    map_text(input, str::to_lowercase)
}

fn upper(input: &[u8], _: &Params) -> OpResult {
    map_text(input, str::to_uppercase)
}

/// Upper-cases the first letter of every word and keeps separators and
/// punctuation as typed. An apostrophe inside a word does not end it, so
/// "don't" stays one word.
fn title(input: &[u8], params: &Params) -> OpResult {
    let lower_rest = params.flag("lower_rest");
    map_text(input, |text| {
        let mut out = String::with_capacity(text.len());
        let mut in_word = false;
        for c in text.chars() {
            if !c.is_alphanumeric() {
                in_word = in_word && matches!(c, '\'' | '’');
                out.push(c);
            } else if in_word && lower_rest {
                out.extend(c.to_lowercase());
            } else if in_word {
                out.push(c);
            } else {
                out.push_str(&titlecase(c));
                in_word = true;
            }
        }
        out
    })
}

/// Lower-cases everything except the first letter of the text and of
/// every sentence, which starts after `.`, `!` or `?` and a space.
/// Closing quotes and brackets after the stop still end the sentence.
fn sentence(input: &[u8], _: &Params) -> OpResult {
    map_text(input, |text| {
        let mut out = String::with_capacity(text.len());
        let (mut start, mut after_stop) = (true, false);
        for c in text.chars() {
            if c.is_alphanumeric() {
                if start && c.is_alphabetic() {
                    out.push_str(&titlecase(c));
                } else {
                    out.extend(c.to_lowercase());
                }
                (start, after_stop) = (false, false);
                continue;
            }

            if matches!(c, '.' | '!' | '?') {
                after_stop = true;
            } else if c.is_whitespace() {
                start = start || after_stop;
            } else {
                after_stop = after_stop && is_closing(c);
            }
            out.push(c);
        }
        out
    })
}

fn is_closing(c: char) -> bool {
    matches!(c, '"' | '\'' | ')' | ']' | '»' | '”' | '’')
}

fn invert(input: &[u8], _: &Params) -> OpResult {
    map_text(input, |text| {
        let mut out = String::with_capacity(text.len());
        for c in text.chars() {
            if c.is_uppercase() {
                out.extend(c.to_lowercase());
            } else if c.is_lowercase() {
                out.extend(c.to_uppercase());
            } else {
                out.push(c);
            }
        }
        out
    })
}

/// Unicode has a separate title case only for the four Latin digraphs;
/// for every other letter it is the upper case with any extra characters
/// lower-cased (`ß` → `Ss`).
fn titlecase(c: char) -> String {
    match c {
        'Ǆ' | 'ǅ' | 'ǆ' => "ǅ".into(),
        'Ǉ' | 'ǈ' | 'ǉ' => "ǈ".into(),
        'Ǌ' | 'ǋ' | 'ǌ' => "ǋ".into(),
        'Ǳ' | 'ǲ' | 'ǳ' => "ǲ".into(),
        _ => {
            let mut upper = c.to_uppercase();
            let mut out = String::new();
            out.extend(upper.next());
            out.extend(upper.flat_map(char::to_lowercase));
            out
        }
    }
}

#[derive(Clone, Copy)]
enum Casing {
    Lower,
    Upper,
    Title,
}

fn apply(casing: Casing, word: &str) -> String {
    match casing {
        Casing::Lower => word.to_lowercase(),
        Casing::Upper => word.to_uppercase(),
        Casing::Title => {
            let mut chars = word.chars();
            let first = chars.next().map(titlecase).unwrap_or_default();
            first + &chars.as_str().to_lowercase()
        }
    }
}

fn join(input: &[u8], first: Casing, rest: Casing, sep: &str) -> OpResult {
    map_text(input, |text| {
        let words = words::split(text);
        let cased: Vec<String> = words
            .iter()
            .enumerate()
            .map(|(i, word)| apply(if i == 0 { first } else { rest }, word))
            .collect();
        cased.join(sep)
    })
}

fn camel(input: &[u8], _: &Params) -> OpResult {
    join(input, Casing::Lower, Casing::Title, "")
}

fn pascal(input: &[u8], _: &Params) -> OpResult {
    join(input, Casing::Title, Casing::Title, "")
}

fn snake(input: &[u8], _: &Params) -> OpResult {
    join(input, Casing::Lower, Casing::Lower, "_")
}

fn screaming_snake(input: &[u8], _: &Params) -> OpResult {
    join(input, Casing::Upper, Casing::Upper, "_")
}

fn kebab(input: &[u8], _: &Params) -> OpResult {
    join(input, Casing::Lower, Casing::Lower, "-")
}

fn screaming_kebab(input: &[u8], _: &Params) -> OpResult {
    join(input, Casing::Upper, Casing::Upper, "-")
}

fn train(input: &[u8], _: &Params) -> OpResult {
    join(input, Casing::Title, Casing::Title, "-")
}

fn dot(input: &[u8], _: &Params) -> OpResult {
    join(input, Casing::Lower, Casing::Lower, ".")
}

fn path(input: &[u8], _: &Params) -> OpResult {
    join(input, Casing::Lower, Casing::Lower, "/")
}

fn flat(input: &[u8], _: &Params) -> OpResult {
    join(input, Casing::Lower, Casing::Lower, "")
}

#[cfg(test)]
mod tests {
    use super::OPS;
    use crate::op::Params;
    use crate::testing::{run, run_with};
    use proptest::prelude::*;
    use serde_json::json;

    #[test]
    fn every_example_is_the_op_applied_to_grown_slowly() {
        for op in OPS {
            let output =
                (op.run)(b"Grown slowly", &Params::defaults(op.meta.params));
            assert_eq!(
                output.unwrap(),
                op.meta.example.as_bytes(),
                "{}",
                op.meta.id
            );
        }
    }

    #[test]
    fn identifier_styles_follow_the_plan_table() {
        let cases = [
            ("case.camel", "XMLHttpRequest", "xmlHttpRequest"),
            ("case.pascal", "xml http request", "XmlHttpRequest"),
            ("case.snake", "XMLHttpRequest", "xml_http_request"),
            ("case.snake", "utf8Value", "utf8_value"),
            ("case.snake", "__init__", "init"),
            ("case.camel", "привет мир", "приветМир"),
            ("case.screaming_snake", "ß", "SS"),
            ("case.screaming_snake", "fooBar baz", "FOO_BAR_BAZ"),
            ("case.kebab", "Foo Bar", "foo-bar"),
            ("case.screaming_kebab", "foo_bar", "FOO-BAR"),
            ("case.train", "foo_bar", "Foo-Bar"),
            ("case.dot", "FooBar", "foo.bar"),
            ("case.path", "foo bar", "foo/bar"),
            ("case.flat", "Foo-Bar", "foobar"),
            ("case.pascal", "straße", "Straße"),
            ("case.pascal", "ßa", "Ssa"),
            ("case.snake", "", ""),
        ];
        for (id, input, expected) in cases {
            assert_eq!(run(id, input), expected, "{id}({input})");
        }
    }

    #[test]
    fn simple_case_ops_use_full_unicode_mappings() {
        let cases = [
            ("case.upper", "straße", "STRASSE"),
            ("case.lower", "ΟΔΟΣ", "οδος"),
            ("case.lower", "ПРИВЕТ Мир", "привет мир"),
            ("case.invert", "Straße", "sTRASSE"),
            ("case.invert", "Привет, World 42", "пРИВЕТ, wORLD 42"),
        ];
        for (id, input, expected) in cases {
            assert_eq!(run(id, input), expected, "{id}({input})");
        }
    }

    #[test]
    fn title_case_keeps_separators_and_punctuation() {
        let cases = [
            ("hello world", "Hello World"),
            ("__init__ foo-bar", "__Init__ Foo-Bar"),
            ("don't STOP", "Don't Stop"),
            ("rock 'n' roll", "Rock 'N' Roll"),
            ("ǆungla", "ǅungla"),
            ("ßtraße", "Sstraße"),
            ("3rd place", "3rd Place"),
            ("привет мир", "Привет Мир"),
        ];
        for (input, expected) in cases {
            assert_eq!(run("case.title", input), expected, "{input}");
        }
        let keep = json!({"lower_rest": false});
        assert_eq!(run_with("case.title", "iPhone XML", keep), "IPhone XML");
    }

    #[test]
    fn titlecase_maps_every_digraph_form() {
        let cases = [
            ("ǆ Ǆ", "ǅ ǅ"),
            ("ǉ Ǉ", "ǈ ǈ"),
            ("ǌ Ǌ", "ǋ ǋ"),
            ("ǳ Ǳ", "ǲ ǲ"),
        ];
        for (input, expected) in cases {
            assert_eq!(run("case.title", input), expected, "{input}");
        }
    }

    #[test]
    fn sentence_case_starts_sentences_after_stops() {
        let cases = [
            ("HELLO WORLD. FOO bar", "Hello world. Foo bar"),
            ("wait?! no... yes", "Wait?! No... Yes"),
            ("he said \"hi.\" then left", "He said \"hi.\" Then left"),
            ("e.g., this", "E.g., this"),
            ("3 apples. two", "3 apples. Two"),
            ("  leading space", "  Leading space"),
            ("end.\nnext line", "End.\nNext line"),
        ];
        for (input, expected) in cases {
            assert_eq!(run("case.sentence", input), expected, "{input}");
        }
    }

    #[test]
    fn text_ops_reject_invalid_utf8() {
        for op in OPS {
            let params = Params::defaults(op.meta.params);
            let error = (op.run)(b"\xc3", &params).unwrap_err();
            assert_eq!(error.offset, Some(0), "{}", op.meta.id);
        }
    }

    const SEPARATED: [&str; 8] = [
        "case.snake",
        "case.screaming_snake",
        "case.kebab",
        "case.screaming_kebab",
        "case.train",
        "case.dot",
        "case.path",
        "case.flat",
    ];

    // Characters whose case mappings stay inside the set, so a second run
    // sees the same kind of text
    const TEXT: &str = "[a-zA-Z0-9а-яА-ЯёЁäöüß _.,/-]{0,40}";

    proptest! {
        #[test]
        fn separated_styles_are_idempotent(text in TEXT) {
            for id in SEPARATED {
                let once = run(id, &text);
                prop_assert_eq!(run(id, &once), once, "{}", id);
            }
        }

        #[test]
        fn simple_styles_are_idempotent(text in TEXT) {
            for id in ["case.lower", "case.upper", "case.title"] {
                let once = run(id, &text);
                prop_assert_eq!(run(id, &once), once, "{}", id);
            }
        }

        // Joining words without a separator loses the boundary between two
        // one-letter words ("a b" → "AB" reads back as one acronym), so
        // these hold for words of two letters or more
        #[test]
        fn joined_styles_are_idempotent(
            words in prop::collection::vec("[a-zа-я]{2,6}[0-9]?", 1..6),
        ) {
            let text = words.join(" ");
            for id in ["case.camel", "case.pascal"] {
                let once = run(id, &text);
                prop_assert_eq!(run(id, &once), once, "{}", id);
            }
        }

        #[test]
        fn invert_twice_is_identity(text in "[a-zA-Zа-яА-ЯёЁ0-9 ,.]{0,40}") {
            let twice = run("case.invert", &run("case.invert", &text));
            prop_assert_eq!(twice, text);
        }
    }
}
