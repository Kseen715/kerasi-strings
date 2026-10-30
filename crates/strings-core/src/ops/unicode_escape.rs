//! Python's `unicode_escape` codec: text as printable ASCII, with every
//! other character written as a backslash escape (`\xe9`, `\u043f`,
//! `\U0001f600`). The decoder reads the escapes of a Python string
//! literal and keeps other characters as they are, where Python would
//! read the input as Latin-1. It also joins a `\ud83d\ude00` surrogate
//! pair into one character, as JSON and JavaScript write them.
//!
//! `\N{name}` needs the Unicode name table, which only the `names` build
//! has. Without it a decode flags that it wants the table
//! (`take_names_wanted`), and the browser loads that build and runs again.

use crate::op::{Group, Op, OpError, OpMeta, OpResult, Params, map_text, text};
use std::fmt::Write;
use std::sync::atomic::{AtomicBool, Ordering};

const HIGH_SURROGATES: std::ops::RangeInclusive<u32> = 0xD800..=0xDBFF;
const LOW_SURROGATES: std::ops::RangeInclusive<u32> = 0xDC00..=0xDFFF;

static NAMES_WANTED: AtomicBool = AtomicBool::new(false);

pub static OPS: &[Op] = &[
    op(
        "unicode.encode",
        "Unicode escape encode",
        r"é😀 → \xe9\U0001f600",
        encode,
    ),
    op(
        "unicode.decode",
        "Unicode escape decode",
        r"\u043f\xe9 → пé",
        decode,
    ),
];

const fn op(
    id: &'static str,
    name: &'static str,
    example: &'static str,
    run: fn(&[u8], &Params) -> OpResult,
) -> Op {
    Op {
        meta: OpMeta {
            id,
            name,
            group: Group::Encode,
            params: &[],
            example,
        },
        run,
    }
}

fn encode(input: &[u8], _: &Params) -> OpResult {
    map_text(input, |text| {
        let mut output = String::with_capacity(text.len());
        for c in text.chars() {
            push_escaped(&mut output, c);
        }
        output
    })
}

fn push_escaped(output: &mut String, c: char) {
    let code = u32::from(c);
    let _ = match c {
        '\\' => output.write_str(r"\\"),
        '\t' => output.write_str(r"\t"),
        '\n' => output.write_str(r"\n"),
        '\r' => output.write_str(r"\r"),
        ' '..='~' => output.write_char(c),
        _ if code < 0x100 => write!(output, r"\x{code:02x}"),
        _ if code < 0x10000 => write!(output, r"\u{code:04x}"),
        _ => write!(output, r"\U{code:08x}"),
    };
}

fn decode(input: &[u8], _: &Params) -> OpResult {
    let text = text(input)?;
    let mut output = String::with_capacity(text.len());
    let mut at = 0;
    while let Some(found) = text[at..].find('\\') {
        let start = at + found;
        output.push_str(&text[at..start]);
        at = unescape(text, start, &mut output)?;
    }
    output.push_str(&text[at..]);
    Ok(output.into_bytes())
}

/// Writes the escape that starts at `start` and returns the offset after
/// it. An unknown escape such as `\q` stays as it is, as in Python.
fn unescape(
    text: &str,
    start: usize,
    output: &mut String,
) -> Result<usize, OpError> {
    let after = start + 1;
    let Some(kind) = text[after..].chars().next() else {
        let message = format!(r"\ at the end of the text at offset {start}");
        return Err(OpError::at(message, start));
    };
    let c = match kind {
        '\n' => return Ok(after + 1),
        '\\' | '\'' | '"' => kind,
        'a' => '\x07',
        'b' => '\x08',
        'f' => '\x0c',
        'n' => '\n',
        'r' => '\r',
        't' => '\t',
        'v' => '\x0b',
        '0'..='7' => return Ok(octal(text, start, output)),
        'x' => return hex(text, start, 2, output),
        'u' => return hex(text, start, 4, output),
        'U' => return hex(text, start, 8, output),
        'N' => return named(text, start, output),
        _ => {
            output.push('\\');
            return Ok(after);
        }
    };
    output.push(c);
    Ok(after + kind.len_utf8())
}

