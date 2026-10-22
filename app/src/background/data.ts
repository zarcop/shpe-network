import { supabase } from '@/lib/supabase';

import { emptyHubs, type HubKind, type Hubs } from './hubs';
import type { KnownHub } from './resume/parse';

export async function loadMyHubs(userId: string): Promise<Hubs> {
  const { data, error } = await supabase
    .from('profile_entities')
    .select('entity:entities(kind, name)')
    .eq('profile_id', userId);
  if (error) throw error;
  const hubs = emptyHubs();
  for (const row of data as unknown as { entity: { kind: HubKind; name: string } }[]) {
    hubs[row.entity.kind].push(row.entity.name);
  }
  return hubs;
}

// Replaces the whole background in one transaction (set_my_hubs).
export async function saveMyHubs(hubs: Hubs): Promise<void> {
  const { error } = await supabase.rpc('set_my_hubs', { p_hubs: hubs });
  if (error) throw error;
}

export async function suggestHubs(kind: HubKind, text: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('similar_entities', { p_kind: kind, p_name: text });
  if (error) return [];
  return (data as { name: string }[]).map((row) => row.name);
}

// Every hub with its spellings, for matching resume text on the device. PostgREST returns at most 1,000
// rows per request (api.max_rows), so read in pages.
export async function loadKnownHubs(): Promise<KnownHub[]> {
  const all: KnownHub[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('entities')
      .select('kind, name, aliases')
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data as KnownHub[]));
    if (data.length < 1000) return all;
  }
}

// The closest existing hub for a name a resume rule found, or the name as read when nothing is close
// ("Univ. of Central Florida" → University of Central Florida; "Smith Robotics Lab" stays). Exact aliases score 1.
export async function closestHub(kind: HubKind, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('similar_entities', { p_kind: kind, p_name: name });
  const best = (data as { name: string; score: number }[] | null)?.[0];
  return !error && best && best.score >= 0.6 ? best.name : name;
}
