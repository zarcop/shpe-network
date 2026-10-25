/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGraph, filterGraph, hubsOf, membersOf, personId, sharedHubIds, type GraphPayload } from './graph.ts';

const person = (id: string, name: string) => ({ id, name, headline: null, grad_year: null, linkedin_url: null });

const payload: GraphPayload = {
  people: [person('ana', 'Ana'), person('luis', 'Luis'), person('sofia', 'Sofía'), person('me', 'Me')],
  hubs: [
    { id: 1, kind: 'school', name: 'University of Florida', domain: 'ufl.edu', country_code: null },
    { id: 2, kind: 'company', name: 'Boeing', domain: null, country_code: null },
    { id: 3, kind: 'country', name: 'Mexico', domain: null, country_code: 'mx' },
  ],
  links: [
    ['ana', 1],
    ['luis', 1],
    ['me', 1],
    ['ana', 2],
    ['me', 2],
    ['sofia', 3],
  ],
};
const me = personId('me');

test('hubs count their members and links connect both ways', () => {
  const graph = buildGraph(payload);
  assert.equal(graph.nodes.size, 7);
  assert.equal(graph.links.length, 6);
  assert.deepEqual(membersOf(graph, 'h:1').map((p) => p.name), ['Ana', 'Luis', 'Me']);
  assert.deepEqual(
    [...graph.nodes.values()].filter((n) => n.type === 'hub').map((h) => [h.name, h.members]),
    [['University of Florida', 3], ['Boeing', 2], ['Mexico', 1]],
  );
});

test('links to people or hubs outside the payload are dropped', () => {
  const graph = buildGraph({ ...payload, links: [...payload.links, ['ghost', 1], ['ana', 99]] });
  assert.equal(graph.links.length, 6);
  assert.equal(membersOf(graph, 'h:1').length, 3);
});

test('an empty payload builds an empty graph', () => {
  const graph = buildGraph({ people: [], hubs: [], links: [] });
  assert.equal(graph.nodes.size, 0);
  assert.deepEqual(filterGraph(graph, new Set(['school'])), { nodes: [], links: [] });
});

test('filtering keeps only the chosen kinds and the people linked to them', () => {
  const graph = buildGraph(payload);
  const { nodes, links } = filterGraph(graph, new Set(['company']));
  assert.deepEqual(nodes.map((n) => n.name).sort(), ['Ana', 'Boeing', 'Me']);
  assert.equal(links.length, 2);
});

test('people with none of the shown kinds are left out, you included', () => {
  const graph = buildGraph(payload);
  const { nodes } = filterGraph(graph, new Set(['country']));
  assert.deepEqual(nodes.map((n) => n.name).sort(), ['Mexico', 'Sofía']);
});

test('filtering reuses node objects so the layout keeps its positions', () => {
  const graph = buildGraph(payload);
  const first = filterGraph(graph, new Set(['school', 'company'])).nodes;
  const second = filterGraph(graph, new Set(['school'])).nodes;
  assert.equal(second.find((n) => n.name === 'Ana'), first.find((n) => n.name === 'Ana'));
});

test('a person\'s hubs are sorted by name, and shared hubs are the overlap', () => {
  const graph = buildGraph(payload);
  assert.deepEqual(hubsOf(graph, personId('ana')).map((h) => h.name), ['Boeing', 'University of Florida']);
  assert.deepEqual([...sharedHubIds(graph, me, personId('ana'))].sort(), ['h:1', 'h:2']);
  assert.deepEqual([...sharedHubIds(graph, me, personId('sofia'))], []);
  assert.deepEqual(hubsOf(graph, 'unknown'), []);
});
