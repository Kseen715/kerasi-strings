// Writes THIRD-PARTY-NOTICES.txt into every build: the npm packages in the
// bundle, the Rust crates compiled into the WebAssembly, the Workbox
// runtime of the service worker and the Kerasi design system, each with
// its license texts. The build stops on a license outside ALLOWED.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';

export const FILE = 'THIRD-PARTY-NOTICES.txt';

/** Licenses that allow redistribution in a public static site (AGENTS.md).
 * Only add one after checking it; ask when unsure. */
export const ALLOWED = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'Zlib',
  '0BSD',
  'Unlicense',
  'Unicode-3.0',
  // The Unicode data license before Unicode-3.0, with the same terms
  'Unicode-DFS-2016',
  'OFL-1.1',
  'MPL-2.0',
]);

/** The service worker that vite-plugin-pwa generates (the precache, and
 * the runtime cache of the Unicode name table) bundles these; closeBundle
 * checks the list against the built file. */
export const WORKBOX = [
  'workbox-core',
  'workbox-expiration',
  'workbox-precaching',
  'workbox-routing',
  'workbox-strategies',
];

const LICENSE_FILE = /^(licen[cs]e|copying|notice)/i;

/** License files that a crate keeps below its root, where licenseTexts
 * does not look */
export const NESTED_LICENSES: Record<string, string[]> = {
  unicode_names2: ['data/LICENSE-UNICODE'],
};

export interface Component {
  name: string;
  version: string;
  license: string;
  source: string;
  texts: { file: string; text: string }[];
}

/** Whether an SPDX expression like "(MIT OR Apache-2.0) AND Unicode-3.0"
 * can be met with allowed licenses only. */
export function licenseAllowed(expression: string): boolean {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let at = 0;

  const term = (): boolean => {
    const token = tokens[at++];
    if (token === '(') {
      const inner = anyOf();
      at++;
      return inner;
    }
    return token !== undefined && ALLOWED.has(token);
  };
  const allOf = (): boolean => {
    let ok = term();
    while (tokens[at] === 'AND') {
      at++;
      ok = term() && ok;
    }
    return ok;
  };
  const anyOf = (): boolean => {
    let ok = allOf();
    while (tokens[at] === 'OR') {
      at++;
      ok = allOf() || ok;
    }
    return ok;
  };

  return tokens.length > 0 && anyOf() && at === tokens.length;
}

export function licenseTexts(dir: string): Component['texts'] {
  return readdirSync(dir)
    .filter((file) => LICENSE_FILE.test(file))
    .filter((file) => statSync(join(dir, file)).isFile())
    .sort()
    .map((file) => ({ file, text: readFileSync(join(dir, file), 'utf8') }));
}

/** The package directory of a module or asset in node_modules; Vite's
 * own helpers come in as virtual modules (`\0vite/…`). */
export function packageDir(path: string): string | undefined {
  if (path.startsWith('\0vite/')) {
    return 'node_modules/vite';
  }
  const match = /^((?:.*\/)?node_modules\/(?:@[^/]+\/)?[^/]+)/.exec(path);
  return match?.[1];
}

interface PackageJson {
  name: string;
  version: string;
  license?: string;
}

export function npmComponent(dir: string): Component {
  const pkg = JSON.parse(
    readFileSync(join(dir, 'package.json'), 'utf8'),
  ) as PackageJson;
  return {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license ?? 'UNKNOWN',
    source: `https://www.npmjs.com/package/${pkg.name}`,
    texts: licenseTexts(dir),
  };
}

interface CargoPackage {
  id: string;
  name: string;
  version: string;
  license: string | null;
  source: string | null;
  manifest_path: string;
}

export interface CargoMetadata {
  packages: CargoPackage[];
  resolve: {
    nodes: {
      id: string;
      deps: { pkg: string; dep_kinds: { kind: string | null }[] }[];
    }[];
  };
}

/** The crates `root` is built from: normal and build dependencies, not
 * dev ones, and not the workspace's own crates. */
export function crates(metadata: CargoMetadata, root: string): CargoPackage[] {
  const byId = new Map(metadata.packages.map((p) => [p.id, p]));
  const nodes = new Map(metadata.resolve.nodes.map((n) => [n.id, n]));
  const start = metadata.packages.find((p) => p.name === root);
  const seen = new Set<string>();
  const todo = start ? [start.id] : [];

  for (let id = todo.pop(); id !== undefined; id = todo.pop()) {
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of nodes.get(id)?.deps ?? []) {
      if (dep.dep_kinds.some((kind) => kind.kind !== 'dev')) {
        todo.push(dep.pkg);
      }
    }
  }
  return [...seen]
    .map((id) => byId.get(id))
    .filter((p): p is CargoPackage => p?.source != null);
}

