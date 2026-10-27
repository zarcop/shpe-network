/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isTap, nodeAt, type Target } from './hit-test.ts';

const target = (id: string, x: number, y: number, r: number, layer = 0): Target => ({ id, x, y, r, layer });

test('finds the node under the tap from where the nodes are now', () => {
  const nodes = [target('ana', 0, 0, 3), target('luis', 50, 0, 3)];
  assert.equal(nodeAt(nodes, 50, 1)?.id, 'luis');
  assert.equal(nodeAt(nodes, 1, -2)?.id, 'ana');
});

test('a tap on empty space finds nothing, and a tap on the edge still counts', () => {
  const nodes = [target('ana', 0, 0, 3)];
  assert.equal(nodeAt(nodes, 10, 10), null);
  assert.equal(nodeAt(nodes, 3, 0)?.id, 'ana');
  assert.equal(nodeAt([], 0, 0), null);
});

test('where targets overlap, the one drawn on top wins, then the closest', () => {
  const hub = target('uf', 0, 0, 10, 1);
  const person = target('ana', 2, 0, 4, 0);
  assert.equal(nodeAt([person, hub], 2, 0)?.id, 'uf');
  const near = target('luis', 4, 0, 4);
  assert.equal(nodeAt([person, near], 3.8, 0)?.id, 'luis');
});

test('nodes not placed yet are skipped', () => {
  assert.equal(nodeAt([{ id: 'new', r: 5, layer: 0 }], 0, 0), null);
});

test('a press and release close together is a tap, even if the finger wobbles; a drag to pan is not', () => {
  assert.equal(isTap({ x: 100, y: 100 }, { x: 100, y: 100 }), true);
  assert.equal(isTap({ x: 100, y: 100 }, { x: 105, y: 104 }), true);
  assert.equal(isTap({ x: 100, y: 100 }, { x: 112, y: 100 }), false);
});
