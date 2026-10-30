//! Punycode as RFC 3492 defines it, for a whole text or for each label of
//! a domain name (the `xn--` form of IDNA). The domain form lower-cases
//! labels, as browsers do; it applies no other IDNA mapping and does not
//! check the labels.

use crate::op::{
    Choice, Group, Op, OpError, OpMeta, OpResult, ParamKind, ParamSpec, Params,
    text,
};

const BASE: u32 = 36;
const T_MIN: u32 = 1;
const T_MAX: u32 = 26;
const SKEW: u32 = 38;
const DAMP: u32 = 700;
const INITIAL_BIAS: u32 = 72;
const INITIAL_N: u32 = 0x80;
const DELIMITER: char = '-';
const ACE_PREFIX: &str = "xn--";

const MODE: ParamSpec = ParamSpec {
    id: "mode",
    name: "Input",
    kind: ParamKind::Choice {
        options: &[
            Choice {
                id: "domain",
                name: "Domain name (xn--)",
            },
            Choice {
                id: "raw",
                name: "Raw text",
            },
        ],
        default: "domain",
    },
};

pub static OPS: &[Op] = &[
    op(
        "punycode.encode",
        "Punycode encode",
        "пример.рф → xn--e1afmkfd.xn--p1ai",
        encode,
    ),
    op(
        "punycode.decode",
        "Punycode decode",
        "xn--e1afmkfd.xn--p1ai → пример.рф",
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
            params: &[MODE],
            example,
        },
        run,
    }
}

fn is_domain(params: &Params) -> bool {
    params.choice("mode") == "domain"
}

fn encode(input: &[u8], params: &Params) -> OpResult {
    let input = text(input)?;
    if !is_domain(params) {
        return Ok(encode_str(input)?.into_bytes());
    }

    let labels = input
        .split('.')
        .map(|label| {
            let label = label.to_lowercase();
            if label.is_ascii() {
                Ok(label)
            } else {
                Ok(format!("{ACE_PREFIX}{}", encode_str(&label)?))
            }
        })
        .collect::<Result<Vec<_>, OpError>>()?;
    Ok(labels.join(".").into_bytes())
}

fn decode(input: &[u8], params: &Params) -> OpResult {
    let input = text(input)?;
    if !is_domain(params) {
        return Ok(decode_str(input, 0)?.into_bytes());
    }

    let mut labels = Vec::new();
    let mut start = 0;
    for label in input.split('.') {
        labels.push(decode_label(label, start)?);
        start += label.len() + 1;
    }
    Ok(labels.join(".").into_bytes())
}

/// `start` is the label's byte offset in the input, for error offsets.
fn decode_label(label: &str, start: usize) -> Result<String, OpError> {
    let prefixed = label
        .get(..ACE_PREFIX.len())
        .is_some_and(|head| head.eq_ignore_ascii_case(ACE_PREFIX));
    if prefixed {
        let at = start + ACE_PREFIX.len();
        decode_str(&label[ACE_PREFIX.len()..], at)
    } else {
        Ok(label.to_owned())
    }
}

fn too_long() -> OpError {
    OpError::new("Text is too long for Punycode")
}

/// RFC 3492 §6.3: the basic code points, the delimiter, then each other
/// code point as a variable-length number of the insertion it stands for.
fn encode_str(input: &str) -> Result<String, OpError> {
    let chars: Vec<u32> = input.chars().map(u32::from).collect();
    let mut output: String = input.chars().filter(char::is_ascii).collect();
    let basic = output.len() as u32;
    if basic > 0 {
        output.push(DELIMITER);
    }

    let (mut n, mut delta, mut bias) = (INITIAL_N, 0u32, INITIAL_BIAS);
    let mut handled = basic;
    while (handled as usize) < chars.len() {
        let next = chars.iter().copied().filter(|&c| c >= n).min();
        let next = next.expect("an unhandled code point is left");
        delta = (next - n)
            .checked_mul(handled + 1)
            .and_then(|step| delta.checked_add(step))
            .ok_or_else(too_long)?;
        n = next;

        for &c in &chars {
            if c < n {
                delta = delta.checked_add(1).ok_or_else(too_long)?;
            }
            if c == n {
                push_number(&mut output, delta, bias);
                bias = adapt(delta, handled + 1, handled == basic);
                delta = 0;
                handled += 1;
            }
        }
        delta += 1;
        n += 1;
    }
    Ok(output)
}

