//! How bytes are shown: as text when they are valid UTF-8, otherwise as
//! hex pairs.

use serde::Serialize;

/// How many bytes of a binary output `show` turns into hex
pub const HEX_BYTES: usize = 4096;

#[derive(Debug, PartialEq, Serialize)]
pub struct Rendered {
    pub text: bool,
    pub value: String,
    /// The value shows only the start of the bytes
    pub truncated: bool,
}

/// `limit` is the most characters of text, or bytes of hex, to show.
pub fn render(bytes: &[u8], limit: usize) -> Rendered {
    match std::str::from_utf8(bytes) {
        Ok(text) => match text.char_indices().nth(limit) {
            Some((end, _)) => Rendered {
                text: true,
                value: text[..end].to_owned(),
                truncated: true,
            },
            None => Rendered {
                text: true,
                value: text.to_owned(),
                truncated: false,
            },
        },
        Err(_) => {
            let shown = &bytes[..bytes.len().min(limit)];
            let pairs: Vec<String> =
                shown.iter().map(|byte| format!("{byte:02x}")).collect();
            Rendered {
                text: false,
                value: pairs.join(" "),
                truncated: shown.len() < bytes.len(),
            }
        }
    }
}

/// A final output: text whole, since it is what the user copies; binary
/// as hex up to `HEX_BYTES`.
pub fn show(bytes: &[u8]) -> Rendered {
    let rendered = render(bytes, usize::MAX);
    if rendered.text {
        rendered
    } else {
        render(bytes, HEX_BYTES)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_is_shown_as_text_up_to_the_limit() {
        let full = render("привет".as_bytes(), 10);
        assert_eq!((full.text, full.value.as_str()), (true, "привет"));
        assert!(!full.truncated);

        let cut = render("привет".as_bytes(), 3);
        assert_eq!((cut.value.as_str(), cut.truncated), ("при", true));
        assert!(!render(b"abc", 3).truncated);
    }

    #[test]
    fn binary_is_shown_as_hex_pairs() {
        let full = render(&[0xde, 0xad, 0xbe, 0xef], 10);
        assert_eq!((full.text, full.value.as_str()), (false, "de ad be ef"));
        assert!(!full.truncated);

        let cut = render(&[0xff, 0x00, 0x01], 2);
        assert_eq!((cut.value.as_str(), cut.truncated), ("ff 00", true));
    }

    #[test]
    fn show_keeps_text_whole_and_cuts_long_binary() {
        let text = "x".repeat(HEX_BYTES * 2);
        assert_eq!(show(text.as_bytes()).value, text);

        let shown = show(&vec![0xff; HEX_BYTES + 1]);
        assert!(shown.truncated);
        assert_eq!(shown.value.len(), HEX_BYTES * 3 - 1);
    }
}
