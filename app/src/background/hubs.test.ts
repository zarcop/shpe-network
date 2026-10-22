/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addNames, emptyHubs, isEmpty, mergeHubs } from './hubs.ts';

test('names are trimmed, single-spaced, and duplicates ignore case', () => {
  const hubs = addNames(emptyHubs(), 'school', ['  University  of Florida ', 'university of florida', '', ' ']);
  assert.deepEqual(hubs.school, ['University of Florida']);
});

test('a kind stops at its limit', () => {
  const hubs = addNames(emptyHubs(), 'major', ['ME', 'EE', 'CS', 'CE']);
  assert.deepEqual(hubs.major, ['ME', 'EE', 'CS']);
});

test('autofill adds to what the person already has and never removes their entries', () => {
  const current = { ...emptyHubs(), school: ['UPRM'], country: ['Puerto Rico'] };
  const suggested = { ...emptyHubs(), school: ['uprm', 'Purdue University'], company: ['Boeing'] };
  const { hubs, added } = mergeHubs(current, suggested);
  assert.deepEqual(hubs.school, ['UPRM', 'Purdue University']);
  assert.deepEqual(hubs.company, ['Boeing']);
  assert.deepEqual(hubs.country, ['Puerto Rico']);
  assert.equal(added, 2);
});

test('a suggestion with nothing new adds nothing', () => {
  const current = { ...emptyHubs(), company: ['Boeing'] };
  assert.equal(mergeHubs(current, { ...emptyHubs(), company: ['BOEING'] }).added, 0);
  assert.equal(isEmpty(emptyHubs()), true);
  assert.equal(isEmpty(current), false);
});
