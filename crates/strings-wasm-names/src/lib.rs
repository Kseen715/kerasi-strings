//! The same exports as `strings-wasm`, built with the Unicode name table
//! that `\N{...}` escapes need. The browser loads this engine only when a
//! decode meets such an escape.

pub use strings_wasm::*;
