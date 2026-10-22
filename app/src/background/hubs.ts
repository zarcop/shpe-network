// A person's background: the hubs that place them in the graph. Limits match set_my_hubs in the database.

export const HUB_KINDS = ['school', 'company', 'major', 'country'] as const;
export type HubKind = (typeof HUB_KINDS)[number];
export type Hubs = Record<HubKind, string[]>;

export const HUB_LIMITS: Record<HubKind, number> = { school: 5, company: 10, country: 3, major: 3 };

export const HUB_LABELS: Record<HubKind, { title: string; placeholder: string; hint?: string }> = {
  school: { title: 'Colleges', placeholder: 'e.g. University of Florida' },
  company: { title: 'Companies', placeholder: 'e.g. Lockheed Martin', hint: 'Jobs, internships, co-ops and research labs.' },
  major: { title: 'Majors', placeholder: 'e.g. Mechanical Engineering' },
  country: { title: 'Country of origin', placeholder: 'e.g. Colombia', hint: 'Optional. Add it if you’d like to connect over it.' },
};

export const emptyHubs = (): Hubs => ({ school: [], company: [], major: [], country: [] });

export function isEmpty(hubs: Hubs): boolean {
  return HUB_KINDS.every((kind) => hubs[kind].length === 0);
}

// Adds names to a list, skipping blanks and case-insensitive duplicates, up to the kind's limit.
export function addNames(hubs: Hubs, kind: HubKind, names: string[]): Hubs {
  const list = [...hubs[kind]];
  const seen = new Set(list.map((n) => n.toLowerCase()));
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name || seen.has(name.toLowerCase()) || list.length >= HUB_LIMITS[kind]) continue;
    seen.add(name.toLowerCase());
    list.push(name);
  }
  return { ...hubs, [kind]: list };
}

// Folds an autofill suggestion into what the person already has: their own entries stay, new ones are added.
export function mergeHubs(current: Hubs, suggested: Hubs): { hubs: Hubs; added: number } {
  let hubs = current;
  let added = 0;
  for (const kind of HUB_KINDS) {
    const before = hubs[kind].length;
    hubs = addNames(hubs, kind, suggested[kind] ?? []);
    added += hubs[kind].length - before;
  }
  return { hubs, added };
}
