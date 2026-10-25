// Plain-English search without AI (D21): finds known hub names and nicknames, graduation years and people's names in
// what someone typed, and turns them into filters. Words nothing explains come back as `unknown`; smarter search
// (AI) only runs on those. Same text always gives the same filters, on the device, for free.
import { HUB_KINDS, type HubKind } from '../background/hubs.ts';
import type { KnownHub } from '../background/resume/parse.ts';
import type { Graph } from '../graph/graph.ts';
import { fold } from '../lib/fold.ts';

export type SearchFilter =
  | { type: 'hub'; kind: HubKind; name: string }
  | { type: 'year'; year: number }
  | { type: 'name'; text: string };
export type ParsedQuery = { filters: SearchFilter[]; unknown: string[] };

// Question words that never narrow anything. A few Spanish ones too: people type "gente de México".
const STOPWORDS = new Set(
  `a an the and or of in at on from to for with who whose that are is was were be been by
   people person anyone everyone someone somebody all any show find list search me my i us we our you like
   student students major majors grad grads graduate graduates graduating alumni class year
   work works worked working job jobs intern interns internship internships engineer engineers
   company companies firm firms industry study studies studied studying going go attend attending attended roots born
   de del la las los el en y gente`.split(/\s+/),
);

// Short nicknames that are also everyday words ("me" = Mechanical Engineering, "us" = United States) count only when
// typed in capitals, so "people like me" isn't a search for mechanical engineers.
const EVERYDAY = new Set(['me', 'us', 'it', 'in', 'at', 'on', 'or', 'an', 'as', 'be', 'do', 'go', 'he', 'is', 'of',
  'so', 'to', 'up', 'we', 'am', 'by', 'my', 'no', 'hi', 'ok']);

// How people name each other's roots. Only for countries that exist as hubs.
const DEMONYMS: Record<string, string> = {
  Mexico: 'mexicans?', 'Puerto Rico': 'puerto ricans?|boricuas?', Colombia: 'colombians?', Venezuela: 'venezuelans?',
  Cuba: 'cubans?', 'Dominican Republic': 'dominicans?', Peru: 'peruvians?', Argentina: 'argentin(?:e|ians?)',
  'El Salvador': 'salvadorans?', Guatemala: 'guatemalans?', Ecuador: 'ecuadorians?', Brazil: 'brazilians?',
  Spain: 'spaniards?', Honduras: 'hondurans?', Nicaragua: 'nicaraguans?', 'Costa Rica': 'costa ricans?',
  Panama: 'panamanians?', Bolivia: 'bolivians?', Chile: 'chileans?', Uruguay: 'uruguayans?', Paraguay: 'paraguayans?',
};

type Term = { kind: HubKind; name: string; pattern: string; capitals: boolean; length: number };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LETTER = '[\\p{L}\\p{N}&]';
const wholeWords = (pattern: string, flags: string) => new RegExp(`(?<!${LETTER})(?:${pattern})(?!${LETTER})`, flags);

// "Mechanical Engineering" also matches "mechanical engineers"; "Computer Science", "computer scientists".
const majorForms = (pattern: string) =>
  pattern
    .replace(/\bengineering\b/, 'engineer(?:ing|s)?')
    .replace(/\bscience\b/, 'scien(?:ce|tists?)')
    .replace(/\bphysics\b/, 'physic(?:s|ists?)')
    .replace(/\bmathematics\b/, 'math(?:ematics|s)?');

function termsFor(known: KnownHub[]): Term[] {
  const terms: Term[] = [];
  const add = (hub: KnownHub, form: string, pattern = escapeRe(form).replace(/ +/g, '\\s+'), capitals = false) =>
    terms.push({ kind: hub.kind, name: hub.name, pattern, capitals, length: form.length });

  // A major's first word alone ("mechanical") when no other major starts with it, unless it describes companies.
  const firstWords = known.filter((h) => h.kind === 'major').map((h) => fold(h.name).split(' ')[0]);
  for (const hub of known) {
    for (const form of new Set([hub.name, ...hub.aliases].map(fold))) {
      if (form.length <= 4 && !form.includes(' ') && EVERYDAY.has(form)) add(hub, form, escapeRe(form.toUpperCase()), true);
      else if (hub.kind === 'major') add(hub, form, majorForms(escapeRe(form).replace(/ +/g, '\\s+')));
      else add(hub, form);
    }
    if (hub.kind === 'major') {
      const first = fold(hub.name).split(' ')[0];
      if (fold(hub.name).includes(' ') && firstWords.filter((w) => w === first).length === 1) {
        add(hub, first, `${escapeRe(first)}(?!\\s+(?:compan(?:y|ies)|firms?|industry))`);
      }
    }
    if (hub.kind === 'country' && DEMONYMS[hub.name]) add(hub, hub.name, DEMONYMS[hub.name]);
  }
  // Longest first: "computer science" before "computer", "texas a&m" before "texas".
  return terms.sort((a, b) => b.length - a.length);
}

