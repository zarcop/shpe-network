// The people-and-hubs graph as plain data: built from the graph() payload, filtered by hub kind, and queried
// for what the detail panel shows. No drawing here, so it can be tested without a canvas.
import type { HubKind } from '../background/hubs.ts';

export type GraphPayload = {
  people: { id: string; name: string; headline: string | null; grad_year: number | null; linkedin_url: string | null }[];
  hubs: { id: number; kind: HubKind; name: string; domain: string | null; country_code: string | null }[];
  links: [string, number][];
};

export type PersonNode = {
  id: string;
  type: 'person';
  name: string;
  headline: string | null;
  gradYear: number | null;
  linkedinUrl: string | null;
};
export type HubNode = {
  id: string;
  type: 'hub';
  kind: HubKind;
  name: string;
  members: number;
  domain: string | null;
  country_code: string | null;
};
export type GraphNode = PersonNode | HubNode;
export type GraphLink = { source: string; target: string };

export type Graph = {
  nodes: Map<string, GraphNode>;
  links: GraphLink[]; // person → hub
  neighbors: Map<string, Set<string>>;
};

// People and hubs share one id space in the drawing, so each gets a prefix.
export const personId = (uuid: string) => `p:${uuid}`;
const hubId = (id: number) => `h:${id}`;

export function buildGraph(payload: GraphPayload): Graph {
  const nodes = new Map<string, GraphNode>();
  for (const p of payload.people) {
    nodes.set(personId(p.id), {
      id: personId(p.id),
      type: 'person',
      name: p.name,
      headline: p.headline,
      gradYear: p.grad_year,
      linkedinUrl: p.linkedin_url,
    });
  }
  for (const h of payload.hubs) {
    nodes.set(hubId(h.id), { ...h, id: hubId(h.id), type: 'hub', members: 0 });
  }

  const links: GraphLink[] = [];
  const neighbors = new Map<string, Set<string>>([...nodes.keys()].map((id) => [id, new Set()]));
  for (const [profile, hub] of payload.links) {
    const source = personId(profile);
    const target = hubId(hub);
    const hubNode = nodes.get(target);
    if (!nodes.has(source) || hubNode?.type !== 'hub') continue;
    hubNode.members += 1;
    links.push({ source, target });
    neighbors.get(source)!.add(target);
    neighbors.get(target)!.add(source);
  }
  return { nodes, links, neighbors };
}

// What to draw when only some hub kinds are switched on: those hubs and the people linked to them. Someone with
// no shown links isn't drawn: a lone dot drifts off and pulls the fitted view with it. Node objects are reused so
// positions persist.
export function filterGraph(graph: Graph, kinds: ReadonlySet<HubKind>) {
  const links = graph.links.filter((l) => {
    const hub = graph.nodes.get(l.target);
    return hub?.type === 'hub' && kinds.has(hub.kind);
  });
  const shown = new Set(links.flatMap((l) => [l.source, l.target]));
  const nodes = [...graph.nodes.values()].filter((n) => shown.has(n.id));
  return { nodes, links: links.map((l) => ({ ...l })) };
}

const byName = (a: GraphNode, b: GraphNode) => a.name.localeCompare(b.name);

export function hubsOf(graph: Graph, id: string): HubNode[] {
  return [...(graph.neighbors.get(id) ?? [])]
    .map((n) => graph.nodes.get(n))
    .filter((n): n is HubNode => n?.type === 'hub')
    .sort(byName);
}

export function membersOf(graph: Graph, id: string): PersonNode[] {
  return [...(graph.neighbors.get(id) ?? [])]
    .map((n) => graph.nodes.get(n))
    .filter((n): n is PersonNode => n?.type === 'person')
    .sort(byName);
}

// Hub ids two people have in common: the "you both…" line on someone's card.
export function sharedHubIds(graph: Graph, a: string, b: string): Set<string> {
  const mine = graph.neighbors.get(a) ?? new Set();
  return new Set([...(graph.neighbors.get(b) ?? [])].filter((id) => mine.has(id)));
}
