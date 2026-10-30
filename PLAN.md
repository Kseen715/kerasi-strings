# Kerasi Strings — plan

A personal, CyberChef-style string workbench. Static site on GitHub Pages; every
transform runs in the visitor's browser (TypeScript UI + Rust compiled to
WebAssembly). No backend, no analytics, no third-party requests — input never
leaves the machine.

Design: Kerasi design system (`../kerasi-design`). Layout variants are on the
design canvas: https://claude.ai/artifact/QkSvYoirT1ta9rMnJ4dPkx

---

## 1. Scope for v0.1

| Group | Operations |
|---|---|
| Case | lower case, UPPER CASE, Title Case, Sentence case, iNVERT cASE, camelCase, PascalCase, snake_case, SCREAMING_SNAKE_CASE, kebab-case, SCREAMING-KEBAB, Train-Case, dot.case, path/case, flatcase |
| Keyboard layout | Fix layout (auto-detect), and explicit pairs between English (US QWERTY), Russian (ЙЦУКЕН), Ukrainian, German (QWERTZ), French (AZERTY) |
| Transliteration | Russian in Latin letters: GOST 7.79-2000 system B, passport names (МИД 4271 / МВД 995, ICAO Doc 9303), URL slugs by the Yandex and Google tables |
| Encode | Base64 encode / decode (standard + URL-safe, padding on/off), Base32 encode / decode (RFC 4648, padding on/off; Crockford later), Punycode encode / decode (RFC 3492, whole text or `xn--` domain labels), URL encode / decode (RFC 3986 percent-encoding, optional `+` for spaces), Unicode escape encode / decode (Python's `unicode_escape`: `\xe9`, `\u043f`, `\U0001f600`; decode also joins surrogate pairs and reads `\N{name}` with the name table loaded on demand) |
| Hash | MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512; output as hex, HEX or Base64 |

**Note on "SHA-128":** no standard hash with that name exists. SHA-1 produces 160
bits, MD5 128 bits. The plan fills out the SHA-2 family (224/384) instead.
If you meant something specific (SHA3-256, BLAKE3, a truncated SHA-256,
CRC32…), add it to the Hash group — it is one more registry entry.

Out of scope for v0.1: arbitrary regex ops, HTML entity encoding, hex dump,
JSON formatting, file-to-file conversions. The architecture below keeps each of
these a one-file addition.

---

## 2. Architecture

```
┌──────────────── browser tab ─────────────────────────────┐
│  UI (React + Kerasi components, main thread)              │
│     │ postMessage(recipe, input bytes)   ▲ result / trace │
│     ▼                                    │                │
│  Web Worker ── strings_wasm.wasm (Rust) ─┘                │
└───────────────────────────────────────────────────────────┘
        served as static files from GitHub Pages; no API
```

### 2.1 Rust: one core crate, one thin binding crate

```
crates/
  strings-core/        # pure Rust, no wasm deps, tested with plain `cargo test`
    src/lib.rs
    src/op.rs          # Op trait, OpMeta, Param schema, Error
    src/registry.rs    # static list of all ops
    src/recipe.rs      # run a chain, collect per-step trace
    src/ops/case.rs
    src/ops/layout/mod.rs
    src/ops/layout/tables.rs   # per-layout key maps
    src/ops/encode.rs
    src/ops/punycode.rs
    src/ops/url.rs
    src/ops/unicode_escape.rs
    src/ops/translit.rs
    src/ops/hash.rs
  strings-wasm/        # wasm-bindgen exports only, no logic
    src/lib.rs
  strings-wasm-names/  # the same exports, with the Unicode name table
    src/lib.rs
```

Why every op lives in Rust (including upper/lower that JS can do natively): one
source of truth, one test suite, identical Unicode behaviour everywhere, and the
UI never needs per-op code. The UI is generated from op metadata.

**Data model.** Every op is `fn(&[u8], &Params) -> Result<Vec<u8>, OpError>`.
*Built (Oct 29, 2026):* an `Op` is a plain struct, `OpMeta` plus that
function pointer, instead of a trait: every op is data in a static table,
which is all the registry needs. `Params` are checked against the specs
and completed with defaults before an op runs, so ops never see bad values.
Text ops decode UTF-8 first and fail with a clear error on invalid input;
Base64 decode may produce arbitrary bytes, so chaining stays lossless. The UI
renders bytes as UTF-8 when valid, otherwise as a hex view with a notice.

```rust
pub struct Op {
    pub meta: OpMeta,                            // id, name, group, params, example
    pub run: fn(&[u8], &Params) -> Result<Vec<u8>, OpError>,
}

pub struct OpMeta {
    pub id: &'static str,       // "case.snake", "hash.sha256"
    pub name: &'static str,     // "snake_case"
    pub group: Group,           // Case | Layout | Translit | Encode | Hash
    pub params: &'static [ParamSpec], // enum / bool / string, with defaults
    pub example: &'static str,  // shown in the op list
}
```

**WASM surface** (`strings-wasm`, kept deliberately small):

| Export | Purpose |
|---|---|
| `version() -> String` | The engine version |
| `ops_meta() -> String` | JSON `{version, groups, ops}`; UI builds lists, forms, search index from it |
| `run(recipe_json: &str, input: &[u8]) -> Result<RunResult, JsError>` | Run a chain; `RunResult.output` is the bytes, `.report` JSON with the shown output and per-step trace (status, preview, bytes, error with offset, duration) |
| `run_board(input: &[u8], options_json: &str) -> Result<String, JsError>` | Every op once on the same input, plus variants (Base64 URL); board-wide options (`format`, `to`) reach the ops that declare them |
| `Hasher::new(ops, format)`, `.update(chunk)`, `.finish()` | Several hashes over a stream of chunks, for files of any size |
| `take_names_wanted() -> bool` | Whether a decode met `\N{...}` without the name table since the last call; the worker then switches to the `strings-wasm-names` build and runs again |

Showing bytes is the engine's job too: valid UTF-8 as text, anything else
as hex pairs (`render.rs`), so the UI never decodes or formats bytes.

Recipe JSON: `[{"op":"layout.fix","params":{"to":"ru"}},{"op":"case.title"}]`.

### 2.2 Crates (all pure Rust, no C, wasm-friendly)

| Need | Crate | Notes |
|---|---|---|
| MD5 / SHA-1 / SHA-2 | `md-5`, `sha1`, `sha2` (RustCrypto) | `default-features = false`; incremental `update()` enables chunked file hashing later |
| Base64 and Base32 | `data-encoding` | *Decided:* one crate for both (no `base64`): RFC 4648 standard and URL-safe alphabets, padding on/off; Crockford/hex variants available later |
| Word splitting for case styles | our own (`ops/words.rs`) | *Decided:* own splitter, no `heck` |
| Punycode, URL encoding, Unicode escapes, transliteration | our own (`ops/punycode.rs`, `ops/url.rs`, `ops/unicode_escape.rs`, `ops/translit.rs`) | *Decided (Oct 30, 2026):* no `idna` / `percent-encoding`: RFC 3492 is ~150 lines, and `idna` would add UTS 46 tables to the WASM. The domain mode lower-cases labels and applies no other IDNA mapping. *Decided (Oct 30, 2026):* `\N{name}` reads the name table of `unicode_names2` (Unicode-DFS-2016 data license, allowed with Unicode-3.0). It is about 400 KB gzipped, so it ships in a second engine build (`strings-wasm-names`, core feature `names`) that the worker loads the first time a decode meets `\N{`, then runs the request again; the service worker caches it when first used instead of precaching it |
| Bindings | `wasm-bindgen`, `serde`, `serde_json` | `serde-wasm-bindgen` is an alternative to JSON strings; JSON is simpler to debug |
| Tests | `proptest` (dev) | round-trip properties |

Release profile: `opt-level = "z"`, `lto = true`, `codegen-units = 1`,
`panic = "abort"`, then `wasm-opt -Oz`. Budget: WASM ≤ 150 KB gzipped. The on-demand names build has its own budget of 600 KB.

### 2.3 Operation semantics (the parts that need decisions)

**Word splitting** (camel, snake, kebab, Pascal, Train, dot, path, flat):
- Split on any non-alphanumeric run (space, `_`, `-`, `.`, `/`, punctuation).
- Split on lower→upper (`fooBar` → foo|Bar).
- Split acronyms before the last capital: `XMLHttpRequest` → XML|Http|Request.
- Digits stick to the preceding word (`utf8Value` → utf8|Value); option later.
  A capital after a digit starts a word only when lower case follows it,
  so upper-casing never splits a word (`UTF8VALUE`, `3D` stay one word)
  and `snake(snake(x)) == snake(x)` holds.
- Unicode letters count as letters (`привет мир` → `приветМир`).

**Simple case ops** use Rust's full Unicode mapping (`to_uppercase()` can grow a
string: `ß` → `SS`). Title Case capitalises the first letter of each word and
keeps every separator and punctuation as typed; option `lower_rest` (default
on) lowercases the remainder. Sentence case: first letter after start or
`. ! ?` capitalised. Invert flips each char's case, multi-char mappings
included.

