/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makePdf, type PdfText } from './make-pdf.ts';
import { parseResume, type KnownHub } from './parse.ts';
import { checkPdf, MAX_PDF_BYTES, readPdfLines } from './pdf-lines.ts';

// A slice of the seeded hubs, with the aliases resumes actually use.
const known: KnownHub[] = [
  { kind: 'school', name: 'University of Florida', aliases: ['uf'] },
  { kind: 'school', name: 'University of Puerto Rico at Mayagüez', aliases: ['uprm', 'upr mayaguez'] },
  { kind: 'company', name: 'Lockheed Martin', aliases: ['lmco'] },
  { kind: 'company', name: 'Texas Instruments', aliases: ['ti'] },
  { kind: 'company', name: 'NASA', aliases: ['jpl'] },
  { kind: 'company', name: 'Meta', aliases: ['facebook'] },
  { kind: 'major', name: 'Mechanical Engineering', aliases: ['me'] },
  { kind: 'major', name: 'Computer Engineering', aliases: ['ce'] },
  { kind: 'country', name: 'Colombia', aliases: [] },
];

async function parse(pages: PdfText[][]) {
  return parseResume(await readPdfLines(makePdf(pages)), known);
}

// Lines stacked top-down from y, like a template would place them.
const stack = (x: number, y: number, rows: [size: number, text: string][]): PdfText[] =>
  rows.map(([size, text], i) => ({ x, y: y - i * 16, size, text }));

// LinkedIn's "Save to PDF": a sidebar (contact, skills, languages) and the main column with experience and
// education. Each job is company (12pt), title (11.5pt), dates (10.5pt), location; a company with several roles
// shows its total time under the name.
const linkedInExport: PdfText[][] = [
  [
    ...stack(30, 750, [
      [13, 'Contact'],
      [10.5, 'www.linkedin.com/in/ana-perez'],
      [13, 'Top Skills'],
      [10.5, 'SolidWorks'],
      [10.5, 'MATLAB'],
      [13, 'Languages'],
      [10.5, 'Spanish (Native or Bilingual)'],
    ]),
    ...stack(220, 750, [
      [26, 'Ana Pérez'],
      [12, 'Mechanical Engineering student at UPRM'],
      [10.5, 'Orlando, Florida, United States'],
      [15.75, 'Summary'],
      [10.5, 'I want to work on rockets with NASA and Meta someday.'],
      [15.75, 'Experience'],
      [12, 'Lockheed Martin'],
      [11.5, 'Mechanical Engineering Intern'],
      [10.5, 'May 2023 - August 2023 (4 months)'],
      [10.5, 'Orlando, Florida, United States'],
      [12, 'Blue Origin'],
      [10.5, '1 year 3 months'],
      [11.5, 'Propulsion Engineering Intern'],
      [10.5, 'January 2024 - Present (10 months)'],
      [10.5, 'Kent, Washington, United States'],
      [11.5, 'Manufacturing Engineering Intern'],
      [10.5, 'September 2023 - December 2023 (4 months)'],
      [15.75, 'Education'],
      [12, 'University of Puerto Rico at Mayagüez'],
      [10.5, 'Bachelor of Science - BS, Mechanical Engineering · (2020 - 2025)'],
      [12, 'Miami Dade College'],
      [10.5, 'Associate of Arts - AA · (2018 - 2020)'],
      [10.5, 'Page 1 of 1'],
    ]),
  ],
];

test('a LinkedIn export gives its schools, companies and majors, using official names for known hubs', async () => {
  assert.deepEqual(await parse(linkedInExport), {
    school: ['University of Puerto Rico at Mayagüez', 'Miami Dade College'],
    company: ['Lockheed Martin', 'Blue Origin'],
    major: ['Mechanical Engineering'],
    country: [],
  });
});

test('names in the summary, sidebar or headline are not read as employers or schools', async () => {
  const hubs = await parse(linkedInExport);
  assert.ok(!hubs.company.includes('NASA'));
  assert.ok(!hubs.company.includes('Meta'));
  assert.ok(!hubs.company.some((c) => /Engineering Intern/.test(c)), 'job titles are not companies');
});

