// `make hub-logos`: finds pictures for hubs people added (D18). Colleges and companies get a domain from Logo.dev
// search, countries a code from their name. Writes hub-logos.json for a person to check; `make hub-logos-apply`
// saves what is left in it. Talks to the database through the Supabase Management API with your CLI login.
import { readFileSync, writeFileSync } from 'node:fs';

import {
  countryCodeFor,
  hubImagesSql,
  pickDomain,
  type HubImageUpdate,
  type SearchResult,
} from '../app/src/graph/hub-images.ts';

const FILE = 'hub-logos.json';
const { PROJECT_REF, SUPABASE_ACCESS_TOKEN, LOGO_DEV_SECRET_KEY } = process.env;

type Proposal = HubImageUpdate & { kind: string; name: string; match: 'exact' | 'guess' };

async function query<T>(sql: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`database query failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function search(name: string): Promise<SearchResult[]> {
  const url = `https://api.logo.dev/v2/search?q=${encodeURIComponent(name)}&limit=5`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${LOGO_DEV_SECRET_KEY}` } });
    if (res.status === 429) {
      // Search has a per-minute limit; wait it out instead of failing the whole run.
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    if (!res.ok) throw new Error(`Logo.dev search failed for "${name}": ${res.status}`);
    return ((await res.json()) as { data: SearchResult[] }).data;
  }
  throw new Error(`Logo.dev search kept rate limiting on "${name}"`);
}

async function find() {
  if (!LOGO_DEV_SECRET_KEY) console.log('No LOGO_DEV_SECRET_KEY in .env.deploy: only countries (flags) this time.\n');
  const hubs = await query<{ id: number; kind: string; name: string }>(
    `select id, kind, name from public.entities
     where (kind in ('school', 'company') and domain is null) or (kind = 'country' and country_code is null)
     order by id`,
  );
  const proposals: Proposal[] = [];
  const unmatched: string[] = [];
  for (const hub of hubs) {
    if (hub.kind === 'country') {
      const code = countryCodeFor(hub.name);
      if (code) proposals.push({ ...hub, country_code: code, match: 'exact' });
      else unmatched.push(`${hub.kind}: ${hub.name}`);
      continue;
    }
    if (!LOGO_DEV_SECRET_KEY) continue;
    const picked = pickDomain(hub.name, await search(hub.name));
    if (picked) proposals.push({ ...hub, domain: picked.domain, match: picked.match });
    else unmatched.push(`${hub.kind}: ${hub.name}`);
  }

  writeFileSync(FILE, JSON.stringify(proposals, null, 2) + '\n');
  console.log(`${hubs.length} hubs without a picture.\n`);
  for (const p of proposals) {
    console.log(`${p.match === 'guess' ? 'CHECK' : '     '}  ${p.kind.padEnd(8)} ${p.name}  →  ${p.domain ?? p.country_code}`);
  }
  if (unmatched.length) console.log(`\nNo match (they keep their shape):\n  ${unmatched.join('\n  ')}`);
  console.log(`\nWrote ${FILE}. Fix or delete wrong lines (especially CHECK ones), then run make hub-logos-apply.`);
}

async function apply() {
  const proposals: Proposal[] = JSON.parse(readFileSync(FILE, 'utf8'));
  const updates = proposals.map(({ id, domain, country_code }) => ({ id, domain, country_code }));
  await query(hubImagesSql(updates));
  console.log(`Saved pictures for ${updates.length} hubs. They show up the next time people open the graph.`);
}

if (!PROJECT_REF || !SUPABASE_ACCESS_TOKEN) throw new Error('Run through make hub-logos (needs PROJECT_REF and a CLI login)');
const mode = process.argv[2];
if (mode === 'find') await find();
else if (mode === 'apply') await apply();
else throw new Error('usage: hub-logos.ts find|apply');
