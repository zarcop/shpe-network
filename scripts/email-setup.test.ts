import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { emailTemplates } from './email-setup.ts';

test('every template in config.toml goes to hosted, subject and content', () => {
  const fields = emailTemplates(readFileSync('supabase/config.toml', 'utf8'), (path) => `<file ${path}>`);
  assert.deepEqual(Object.keys(fields).sort(), [
    'mailer_subjects_confirmation',
    'mailer_subjects_email_change',
    'mailer_subjects_magic_link',
    'mailer_templates_confirmation_content',
    'mailer_templates_email_change_content',
    'mailer_templates_magic_link_content',
  ]);
  assert.equal(fields.mailer_subjects_magic_link, 'Your sign-in code for Who is going to SHPE?');
  assert.equal(fields.mailer_templates_email_change_content, '<file ./supabase/templates/code.html>');
});

test('the real template shows the code', () => {
  const fields = emailTemplates(readFileSync('supabase/config.toml', 'utf8'), (path) => readFileSync(path, 'utf8'));
  assert.match(fields.mailer_templates_magic_link_content, /\{\{ \.Token \}\}/);
});

test('commented-out templates are skipped, and a half-filled one is refused', () => {
  const toml = '# [auth.email.template.invite]\n# subject = "x"\n[auth.email.template.recovery]\nsubject = "Reset"\n';
  assert.throws(() => emailTemplates(toml, () => ''), /recovery needs a subject and a content_path/);
  assert.throws(() => emailTemplates('[auth]\nenabled = true\n', () => ''), /no \[auth\.email\.template/);
});