// A common one-column template: right-aligned dates and locations, a bullet that mentions a partner, and a
// club under Leadership.
const oneColumnResume: PdfText[][] = [
  [
    { x: 250, y: 760, size: 18, text: 'ANA PÉREZ' },
    { x: 200, y: 742, size: 10, text: 'ana@ufl.edu | linkedin.com/in/ana-perez' },
    { x: 50, y: 715, size: 12, text: 'EDUCATION' },
    { x: 50, y: 699, size: 10.5, text: 'University of Florida, Gainesville, FL' },
    { x: 480, y: 699, size: 10.5, text: 'May 2026' },
    { x: 50, y: 684, size: 10.5, text: 'Bachelor of Science in Computer Engineering; Minor in Mathematics' },
    { x: 50, y: 655, size: 12, text: 'EXPERIENCE' },
    { x: 50, y: 639, size: 10.5, text: 'Texas Instruments' },
    { x: 480, y: 639, size: 10.5, text: 'Dallas, TX' },
    { x: 50, y: 624, size: 10.5, text: 'Software Engineering Intern' },
    { x: 440, y: 624, size: 10.5, text: 'May 2025 – Aug 2025' },
    { x: 60, y: 609, size: 10.5, text: '• Built a test harness used by NASA mission teams' },
    { x: 50, y: 590, size: 10.5, text: 'Research Assistant | Smith Robotics Lab | Jan 2024 - Present' },
    { x: 50, y: 560, size: 12, text: 'LEADERSHIP' },
    { x: 50, y: 544, size: 10.5, text: 'SHPE UF Chapter, Treasurer' },
    { x: 440, y: 544, size: 10.5, text: 'Aug 2023 – Present' },
  ],
];

test('a one-column resume gives employers from entry headers, not bullets or clubs', async () => {
  assert.deepEqual(await parse(oneColumnResume), {
    school: ['University of Florida'],
    company: ['Texas Instruments', 'Smith Robotics Lab'],
    major: ['Computer Engineering'],
    country: [],
  });
});

test('a degree line with a new major and school gives both', async () => {
  const hubs = await parse([
    stack(50, 700, [
      [12, 'Education'],
      [10.5, 'B.S. in Industrial Engineering, Georgia Institute of Technology, Atlanta, GA'],
    ]),
  ]);
  assert.deepEqual(hubs.major, ['Industrial Engineering']);
  assert.deepEqual(hubs.school, ['Georgia Institute of Technology']);
});

test('a file without section headings is still matched against known hubs', async () => {
  const hubs = await parse([stack(50, 700, [[11, 'Ana Pérez'], [11, 'Lockheed Martin, 2023'], [11, 'UF Mechanical Engineering']])]);
  assert.deepEqual(hubs.company, ['Lockheed Martin']);
  assert.deepEqual(hubs.school, ['University of Florida']);
  assert.deepEqual(hubs.major, ['Mechanical Engineering']);
});

test('short aliases only count as standalone capitals', async () => {
  const hubs = await parse([
    stack(50, 700, [
      [12, 'Education'],
      [10.5, 'Coursework at a time when we met'],
      [12, 'Experience'],
      [10.5, 'Tim at the time'],
    ]),
  ]);
  assert.deepEqual(hubs, { school: [], company: [], major: [], country: [] });
});

test('roots are never read from a resume', async () => {
  const hubs = await parse([stack(50, 700, [[12, 'Education'], [10.5, 'Universidad de los Andes, Bogotá, Colombia']])]);
  assert.deepEqual(hubs.country, []);
  assert.deepEqual(hubs.school, ['Universidad de los Andes']);
});

test('the same file always gives the same answer', async () => {
  assert.deepEqual(await parse(linkedInExport), await parse(linkedInExport));
});

test('only real PDFs up to 5 MB are read', () => {
  const pdf = makePdf([[{ x: 50, y: 700, size: 12, text: 'Hi' }]]);
  assert.equal(checkPdf(pdf), null);
  assert.equal(checkPdf(new Uint8Array()), 'empty');
  assert.equal(checkPdf(new TextEncoder().encode('PK\u0003\u0004 a Word file')), 'not-pdf');
  const big = new Uint8Array(MAX_PDF_BYTES + 1);
  big.set(pdf.subarray(0, 5));
  assert.equal(checkPdf(big), 'too-large');
});