export function crateComponent(pkg: CargoPackage): Component {
  const dir = dirname(pkg.manifest_path);
  const nested = (NESTED_LICENSES[pkg.name] ?? []).map((file) => ({
    file,
    text: readFileSync(join(dir, file), 'utf8'),
  }));
  return {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license ?? 'UNKNOWN',
    source: `https://crates.io/crates/${pkg.name}`,
    texts: [...licenseTexts(dir), ...nested],
  };
}

/** One list of components, then each distinct license text once with the
 * components that ship under it. */
export function render(components: Component[], intro: string): string {
  const sorted = [...components].sort((a, b) => a.name.localeCompare(b.name));
  const lines = sorted.map(
    (c) => `${c.name} ${c.version} · ${c.license} · ${c.source}`,
  );

  const users = new Map<string, string[]>();
  for (const c of sorted) {
    if (c.texts.length === 0) {
      lines.push(`  (${c.name} has no license file; see ${c.license})`);
    }
    for (const { file, text } of c.texts) {
      const key = text.trim();
      users.set(key, [...(users.get(key) ?? []), `${c.name} (${file})`]);
    }
  }
  const texts = [...users].map(
    ([text, names]) => `${'-'.repeat(72)}\n${names.join(', ')}\n\n${text}\n`,
  );
  return [
    intro,
    '',
    'Components',
    '',
    ...lines,
    '',
    'License texts',
    '',
    ...texts,
  ].join('\n');
}

const INTRO = `Kerasi Strings ships the third-party components below, under
their own licenses. They are listed from the build itself: the npm packages in
the page, the Rust crates in the WebAssembly engine and the Workbox
runtime of the offline service worker.`;

interface NoticesOptions {
  /** The Cargo.toml of the workspace */
  manifest: string;
  /** The crate compiled to WebAssembly */
  crate: string;
  /** The Kerasi design system checkout */
  kerasi: string;
}

export function notices(options: NoticesOptions): Plugin {
  let root = '';
  let outDir = '';
  return {
    name: 'third-party-notices',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = join(root, config.build.outDir);
    },
    generateBundle(_, bundle) {
      const assets = Object.values(bundle).flatMap((item) =>
        item.type === 'asset' ? item.originalFileNames : [],
      );
      const paths = [...this.getModuleIds(), ...assets];
      const components = collect(paths, root, options);
      const refused = components.filter((c) => !licenseAllowed(c.license));
      if (refused.length > 0) {
        const names = refused.map((c) => `${c.name} (${c.license})`);
        this.error(`License not allowed: ${names.join(', ')}`);
      }
      const text = render(components, INTRO) + kerasiNotice(options.kerasi);
      this.emitFile({ type: 'asset', fileName: FILE, source: text });
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        checkWorkbox(outDir);
      },
    },
  };
}

function collect(
  paths: string[],
  root: string,
  options: NoticesOptions,
): Component[] {
  const dirs = new Set(
    paths
      .map(packageDir)
      .filter((dir) => dir !== undefined)
      .map((dir) => resolve(root, dir)),
  );
  for (const name of WORKBOX) {
    dirs.add(resolve(root, 'node_modules', name));
  }

  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      [
        'metadata',
        '--format-version=1',
        '--filter-platform=wasm32-unknown-unknown',
        '--locked',
        `--manifest-path=${options.manifest}`,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    ),
  ) as CargoMetadata;
  return [
    ...[...dirs].map(npmComponent),
    ...crates(metadata, options.crate).map(crateComponent),
  ];
}

/** The design system is the work of this project's author; it has no
 * license file of its own yet. */
function kerasiNotice(dir: string): string {
  const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  return [
    '-'.repeat(72),
    `Kerasi design system ${commit.slice(0, 12)}`,
    'https://github.com/Kseen715/kerasi-design',
    '',
    'Tokens and components of the Kerasi design system, by the author of',
    'Kerasi Strings, who ships them as part of this project.',
    '',
  ].join('\n');
}

/** Fails the build when the generated service worker bundles a Workbox
 * package that WORKBOX, and so the notices, leave out. */
export function checkWorkbox(outDir: string): void {
  const runtimes = readdirSync(outDir).filter((f) =>
    /^workbox-.*\.js$/.test(f),
  );
  for (const file of runtimes) {
    const code = readFileSync(join(outDir, file), 'utf8');
    for (const [, name] of code.matchAll(/workbox:([a-z-]+):/g)) {
      if (!WORKBOX.includes(`workbox-${name ?? ''}`)) {
        throw new Error(
          `${file} bundles workbox-${name ?? ''}; add it to WORKBOX`,
        );
      }
    }
  }
}
