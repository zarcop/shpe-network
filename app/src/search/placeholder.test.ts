/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HOLD_MS, PAUSE_MS, typedAt, TYPE_MS } from './placeholder.ts';

const examples = ['UF', 'NASA'];
const typed = (ms: number) => typedAt(examples, ms);

test('types an example letter by letter, holds it, erases it, then moves to the next', () => {
  assert.equal(typed(0), '');
  assert.equal(typed(TYPE_MS), 'U');
  assert.equal(typed(2 * TYPE_MS), 'UF');
  assert.equal(typed(2 * TYPE_MS + HOLD_MS - 1), 'UF');
  const erasing = 2 * TYPE_MS + HOLD_MS;
  assert.equal(typed(erasing + 1), 'U');
  const next = erasing + 2 * (TYPE_MS / 2) + PAUSE_MS;
  assert.equal(typed(next - 1), '');
  assert.equal(typed(next + TYPE_MS), 'N');
});

test('loops back to the first example and handles an empty list', () => {
  const cycle = (e: string) => e.length * TYPE_MS + HOLD_MS + e.length * (TYPE_MS / 2) + PAUSE_MS;
  const full = cycle('UF') + cycle('NASA');
  assert.equal(typed(full + 2 * TYPE_MS), 'UF');
  assert.equal(typedAt([], 1234), '');
});
