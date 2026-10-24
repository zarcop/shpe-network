import { supabase } from '@/lib/supabase';

import { buildGraph, type Graph, type GraphPayload } from './graph';

export async function loadGraph(): Promise<Graph> {
  const { data, error } = await supabase.rpc('graph');
  if (error) throw error;
  return buildGraph(data as GraphPayload);
}
