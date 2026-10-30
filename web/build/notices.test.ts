import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkWorkbox,
  crateComponent,
  crates,
  licenseAllowed,
  licenseTexts,
  npmComponent,
  packageDir,
  render,
} from './notices';
import type { CargoMetadata } from './notices';

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'notices-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

describe('licenseAllowed', () => {
  it('accepts expressions that allowed licenses can meet', () => {
    expect(licenseAllowed('MIT')).toBe(true);
    expect(licenseAllowed('MIT OR Apache-2.0')).toBe(true);
    expect(licenseAllowed('Unlicense OR MIT')).toBe(true);
    expect(licenseAllowed('(MIT OR Apache-2.0) AND Unicode-3.0')).toBe(true);
    expect(licenseAllowed('(MIT OR Apache-2.0) AND Unicode-DFS-2016')).toBe(
      true,
    );
    expect(licenseAllowed('GPL-3.0 OR MIT')).toBe(true);
  });

  it('refuses anything else', () => {
    expect(licenseAllowed('GPL-3.0')).toBe(false);
    expect(licenseAllowed('MIT AND GPL-2.0')).toBe(false);
    expect(licenseAllowed('UNKNOWN')).toBe(false);
    expect(licenseAllowed('')).toBe(false);
    expect(licenseAllowed('MIT MIT')).toBe(false);
  });
});

describe('packageDir', () => {
  it('finds the innermost package, scoped or not', () => {
    expect(packageDir('/w/node_modules/react/index.js')).toBe(
      '/w/node_modules/react',
    );
    expect(packageDir('node_modules/@fontsource-variable/oswald/f.woff2')).toBe(
      'node_modules/@fontsource-variable/oswald',
    );
    expect(packageDir('/w/node_modules/a/node_modules/b/x.js')).toBe(
      '/w/node_modules/a/node_modules/b',
    );
    expect(packageDir('\0vite/modulepreload-polyfill.js')).toBe(
      'node_modules/vite',
    );
    expect(packageDir('/w/src/main.tsx')).toBeUndefined();
  });
});

describe('components', () => {
  it('reads npm packages with their license files', () => {
    const dir = folder({
      'package.json': '{"name":"pkg","version":"1.2.3","license":"ISC"}',
      LICENSE: 'ISC text',
      'NOTICE.md': 'notice',
      'license-dir/x': 'not a file at the top',
      'README.md': 'no',
    });
    const component = npmComponent(dir);
    expect(component).toMatchObject({
      name: 'pkg',
      version: '1.2.3',
      license: 'ISC',
      source: 'https://www.npmjs.com/package/pkg',
    });
    expect(component.texts.map((t) => t.file)).toEqual([
      'LICENSE',
      'NOTICE.md',
    ]);
    expect(licenseTexts(dir)).toHaveLength(2);
  });

  it('marks packages without a license field', () => {
    const dir = folder({ 'package.json': '{"name":"x","version":"0"}' });
    expect(npmComponent(dir).license).toBe('UNKNOWN');
  });

  it('adds the license files a crate keeps below its root', () => {
    const dir = folder({
      'LICENSE-MIT': 'mit',
      'data/LICENSE-UNICODE': 'unicode',
    });
    const component = crateComponent({
      id: 'unicode_names2',
      name: 'unicode_names2',
      version: '1.3.0',
      license: '(MIT OR Apache-2.0) AND Unicode-DFS-2016',
      source: 'registry',
      manifest_path: join(dir, 'Cargo.toml'),
    });
    expect(component.texts).toEqual([
      { file: 'LICENSE-MIT', text: 'mit' },
      { file: 'data/LICENSE-UNICODE', text: 'unicode' },
    ]);
  });

  it('follows normal and build dependencies of the root crate only', () => {
    const pkg = (id: string, source: string | null) => ({
      id,
      name: id,
      version: '1.0.0',
      license: id === 'b' ? null : 'MIT',
      source,
      manifest_path: join(folder({ 'LICENSE-MIT': id }), 'Cargo.toml'),
    });
    const metadata: CargoMetadata = {
      packages: [
        pkg('root', null),
        pkg('a', 'registry'),
        pkg('b', 'registry'),
        pkg('dev', 'registry'),
        pkg('core', null),
      ],
      resolve: {
        nodes: [
          {
            id: 'root',
            deps: [
              { pkg: 'a', dep_kinds: [{ kind: null }] },
              { pkg: 'dev', dep_kinds: [{ kind: 'dev' }] },
              { pkg: 'core', dep_kinds: [{ kind: null }] },
            ],
          },
          { id: 'a', deps: [{ pkg: 'b', dep_kinds: [{ kind: 'build' }] }] },
          { id: 'b', deps: [{ pkg: 'a', dep_kinds: [{ kind: null }] }] },
        ],
      },
    };
    const found = crates(metadata, 'root');
    expect(found.map((p) => p.name).sort()).toEqual(['a', 'b']);
    const b = found.find((p) => p.name === 'b');
    if (!b) throw new Error('no crate b');
    expect(crateComponent(b)).toMatchObject({
      license: 'UNKNOWN',
      texts: [{ file: 'LICENSE-MIT' }],
    });
    expect(crates(metadata, 'missing')).toEqual([]);
  });
});

describe('render', () => {
  it('lists components and prints each distinct text once', () => {
    const text = render(
      [
        {
          name: 'b',
          version: '2',
          license: 'MIT',
          source: 'https://b',
          texts: [{ file: 'LICENSE', text: 'same\n' }],
        },
        {
          name: 'a',
          version: '1',
          license: 'MIT',
          source: 'https://a',
          texts: [{ file: 'COPYING', text: 'same' }],
        },
        { name: 'c', version: '3', license: 'ISC', source: 'x', texts: [] },
      ],
      'Intro',
    );
    expect(text).toContain('a 1 · MIT · https://a\nb 2 · MIT · https://b');
    expect(text).toContain('a (COPYING), b (LICENSE)\n\nsame');
    expect(text.match(/same/g)).toHaveLength(1);
    expect(text).toContain('(c has no license file; see ISC)');
  });
});

describe('checkWorkbox', () => {
  it('accepts the listed runtime and refuses others', () => {
    const ok = folder({ 'workbox-1.js': 'self["workbox:core:7"]', 'a.js': '' });
    expect(() => {
      checkWorkbox(ok);
    }).not.toThrow();
    const extra = folder({ 'workbox-2.js': '"workbox:streams:7"' });
    expect(() => {
      checkWorkbox(extra);
    }).toThrow('bundles workbox-streams');
  });
});
