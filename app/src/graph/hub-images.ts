// Pictures for hubs: flags ship with the app (public/flags, from flag-icons), so do a few major icons
// (public/majors), and college and company logos come from Logo.dev by website domain. Shared by the graph (image URLs) and `make hub-logos` (finding domains and codes for
// hubs people add, D18). No I/O here.
import type { HubKind } from '../background/hubs.ts';
import { fold } from '../lib/fold.ts';

export type HubImageFields = { kind: HubKind; name?: string; domain?: string | null; country_code?: string | null };

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const COUNTRY_CODE = /^[a-z]{2}$/;

// By keyword, so majors people add ("Mechanical Engineering Technology") get the icon too. Others keep the diamond.
// First match wins: "Electrical and Computer Engineering" is a chip, "Civil and Environmental" a bridge.
const MAJOR_ICONS: [RegExp, string][] = [
  [/mechanical/, 'gear'],
  [/electrical/, 'chip'],
  [/business|finance|accounting|economics/, 'money'],
  [/chemical/, 'flask'],
  [/industrial/, 'trend'],
  [/computer science|software/, 'code'],
  [/computer/, 'monitor'],
  [/aerospace|aeronautic|astronautic/, 'rocket'],
  [/civil/, 'bridge'],
  [/biomedical/, 'heart'],
  [/data/, 'database'],
  [/materials/, 'cube'],
  [/environmental/, 'leaf'],
  [/physics/, 'atom'],
  [/math/, 'sigma'],
];

// null: draw the plain shape. Without a Logo.dev key (local dev, or a build without one) only flags and major icons show.
export function hubImageUrl(hub: HubImageFields, logoKey: string | undefined): string | null {
  if (hub.kind === 'country' && hub.country_code) return `/flags/${hub.country_code}.svg`;
  if (hub.kind === 'major') {
    const icon = MAJOR_ICONS.find(([words]) => words.test(norm(hub.name ?? '')));
    return icon ? `/majors/${icon[1]}.svg` : null;
  }
  if ((hub.kind === 'school' || hub.kind === 'company') && hub.domain && logoKey) {
    // fallback=404: no generated monogram for unknown domains, so the shape shows instead.
    return `https://img.logo.dev/${hub.domain}?token=${logoKey}&format=png&size=128&fallback=404`;
  }
  return null;
}

const norm = (s: string) => fold(s).replace(/\s+/g, ' ').trim();

let countryCodes: Map<string, string> | null = null;

// "México" → "mx", using the runtime's own list of region names (no table to maintain). null when unknown.
export function countryCodeFor(name: string): string | null {
  if (!countryCodes) {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    countryCodes = new Map();
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const regionName = names.of(code);
        if (regionName && regionName !== code) countryCodes.set(norm(regionName), code.toLowerCase());
      }
    }
  }
  return countryCodes.get(norm(name)) ?? null;
}

export type SearchResult = { name: string; domain: string };

// Picks a domain from Logo.dev search results for a hub's name. "exact" when a result has the same name;
// otherwise the top result is only a guess, for a person to check.
export function pickDomain(name: string, results: SearchResult[]): { domain: string; match: 'exact' | 'guess' } | null {
  const usable = results.filter((r) => DOMAIN.test(r.domain));
  const exact = usable.find((r) => norm(r.name) === norm(name));
  if (exact) return { domain: exact.domain, match: 'exact' };
  return usable[0] ? { domain: usable[0].domain, match: 'guess' } : null;
}

export type HubImageUpdate = { id: number; domain?: string; country_code?: string };

// One UPDATE for the approved rows. Values are checked against the same rules as the table's constraints, so
// nothing but a domain, a two-letter code and an integer id ever reaches the SQL text.
export function hubImagesSql(updates: HubImageUpdate[]): string {
  const rows = updates.map((u) => {
    if (!Number.isInteger(u.id) || u.id <= 0) throw new Error(`bad hub id: ${u.id}`);
    if (u.domain !== undefined && !DOMAIN.test(u.domain)) throw new Error(`bad domain for hub ${u.id}: ${u.domain}`);
    if (u.country_code !== undefined && !COUNTRY_CODE.test(u.country_code)) {
      throw new Error(`bad country code for hub ${u.id}: ${u.country_code}`);
    }
    return `(${u.id}, ${u.domain ? `'${u.domain}'` : 'null'}, ${u.country_code ? `'${u.country_code}'` : 'null'})`;
  });
  if (!rows.length) throw new Error('nothing to update');
  return `update public.entities e
set domain = coalesce(v.domain, e.domain), country_code = coalesce(v.country_code, e.country_code)
from (values ${rows.join(', ')}) as v (id, domain, country_code)
where e.id = v.id;`;
}
