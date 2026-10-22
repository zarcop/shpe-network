/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { authErrorMessage, profileErrorMessage } from './errors.ts';
import { codeSchema, emailSchema } from './validation.ts';

test('emails are trimmed and lowercased so one person gets one account', () => {
  assert.equal(emailSchema.parse('  Ana.Perez@UFL.edu '), 'ana.perez@ufl.edu');
});

test('malformed emails are refused', () => {
  for (const email of ['', 'ana', 'ana@', '@ufl.edu', 'ana perez@ufl.edu']) {
    assert.equal(emailSchema.safeParse(email).success, false, email);
  }
});

test('codes accept spaces people type or paste, and must be exactly 6 digits', () => {
  assert.equal(codeSchema.parse(' 123 456 '), '123456');
  for (const code of ['', '12345', '1234567', '12a456']) {
    assert.equal(codeSchema.safeParse(code).success, false, code);
  }
});

test('auth errors map to plain messages, never raw server text', () => {
  assert.equal(authErrorMessage(null), null);
  assert.match(authErrorMessage({ code: 'otp_expired' })!, /wrong or has expired/);
  assert.match(authErrorMessage({ code: 'over_email_send_rate_limit' })!, /Wait a minute/);
  assert.match(authErrorMessage({ status: 429 })!, /Wait a minute/);
  assert.match(authErrorMessage({ code: 'something_new' })!, /Something went wrong/);
});

test('profile save errors map to plain messages', () => {
  assert.equal(profileErrorMessage(null), null);
  assert.match(profileErrorMessage({ code: '23514' })!, /Check the fields/);
  assert.match(profileErrorMessage({ code: 'XX000' })!, /Couldn’t save/);
});
