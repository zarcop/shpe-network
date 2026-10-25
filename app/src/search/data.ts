import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import type { SearchFilter } from './query';

export type SmartResult = { ok: true; filters: SearchFilter[]; remaining: number } | { ok: false; message: string };

// Asks the smart-search function (Claude) for filters the on-device rules missed. Uses one of today's 5; regular
// search runs on the device and has no limit.
export async function smartSearch(question: string): Promise<SmartResult> {
  const { data, error } = await supabase.functions.invoke('smart-search', { body: { question } });
  if (!error) return { ok: true, ...(data as { filters: SearchFilter[]; remaining: number }) };
  const status = error instanceof FunctionsHttpError ? (error.context as Response).status : 0;
  return {
    ok: false,
    message:
      status === 429
        ? 'You’ve used today’s 5 smarter searches. Regular search still works, as much as you like.'
        : 'Smarter search isn’t available right now. Try again later.',
  };
}
