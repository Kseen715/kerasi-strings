// Replaces the design system's Icon (build/kerasi.ts points every import
// of it here): the same props and drawing, with the icons bundled instead
// of fetched from a CDN.

import type { CSSProperties } from 'react';
import { ICONS } from './icons';

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  title?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function Icon({
  name,
  size = 18,
  color = 'currentColor',
  title,
  strokeWidth = 1.75,
  style,
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'inline-block', flex: 'none', color, ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }}
    />
  );
}
