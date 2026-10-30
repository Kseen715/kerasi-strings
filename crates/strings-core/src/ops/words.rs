//! Splits text into the words that identifier styles (camelCase,
//! snake_case, ...) join back together.

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Upper,
    Lower,
    Digit,
}

/// Letters without case (CJK, Hebrew, ...) count as lower case, so they
/// never start a new word on their own.
fn kind(c: char) -> Option<Kind> {
    if c.is_uppercase() {
        Some(Kind::Upper)
    } else if c.is_numeric() {
        Some(Kind::Digit)
    } else if c.is_alphanumeric() {
        Some(Kind::Lower)
    } else {
        None
    }
}

/// Words are runs of letters and digits. Inside a run a word ends before
/// an upper-case letter that follows a lower-case one (`fooBar`), and
/// before a capital that follows a digit or a capital and starts a lower-
/// case word (`utf8Value`, `XMLHttp` → `XML`, `Http`). Digits stay with
/// the word before them, so upper-casing a word never splits it
/// (`UTF8VALUE` stays one word).
pub fn split(text: &str) -> Vec<&str> {
    let mut words = Vec::new();
    for run in text.split(|c| kind(c).is_none()) {
        if !run.is_empty() {
            split_run(run, &mut words);
        }
    }
    words
}

fn split_run<'a>(run: &'a str, words: &mut Vec<&'a str>) {
    let chars: Vec<(usize, Option<Kind>)> =
        run.char_indices().map(|(at, c)| (at, kind(c))).collect();

    let mut start = 0;
    for i in 1..chars.len() {
        let next = chars.get(i + 1).and_then(|(_, kind)| *kind);
        if is_boundary(chars[i - 1].1, chars[i].1, next) {
            words.push(&run[start..chars[i].0]);
            start = chars[i].0;
        }
    }
    words.push(&run[start..]);
}

fn is_boundary(
    prev: Option<Kind>,
    cur: Option<Kind>,
    next: Option<Kind>,
) -> bool {
    match (prev, cur) {
        (Some(Kind::Lower), Some(Kind::Upper)) => true,
        (Some(Kind::Digit | Kind::Upper), Some(Kind::Upper)) => {
            next == Some(Kind::Lower)
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::split;

    #[test]
    fn splits_the_plan_table() {
        let cases: &[(&str, &[&str])] = &[
            ("XMLHttpRequest", &["XML", "Http", "Request"]),
            ("utf8Value", &["utf8", "Value"]),
            ("__init__", &["init"]),
            ("привет мир", &["привет", "мир"]),
            ("ß", &["ß"]),
            ("fooBar", &["foo", "Bar"]),
            (
                "foo_bar-baz.qux/quux",
                &["foo", "bar", "baz", "qux", "quux"],
            ),
            (
                "Grown slowly, cut sharp",
                &["Grown", "slowly", "cut", "sharp"],
            ),
            ("HTML5Parser", &["HTML5", "Parser"]),
            ("v2Api", &["v2", "Api"]),
            ("UTF8VALUE", &["UTF8VALUE"]),
            ("3D", &["3D"]),
            ("ПриветМир", &["Привет", "Мир"]),
            ("ABC", &["ABC"]),
            ("A", &["A"]),
            ("日本語テキスト", &["日本語テキスト"]),
            ("", &[]),
            ("  --  ", &[]),
        ];
        for (text, words) in cases {
            assert_eq!(split(text), *words, "{text}");
        }
    }
}
