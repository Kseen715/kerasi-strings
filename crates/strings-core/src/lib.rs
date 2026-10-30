//! The engine of Kerasi Strings: every string operation, the recipe runner
//! and the board. Pure Rust without WebAssembly dependencies;
//! `strings-wasm` exports it to the browser.

pub mod board;
pub mod op;
pub mod ops;
pub mod recipe;
pub mod registry;
pub mod render;

#[cfg(test)]
mod testing;

pub use ops::hash::MultiHasher;
pub use ops::unicode_escape::take_names_wanted;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
