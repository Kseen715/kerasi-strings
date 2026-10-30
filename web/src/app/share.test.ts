import { describe, expect, it } from 'vitest';
import type { Step } from '../engine/types';
import { testEngine } from '../engine/testing';
import { readShare, shareUrl } from './share';

const engine = testEngine();
const PAGE = 'https://example.test/kerasi-strings/';
const steps: Step[] = [
  { op: 'layout.fix', params: { to: 'ru' }, enabled: true },
  { op: 'case.title', params: {}, enabled: false },
];

describe('share links', () => {
  it('carry the recipe in the fragment only', async () => {
    const url = await shareUrl(engine, PAGE, { steps });
    expect(url.startsWith(`${PAGE}#r=`)).toBe(true);
    expect(url).not.toContain('&i=');
    expect(new URL(url).search).toBe('');
    expect(url).toMatch(/#r=[A-Za-z0-9_-]+$/);

    await expect(readShare(engine, new URL(url).hash)).resolves.toEqual({
      steps,
    });
  });

  it('carry the input when asked', async () => {
    const url = await shareUrl(engine, PAGE, { steps, input: 'ghbdtn €' });
    const shared = await readShare(engine, new URL(url).hash);
    expect(shared).toEqual({ steps, input: 'ghbdtn €' });
  });

  it('read nothing from fragments without a recipe', async () => {
    await expect(readShare(engine, '')).resolves.toBeNull();
    await expect(readShare(engine, '#section')).resolves.toBeNull();
  });

  it('reject recipes that do not decode or parse', async () => {
    await expect(readShare(engine, '#r=!!!')).resolves.toBeNull();
    await expect(readShare(engine, '#r=_w')).resolves.toBeNull();
    const notJson = await shareUrl(engine, PAGE, { steps: [] });
    const broken = notJson.replace(/#r=.*/, '#r=e30'); // "{}"
    await expect(readShare(engine, new URL(broken).hash)).resolves.toBeNull();
    await expect(readShare(engine, '#r=ew')).resolves.toBeNull(); // "{"
  });
});
