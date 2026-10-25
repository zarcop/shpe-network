// The search box's grey placeholder types example questions, holds each, erases it and moves on, so people see what
// they can ask. Pure: the text depends only on the time since it started.

export const EXAMPLES = [
  'mechanical engineers from Mexico at Boeing',
  'UF computer science, class of 2026',
  'Puerto Ricans at NASA',
  'aerospace companies',
  'people in finance',
];

export const TYPE_MS = 55;
export const HOLD_MS = 1800;
export const PAUSE_MS = 400;
const ERASE_MS = TYPE_MS / 2;

const cycle = (e: string) => e.length * TYPE_MS + HOLD_MS + e.length * ERASE_MS + PAUSE_MS;

export function typedAt(examples: string[], elapsedMs: number): string {
  const total = examples.reduce((sum, e) => sum + cycle(e), 0);
  if (!total) return '';
  let t = elapsedMs % total;
  for (const e of examples) {
    if (t >= cycle(e)) {
      t -= cycle(e);
      continue;
    }
    const typing = e.length * TYPE_MS;
    if (t < typing) return e.slice(0, Math.floor(t / TYPE_MS));
    if (t < typing + HOLD_MS) return e;
    const erased = Math.ceil((t - typing - HOLD_MS) / ERASE_MS);
    return e.slice(0, Math.max(e.length - erased, 0));
  }
  return '';
}
