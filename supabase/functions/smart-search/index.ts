// Smart search (D21): turns a question the on-device rules couldn't fully read into hub and year filters with
// Claude Haiku. Runs as the signed-in person, so the daily limit (consume_llm_quota) and row security apply to them.
// Only the question and public hub names go to Anthropic; no profiles. Small and stateless so it ports to Lambda (D13).
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { type Hub, keepKnown, MAX_QUESTION, OUTPUT_SCHEMA, SYSTEM, userMessage } from './filters.ts';

const anthropic = new Anthropic(); // ANTHROPIC_API_KEY, a Supabase secret

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'not_allowed' });

  const { question } = await req.json().catch(() => ({}));
  if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION) {
    return reply(400, { error: 'bad_question' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const quota = await db.rpc('consume_llm_quota', { p_action: 'search' });
  if (quota.error) {
    const code = quota.error.code;
    if (code === 'P0429') return reply(429, { error: 'daily_limit' });
    if (code === 'P0503') return reply(503, { error: 'service_limit' });
    return reply(401, { error: 'not_allowed' }); // signed out, or no profile yet
  }

  const hubs: Hub[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await db.from('entities').select('kind, name').order('id').range(from, from + 999);
    if (page.error) return reply(500, { error: 'failed' });
    hubs.push(...(page.data as Hub[]));
    if (page.data.length < 1000) break;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: userMessage(question.trim(), hubs) }],
    });
    const text = response.content.find((b) => b.type === 'text');
    if (response.stop_reason !== 'end_turn' || !text || text.type !== 'text') {
      return reply(200, { filters: [], remaining: quota.data });
    }
    return reply(200, { filters: keepKnown(JSON.parse(text.text), hubs), remaining: quota.data });
  } catch (error) {
    console.error('smart-search failed', error instanceof Anthropic.APIError ? error.status : error);
    return reply(502, { error: 'failed' });
  }
});
