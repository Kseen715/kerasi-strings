//! Percent-encoding as RFC 3986 defines it. The encoder works on bytes,
//! so UTF-8 text becomes one `%XX` per byte, written in upper case as
//! §2.1 recommends; the decoder may produce bytes that are not text.

use crate::op::{
    Choice, Group, Op, OpError, OpMeta, OpResult, ParamKind, ParamSpec, Params,
};

/// RFC 3986 §2.2, the characters that delimit the parts of a URL
const RESERVED: &[u8] = b":/?#[]@!$&'()*+,;=";

const KEEP: ParamSpec = ParamSpec {
    id: "keep",
    name: "Keep",
    kind: ParamKind::Choice {
        options: &[
            Choice {
                id: "component",
                name: "Letters, digits and -._~",
            },
            Choice {
                id: "url",
                name: "Also URL delimiters (:/?#&=...)",
            },
        ],
        default: "component",
    },
};

const PLUS: ParamSpec = ParamSpec {
    id: "plus",
    name: "Space as + (forms)",
    kind: ParamKind::Flag { default: false },
};

pub static OPS: &[Op] = &[
    op(
        "url.encode",
        "URL encode",
        "a b&c → a%20b%26c",
        &[KEEP, PLUS],
        encode,
    ),
    op(
        "url.decode",
        "URL decode",
        "a%20b%26c → a b&c",
        &[PLUS],
        decode,
    ),
];

const fn op(
    id: &'static str,
    name: &'static str,
    example: &'static str,
    params: &'static [ParamSpec],
    run: fn(&[u8], &Params) -> OpResult,
) -> Op {
    Op {
        meta: OpMeta {
            id,
            name,
            group: Group::Encode,
            params,
            example,
        },
        run,
    }
}

/// RFC 3986 §2.3
fn is_unreserved(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || b"-._~".contains(&byte)
}

fn encode(input: &[u8], params: &Params) -> OpResult {
    let keep_reserved = params.choice("keep") == "url";
    let plus = params.flag("plus");

    let mut output = Vec::with_capacity(input.len());
    for &byte in input {
        if is_unreserved(byte) || keep_reserved && RESERVED.contains(&byte) {
            output.push(byte);
        } else if plus && byte == b' ' {
            output.push(b'+');
        } else {
            output.extend(format!("%{byte:02X}").bytes());
        }
    }
    Ok(output)
}

fn decode(input: &[u8], params: &Params) -> OpResult {
    let plus = params.flag("plus");

    let mut output = Vec::with_capacity(input.len());
    let mut at = 0;
    while let Some(&byte) = input.get(at) {
        match byte {
            b'%' => {
                output.push(escaped(input, at)?);
                at += 3;
            }
            b'+' if plus => {
                output.push(b' ');
                at += 1;
            }
            _ => {
                output.push(byte);
                at += 1;
            }
        }
    }
    Ok(output)
}

/// The byte that the `%XX` escape at `at` stands for.
fn escaped(input: &[u8], at: usize) -> Result<u8, OpError> {
    input
        .get(at + 1..at + 3)
        .filter(|hex| hex.iter().all(u8::is_ascii_hexdigit))
        .and_then(|hex| std::str::from_utf8(hex).ok())
        .and_then(|hex| u8::from_str_radix(hex, 16).ok())
        .ok_or_else(|| {
            OpError::at(format!("Invalid percent escape at offset {at}"), at)
        })
}

#[cfg(test)]
mod tests {
    use crate::testing::{op, run, run_err, run_with};
    use proptest::prelude::*;
    use serde_json::json;

    use super::*;

    #[test]
    fn encodes_all_but_unreserved_characters() {
        assert_eq!(run("url.encode", "a b&c=d/e"), "a%20b%26c%3Dd%2Fe");
        assert_eq!(run("url.encode", "AZaz09-._~"), "AZaz09-._~");
        assert_eq!(
            run("url.encode", "привет"),
            "%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82"
        );
        assert_eq!(run("url.encode", "100%"), "100%25");
    }

    #[test]
    fn can_keep_url_delimiters_and_write_spaces_as_plus() {
        let url = json!({"keep": "url"});
        let link = "https://x.ru/a b?q=1&r=[2]#top";
        assert_eq!(
            run_with("url.encode", link, url),
            "https://x.ru/a%20b?q=1&r=[2]#top"
        );
        let form = json!({"plus": true});
        assert_eq!(run_with("url.encode", "a b+c", form), "a+b%2Bc");
    }

    #[test]
    fn decodes_escapes_in_either_case() {
        assert_eq!(run("url.decode", "a%20b%2fc%2F"), "a b/c/");
        assert_eq!(run("url.decode", "%D0%BF%d1%80"), "пр");
        assert_eq!(run("url.decode", "a+b"), "a+b");
        let form = json!({"plus": true});
        assert_eq!(run_with("url.decode", "a+b%2B", form), "a b+");
    }

    #[test]
    fn decoding_names_the_offset_of_a_bad_escape() {
        let cases = [
            ("ab%zz", "Invalid percent escape at offset 2"),
            ("ab%4", "Invalid percent escape at offset 2"),
            ("%", "Invalid percent escape at offset 0"),
            ("%+1", "Invalid percent escape at offset 0"),
        ];
        for (input, message) in cases {
            assert_eq!(run_err("url.decode", input), message, "{input}");
        }
    }

    #[test]
    fn decoded_bytes_need_not_be_text() {
        let op = op("url.decode");
        let output = (op.run)(b"%FF", &Params::defaults(op.meta.params));
        assert_eq!(output.unwrap(), [0xff]);
    }

    proptest! {
        #[test]
        fn bytes_round_trip(
            bytes in prop::collection::vec(any::<u8>(), 0..64),
            plus in any::<bool>(),
        ) {
            let given = json!({"plus": plus});
            let params = |id| {
                let given = given.as_object().unwrap();
                Params::resolve(op(id).meta.params, given).unwrap()
            };
            let encoded = encode(&bytes, &params("url.encode"))?;
            prop_assert_eq!(decode(&encoded, &params("url.decode"))?, bytes);
        }
    }
}
