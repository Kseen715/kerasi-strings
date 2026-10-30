import { describe, expect, it } from 'vitest';
import type { OpMeta, ParamSpec } from '../engine/types';
import {
  isStepList,
  moveStep,
  newStep,
  opOf,
  paramValue,
  removeStep,
  setParam,
  toEngine,
  updateStep,
  withUids,
} from './recipe';

const steps = ['a', 'b', 'c'].map(newStep);
const ids = (list: { op: string }[]) => list.map((step) => step.op);

describe('recipe editing', () => {
  it('creates enabled steps with unique uids', () => {
    expect(steps[0]).toMatchObject({ op: 'a', params: {}, enabled: true });
    expect(new Set(steps.map((s) => s.uid)).size).toBe(3);
  });

  it('removes a step', () => {
    expect(ids(removeStep(steps, steps[1]?.uid ?? ''))).toEqual(['a', 'c']);
  });

  it('moves a step and stops at the ends', () => {
    const first = steps[0]?.uid ?? '';
    const last = steps[2]?.uid ?? '';
    expect(ids(moveStep(steps, first, 1))).toEqual(['b', 'a', 'c']);
    expect(ids(moveStep(steps, last, -1))).toEqual(['a', 'c', 'b']);
    expect(moveStep(steps, first, -1)).toBe(steps);
    expect(moveStep(steps, last, 1)).toBe(steps);
    expect(moveStep(steps, 'missing', 1)).toBe(steps);
  });

  it('updates one step and sets its params', () => {
    const uid = steps[1]?.uid ?? '';
    const changed = updateStep(steps, uid, (step) => setParam(step, 'x', 'y'));
    expect(changed[1]?.params).toEqual({ x: 'y' });
    expect(changed[0]).toBe(steps[0]);
  });

  it('strips uids for the engine and adds them back', () => {
    const plain = toEngine(steps);
    expect(plain[0]).toEqual({ op: 'a', params: {}, enabled: true });
    expect(withUids(plain)[0]?.uid).toEqual(expect.any(String));
  });

  it('reads a param or its default', () => {
    const spec: ParamSpec = {
      type: 'flag',
      id: 'padding',
      name: 'Padding',
      default: true,
    };
    const step = newStep('base64.encode');
    expect(paramValue(step, spec)).toBe(true);
    expect(paramValue(setParam(step, 'padding', false), spec)).toBe(false);
  });

  it('validates stored step lists', () => {
    expect(isStepList(toEngine(steps))).toBe(true);
    expect(isStepList('x')).toBe(false);
    expect(isStepList([null])).toBe(false);
    expect(isStepList([{ op: 1, params: {}, enabled: true }])).toBe(false);
    expect(isStepList([{ op: 'a', params: null, enabled: true }])).toBe(false);
    expect(isStepList([{ op: 'a', params: { x: 1 }, enabled: true }])).toBe(
      false,
    );
  });

  it('stands in for operations this version does not know', () => {
    const known: OpMeta = {
      id: 'case.upper',
      name: 'UPPER CASE',
      group: 'case',
      params: [],
      example: '',
    };
    const ops = new Map([[known.id, known]]);
    expect(opOf(ops, newStep('case.upper'))).toBe(known);
    expect(opOf(ops, newStep('gone.op')).name).toBe('gone.op');
  });
});