fn push_number(output: &mut String, mut q: u32, bias: u32) {
    let mut k = BASE;
    loop {
        let t = threshold(k, bias);
        if q < t {
            break;
        }
        output.push(digit(t + (q - t) % (BASE - t)));
        q = (q - t) / (BASE - t);
        k += BASE;
    }
    output.push(digit(q));
}

/// RFC 3492 §6.2. `start` is the byte offset of `input` in the text the
/// user gave, so errors point at the right character.
fn decode_str(input: &str, start: usize) -> Result<String, OpError> {
    let (basic, extended, extended_at) = match input.rfind(DELIMITER) {
        Some(at) => (&input[..at], &input[at + 1..], at + 1),
        None => ("", input, 0),
    };
    if let Some((at, c)) = basic.char_indices().find(|(_, c)| !c.is_ascii()) {
        return Err(invalid(c, start + at));
    }

    let mut output: Vec<char> = basic.chars().collect();
    let mut digits = extended
        .char_indices()
        .map(|(at, c)| (start + extended_at + at, c))
        .peekable();
    let (mut n, mut i, mut bias) = (INITIAL_N, 0u32, INITIAL_BIAS);
    while let Some(&(at, _)) = digits.peek() {
        let old_i = i;
        i = read_number(&mut digits, i, bias)?;
        let length = output.len() as u32 + 1;
        bias = adapt(i - old_i, length, old_i == 0);
        n = n.checked_add(i / length).ok_or_else(|| out_of_range(at))?;
        i %= length;

        let c = char::from_u32(n).ok_or_else(|| out_of_range(at))?;
        output.insert(i as usize, c);
        i += 1;
    }
    Ok(output.into_iter().collect())
}

/// Adds one variable-length number, read from `digits`, to `i`.
fn read_number(
    digits: &mut impl Iterator<Item = (usize, char)>,
    mut i: u32,
    bias: u32,
) -> Result<u32, OpError> {
    let mut weight = 1u32;
    let mut k = BASE;
    loop {
        let (at, c) = digits
            .next()
            .ok_or_else(|| OpError::new("Punycode text ends too early"))?;
        let value = value(c).ok_or_else(|| invalid(c, at))?;
        i = value
            .checked_mul(weight)
            .and_then(|step| i.checked_add(step))
            .ok_or_else(|| out_of_range(at))?;

        let t = threshold(k, bias);
        if value < t {
            return Ok(i);
        }
        weight = weight
            .checked_mul(BASE - t)
            .ok_or_else(|| out_of_range(at))?;
        k += BASE;
    }
}

fn invalid(c: char, at: usize) -> OpError {
    OpError::at(
        format!("Invalid Punycode character '{c}' at offset {at}"),
        at,
    )
}

fn out_of_range(at: usize) -> OpError {
    OpError::at(format!("Punycode value is out of range at offset {at}"), at)
}

fn threshold(k: u32, bias: u32) -> u32 {
    k.saturating_sub(bias).clamp(T_MIN, T_MAX)
}

/// RFC 3492 §6.1
fn adapt(delta: u32, length: u32, first: bool) -> u32 {
    let mut delta = if first { delta / DAMP } else { delta / 2 };
    delta += delta / length;
    let mut k = 0;
    while delta > ((BASE - T_MIN) * T_MAX) / 2 {
        delta /= BASE - T_MIN;
        k += BASE;
    }
    k + (BASE - T_MIN + 1) * delta / (delta + SKEW)
}

fn digit(value: u32) -> char {
    let byte = match value {
        0..=25 => b'a' + value as u8,
        _ => b'0' + (value - 26) as u8,
    };
    char::from(byte)
}