/// `\N{name}`: a character name or alias, in any letter case.
fn named(
    text: &str,
    start: usize,
    output: &mut String,
) -> Result<usize, OpError> {
    let open = start + 2;
    let close = text[open..]
        .strip_prefix('{')
        .and_then(|rest| rest.find('}'))
        .filter(|&length| length > 0)
        .map(|length| open + 1 + length)
        .ok_or_else(|| {
            let message =
                format!(r"Malformed \N{{...}} escape at offset {start}");
            OpError::at(message, start)
        })?;

    let name = &text[open + 1..close];
    let c = character(name, start)?.ok_or_else(|| {
        let message =
            format!("Unknown character name '{name}' at offset {start}");
        OpError::at(message, start)
    })?;
    output.push(c);
    Ok(close + 1)
}

#[cfg(feature = "names")]
fn character(name: &str, _: usize) -> Result<Option<char>, OpError> {
    Ok(unicode_names2::character(name))
}

#[cfg(not(feature = "names"))]
fn character(_: &str, start: usize) -> Result<Option<char>, OpError> {
    NAMES_WANTED.store(true, Ordering::Relaxed);
    let message =
        format!(r"\N{{...}} needs the Unicode name table at offset {start}");
    Err(OpError::at(message, start))
}

/// Whether a decode met `\N{...}` without the name table since the last
/// call.
pub fn take_names_wanted() -> bool {
    NAMES_WANTED.swap(false, Ordering::Relaxed)
}

/// One to three octal digits, as in `\0` or `\101`
fn octal(text: &str, start: usize, output: &mut String) -> usize {
    let digits = text[start + 1..]
        .bytes()
        .take(3)
        .take_while(|byte| (b'0'..=b'7').contains(byte))
        .count();
    let end = start + 1 + digits;
    let code = u32::from_str_radix(&text[start + 1..end], 8)
        .expect("the digits are octal");
    output.push(char::from_u32(code).expect("at most 0o777"));
    end
}

/// `\x`, `\u` or `\U` with exactly `digits` hex digits.
fn hex(
    text: &str,
    start: usize,
    digits: usize,
    output: &mut String,
) -> Result<usize, OpError> {
    let end = start + 2 + digits;
    let code = read_hex(text, start + 2, end).ok_or_else(|| {
        let kind = &text[start..start + 2];
        let message = format!(
            "Truncated {kind}{} escape at offset {start}",
            "X".repeat(digits)
        );
        OpError::at(message, start)
    })?;

    if HIGH_SURROGATES.contains(&code) {
        let low = text
            .get(end..end + 2)
            .filter(|&next| next == r"\u")
            .and_then(|_| read_hex(text, end + 2, end + 6))
            .filter(|low| LOW_SURROGATES.contains(low));
        if let Some(low) = low {
            let pair = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
            output.extend(char::from_u32(pair));
            return Ok(end + 6);
        }
    }
    let c = char::from_u32(code).ok_or_else(|| {
        let message =
            format!("Invalid character U+{code:04X} at offset {start}");
        OpError::at(message, start)
    })?;
    output.push(c);
    Ok(end)
}

