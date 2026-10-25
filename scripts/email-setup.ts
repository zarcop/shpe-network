// `make email-setup`: points a hosted project's sign-in emails at Gmail (D19) and gives them the same templates as
// local (supabase/config.toml), which the Free plan only accepts once custom SMTP is set. Prints no secrets.
import { readFileSync } from 'node:fs';

const SENDER_NAME = 'Who is going to SHPE?';
// Gmail allows about 500 a day; codes only go out to people saving their account or signing back in.
const EMAILS_PER_HOUR = 100;

// The [auth.email.template.<name>] blocks in config.toml, as the Management API's mailer_* fields. Content paths
// are relative to the repo root, like the CLI reads them.
export function emailTemplates(configToml: string, readTemplate: (path: string) => string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const block of configToml.matchAll(/^\[auth\.email\.template\.(\w+)\]\n((?:[^\[\n].*\n?)*)/gm)) {
    const [, name, body] = block;
    const subject = body.match(/^subject = "(.*)"$/m)?.[1];
    const contentPath = body.match(/^content_path = "(.*)"$/m)?.[1];
    if (!subject || !contentPath) throw new Error(`template ${name} needs a subject and a content_path`);
    fields[`mailer_subjects_${name}`] = subject;
    fields[`mailer_templates_${name}_content`] = readTemplate(contentPath);
  }
  if (!Object.keys(fields).length) throw new Error('no [auth.email.template.*] blocks in config.toml');
  return fields;
}

async function main() {
  const { PROJECT_REF, SUPABASE_ACCESS_TOKEN, SMTP_USER, SMTP_PASS } = process.env;
  if (!PROJECT_REF || !SUPABASE_ACCESS_TOKEN) throw new Error('Run through make email-setup (needs PROJECT_REF and a CLI login)');
  if (!SMTP_USER || !SMTP_PASS) throw new Error('Set SMTP_USER and SMTP_PASS in .env.deploy (see .env.deploy.example)');

  const templates = emailTemplates(readFileSync('supabase/config.toml', 'utf8'), (path) => readFileSync(path, 'utf8'));
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      smtp_host: 'smtp.gmail.com',
      smtp_port: '465',
      smtp_user: SMTP_USER,
      smtp_pass: SMTP_PASS.replace(/\s/g, ''), // Google shows app passwords in groups of four
      smtp_admin_email: SMTP_USER, // Gmail only sends as the account itself
      smtp_sender_name: SENDER_NAME,
      rate_limit_email_sent: EMAILS_PER_HOUR,
      ...templates,
    }),
  });
  if (!res.ok) throw new Error(`Supabase refused the settings: ${res.status} ${await res.text()}`);
  console.log(`Emails now go out from ${SENDER_NAME} <${SMTP_USER}>, up to ${EMAILS_PER_HOUR}/hour, with ` +
    `${Object.keys(templates).length / 2} templates.`);
}

if (import.meta.main) await main();
