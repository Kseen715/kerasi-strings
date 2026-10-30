// The Lucide icons the app and the design system components use,
// bundled at build time (lucide-static, ISC). Add a name here before
// using it; Icon renders nothing for an unknown name.

import arrowDown from 'lucide-static/icons/arrow-down.svg?raw';
import arrowRight from 'lucide-static/icons/arrow-right.svg?raw';
import arrowUp from 'lucide-static/icons/arrow-up.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import chevronDown from 'lucide-static/icons/chevron-down.svg?raw';
import copy from 'lucide-static/icons/copy.svg?raw';
import download from 'lucide-static/icons/download.svg?raw';
import gripVertical from 'lucide-static/icons/grip-vertical.svg?raw';
import info from 'lucide-static/icons/info.svg?raw';
import lock from 'lucide-static/icons/lock.svg?raw';
import octagonX from 'lucide-static/icons/octagon-x.svg?raw';
import power from 'lucide-static/icons/power.svg?raw';
import save from 'lucide-static/icons/save.svg?raw';
import search from 'lucide-static/icons/search.svg?raw';
import share2 from 'lucide-static/icons/share-2.svg?raw';
import sparkle from 'lucide-static/icons/sparkle.svg?raw';
import trash2 from 'lucide-static/icons/trash-2.svg?raw';
import triangleAlert from 'lucide-static/icons/triangle-alert.svg?raw';
import upload from 'lucide-static/icons/upload.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';

const SOURCES = {
  'arrow-down': arrowDown,
  'arrow-right': arrowRight,
  'arrow-up': arrowUp,
  check,
  'chevron-down': chevronDown,
  copy,
  download,
  'grip-vertical': gripVertical,
  info,
  lock,
  'octagon-x': octagonX,
  power,
  save,
  search,
  'share-2': share2,
  sparkle,
  'trash-2': trash2,
  'triangle-alert': triangleAlert,
  upload,
  x,
};

export type IconName = keyof typeof SOURCES;

/** The inside of each <svg>; Icon draws its own wrapper. */
export const ICONS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SOURCES).map(([name, svg]) => [name, inner(svg)]),
);

function inner(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();
}
