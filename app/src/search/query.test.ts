/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HubKind } from '../background/hubs.ts';
import type { KnownHub } from '../background/resume/parse.ts';
import { buildGraph, personId, type GraphPayload } from '../graph/graph.ts';
import { findPeople, mergeFilters, parseQuery, type SearchFilter } from './query.ts';

const known: KnownHub[] = [
  { kind: 'school', name: 'University of Florida', aliases: ['uf'] },
  { kind: 'school', name: 'Georgia Institute of Technology', aliases: ['georgia tech', 'gatech'] },
  { kind: 'company', name: 'Boeing', aliases: ['the boeing company'] },
  { kind: 'company', name: 'Texas Instruments', aliases: ['ti'] },
  { kind: 'company', name: 'NASA', aliases: ['jpl'] },
  { kind: 'major', name: 'Mechanical Engineering', aliases: ['me', 'meche'] },
  { kind: 'major', name: 'Computer Engineering', aliases: ['ce'] },
  { kind: 'major', name: 'Computer Science', aliases: ['cs'] },
  { kind: 'major', name: 'Aerospace Engineering', aliases: ['aero'] },
  { kind: 'major', name: 'Mathematics', aliases: ['math'] },
  { kind: 'country', name: 'Mexico', aliases: ['méxico'] },
  { kind: 'country', name: 'Puerto Rico', aliases: ['pr'] },
  { kind: 'country', name: 'United States', aliases: ['us', 'usa'] },
];
const people = ['Ana Torres', 'Luis Pérez', 'Sofía Ramírez'];
const parse = (text: string) => parseQuery(text, known, people);
const hub = (kind: HubKind, name: string): SearchFilter => ({ type: 'hub', kind, name });

test('hub names and nicknames in a question become filters, in the app\'s kind order', () => {
  assert.deepEqual(parse('mechanical engineers from Mexico who worked at Boeing'), {
    filters: [hub('company', 'Boeing'), hub('major', 'Mechanical Engineering'), hub('country', 'Mexico')],
    unknown: [],
  });
  assert.deepEqual(parse('UF and georgia tech computer science').filters, [
    hub('school', 'University of Florida'),
    hub('school', 'Georgia Institute of Technology'),
    hub('major', 'Computer Science'),
  ]);
});

test('majors match how people say them: plurals, one distinctive word, short forms', () => {
  assert.deepEqual(parse('computer engineers').filters, [hub('major', 'Computer Engineering')]);
  assert.deepEqual(parse('mechanical').filters, [hub('major', 'Mechanical Engineering')]);
  assert.deepEqual(parse('math majors').filters, [hub('major', 'Mathematics')]);
  // "computer" alone could be two majors, so it isn't a guess.
  assert.deepEqual(parse('computer'), { filters: [], unknown: ['computer'] });
  // "aerospace companies" is about companies, not the major: left for smarter search.
  assert.deepEqual(parse('aerospace companies'), { filters: [], unknown: ['aerospace'] });
});

test('nationalities and accents find the country', () => {
  assert.deepEqual(parse('Mexicans').filters, [hub('country', 'Mexico')]);
  assert.deepEqual(parse('puerto ricans at NASA').filters, [hub('company', 'NASA'), hub('country', 'Puerto Rico')]);
  assert.deepEqual(parse('gente de México').filters, [hub('country', 'Mexico')]);
});

test('short nicknames that are everyday words only count in capitals', () => {
  assert.deepEqual(parse('people like me'), { filters: [], unknown: [] });
  assert.deepEqual(parse('ME majors').filters, [hub('major', 'Mechanical Engineering')]);
  assert.deepEqual(parse('cs and ti').filters, [hub('company', 'Texas Instruments'), hub('major', 'Computer Science')]);
  assert.deepEqual(parse('show us').filters, []);
});

test('graduation years and people names', () => {
  assert.deepEqual(parse('class of 2026').filters, [{ type: 'year', year: 2026 }]);
  assert.deepEqual(parse('UF 2025 or 2027').filters, [
    hub('school', 'University of Florida'),
    { type: 'year', year: 2025 },
    { type: 'year', year: 2027 },
  ]);
  assert.deepEqual(parse('find sofia').filters, [{ type: 'name', text: 'sofia' }]);
  assert.deepEqual(parse('luis p').filters, [{ type: 'name', text: 'luis p' }]);
});

test('words nothing explains are kept for smarter search; empty input finds nothing', () => {
  assert.deepEqual(parse('people in finance hiring interns'), { filters: [], unknown: ['finance', 'hiring'] });
  assert.deepEqual(parse(''), { filters: [], unknown: [] });
  assert.deepEqual(parse('   the and of '), { filters: [], unknown: [] });
});

// ───────────── Finding people ─────────────

const person = (id: string, name: string, grad_year: number | null = null) =>
  ({ id, name, headline: null, grad_year, linkedin_url: null });
const graph = buildGraph({
  people: [person('ana', 'Ana Torres', 2026), person('luis', 'Luis Pérez', 2025), person('sofia', 'Sofía Ramírez')],
  hubs: [
    { id: 1, kind: 'school', name: 'University of Florida', domain: null, country_code: null },
    { id: 2, kind: 'company', name: 'Boeing', domain: null, country_code: null },
    { id: 3, kind: 'company', name: 'NASA', domain: null, country_code: null },
    { id: 4, kind: 'country', name: 'Mexico', domain: null, country_code: 'mx' },
  ],
  links: [['ana', 1], ['ana', 2], ['ana', 4], ['luis', 1], ['luis', 3], ['sofia', 4]],
} satisfies GraphPayload);
const ids = (...names: string[]) => new Set(names.map(personId));

test('any hub of a kind, every kind: UF and (Boeing or NASA)', () => {
  const found = findPeople(graph, [hub('school', 'University of Florida'), hub('company', 'Boeing'), hub('company', 'NASA')]);
  assert.deepEqual(found.people, ids('ana', 'luis'));
  assert.deepEqual(found.hubs, new Set(['h:1', 'h:2', 'h:3']));
  assert.deepEqual(findPeople(graph, [hub('school', 'University of Florida'), hub('country', 'Mexico')]).people, ids('ana'));
});

test('years and names narrow it further, ignoring accents', () => {
  assert.deepEqual(findPeople(graph, [hub('school', 'University of Florida'), { type: 'year', year: 2025 }]).people, ids('luis'));
  assert.deepEqual(findPeople(graph, [{ type: 'name', text: 'sofia ram' }]).people, ids('sofia'));
  assert.deepEqual(findPeople(graph, [{ type: 'name', text: 'perez' }]).people, ids('luis'));
});

test('a hub nobody has joined yet finds nobody, and no filters find nobody', () => {
  assert.deepEqual(findPeople(graph, [hub('company', 'SpaceX')]), { people: new Set(), hubs: new Set() });
  assert.deepEqual(findPeople(graph, []), { people: new Set(), hubs: new Set() });
});

test('smarter search adds its filters after the ones already understood, without repeats, in kind order', () => {
  const mine: SearchFilter[] = [hub('school', 'University of Florida'), { type: 'year', year: 2026 }];
  const smart: SearchFilter[] = [hub('company', 'Boeing'), hub('school', 'University of Florida'), { type: 'year', year: 2026 }];
  assert.deepEqual(mergeFilters(mine, smart), [
    hub('school', 'University of Florida'),
    hub('company', 'Boeing'),
    { type: 'year', year: 2026 },
  ]);
  assert.deepEqual(mergeFilters(mine, []), mine);
});
