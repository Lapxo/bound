import { deepStrictEqual } from 'node:assert/strict';
import { test as nodeTest } from 'node:test';

function labelOf(message: unknown): string | undefined {
  if (message === undefined) return undefined;
  if (typeof message === 'string') return message;
  if (message && typeof message === 'object' && 'name' in message) return String((message as { name: unknown }).name);
  return JSON.stringify(message);
}

const world = globalThis as {
  compare: (actual: unknown, expected: unknown, message?: unknown) => void;
  test: typeof nodeTest;
};

world.compare = (actual, expected, message) => {
  deepStrictEqual(actual, expected, labelOf(message));
};
if (typeof world.test !== 'function') world.test = nodeTest;
