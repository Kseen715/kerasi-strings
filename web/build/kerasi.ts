// Vite plugins that keep the Kerasi design system off the network: its
// Icon component fetches Lucide from a CDN, so every import of it is
// resolved to the local version that bundles the icons.
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const KERASI = fileURLToPath(
  new URL('../../vendor/kerasi-design', import.meta.url),
);
const VENDOR_ICON = `${KERASI}/components/core/Icon.jsx`;
const LOCAL_ICON = fileURLToPath(
  new URL('../src/ds/Icon.tsx', import.meta.url),
);
const NETWORK_FONTS = `${KERASI}/tokens/fonts.css`;
const CSP_META = /<meta http-equiv="Content-Security-Policy"[^>]*>/;

export function kerasiOffline(): Plugin {
  return {
    name: 'kerasi-offline',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (resolved?.id === VENDOR_ICON) {
        return LOCAL_ICON;
      }
      if (resolved?.id === NETWORK_FONTS) {
        this.error('tokens/fonts.css loads Google Fonts; use ds/fonts.css');
      }
      return null;
    },
  };
}

// The dev server needs an inline script (React Refresh) and a websocket,
// which the Content Security Policy forbids, so `vite dev` serves the page
// without it. Builds, previews and the end-to-end tests keep it.
export function devWithoutCsp(): Plugin {
  return {
    name: 'dev-without-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(CSP_META, '');
    },
  };
}