fn read_hex(text: &str, from: usize, to: usize) -> Option<u32> {
    text.get(from..to)
        .filter(|hex| hex.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .and_then(|hex| u32::from_str_radix(hex, 16).ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{run, run_err};
    use proptest::prelude::*;

    // The output of Python 3's "...".encode("unicode_escape")
    const VECTORS: [(&str, &str); 8] = [
        ("привет", r"\u043f\u0440\u0438\u0432\u0435\u0442"),
        ("é", r"\xe9"),
        ("😀", r"\U0001f600"),
        (r"a\b", r"a\\b"),
        ("tab\tnl\nCR\r", r"tab\tnl\nCR\r"),
        ("\x00\x07\x1b\x7f", r"\x00\x07\x1b\x7f"),
        ("quote '\"", "quote '\""),
        ("\u{ff}\u{100}\u{10ffff}", r"\xff\u0100\U0010ffff"),
    ];

    #[test]
    fn matches_python() {
        for (plain, escaped) in VECTORS {
            assert_eq!(run("unicode.encode", plain), escaped);
            assert_eq!(run("unicode.decode", escaped), plain);
        }
    }

    #[test]
    fn decodes_every_escape_of_a_python_string_literal() {
        let cases = [
            (r"\x41\101\u0041\U00000041", "AAAA"),
            (r"\a\b\f\v\0\777", "\x07\x08\x0c\x0b\x00\u{1ff}"),
            (r#"\'\"\\"#, "'\"\\"),
            ("a\\\nb", "ab"),
            (r"\q \é", r"\q \é"),
            (r"\u0041BC", "ABC"),
            (r"\101101", "A101"),
            ("пр\\u0438", "при"),
        ];
        for (escaped, plain) in cases {
            assert_eq!(run("unicode.decode", escaped), plain, "{escaped}");
        }
    }

    #[test]
    fn joins_surrogate_pairs() {
        assert_eq!(run("unicode.decode", r"\ud83d\ude00!"), "😀!");
        assert_eq!(run("unicode.decode", r"\uD83D\uDE00"), "😀");
    }

    #[test]
    fn names_the_offset_of_a_bad_escape() {
        let cases = [
            (r"ab\x4", r"Truncated \xXX escape at offset 2"),
            (r"\u12", r"Truncated \uXXXX escape at offset 0"),
            (r"\x4g", r"Truncated \xXX escape at offset 0"),
            (r"\U00110000", "Invalid character U+110000 at offset 0"),
            (r"x\ud83d", "Invalid character U+D83D at offset 1"),
            (r"\ude00", "Invalid character U+DE00 at offset 0"),
            ("ok\\", r"\ at the end of the text at offset 2"),
            (r"\N", r"Malformed \N{...} escape at offset 0"),
            (r"a\NBULLET", r"Malformed \N{...} escape at offset 1"),
            (r"\N{}", r"Malformed \N{...} escape at offset 0"),
            (r"\N{BULLET", r"Malformed \N{...} escape at offset 0"),
        ];
        for (input, message) in cases {
            assert_eq!(run_err("unicode.decode", input), message, "{input}");
        }
    }

    #[cfg(not(feature = "names"))]
    #[test]
    fn names_ask_for_the_name_table() {
        assert!(!take_names_wanted());
        let message = r"\N{...} needs the Unicode name table at offset 2";
        assert_eq!(run_err("unicode.decode", r"a \N{BULLET}"), message);
        assert!(take_names_wanted());
        assert!(!take_names_wanted());
    }

    // As Python 3 reads them, aliases and generated names included
    #[cfg(feature = "names")]
    #[test]
    fn names_are_looked_up_in_the_name_table() {
        let cases = [
            (r"\N{BULLET} \N{latin small letter a}", "• a"),
            (r"\N{LF}\N{BYTE ORDER MARK}", "\n\u{feff}"),
            (
                r"\N{CJK UNIFIED IDEOGRAPH-4E00}\N{HANGUL SYLLABLE GA}",
                "一가",
            ),
        ];
        for (escaped, plain) in cases {
            assert_eq!(run("unicode.decode", escaped), plain, "{escaped}");
        }
        let message = "Unknown character name 'NO SUCH' at offset 1";
        assert_eq!(run_err("unicode.decode", r"x\N{NO SUCH}"), message);
        assert!(!take_names_wanted());
    }

    proptest! {
        #[test]
        fn text_round_trips(text in any::<String>()) {
            let params = Params::defaults(&[]);
            let escaped = encode(text.as_bytes(), &params)?;
            prop_assert!(escaped.is_ascii());
            prop_assert_eq!(decode(&escaped, &params)?, text.into_bytes());
        }
    }
}
