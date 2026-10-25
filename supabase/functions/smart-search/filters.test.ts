import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keepKnown, userMessage, type Hub } from './filters.ts';

const hubs: Hub[] = [
  { kind: 'company', name: 'Boeing' },
  { kind: 'company', name: 'Lockheed Martin' },
  { kind: 'school', name: 'University of Florida' },
  { kind: 'country', name: 'Mexico' },
];

test('the hub lists go to Claude grouped by kind and sorted, so the same question sends the same text', () => {
  const text = userMessage('aerospace companies', [...hubs].reverse());
  assert.equal(text, userMessage('aerospace companies', hubs));
  assert.match(text, /Companies:\nBoeing\nLockheed Martin/);
  assert.match(text, /Majors:\n\(none\)/);
  assert.match(text, /Question: aerospace companies$/);
});

test('only existing hubs and plausible years survive, once each', () => {
  const answer = {
    hubs: [
      { kind: 'company', name: 'Boeing' },
      { kind: 'company', name: 'Boeing' },
      { kind: 'company', name: 'SpaceX' }, // not a hub here
      { kind: 'school', name: 'Mexico' }, // right name, wrong kind
      { kind: 'country', name: 'Mexico' },
    ],
    years: [2026, 2026, 3000, 2025.5],
  };
  assert.deepEqual(keepKnown(answer, hubs), [
    { type: 'hub', kind: 'company', name: 'Boeing' },
    { type: 'hub', kind: 'country', name: 'Mexico' },
    { type: 'year', year: 2026 },
  ]);
});

test('a malformed answer gives no filters instead of failing', () => {
  assert.deepEqual(keepKnown(null, hubs), []);
  assert.deepEqual(keepKnown({ hubs: 'Boeing', years: null }, hubs), []);
  assert.deepEqual(keepKnown({ hubs: [null, 7] }, hubs), []);
});
