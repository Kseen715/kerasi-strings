// Editing a recipe: pure functions over its list of steps. Each step has
// a uid so React and the keyboard focus can follow it when it moves.

import type { OpMeta, ParamSpec, ParamValue, Step } from '../engine/types';

export interface RecipeStep extends Step {
  uid: string;
}

export function newStep(op: string): RecipeStep {
  return { uid: crypto.randomUUID(), op, params: {}, enabled: true };
}

export function withUids(steps: Step[]): RecipeStep[] {
  return steps.map((step) => ({ ...step, uid: crypto.randomUUID() }));
}

export function toEngine(steps: RecipeStep[]): Step[] {
  return steps.map(({ op, params, enabled }) => ({ op, params, enabled }));
}

export function removeStep(steps: RecipeStep[], uid: string): RecipeStep[] {
  return steps.filter((step) => step.uid !== uid);
}

/** Moves a step up (`-1`) or down (`1`); at either end it stays. */
export function moveStep(
  steps: RecipeStep[],
  uid: string,
  by: -1 | 1,
): RecipeStep[] {
  const from = steps.findIndex((step) => step.uid === uid);
  const to = from + by;
  const moving = steps[from];
  if (!moving || to < 0 || to >= steps.length) {
    return steps;
  }
  const rest = steps.filter((step) => step.uid !== uid);
  return [...rest.slice(0, to), moving, ...rest.slice(to)];
}

export function updateStep(
  steps: RecipeStep[],
  uid: string,
  change: (step: RecipeStep) => RecipeStep,
): RecipeStep[] {
  return steps.map((step) => (step.uid === uid ? change(step) : step));
}

export function setParam(
  step: RecipeStep,
  id: string,
  value: ParamValue,
): RecipeStep {
  return { ...step, params: { ...step.params, [id]: value } };
}

export function paramValue(step: Step, spec: ParamSpec): ParamValue {
  return step.params[spec.id] ?? spec.default;
}

export function isStepList(value: unknown): value is Step[] {
  return Array.isArray(value) && value.every(isStep);
}

function isStep(value: unknown): value is Step {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const step = value as Partial<Record<keyof Step, unknown>>;
  return (
    typeof step.op === 'string' &&
    typeof step.enabled === 'boolean' &&
    typeof step.params === 'object' &&
    step.params !== null &&
    Object.values(step.params).every(
      (param) => typeof param === 'string' || typeof param === 'boolean',
    )
  );
}

/** The step's operation, or a stand-in when it is not in this version. */
export function opOf(ops: Map<string, OpMeta>, step: Step): OpMeta {
  return (
    ops.get(step.op) ?? {
      id: step.op,
      name: step.op,
      group: 'case',
      params: [],
      example: '',
    }
  );
}