export function parseQuery(text: string, known: KnownHub[], peopleNames: string[]): ParsedQuery {
  const folded = fold(text);
  const taken = new Array<boolean>(folded.length).fill(false);
  const take = (from: number, to: number) => {
    if (taken.slice(from, to).some(Boolean)) return false;
    taken.fill(true, from, to);
    return true;
  };

  const hubs: { kind: HubKind; name: string; at: number }[] = [];
  for (const term of termsFor(known)) {
    const re = wholeWords(term.pattern, term.capitals ? 'gu' : 'giu');
    for (const m of (term.capitals ? text : folded).matchAll(re)) {
      if (!take(m.index, m.index + m[0].length)) continue;
      if (!hubs.some((h) => h.kind === term.kind && h.name === term.name)) hubs.push({ ...term, at: m.index });
    }
  }

  const years: number[] = [];
  for (const m of folded.matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/g)) {
    if (take(m.index, m.index + 4) && !years.includes(+m[0])) years.push(+m[0]);
  }

  const rest = [...folded].map((c, i) => (taken[i] ? ' ' : c)).join('');
  const words = rest.split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOPWORDS.has(w));
  const nameWords = peopleNames.flatMap((n) => fold(n).split(/\s+/));
  const isName = (w: string) => nameWords.some((n) => n.startsWith(w));

  const filters: SearchFilter[] = [
    ...hubs
      .sort((a, b) => HUB_KINDS.indexOf(a.kind) - HUB_KINDS.indexOf(b.kind) || a.at - b.at)
      .map(({ kind, name }) => ({ type: 'hub' as const, kind, name })),
    ...years.map((year) => ({ type: 'year' as const, year })),
  ];
  const name = words.filter(isName);
  if (name.length) filters.push({ type: 'name', text: name.join(' ') });
  return { filters, unknown: [...new Set(words.filter((w) => !isName(w)))] };
}

// Who matches: any hub within a kind, every kind asked about (UF and (Boeing or NASA)), any of the years, and every
// word of a name. Also returns the asked-about hubs that are on the graph, to light them up with the people.
export function findPeople(graph: Graph, filters: SearchFilter[]): { people: Set<string>; hubs: Set<string> } {
  const people = new Set<string>();
  const hubs = new Set<string>();
  if (!filters.length) return { people, hubs };

  const hubIds = new Map<string, string>();
  for (const n of graph.nodes.values()) if (n.type === 'hub') hubIds.set(`${n.kind}:${n.name}`, n.id);
  const groups = new Map<HubKind, string[]>();
  const years: number[] = [];
  const nameWords: string[] = [];
  for (const f of filters) {
    if (f.type === 'hub') {
      const id = hubIds.get(`${f.kind}:${f.name}`);
      groups.set(f.kind, [...(groups.get(f.kind) ?? []), ...(id ? [id] : [])]);
      if (id) hubs.add(id);
    } else if (f.type === 'year') years.push(f.year);
    else nameWords.push(...fold(f.text).split(/\s+/));
  }

  for (const n of graph.nodes.values()) {
    if (n.type !== 'person') continue;
    const linked = graph.neighbors.get(n.id) ?? new Set();
    const words = fold(n.name).split(/\s+/);
    if (
      [...groups.values()].every((ids) => ids.some((id) => linked.has(id))) &&
      (!years.length || (n.gradYear !== null && years.includes(n.gradYear))) &&
      nameWords.every((w) => words.some((x) => x.startsWith(w)))
    ) {
      people.add(n.id);
    }
  }
  return { people, hubs: people.size ? hubs : new Set() };
}
