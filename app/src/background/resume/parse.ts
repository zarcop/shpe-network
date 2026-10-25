import { fold } from '../../lib/fold.ts';
import { emptyHubs, type HubKind, type Hubs } from '../hubs.ts';

import type { Line } from './pdf-lines';

// Reads schools, companies and majors out of resume or LinkedIn PDF text with fixed rules: the same file
// always gives the same answer, it runs on the phone, and nothing is sent anywhere. It only suggests:
// people review the result on the background screen. Roots (the country hub) are never read from a resume.

export type KnownHub = { kind: HubKind; name: string; aliases: string[] };

type Section = 'education' | 'experience' | 'other' | 'none';

const HEADINGS: Record<string, Section> = {};
const heading = (section: Section, names: string[]) => names.forEach((n) => (HEADINGS[n] = section));
heading('education', ['education', 'academic background', 'academics', 'education and certifications', 'education & certifications']);
heading('experience', [
  'experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history',
  'internships', 'internship experience', 'relevant experience', 'research experience', 'engineering experience',
  'industry experience', 'technical experience',
]);
heading('other', [
  'summary', 'about', 'about me', 'profile', 'objective', 'contact', 'skills', 'technical skills', 'top skills',
  'projects', 'technical projects', 'leadership', 'leadership experience', 'activities', 'involvement',
  'campus involvement', 'extracurricular activities', 'organizations', 'awards', 'honors', 'honors & awards',
  'honors and awards', 'certifications', 'licenses & certifications', 'publications', 'volunteer',
  'volunteer experience', 'languages', 'interests', 'coursework', 'relevant coursework', 'references',
  'additional information', 'professional development', 'patents',
]);

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}/\\d{4}|(?:spring|summer|fall|winter)\\s+\\d{4}|\\d{4})`;
const DATE_RANGE = new RegExp(`${DATE}\\s*(?:-|–|—|to)\\s*(?:present|current|now|${DATE})`, 'i');
const DURATION = /^\(?\d+ (?:years?|months?|yrs?|mos?)(?: \d+ (?:months?|mos?))?\)?$/i;
const SCHOOL_WORD = /\b(?:university|college|institute|universidad|polytechnic|politécnico|tecnológico|school of)\b/i;
const TITLE_WORD =
  /\b(?:intern|internship|co-?op|engineer|engineering intern|developer|analyst|manager|assistant|researcher|associate|coordinator|specialist|technician|consultant|scientist|designer|lead|director|president|officer|fellow|student|representative|ambassador|tutor|mentor|volunteer)\b/i;
const LOCATION = /^(?:remote|hybrid|[A-Z][A-Za-z.' ]+,\s*(?:[A-Z]{2}|[A-Z][A-Za-z ]+)(?:,\s*[A-Z][A-Za-z ]+)?)$/;
const SEPARATORS = /\s*(?:\||·|•|–|—|\s-\s|,|\(|\)|;)\s*/;

export function parseResume(lines: Line[], known: KnownHub[]): Hubs {
  const sections = splitSections(lines);
  const hasSections = sections.some((s) => s.section === 'education' || s.section === 'experience');
  const inSection = (want: Section) =>
    sections.filter((s) => s.section === want || (!hasSections && s.section === 'none')).flatMap((s) => s.lines);

  const education = inSection('education');
  const experience = inSection('experience');
  const linkedIn = isLinkedInExport(lines);
  const hubs = emptyHubs();

  const add = (kind: HubKind, names: string[]) => {
    for (const name of names) {
      const clean = tidy(name);
      if (clean && !hubs[kind].some((n) => n.toLowerCase() === clean.toLowerCase())) hubs[kind].push(clean);
    }
  };

  // Known hubs first: they come back with their official names.
  add('school', matchKnown(education, known, 'school'));
  add('major', matchKnown(education, known, 'major'));
  add('company', matchKnown(experience, known, 'company'));
  const fromKnown = { school: [...hubs.school], major: [...hubs.major], company: [...hubs.company] };

  // Then rules for names that aren't hubs yet. A rule's "Lockheed Martin Space" or "University of Florida
  // College of Engineering" is the same hub as a known name it contains, so the known name wins.
  const addNew = (kind: 'school' | 'major' | 'company', names: string[]) =>
    add(kind, names.filter((name) => !fromKnown[kind].some((k) => containsWords(name, k))));
  addNew('school', education.flatMap((l) => schoolsIn(l.text)));
  addNew('major', education.flatMap((l) => majorsIn(l.text)));
  addNew('company', linkedIn ? linkedInCompanies(experience) : resumeCompanies(experience));

  return hubs;
}

function splitSections(lines: Line[]): { section: Section; lines: Line[] }[] {
  const out: { section: Section; lines: Line[] }[] = [{ section: 'none', lines: [] }];
  for (const line of lines) {
    const key = line.text.toLowerCase().replace(/[:\s]+$/, '').replace(/\s+/g, ' ');
    const section = HEADINGS[key];
    if (section) out.push({ section, lines: [] });
    else out.at(-1)!.lines.push(line);
  }
  return out;
}

function isLinkedInExport(lines: Line[]): boolean {
  const text = lines.map((l) => l.text).join('\n');
  return /linkedin\.com\/in\//i.test(text) && /^Page \d+ of \d+$/m.test(text) && lines.some((l) => l.text === 'Experience');
}

// ───────────── Known hubs ─────────────

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Only entry headers count: a bullet like "• Built test tools for NASA teams" mentions a partner, not an employer.
const isHeaderLine = (l: Line) => !/^[•▪◦●*-]/.test(l.text) && l.text.length <= 90;
const isShort = (t: string) => t.length <= 4 && !t.includes(' ');

function matchKnown(lines: Line[], known: KnownHub[], kind: HubKind): string[] {
  const text = lines
    .filter(isHeaderLine)
    .map((l) => l.text)
    .join('\n');
  return known
    .filter((hub) => hub.kind === kind)
    .filter((hub) => {
      const long = [hub.name, ...hub.aliases].filter((t) => !isShort(t));
      // Short names match as written ("NASA", "Meta"); short aliases ("uf", "ti", "me") only as standalone capitals.
      const short = [...(isShort(hub.name) ? [hub.name] : []), ...hub.aliases.filter(isShort).map((a) => a.toUpperCase())];
      return (
        long.some((t) => containsWords(text, t)) ||
        short.some((t) => new RegExp(`(?<![\\w&])${escapeRe(t)}(?![\\w&])`).test(text))
      );
    })
    .map((hub) => hub.name);
}

// ───────────── Rules ─────────────

const DEGREE =
  /\b(?:bachelor(?:'s|’s)?|master(?:'s|’s)?|doctor(?:ate)?|associate(?:'s|’s)?|b\.\s?s\.?|b\.\s?a\.?|b\.\s?e\.?|m\.\s?s\.?|ph\.?\s?d\.?|bsc|msc|meng|bs|ba|be|ms|ma|phd|as)(?=\s|,|-|–|:|\.|$)/i;
const DEGREE_FILLER =
  /^(?:\s|[-–—,:.]|\bof (?:applied )?(?:science|arts|engineering)\b|\bdegree\b|\bin\b|\bb\.?\s?s\.?c?\b|\bbsc\b|\bbs\b|\bba\b|\bbe\b|\bms\b|\bmsc\b|\bmeng\b|\bphd\b|\bb\.?\s?a\.?\b|\bm\.?\s?s\.?\b)+/i;

// "B.S. Mechanical Engineering, University of Florida, Gainesville, FL": the school is the part with a school word.
function schoolsIn(text: string): string[] {
  return text
    .split(SEPARATORS)
    .filter((part) => SCHOOL_WORD.test(part) && !DEGREE.test(part) && /^[A-Z]/.test(part) && part.length <= 80)
    .slice(0, 1);
}

function majorsIn(text: string): string[] {
  const majors: string[] = [];
  const declared = text.match(/\bmajor(?:ing)?\s*(?:in|:)\s*([A-Z][A-Za-z&/ ]{2,60})/);
  if (declared) majors.push(declared[1]);
  const degree = text.match(DEGREE);
  if (degree) {
    const rest = text.slice(degree.index! + degree[0].length).replace(DEGREE_FILLER, '');
    const field = rest.split(/\s*(?:,|·|•|\(|\||;|–|—|\s-\s|\bminor\b|\bconcentration\b|\d)/i)[0];
    if (/^[A-Z][A-Za-z&/ ]{2,60}$/.test(field) && !SCHOOL_WORD.test(field)) majors.push(field);
  }
  return majors;
}

// LinkedIn lists each job as: company (larger type), [total time at the company], title, dates, [location].
function linkedInCompanies(lines: Line[]): string[] {
  const companies: string[] = [];
  lines.forEach((line, i) => {
    if (!DATE_RANGE.test(line.text) || i < 2) return;
    const title = lines[i - 1];
    let candidate = lines[i - 2];
    if (DURATION.test(candidate.text) && i >= 3) candidate = lines[i - 3];
    // A later role at the same company has a description or location above its title, in small type.
    if (candidate.size > line.size && candidate.size >= title.size && !DATE_RANGE.test(candidate.text)) {
      companies.push(candidate.text);
    }
  });
  return companies;
}

// Free-form resumes: the employer sits on the same row as the dates, or on the row just above.
function resumeCompanies(lines: Line[]): string[] {
  const companies: string[] = [];
  lines.forEach((line, i) => {
    if (!DATE_RANGE.test(line.text)) return;
    const sameRow = lines.filter((l) => l.row === line.row);
    const above = lines.slice(0, i).findLast((l) => l.row !== line.row);
    const rowAbove = above ? lines.filter((l) => l.row === above.row) : [];
    for (const candidate of [...sameRow, ...rowAbove]) {
      const part = candidate.text
        .replace(DATE_RANGE, ' ')
        .split(SEPARATORS)
        .map((p) => p.replace(/^(?:at|@)\s+/i, '').trim())
        .find((p) => looksLikeEmployer(p));
      if (part) {
        companies.push(part);
        return;
      }
    }
  });
  return companies;
}

function looksLikeEmployer(part: string): boolean {
  return (
    /^[A-Z0-9]/.test(part) &&
    part.length >= 2 &&
    part.length <= 60 &&
    !TITLE_WORD.test(part) &&
    !LOCATION.test(part) &&
    !new RegExp(`^${DATE}$`, 'i').test(part) &&
    !/^(?:present|current)$/i.test(part)
  );
}

// ───────────── Cleanup ─────────────

function tidy(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:–—-]+|[\s,.;:–—-]+$/g, '')
    .trim();
}

function containsWords(text: string, words: string): boolean {
  return new RegExp(`(?<![\\w])${escapeRe(fold(words))}(?![\\w])`).test(fold(text));
}
