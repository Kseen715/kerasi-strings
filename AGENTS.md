# Agent rules

Kerasi Strings is a static string workbench on GitHub Pages: a TypeScript +
React UI (`web/`) and a Rust engine compiled to WebAssembly (`crates/`). The
plan, scope and design decisions are in `PLAN.md`; read it before a larger
change and update it when a decision changes.

## Keep the user's data on the user's machine

The promise of this app is that no input ever leaves the browser tab. Every
change must keep it true.

### Everything ships with the deployment

The site is fully static. Every file the app needs at runtime (WASM, scripts,
styles, fonts, icons, images, keyboard layout tables, any data) is built into
the deployment and served from the same origin. If a feature needs a file, add
it to the repository or the build and ship it in the release; never load it
from another host, not even a CDN or a "trusted" API. Build-time downloads
(crates, npm packages) are fine; runtime ones are not.

### Things that must not be removed or weakened

- The Content Security Policy `<meta>` in `web/index.html`. Never widen
  `connect-src`, `script-src`, `font-src` or `img-src` beyond `'self'` (plus
  `'wasm-unsafe-eval'` and `data:` images as listed in `PLAN.md`).
- No request to another origin at runtime: no CDNs, Google Fonts, analytics,
  error reporting, telemetry or remote config. Fonts and icons are bundled at
  build time. This includes the Kerasi `Icon` component and `tokens/fonts.css`,
  which load from the network; they stay replaced by the local versions in
  `web/src/ds/`.
- The end-to-end test that fails on any off-origin request, and the offline
  (service worker) test.
- Input is not written to `localStorage`, the URL or anywhere else unless the
  user turned that on. Share links carry the recipe in the URL fragment only.
- The "Local only · 0 requests" counter shows a real measurement, never a
  hard-coded value.

## Keep third-party notices in sync with the code

The site ships third-party code and assets: Rust crates in the WASM, npm
packages in the bundle, the Oswald, Manrope and JetBrains Mono fonts (SIL OFL),
Lucide icons (ISC) and the Kerasi design system. Treat a notices update as
part of the change itself, made in the same commit and never left for later.

The project's own license is not chosen yet. It is decided as components are
added: the license of every shipped component is recorded when it comes in,
and the project license must be compatible with all of them. When a component
would narrow that choice (any copyleft license: GPL, LGPL, AGPL, MPL), say so
and ask the user before adding it.

- When you add, remove or upgrade a crate or npm package, or bundle a new font,
  icon set or image, update the third-party notices the site ships with it.
  The build writes `THIRD-PARTY-NOTICES.txt` from what it contains
  (`web/build/notices.ts`); check the result, and keep its `ALLOWED`
  licenses, `WORKBOX` list and `deny.toml` in step. Something it cannot
  see (a file copied into `web/public`, say) needs its notice added there.
- Only add a dependency whose license allows redistribution in a public static
  site (MIT, Apache-2.0, BSD, ISC, Zlib, OFL, MPL-2.0 and similar). If a
  license is unclear, stop and ask the user. Do not guess.
- Commit the updated `Cargo.lock` and `web/package-lock.json`.
- Prefer pure-Rust crates with `default-features = false`. Do not add a crate
  that needs C code, threads or network access in the WASM build.

## Code style

The code must stay easy to read, edit and extend by people. Read it first and
match what is already there.

- Code, scripts and config files keep lines at most 80 columns.
- A function fits in 40 lines. A longer one (up to 120-150 lines, rarely more)
  is allowed only when splitting it would make it harder to follow, and then a
  comment above it says why.
- Separate the logical blocks of a function with one empty line, for example:
  decode the input, run the steps, collect the trace, encode the result.
- A block that more than one file needs goes into its own module, which they
  import.
- Code explains itself through names and structure. Comments say why the code
  is written this way, and only where it does something unusual. Never write a
  comment that repeats what the code does.
- Do not repeat yourself (DRY): one constant, helper or table per fact.
- Constants and shared variables go at the top of the file, under the imports,
  where possible.
- Every string operation lives in Rust, in `crates/strings-core`, and is
  registered in its registry with its metadata. `crates/strings-wasm` holds
  only the `wasm-bindgen` exports and no logic. The UI never implements an
  operation itself; it builds lists, options and search from `ops_meta()`.
- `strings-core` has no WebAssembly dependencies and is tested with plain
  `cargo test`.
- The UI talks to the engine only through the worker client in
  `web/src/engine/`; no other module imports the WASM package.
- UI uses the Kerasi components from `vendor/kerasi-design` and its semantic
  tokens (`--bg`, `--fg-1`, `--accent`, ...). Do not copy a component into this
  repository or hard-code a colour; app-only components go in `web/src/ds/`.
  Small labels use `--fg-2`, not `--fg-3`, to keep AA contrast.
- Rust is formatted with `cargo fmt` (`rustfmt.toml`: `max_width = 80`) and
  linted with `cargo clippy --all-targets -- -D warnings`. TypeScript is
  formatted with Prettier (`web/.prettierrc`: 80 columns, single quotes) and
  linted with ESLint (`web/eslint.config.js`). Run all of them before
  finishing a change. They must pass.
- Tests: Rust unit and property tests next to the code in `crates/`
  (`cargo test`), UI tests in `web/src` (Vitest), end-to-end tests in
  `web/tests/e2e` (Playwright). Add or update the tests of the part a change
  touches, and run that part's tests before finishing it. They must pass. A
  new operation always comes with tests against published vectors where they
  exist (RFC 4648, RFC 1321, FIPS 180).
