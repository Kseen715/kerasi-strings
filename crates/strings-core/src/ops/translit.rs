//! Russian text written in Latin letters, by one of four systems. The
//! tables follow https://transliteration-online.ru/; characters that are
//! not Russian letters pass through unchanged.

use super::words;
use crate::op::{Group, Op, OpMeta, OpResult, Params, map_text};

/// The order of every table below
const LETTERS: &str = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";

struct System {
    id: &'static str,
    name: &'static str,
    example: &'static str,
    latin: [&'static str; 33],
    /// GOST: `ц` is `c` before `i`, `e`, `y` and `j`, `cz` elsewhere
    short_tse: bool,
    /// Lower case, words joined by `-`, everything else dropped
    slug: bool,
}

const SYSTEMS: [System; 4] = [
    System {
        id: "translit.gost",
        name: "GOST 7.79-2000 (System B)",
        example: "щи → shhi",
        latin: [
            "a", "b", "v", "g", "d", "e", "yo", "zh", "z", "i", "j", "k", "l",
            "m", "n", "o", "p", "r", "s", "t", "u", "f", "x", "cz", "ch", "sh",
            "shh", "``", "y`", "`", "e`", "yu", "ya",
        ],
        short_tse: true,
        slug: false,
    },
    // МИД order 4271 and МВД order 995, which follow ICAO Doc 9303
    System {
        id: "translit.passport",
        name: "Names (passport, ICAO)",
        example: "Юлия → Iuliia",
        latin: [
            "a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "i", "k", "l",
            "m", "n", "o", "p", "r", "s", "t", "u", "f", "kh", "ts", "ch",
            "sh", "shch", "ie", "y", "", "e", "iu", "ia",
        ],
        short_tse: false,
        slug: false,
    },
    System {
        id: "translit.yandex",
        name: "URL slug (Yandex)",
        example: "Привет, мир → privet-mir",
        latin: [
            "a", "b", "v", "g", "d", "e", "yo", "zh", "z", "i", "j", "k", "l",
            "m", "n", "o", "p", "r", "s", "t", "u", "f", "kh", "c", "ch", "sh",
            "shch", "", "y", "", "eh", "yu", "ya",
        ],
        short_tse: false,
        slug: true,
    },
    // The site drops `э` here, which reads as a slip; it is `e` instead.
    System {
        id: "translit.google",
        name: "URL slug (Google)",
        example: "Жёлтый дом → jeltyy-dom",
        latin: [
            "a", "b", "v", "g", "d", "e", "e", "j", "z", "i", "y", "k", "l",
            "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "c", "ch", "sh",
            "sch", "", "y", "", "e", "u", "ya",
        ],
        short_tse: false,
        slug: true,
    },
];

pub static OPS: &[Op] = &[op::<0>(), op::<1>(), op::<2>(), op::<3>()];

const fn op<const S: usize>() -> Op {
    let system = &SYSTEMS[S];
    Op {
        meta: OpMeta {
            id: system.id,
            name: system.name,
            group: Group::Translit,
            params: &[],
            example: system.example,
        },
        run: run::<S>,
    }
}

fn run<const S: usize>(input: &[u8], _: &Params) -> OpResult {
    map_text(input, |text| transliterate(&SYSTEMS[S], text))
}

fn transliterate(system: &System, text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut output = String::with_capacity(text.len());
    for (i, &c) in chars.iter().enumerate() {
        match latin(system, c, chars.get(i + 1).copied()) {
            Some(latin) => {
                push_cased(&mut output, latin, c, all_caps(&chars, i))
            }
            None => output.push(c),
        }
    }

    if !system.slug {
        return output;
    }
    words::split(&output.to_lowercase()).join("-")
}

fn latin(system: &System, c: char, next: Option<char>) -> Option<&'static str> {
    let lower = c.to_lowercase().next()?;
    let index = LETTERS.chars().position(|letter| letter == lower)?;
    let soft = || {
        next.and_then(|next| latin(system, next, None))
            .is_some_and(|latin| latin.starts_with(['i', 'e', 'y', 'j']))
    };
    if system.short_tse && lower == 'ц' && soft() {
        return Some("c");
    }
    Some(system.latin[index])
}

