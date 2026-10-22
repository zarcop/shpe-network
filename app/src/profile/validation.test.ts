/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseProfileForm, type ProfileForm } from './validation.ts';

const base = { full_name: 'Ana Pérez', headline: '', linkedin_url: '', grad_year: '' };

function expectValid(form: ProfileForm) {
  const result = parseProfileForm(form);
  if (!result.ok) assert.fail(`expected valid: ${JSON.stringify(result.errors)}`);
  return result.value;
}

test('a name alone is a valid profile; empty optional fields become null', () => {
  assert.deepEqual(parseProfileForm(base), {
    ok: true,
    value: { full_name: 'Ana Pérez', headline: null, linkedin_url: null, grad_year: null },
  });
});

test('names and headlines are trimmed and single-spaced', () => {
  const value = expectValid({ ...base, full_name: '  Ana   María  Pérez ', headline: ' ME  student ' });
  assert.equal(value.full_name, 'Ana María Pérez');
  assert.equal(value.headline, 'ME student');
});

test('a blank or whitespace-only name is refused', () => {
  for (const full_name of ['', '   ']) {
    const result = parseProfileForm({ ...base, full_name });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.full_name);
  }
});

test('names over 120 characters and headlines over 200 are refused', () => {
  const result = parseProfileForm({ ...base, full_name: 'a'.repeat(121), headline: 'h'.repeat(201) });
  assert.ok(!result.ok && result.errors.full_name && result.errors.headline);
  assert.ok(parseProfileForm({ ...base, full_name: 'a'.repeat(120), headline: 'h'.repeat(200) }).ok);
});

test('LinkedIn links are accepted as people paste them and stored as https', () => {
  const cases: Record<string, string> = {
    'linkedin.com/in/ana': 'https://linkedin.com/in/ana',
    'www.linkedin.com/in/ana/': 'https://www.linkedin.com/in/ana/',
    'http://www.linkedin.com/in/ana': 'https://www.linkedin.com/in/ana',
    ' https://www.linkedin.com/in/ana ': 'https://www.linkedin.com/in/ana',
  };
  for (const [input, stored] of Object.entries(cases)) {
    assert.equal(expectValid({ ...base, linkedin_url: input }).linkedin_url, stored, input);
  }
});

test('links that are not LinkedIn are refused', () => {
  for (const linkedin_url of ['example.com/ana', 'https://linkedin.evil.com/in/ana', 'https://linkedin.com/']) {
    const result = parseProfileForm({ ...base, linkedin_url });
    assert.ok(!result.ok && result.errors.linkedin_url, linkedin_url);
  }
});

test('graduation year must be a 4-digit year between 1950 and 2040', () => {
  assert.equal(expectValid({ ...base, grad_year: ' 2027 ' }).grad_year, 2027);
  assert.ok(parseProfileForm({ ...base, grad_year: '1950' }).ok);
  assert.ok(parseProfileForm({ ...base, grad_year: '2040' }).ok);
  for (const grad_year of ['1949', '2041', '27', 'abcd', '20.5']) {
    const result = parseProfileForm({ ...base, grad_year });
    assert.ok(!result.ok && result.errors.grad_year, grad_year);
    assert.match(result.errors.grad_year!, /^Enter a (4-digit year|year between 1950 and 2040)$/, grad_year);
  }
});