**Keyboard layouts:** each layout is a table from physical key (US QWERTY
position, unshifted + shifted) to the character it produces. Converting A→B
means: char → key on layout A → char on layout B. Keys that don't exist on A
pass through unchanged.
- `Fix layout (auto)`: score input against every layout's letter set; pick the
  source with the most hits, convert to the target param (default: the other
  side of the most likely EN↔RU pair). Show the detected source in the UI.
  *Built:* one op `layout.fix` with `from` (auto or a layout) and `to` (auto
  or a layout) covers the explicit pairs; `layout.detect` names the source.
  Ties go to the layout listed first (en, ru, uk, de, fr); with no letter
  at all, auto leaves the text alone. Tables follow the default X keyboard
  layouts (`us`, `ru`, `ua`, `de`, `fr`); dead keys stand for their
  spacing character.
- Tables live in `tables.rs` as `const` arrays; tests assert they're bijective
  over letters and cover all 47 printable keys.
- Start with en-US, ru, uk, de, fr. Adding a layout = one table + one enum
  variant.

**Hashes** take bytes (UTF-8 of the text, or file bytes). Output format param:
`hex` (default) | `HEX` | `base64`.

**Encodings** follow RFC 4648 exactly. Decoders ignore ASCII whitespace,
reject other invalid characters with an error that names the offending offset.

