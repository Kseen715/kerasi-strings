# Kerasi Strings

[![CI](https://github.com/Kseen715/kerasi-strings/actions/workflows/ci.yml/badge.svg)](https://github.com/Kseen715/kerasi-strings/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Kseen715/kerasi-strings/badges/coverage.json)](#tests)

A string workbench that runs in your browser tab: case styles, keyboard
layout fixes, Base64, Base32 and hashes, one at a time or chained into a
recipe. The engine is Rust compiled to WebAssembly; the page is
TypeScript and React with the Kerasi design system.

Nothing you type leaves the tab. The site is fully static, loads every
file from its own origin, sends no analytics and works offline. A Content
Security Policy blocks requests to other origins, an end-to-end test fails
on any, and the header shows a live count of them.

## What it does

| Group           | Operations                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Case            | lower, UPPER, Title, Sentence, iNVERT, camelCase, PascalCase, snake_case, SCREAMING_SNAKE_CASE, kebab-case, SCREAMING-KEBAB, Train-Case, dot, path, flat |
| Keyboard layout | Fix layout (auto-detect or explicit, English / Russian / Ukrainian / German / French), Detect layout                                                     |
| Encode          | Base64 and Base32 encode and decode (RFC 4648; URL-safe alphabet, padding on or off)                                                                     |
| Hash            | MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512 as hex, HEX or Base64                                                                                     |

Two modes share the input:

- **Board** runs every operation live on the input; click a row to use it
  as the new input, or copy it. A dropped file is hashed in chunks, so its
  size does not matter.
- **Recipe** chains operations with options, shows a trace of every step,
  and turns the output into the next input. Ctrl K finds an operation;
  on a step's handle Delete removes it and Alt+↑/↓ moves it. Recipes can be
  saved on the device or shared as a link that carries the recipe after
  the `#`, which browsers never send to a server.

## Building

You need Rust with the `wasm32-unknown-unknown` target, `wasm-pack` and
Node 24.

```sh
git clone --recurse-submodules https://github.com/Kseen715/kerasi-strings
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
npm --prefix web install
npm --prefix web run dev     # the engine in debug, then the dev server
npm --prefix web run build   # the site in web/dist
```

`npm run dev` serves the page without its Content Security Policy, which
blocks the dev server's inline script; builds and previews keep it.

## Tests

| What                                                                          | Command                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Rust: unit and property tests, RFC 4648 / RFC 1321 / FIPS 180 vectors         | `cargo test`                                                                         |
| Rust: format, lint, licenses                                                  | `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo deny check` |
| WebAssembly exports in headless Chrome                                        | `wasm-pack test --headless --chrome crates/strings-wasm`                             |
| UI: Vitest on the real engine                                                 | `npm --prefix web test` (`run coverage` for the report)                              |
| UI: format, lint, types                                                       | `npm --prefix web run format:check`, `lint`, `typecheck`                             |
| Size budgets (WASM ≤ 150 KB, JS ≤ 120 KB gzipped)                             | `npm --prefix web run budget` after a build                                          |
| End-to-end on the built site: no off-origin request, offline, keyboard, phone | `npm --prefix web run e2e` after a build                                             |

CI (`.github/workflows/ci.yml`) runs all of these. On `main`, the line
coverage of the Rust and web suites goes to the `badges` branch, which the
badge above reads. `pages.yml` publishes `web/dist` on GitHub Pages.

## Layout

```
crates/strings-core   every operation, the registry, recipes, the board
crates/strings-wasm   wasm-bindgen exports only
web/src/engine        the worker and its client, the only way to the engine
web/src/app           the two modes, dialogs, settings
web/src/ds            app-only components and the local Icon and fonts
web/build             Vite plugins: offline design system, notices
vendor/kerasi-design  the Kerasi design system (git submodule)
```

`PLAN.md` holds the scope and the design decisions; `AGENTS.md` the rules
every change follows.

## License

The project's own license is not chosen yet. Every build ships
`THIRD-PARTY-NOTICES.txt` with the license texts of the npm packages,
Rust crates, fonts (Oswald, Manrope, JetBrains Mono under the SIL OFL)
and icons (Lucide, ISC) it contains; the build stops on a license outside
the allowed list.