/// A capital written with several letters is all capitals inside a word
/// in capitals (`ЩИ` → `SHHI`), and only capitalized elsewhere (`Щи` →
/// `Shhi`).
fn all_caps(chars: &[char], i: usize) -> bool {
    let cased = |c: &&char| c.is_uppercase() || c.is_lowercase();
    match chars.get(i + 1).filter(cased) {
        Some(next) => next.is_uppercase(),
        None => i > 0 && chars[i - 1].is_uppercase(),
    }
}

fn push_cased(output: &mut String, latin: &str, c: char, all_caps: bool) {
    if !c.is_uppercase() {
        output.push_str(latin);
    } else if all_caps {
        output.push_str(&latin.to_uppercase());
    } else {
        let mut letters = latin.chars();
        output.extend(letters.next().map(|first| first.to_ascii_uppercase()));
        output.push_str(letters.as_str());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::run;

    #[test]
    fn every_table_covers_every_letter() {
        assert_eq!(LETTERS.chars().count(), 33);
        assert!(SYSTEMS.iter().all(|system| system.latin.len() == 33));
    }

    // GOST 7.79-2000, table 1, system B
    #[test]
    fn gost_matches_the_standard_table() {
        assert_eq!(
            run("translit.gost", LETTERS),
            "abvgdeyozhzijklmnoprstufxczchshshh``y``e`yuya"
        );
    }

    #[test]
    fn gost_writes_tse_as_c_before_i_e_y_and_j() {
        let cases = [
            ("цирк", "cirk"),
            ("центр", "centr"),
            ("цыган", "cy`gan"),
            ("цюрих", "cyurix"),
            ("лицо", "liczo"),
            ("конец", "konecz"),
            ("Царь", "Czar`"),
        ];
        for (russian, latin) in cases {
            assert_eq!(run("translit.gost", russian), latin, "{russian}");
        }
    }

    #[test]
    fn capitals_follow_the_word_around_them() {
        let cases = [
            ("Щука", "Shhuka"),
            ("ЩУКА", "SHHUKA"),
            ("ЁЖ", "YOZH"),
            ("Ёж Ёжиков", "Yozh Yozhikov"),
            ("ВХОД 5", "VXOD 5"),
            ("Я", "Ya"),
        ];
        for (russian, latin) in cases {
            assert_eq!(run("translit.gost", russian), latin, "{russian}");
        }
    }

    #[test]
    fn other_characters_pass_through() {
        assert_eq!(run("translit.gost", "Hi, мир! 42"), "Hi, mir! 42");
        assert_eq!(run("translit.yandex", "Ünïcode"), "ünïcode");
    }

    // ICAO Doc 9303 part 3, table for Cyrillic
    #[test]
    fn passport_names_follow_icao() {
        assert_eq!(
            run("translit.passport", LETTERS),
            "abvgdeezhziiklmnoprstufkhtschshshchieyeiuia"
        );
        let cases = [
            ("Юлия", "Iuliia"),
            ("Щербаков Артём", "Shcherbakov Artem"),
            ("ЮЛИЯ", "IULIIA"),
            ("Подъячев", "Podieiachev"),
        ];
        for (russian, latin) in cases {
            assert_eq!(run("translit.passport", russian), latin, "{russian}");
        }
    }

    #[test]
    fn slugs_are_lower_case_words_joined_by_dashes() {
        let cases = [
            (
                "translit.yandex",
                LETTERS,
                "abvgdeyozhzijklmnoprstufkhcchshshchyehyuya",
            ),
            ("translit.yandex", "Привет, мир!", "privet-mir"),
            (
                "translit.yandex",
                "  Съешь  же — iPhone 15 ",
                "sesh-zhe-iphone-15",
            ),
            (
                "translit.google",
                LETTERS,
                "abvgdeejziyklmnoprstufhcchshschyeuya",
            ),
            ("translit.google", "Жёлтый дом", "jeltyy-dom"),
            ("translit.google", "Этаж", "etaj"),
        ];
        for (id, russian, slug) in cases {
            assert_eq!(run(id, russian), slug, "{id}({russian})");
        }
    }
}