### 2.4 Front end

- **Stack:** Vite + TypeScript + React 18. *Built with* Vite 8, TypeScript
  6.0 (typescript-eslint supports < 6.1), ESLint 9 (eslint-plugin-jsx-a11y
  supports ≤ 9), React 18.3 (the design system's `.d.ts` use the global
  `JSX` namespace that React 19 types dropped), Prettier, Stylelint. React because the Kerasi components
  are React (`.jsx`, inline styles reading CSS tokens) — we use them directly
  rather than re-implementing.
- **Design system consumption:** `kerasi-design` as a git submodule in
  `vendor/kerasi-design`, pinned to a commit. Import token files individually
  (`palette`, `themes`, `syntax`, `typography`, `spacing`, `base`) and **skip
  `tokens/fonts.css`** (it pulls Google Fonts). Two Vite `resolve.alias`
  overrides replace network-dependent pieces without forking:
  - `components/core/Icon.jsx` → `web/src/ds/Icon.tsx`, same props, icons
    imported at build time from the `lucide-static` npm package (`?raw`).
    *Built* as a `resolveId` plugin (`web/build/kerasi.ts`) that matches the
    resolved file, not the import string; it also stops the build if
    `tokens/fonts.css` is imported.
  - Fonts: Oswald, Manrope, JetBrains Mono self-hosted as WOFF2 (from
    `@fontsource-variable/*` packages), subset to Latin + Cyrillic.
  - The design system's Radio, Switch and Checkbox cannot be reached by
    keyboard, so `web/src/ds/` has app-only `Segmented` and `Toggle` drawn
    the same way. Worth fixing upstream.
- **Worker:** `engine.worker.ts` loads the WASM once and handles
  `{id, kind: "run" | "board", recipe, input: ArrayBuffer}` messages
  (input transferred, not copied). Main thread keeps only the latest request id,
  so fast typing drops stale results. Debounce 60 ms; the board view for inputs
  over ~1 MB switches from live to "Run".
- **State:**
  - Recipe, mode (board/recipe), theme → `localStorage`.
  - Input is **not** persisted by default (it may be a secret); opt-in toggle.
  - Share link: recipe in the URL fragment (`#r=<base64url json>`). Fragments
    are never sent to the server; input is excluded unless explicitly ticked
    (`&i=<base64url text>`). The engine does the Base64url. After a link is
    opened the fragment is removed from the address bar.
  - Files: a dropped file up to 1 MB that is valid UTF-8 becomes text;
    anything else stays a file. Recipes run on files up to 64 MB; the board
    shows the six hashes of a file of any size, read in 4 MB chunks with
    progress.
- **Themes:** all six Kerasi themes via `data-theme` on `<html>`; default
  follows `prefers-color-scheme` (Sakura / Sakura dark).
- **Accessibility:** real buttons/inputs, keyboard-only flow (Ctrl K palette,
  Enter adds op, Delete removes step, Alt+↑/↓ reorders), 44 px touch targets,
  live region announcing errors, AA contrast (use `--fg-2`, not `--fg-3`, for
  small labels).

