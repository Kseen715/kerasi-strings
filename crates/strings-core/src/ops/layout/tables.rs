//! What each layout types on the 47 printable keys of a keyboard, in the
//! order of the US QWERTY keys: `` ` `` and the digit row, `Q` row with
//! `\`, `A` row, `Z` row. The tables follow the default X keyboard
//! layouts (`/usr/share/X11/xkb/symbols`); dead keys stand for the
//! character they put on screen when pressed twice.

pub const KEYS: usize = 47;

pub struct Layout {
    pub id: &'static str,
    pub name: &'static str,
    pub plain: &'static str,
    pub shifted: &'static str,
}

pub const LAYOUTS: [Layout; 5] = [
    Layout {
        id: "en",
        name: "English (US QWERTY)",
        plain: "`1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./",
        shifted: "~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:\"ZXCVBNM<>?",
    },
    Layout {
        id: "ru",
        name: "Russian (ЙЦУКЕН)",
        plain: "ё1234567890-=йцукенгшщзхъ\\фывапролджэячсмитьбю.",
        shifted: "Ё!\"№;%:?*()_+ЙЦУКЕНГШЩЗХЪ/ФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,",
    },
    Layout {
        id: "uk",
        name: "Ukrainian",
        plain: "'1234567890-=йцукенгшщзхїґфівапролджєячсмитьбю.",
        shifted: "ʼ!\"№;%:?*()_+ЙЦУКЕНГШЩЗХЇҐФІВАПРОЛДЖЄЯЧСМИТЬБЮ,",
    },
    Layout {
        id: "de",
        name: "German (QWERTZ)",
        plain: "^1234567890ß´qwertzuiopü+#asdfghjklöäyxcvbnm,.-",
        shifted: "°!\"§$%&/()=?`QWERTZUIOPÜ*'ASDFGHJKLÖÄYXCVBNM;:_",
    },
    Layout {
        id: "fr",
        name: "French (AZERTY)",
        plain: "²&é\"'(-è_çà)=azertyuiop^$*qsdfghjklmùwxcvbn,;:!",
        shifted: "~1234567890°+AZERTYUIOP¨£µQSDFGHJKLM%WXCVBN?./§",
    },
];

#[cfg(test)]
mod tests {
    use super::{KEYS, LAYOUTS};
    use std::collections::HashSet;

    #[test]
    fn every_layout_covers_all_printable_keys() {
        for layout in &LAYOUTS {
            assert_eq!(layout.plain.chars().count(), KEYS, "{}", layout.id);
            assert_eq!(layout.shifted.chars().count(), KEYS, "{}", layout.id);
        }
    }

    // Each character on one key only, so converting back is unambiguous
    #[test]
    fn every_layout_is_bijective() {
        for layout in &LAYOUTS {
            let chars: Vec<char> =
                layout.plain.chars().chain(layout.shifted.chars()).collect();
            let unique: HashSet<&char> = chars.iter().collect();
            assert_eq!(unique.len(), chars.len(), "{}", layout.id);
        }
    }

    // Letters such as é and ß have no capital on their key, so the check
    // runs from the shifted side
    #[test]
    fn shift_gives_the_capital_of_every_letter() {
        for layout in &LAYOUTS {
            let keys = layout.plain.chars().zip(layout.shifted.chars());
            for (plain, shifted) in keys.filter(|(_, s)| s.is_uppercase()) {
                let upper: String = plain.to_uppercase().collect();
                assert_eq!(upper, shifted.to_string(), "{}", layout.id);
            }
        }
    }
}
