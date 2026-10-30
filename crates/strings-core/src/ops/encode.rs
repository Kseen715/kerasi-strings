//! Base64 and Base32 as RFC 4648 defines them. Decoders skip ASCII
//! whitespace, accept the text with or without padding, and name the
//! offset of the first character they cannot read.

use crate::op::{
    Choice, Group, Op, OpError, OpMeta, OpResult, ParamKind, ParamSpec, Params,
};
use data_encoding::{
    BASE32, BASE32_NOPAD, BASE64, BASE64_NOPAD, BASE64URL, BASE64URL_NOPAD,
    DecodeError, DecodeKind, Encoding,
};

const ALPHABET: ParamSpec = ParamSpec {
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
};

const PADDING: ParamSpec = ParamSpec {
    id: "padding",
    name: "Padding (=)",
    kind: ParamKind::Flag { default: true },
};

pub static OPS: &[Op] = &[
    op(
        "base64.encode",
        "Base64 encode",
        "hi → aGk=",
        &[ALPHABET, PADDING],
        base64_encode,
    ),
    op(
        "base64.decode",
        "Base64 decode",
        "aGk= → hi",
        &[ALPHABET],
        base64_decode,
    ),
    op(
        "base32.encode",
        "Base32 encode",
        "hi → NBUQ====",
        &[PADDING],
        base32_encode,
    ),
    op(
        "base32.decode",
        "Base32 decode",
        "NBUQ==== → hi",
        &[],
        base32_decode,
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

fn base64(url: bool, padded: bool) -> Encoding {
    match (url, padded) {
        (false, true) => BASE64,
        (false, false) => BASE64_NOPAD,
        (true, true) => BASE64URL,
        (true, false) => BASE64URL_NOPAD,
    }
}

fn base32(padded: bool) -> Encoding {
    if padded { BASE32 } else { BASE32_NOPAD }
}

fn base64_encode(input: &[u8], params: &Params) -> OpResult {
    let url = params.choice("alphabet") == "url";
    let encoding = base64(url, params.flag("padding"));
    Ok(encoding.encode(input).into_bytes())
}

fn base64_decode(input: &[u8], params: &Params) -> OpResult {
    let url = params.choice("alphabet") == "url";
    decode(input, "Base64", |padded| base64(url, padded))
}

fn base32_encode(input: &[u8], params: &Params) -> OpResult {
    Ok(base32(params.flag("padding")).encode(input).into_bytes())
}

/// Base32 has one letter case only, so lower case is read as upper case.
fn base32_decode(input: &[u8], _: &Params) -> OpResult {
    let upper = input.to_ascii_uppercase();
    decode(&upper, "Base32", base32)
}

fn decode(
    input: &[u8],
    name: &str,
    encoding: impl Fn(bool) -> Encoding,
) -> OpResult {
    let (kept, offsets): (Vec<u8>, Vec<usize>) = input
        .iter()
        .enumerate()
        .filter(|(_, byte)| !byte.is_ascii_whitespace())
        .map(|(offset, byte)| (*byte, offset))
        .unzip();

    let encoding = encoding(kept.contains(&b'='));
    let error = match first_foreign(&encoding, &kept) {
        Some(position) => DecodeError {
            position,
            kind: DecodeKind::Symbol,
        },
        None => match encoding.decode(&kept) {
            Ok(bytes) => return Ok(bytes),
            Err(error) => error,
        },
    };
    let offset = offsets.get(error.position).copied();
    Err(describe(name, error.kind, offset.map(|at| (at, input[at]))))
}

/// The library checks the length first; looking for a foreign character
/// before that names the actual mistake in text like `Zm9v!`.
fn first_foreign(encoding: &Encoding, text: &[u8]) -> Option<usize> {
    let symbols = encoding.specification().symbols;
    text.iter()
        .position(|&byte| byte != b'=' && !symbols.as_bytes().contains(&byte))
}

fn describe(name: &str, kind: DecodeKind, at: Option<(usize, u8)>) -> OpError {
    let Some((offset, byte)) = at else {
        return OpError::new(format!("{name} text ends too early"));
    };
    let what = match kind {
        DecodeKind::Symbol if byte == b'=' => {
            format!("Misplaced {name} padding")
        }
        DecodeKind::Symbol => {
            format!("Invalid {name} character {}", shown(byte))
        }
        DecodeKind::Trailing => format!("{name} text has extra bits"),
        DecodeKind::Padding => format!("Misplaced {name} padding"),
        DecodeKind::Length => format!("{name} text has the wrong length"),
    };
    OpError::at(format!("{what} at offset {offset}"), offset)
}

fn shown(byte: u8) -> String {
    if byte.is_ascii_graphic() {
        format!("'{}'", char::from(byte))
    } else {
        format!("0x{byte:02X}")
    }
}

#[cfg(test)]
mod tests {
    use crate::testing::{run, run_err, run_with};
    use proptest::prelude::*;
    use serde_json::json;

    use super::*;

    // RFC 4648 §10
    const BASE64_VECTORS: [(&str, &str); 7] = [
        ("", ""),
        ("f", "Zg=="),
        ("fo", "Zm8="),
        ("foo", "Zm9v"),
        ("foob", "Zm9vYg=="),
        ("fooba", "Zm9vYmE="),
        ("foobar", "Zm9vYmFy"),
    ];

    const BASE32_VECTORS: [(&str, &str); 7] = [
        ("", ""),
        ("f", "MY======"),
        ("fo", "MZXQ===="),
        ("foo", "MZXW6==="),
        ("foob", "MZXW6YQ="),
        ("fooba", "MZXW6YTB"),
        ("foobar", "MZXW6YTBOI======"),
    ];

    #[test]
    fn base64_matches_rfc_4648() {
        for (plain, encoded) in BASE64_VECTORS {
            assert_eq!(run("base64.encode", plain), encoded);
            assert_eq!(run("base64.decode", encoded), plain);
        }
    }

    #[test]
    fn base32_matches_rfc_4648() {
        for (plain, encoded) in BASE32_VECTORS {
            assert_eq!(run("base32.encode", plain), encoded);
            assert_eq!(run("base32.decode", encoded), plain);
        }
    }

    #[test]
    fn padding_can_be_left_out() {
        let bare = json!({"padding": false});
        assert_eq!(run_with("base64.encode", "f", bare.clone()), "Zg");
        assert_eq!(run_with("base32.encode", "f", bare), "MY");
        assert_eq!(run("base64.decode", "Zg"), "f");
        assert_eq!(run("base32.decode", "MY"), "f");
    }

    #[test]
    fn url_safe_alphabet_uses_minus_and_underscore() {
        let input = "\u{fb}\u{ff}";
        let url = json!({"alphabet": "url", "padding": false});
        assert_eq!(run("base64.encode", input), "w7vDvw==");
        assert_eq!(run_with("base64.encode", "?>?", url.clone()), "Pz4_");
        assert_eq!(run_with("base64.encode", "\u{3ff}", url), "z78");
        let url = json!({"alphabet": "url"});
        assert_eq!(run_with("base64.decode", "Pz4_", url), "?>?");
    }

    #[test]
    fn decoders_skip_whitespace_and_accept_lower_case_base32() {
        assert_eq!(run("base64.decode", " Zm9v\nYmFy\t"), "foobar");
        assert_eq!(run("base32.decode", "mzxw6 ytb"), "fooba");
    }

    #[test]
    fn decoders_name_the_offset_of_the_problem() {
        let cases = [
            (
                "base64.decode",
                "Zm9v!",
                "Invalid Base64 character '!' at offset 4",
            ),
            (
                "base64.decode",
                "Zm 9\u{e9}",
                "Invalid Base64 character 0xC3 at offset 4",
            ),
            (
                "base64.decode",
                "Zh==",
                "Base64 text has extra bits at offset 1",
            ),
            (
                "base64.decode",
                "Zg=a",
                "Misplaced Base64 padding at offset 2",
            ),
            (
                "base64.decode",
                "Z",
                "Base64 text has the wrong length at offset 0",
            ),
            (
                "base64.decode",
                "Zm9v_w",
                "Invalid Base64 character '_' at offset 4",
            ),
            (
                "base32.decode",
                "MY1=====",
                "Invalid Base32 character '1' at offset 2",
            ),
        ];
        for (id, input, message) in cases {
            assert_eq!(run_err(id, input), message, "{id}({input})");
        }
    }

    #[test]
    fn decoded_bytes_need_not_be_text() {
        let op = crate::testing::op("base64.decode");
        let output = (op.run)(b"/w==", &Params::defaults(op.meta.params));
        assert_eq!(output.unwrap(), [0xff]);
    }

    proptest! {
        #[test]
        fn base64_round_trips(
            bytes in prop::collection::vec(any::<u8>(), 0..64),
            url in any::<bool>(),
            padded in any::<bool>(),
        ) {
            let encoding = base64(url, padded);
            let encoded = encoding.encode(&bytes);
            let alphabet = if url { "url" } else { "standard" };
            let params = Params::resolve(
                ALPHABET_ONLY,
                json!({"alphabet": alphabet}).as_object().unwrap(),
            ).unwrap();
            prop_assert_eq!(base64_decode(encoded.as_bytes(), &params)?, bytes);
        }

        #[test]
        fn base32_round_trips(
            bytes in prop::collection::vec(any::<u8>(), 0..64),
            padded in any::<bool>(),
        ) {
            let encoded = base32(padded).encode(&bytes);
            let decoded = base32_decode(encoded.as_bytes(), &no_params())?;
            prop_assert_eq!(decoded, bytes);
        }
    }

    static ALPHABET_ONLY: &[ParamSpec] = &[ALPHABET];

    fn no_params() -> Params {
        Params::defaults(&[])
    }
}