### 2.5 "No data leaves the PC" — how it's enforced, not just promised

1. **CSP** in a `<meta http-equiv>` tag (GitHub Pages can't set headers):
   `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self';
   img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self';
   object-src 'none'; base-uri 'none'; form-action 'none'`.
   (`'unsafe-inline'` for styles is needed by the components' inline styles;
   it does not allow scripts.)
2. **Fully static, no third-party assets** at runtime: everything the app
   needs (WASM, fonts, icons, images, layout tables, data) is part of the
   deployment and served from the same origin. A feature that needs a file
   ships that file in the release.
3. **No analytics, no error reporting service.**
4. **E2E test** (Playwright) loads the built site, runs every op, and fails if
   any request goes to an origin other than the page's own.
5. **Offline:** a service worker (`vite-plugin-pwa`, precache only) makes the
   app work with the network off — a visible proof for the user.
6. **Header badge** "Local only · 0 requests" backed by a real counter
   (`PerformanceObserver` on resource entries, buffered): the number is the
   requests that reached another origin; its tooltip adds the files loaded
   from the site and the requests the CSP blocked
   (`securitypolicyviolation`).
7. **Notices:** every build writes `THIRD-PARTY-NOTICES.txt` from what it
   actually contains (`web/build/notices.ts`: bundle modules and assets,
   the crates of `cargo metadata`, the Workbox runtime) and stops on a
   license outside its allowed list; `cargo deny` (`deny.toml`) checks the
   crates with the same list.

---

## 3. Repository layout

```
kerasi-strings/
  Cargo.toml                 # workspace: crates/*
  crates/strings-core/
  crates/strings-wasm/
  web/
    index.html               # CSP meta, favicon
    vite.config.ts           # base: '/', DS aliases, PWA
    src/
      main.tsx
      app/                   # App, BoardView, RecipeView, CommandPalette
      engine/                # worker, typed client, wasm loader
      ds/                    # Icon override, font-face CSS, small app-only components
      wasm/                  # wasm-pack output (gitignored)
    tests/e2e/               # Playwright
  vendor/kerasi-design/      # git submodule
  .github/workflows/
    ci.yml                   # PRs: cargo test, clippy, fmt, vitest, build, e2e
    pages.yml                # main: build + deploy to GitHub Pages
  PLAN.md
```

---

## 4. Build and deploy

Local:
```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack           # or wasm-bindgen-cli + binaryen
npm --prefix web install
npm --prefix web run dev          # runs wasm-pack build --dev, then vite
```

`web/package.json` scripts:
- `wasm`: `wasm-pack build ../crates/strings-wasm --target web --release --out-dir ../../web/src/wasm`
- `dev`: `npm run wasm -- --dev && vite`
- `build`: `npm run wasm && tsc -b && vite build`
- `test`, `e2e`

GitHub Actions (`pages.yml`), same shape as `kerasi-design`'s workflow:
checkout (with submodules) → Rust stable + `wasm32-unknown-unknown` + cache →
install wasm-pack → Node LTS + npm cache → `npm ci` → `npm run build` →
`actions/upload-pages-artifact` (`web/dist`) → `actions/deploy-pages`.
Repository setting: Pages source = GitHub Actions.

---

## 5. Testing

| Layer | What |
|---|---|
| Rust unit | RFC 4648 §10 vectors (Base64/Base32), RFC 1321 (MD5), FIPS 180 vectors (SHA-1/2), case-splitting table (`XMLHttpRequest`, `utf8Value`, `__init__`, `привет мир`, `ß`), layout tables (`ghbdtn` → `привет`, round trip ru→en→ru) |
| Rust property | `decode(encode(x)) == x` for both encodings; layout A→B→A identity on letters; case ops idempotent where they should be (`snake(snake(x)) == snake(x)`) |
| WASM | one `wasm-bindgen-test` smoke test per export in headless browser |
| UI | Vitest + Testing Library for recipe editing, palette search, stale-result dropping |
| E2E | Playwright: type → see outputs, copy, file drop hash, share link, offline reload, **no off-origin requests** |
| Budgets | CI fails if gzipped WASM > 150 KB or JS > 120 KB (`npm run budget`) |
| Coverage | `cargo llvm-cov` and Vitest lcov; on `main` CI pushes the line totals to the `badges` branch for the README badge |

---

## 6. Phases

Each phase ends deployable. *Status (Oct 29, 2026):* phases 0–6 are built
and tested locally; the Pages deploy runs once the repository is pushed.

**Phase 0 — Skeleton & pipeline (½ day)**
Cargo workspace, Vite app, submodule, CI + Pages deploy of a page that calls a
`version()` export from WASM.
*Done when:* the GitHub Pages URL shows the version string from Rust.

**Phase 1 — Core engine + case ops (1 day)**
`Op` trait, registry, recipe runner with trace, all case operations, word
splitter, tests.
*Done when:* `cargo test` covers the splitter table; `ops_meta()` lists 15 ops.

**Phase 2 — Encodings and hashes (½ day)**
Base64/Base32 (both directions, options), six hashes, output formats, vectors.
*Done when:* every RFC/FIPS vector passes.

**Phase 3 — Keyboard layouts (1 day)**
Tables for en/ru/uk/de/fr, explicit conversion, auto-detect + fix.
*Done when:* `Ghbdtn rfr ltkf` → `Привет как дела`, ru→en round trip passes,
detection picks the right source on a test corpus.

**Phase 4 — Worker + UI shell (1–2 days)**
Worker client, Board mode (C) and Recipe mode (A) from §7, op list from
metadata, live output, copy, theme switch, Ctrl K palette.
*Done when:* both modes work by keyboard only, on desktop and phone width, and
switching mode keeps the input.

**Phase 5 — Privacy hardening + offline (½ day)**
CSP, self-hosted fonts/icons, service worker, request counter, no-network
e2e test.
*Done when:* e2e passes with all off-origin requests blocked; app works offline.

**Phase 6 — Quality of life (ongoing)**
Share links, saved recipes, file drop (chunked hashing for large files, progress),
"use output as input", step enable/disable, per-step trace view.

---

## 7. Design direction

**Decision (Oct 29, 2026): A + C.** The app has two modes, switched in the
header:

- **Board** (layout C) — the default. One big input on an accent band; below it
  every parameter-free op runs live in five sections (Case, Encode, Layout,
  Transliteration, Hash), one row per op with a copy button. Clicking a row
  sends its value to the input. Phone: same board, groups as tabs.
- **Recipe** (layout A) — for chains. Ops list with filter · recipe stack with
  per-step options, remove and reorder · input, output, step trace. The
  header's "Find operation · Ctrl K" palette adds ops to the recipe.

Both modes share the input text, theme, worker and op metadata; switching mode
never loses input. B (single bench) and D (ultrawide) are not built; D's rails
may come later as a layout of A on screens ≥ 2200 px.

The four layouts drawn on the canvas, all using Kerasi tokens, type and chamfer
rules:

- **A — Recipe pipeline** (Sakura): ops list · recipe stack · input/output with
  a per-step trace. Closest to CyberChef; best for chains.
- **B — Single bench** (Wine): one big input, a chain of chips, ops as a grid
  by group, Ctrl K command palette. Fast for one-off conversions.
- **C — Live board** (Rust, + phone): type once, see every transform at once,
  copy any row. Best for "what does this look like as snake/sha256/base64".
- **D — Ultrawide workspace** (Sakura dark, 21:9): A inside the 1720 px focus
  zone, glance-only rails for the network counter and saved recipes.

Why A + C: Board covers most daily single-step use ("what is this as
snake_case / SHA-256 / Base64"); Recipe covers chaining. Together they need one
engine call each (`run_board`, `run`).

---

## 8. Open questions

1. "SHA-128" — what did you mean? (see §1) For now the six hashes of §1
   ship; add SHA-3, BLAKE3 or CRC32 when wanted.
2. ~~Which layout(s)?~~ Decided: A + C (§7).
3. Layout list beyond en/ru/uk/de/fr? (Belarusian, Kazakh, Hebrew, Greek are
   straightforward table additions.)
4. ~~Repository name / Pages path?~~ Decided: custom domain
   `https://strings.kerasi.gripe/`, served from the root (`base: '/'`).
5. ~~Logo and favicon?~~ Decided: mark **E — Literal** (the sun on the
   blade ground between an opening and a closing chamfered quote mark). The
   favicon is the same mark, built like the main Kerasi favicon: redrawn on a
   32 px grid inside the chamfered paper tile (`favicon.svg`), with a dark
   tile (`favicon-dark.svg`) and a tile-less version for light UI
   (`favicon-bare.svg`).
   Files in `web/public/`: the three favicon SVGs, `favicon-32.png`,
   `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`,
   `brand/strings-mark.svg`, `brand/strings-mark-on-dark.svg`,
   `brand/strings-mark-512.png`. The SVGs are the source; regenerate PNGs
   from them when they change.
6. Project license — chosen as components are added (see `AGENTS.md`).
