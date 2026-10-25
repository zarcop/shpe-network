// The parts of smart search that don't talk to anything: what Claude is asked, the JSON shape it must answer in,
// and the check that keeps only hubs that exist. Plain TypeScript so Node can test it (make test-scripts).

export type Hub = { kind: 'school' | 'company' | 'major' | 'country'; name: string };
export type SmartFilter = { type: 'hub'; kind: Hub['kind']; name: string } | { type: 'year'; year: number };

export const MAX_QUESTION = 200;

const KIND_TITLES: Record<Hub['kind'], string> = {
  school: 'Colleges',
  company: 'Companies',
  major: 'Majors',
  country: 'Roots (countries)',
};

export const SYSTEM = `You turn a question about who is attending a SHPE convention into search filters.
People are linked to hubs: colleges, companies, majors and roots (countries of family origin).
Pick every hub from the lists that the question is asking about, using what you know about them: "aerospace companies"
means the aerospace and defense companies listed; "people in finance" means the banks and finance companies listed;
"Ivy League" means those colleges listed. Copy hub names exactly as written in the lists. Add graduation years only
when the question names them. If nothing in the lists fits, return empty arrays. Never invent hubs.`;

// Grouped by kind so the model reads them like a menu. Order is stable, so identical questions send identical text.
export function userMessage(question: string, hubs: Hub[]): string {
  const lists = (Object.keys(KIND_TITLES) as Hub['kind'][])
    .map((kind) => {
      const names = hubs.filter((h) => h.kind === kind).map((h) => h.name).sort();
      return `${KIND_TITLES[kind]}:\n${names.join('\n') || '(none)'}`;
    })
    .join('\n\n');
  return `${lists}\n\nQuestion: ${question}`;
}

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    hubs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kind: { type: 'string', enum: Object.keys(KIND_TITLES) }, name: { type: 'string' } },
        required: ['kind', 'name'],
        additionalProperties: false,
      },
    },
    years: { type: 'array', items: { type: 'integer' } },
  },
  required: ['hubs', 'years'],
  additionalProperties: false,
} as const;

// The model's answer is input from outside: anything that isn't an existing hub or a plausible class year is dropped.
export function keepKnown(answer: unknown, hubs: Hub[]): SmartFilter[] {
  const a = answer as { hubs?: unknown; years?: unknown } | null;
  const exists = new Set(hubs.map((h) => `${h.kind}:${h.name}`));
  const filters: SmartFilter[] = [];
  for (const h of Array.isArray(a?.hubs) ? a.hubs : []) {
    const key = `${h?.kind}:${h?.name}`;
    if (exists.has(key) && !filters.some((f) => f.type === 'hub' && `${f.kind}:${f.name}` === key)) {
      filters.push({ type: 'hub', kind: h.kind, name: h.name });
    }
  }
  for (const y of Array.isArray(a?.years) ? a.years : []) {
    if (Number.isInteger(y) && y >= 1950 && y <= 2100 && !filters.some((f) => f.type === 'year' && f.year === y)) {
      filters.push({ type: 'year', year: y });
    }
  }
  return filters;
}