/// Digits read in either case: RFC 3492 uses upper case to annotate the
/// case of the decoded text, which a decoder may ignore.
fn value(c: char) -> Option<u32> {
    match c {
        'a'..='z' => Some(u32::from(c) - u32::from('a')),
        'A'..='Z' => Some(u32::from(c) - u32::from('A')),
        '0'..='9' => Some(u32::from(c) - u32::from('0') + 26),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use crate::testing::{op, run_with};
    use proptest::prelude::*;
    use serde_json::json;

    use super::*;

    // RFC 3492 §7.1, encoded in lower case
    const VECTORS: [(&str, &str); 9] = [
        ("他们为什么不说中文", "ihqwcrb4cv8a8dqg056pqjye"),
        ("他們爲什麽不說中文", "ihqwctvzc91f659drss3x8bo0yb"),
        ("Pročprostěnemluvíčesky", "Proprostnemluvesky-uyb24dma41a"),
        (
            "なぜみんな日本語を話してくれないのか",
            "n8jok5ay5dzabd5bym9f0cm5685rrjetr6pdxa",
        ),
        (
            "почемужеонинеговорятпорусски",
            "b1abfaaepdrnnbgefbadotcwatmq2g4l",
        ),
        ("3年B組金八先生", "3B-ww4c5e180e575a65lsy2b"),
        (
            "安室奈美恵-with-SUPER-MONKEYS",
            "-with-SUPER-MONKEYS-pc58ag80a8qai00g7n9n",
        ),
        ("そのスピードで", "d9juau41awczczp"),
        ("-> $1.00 <-", "-> $1.00 <--"),
    ];

    fn raw(id: &str, input: &str) -> String {
        run_with(id, input, json!({"mode": "raw"}))
    }

    fn output(id: &str, input: &str, mode: &str) -> Result<String, String> {
        let op = op(id);
        let given = json!({ "mode": mode });
        let params =
            Params::resolve(op.meta.params, given.as_object().unwrap())
                .unwrap();
        (op.run)(input.as_bytes(), &params)
            .map(|bytes| String::from_utf8(bytes).unwrap())
            .map_err(|error| error.message)
    }

    #[test]
    fn raw_text_matches_rfc_3492() {
        for (plain, encoded) in VECTORS {
            assert_eq!(raw("punycode.encode", plain), encoded);
            assert_eq!(raw("punycode.decode", encoded), plain);
        }
    }

    #[test]
    fn decoding_ignores_the_case_annotation() {
        let annotated = "b1abfaaepdrnnbgefbaDotcwatmq2g4l";
        assert_eq!(raw("punycode.decode", annotated), VECTORS[4].0);
    }

    #[test]
    fn domain_names_encode_each_non_ascii_label() {
        let cases = [
            ("пример.рф", "xn--e1afmkfd.xn--p1ai"),
            ("Bücher.example", "xn--bcher-kva.example"),
            ("ПРИМЕР.РФ", "xn--e1afmkfd.xn--p1ai"),
            ("example.com", "example.com"),
            ("", ""),
        ];
        for (domain, encoded) in cases {
            assert_eq!(
                output("punycode.encode", domain, "domain"),
                Ok(encoded.into())
            );
        }
    }

    #[test]
    fn domain_names_decode_only_xn_labels() {
        let cases = [
            ("xn--e1afmkfd.xn--p1ai", "пример.рф"),
            ("XN--bcher-kva.example", "bücher.example"),
            ("e1afmkfd.com", "e1afmkfd.com"),
        ];
        for (encoded, domain) in cases {
            assert_eq!(
                output("punycode.decode", encoded, "domain"),
                Ok(domain.into())
            );
        }
    }

    #[test]
    fn decoding_names_the_offset_of_the_problem() {
        let cases = [
            ("ab!", "raw", "Invalid Punycode character '!' at offset 2"),
            ("é-ab", "raw", "Invalid Punycode character 'é' at offset 0"),
            (
                "x.xn--a$b",
                "domain",
                "Invalid Punycode character '$' at offset 7",
            ),
            (
                "xn--99999999",
                "domain",
                "Punycode value is out of range at offset 11",
            ),
            ("b", "raw", "Punycode text ends too early"),
        ];
        for (input, mode, message) in cases {
            assert_eq!(
                output("punycode.decode", input, mode),
                Err(message.into()),
                "{input}"
            );
        }
    }

    proptest! {
        #[test]
        fn raw_text_round_trips(text in "\\PC{0,40}") {
            let encoded = encode_str(&text).unwrap();
            prop_assert_eq!(decode_str(&encoded, 0)?, text);
        }
    }
}
