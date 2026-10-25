/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countryCodeFor, hubImageUrl, hubImagesSql, pickDomain } from './hub-images.ts';

test('countries use the bundled flag, colleges and companies a Logo.dev logo', () => {
  assert.equal(hubImageUrl({ kind: 'country', country_code: 'mx' }, undefined), '/flags/mx.svg');
  assert.equal(
    hubImageUrl({ kind: 'school', domain: 'ufl.edu' }, 'pk_test'),
    'https://img.logo.dev/ufl.edu?token=pk_test&format=png&size=128&fallback=404',
  );
});

test('no picture without a domain, a code or a Logo.dev key, or for a major with no matching icon', () => {
  assert.equal(hubImageUrl({ kind: 'company', domain: 'boeing.com' }, undefined), null);
  assert.equal(hubImageUrl({ kind: 'company', domain: null }, 'pk_test'), null);
  assert.equal(hubImageUrl({ kind: 'country', country_code: null }, 'pk_test'), null);
  assert.equal(hubImageUrl({ kind: 'major', name: 'Underwater Basket Weaving' }, 'pk_test'), null);
});

test('majors get an icon by field, also ones people add, and need no Logo.dev key', () => {
  assert.equal(hubImageUrl({ kind: 'major', name: 'Mechanical Engineering' }, undefined), '/majors/gear.svg');
  assert.equal(hubImageUrl({ kind: 'major', name: 'Electrical Engineering' }, undefined), '/majors/chip.svg');
  assert.equal(hubImageUrl({ kind: 'major', name: 'Business Administration' }, undefined), '/majors/money.svg');
  assert.equal(hubImageUrl({ kind: 'major', name: 'chemical engineering' }, undefined), '/majors/flask.svg');
  assert.equal(hubImageUrl({ kind: 'major', name: 'Industrial and Systems Engineering' }, undefined), '/majors/trend.svg');
  assert.equal(hubImageUrl({ kind: 'major', name: 'Biochemistry' }, undefined), null);
});

test('every reference major gets its own icon, and the specific word wins over the general one', () => {
  const icon = (name: string) => hubImageUrl({ kind: 'major', name }, undefined);
  assert.equal(icon('Computer Science'), '/majors/code.svg');
  assert.equal(icon('Software Engineering'), '/majors/code.svg');
  assert.equal(icon('Computer Engineering'), '/majors/monitor.svg');
  assert.equal(icon('Electrical and Computer Engineering'), '/majors/chip.svg');
  assert.equal(icon('Aerospace Engineering'), '/majors/rocket.svg');
  assert.equal(icon('Civil Engineering'), '/majors/bridge.svg');
  assert.equal(icon('Civil and Environmental Engineering'), '/majors/bridge.svg');
  assert.equal(icon('Biomedical Engineering'), '/majors/heart.svg');
  assert.equal(icon('Data Science'), '/majors/database.svg');
  assert.equal(icon('Materials Science and Engineering'), '/majors/cube.svg');
  assert.equal(icon('Environmental Engineering'), '/majors/leaf.svg');
  assert.equal(icon('Physics'), '/majors/atom.svg');
  assert.equal(icon('Mathematics'), '/majors/sigma.svg');
  assert.equal(icon('Applied Math'), '/majors/sigma.svg');
  assert.equal(hubImageUrl({ kind: 'major', name: '' }, undefined), null);
});

test('country names resolve to codes, ignoring accents, case and spacing', () => {
  assert.equal(countryCodeFor('México'), 'mx');
  assert.equal(countryCodeFor('  puerto   rico '), 'pr');
  assert.equal(countryCodeFor('Dominican Republic'), 'do');
  assert.equal(countryCodeFor('Atlantis'), null);
  assert.equal(countryCodeFor(''), null);
});

test('an exact name match wins over the top result; otherwise the top result is only a guess', () => {
  const results = [
    { name: 'Delta Faucet', domain: 'deltafaucet.com' },
    { name: 'Delta Air Lines', domain: 'delta.com' },
  ];
  assert.deepEqual(pickDomain('delta air lines', results), { domain: 'delta.com', match: 'exact' });
  assert.deepEqual(pickDomain('Delta', results), { domain: 'deltafaucet.com', match: 'guess' });
  assert.equal(pickDomain('Nobody Inc', []), null);
  assert.equal(pickDomain('Weird', [{ name: 'Weird', domain: 'not a domain' }]), null);
});

test('the update keeps existing values for fields it does not set', () => {
  const sql = hubImagesSql([{ id: 7, domain: 'spacex.com' }, { id: 9, country_code: 'co' }]);
  assert.match(sql, /\(7, 'spacex\.com', null\), \(9, null, 'co'\)/);
  assert.match(sql, /coalesce\(v\.domain, e\.domain\)/);
});

test('anything that is not a clean id, domain or code is refused before it reaches SQL', () => {
  assert.throws(() => hubImagesSql([{ id: 1, domain: "x.com'; drop table profiles; --" }]), /bad domain/);
  assert.throws(() => hubImagesSql([{ id: 1, country_code: 'MEX' }]), /bad country code/);
  assert.throws(() => hubImagesSql([{ id: 1.5, domain: 'a.com' }]), /bad hub id/);
  assert.throws(() => hubImagesSql([]), /nothing to update/);
});
