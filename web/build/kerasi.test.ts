import { describe, expect, it, vi } from 'vitest';
import { KERASI, devWithoutCsp, kerasiOffline } from './kerasi';

type Resolve = (
  this: unknown,
  source: string,
  importer: string,
  options: object,
) => Promise<string | null>;

function resolveWith(resolved: string | null) {
  const plugin = kerasiOffline();
  const context = {
    resolve: vi.fn(() => Promise.resolve(resolved && { id: resolved })),
    error: vi.fn((message: string) => {
      throw new Error(message);
    }),
  };
  const resolveId = plugin.resolveId as Resolve;
  return (source: string) =>
    resolveId.call(context, source, `${KERASI}/components/core/Button.jsx`, {});
}

describe('kerasiOffline', () => {
  it('points the network Icon at the bundled one', async () => {
    const resolve = resolveWith(`${KERASI}/components/core/Icon.jsx`);
    await expect(resolve('./Icon.jsx')).resolves.toMatch(/src\/ds\/Icon\.tsx$/);
  });

  it('leaves every other module alone', async () => {
    await expect(resolveWith('/x/react.js')('react')).resolves.toBeNull();
    await expect(resolveWith(null)('missing')).resolves.toBeNull();
  });

  it('stops the build when the Google Fonts tokens are imported', async () => {
    const resolve = resolveWith(`${KERASI}/tokens/fonts.css`);
    await expect(resolve('./fonts.css')).rejects.toThrow('Google Fonts');
  });
});

describe('devWithoutCsp', () => {
  it('runs only on the dev server and drops the CSP meta there', () => {
    const plugin = devWithoutCsp();
    expect(plugin.apply).toBe('serve');
    const transform = plugin.transformIndexHtml as (html: string) => string;
    const html =
      '<head><meta http-equiv="Content-Security-Policy" content="x"></head>';
    expect(transform(html)).toBe('<head></head>');
  });
});
