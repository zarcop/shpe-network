import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// Turns a PDF into lines of text in reading order, on the device: the file never leaves the phone.

export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export type Line = {
  text: string;
  size: number; // font size in points: headings and company names are usually larger than body text
  row: string; // segments printed on the same row share this, e.g. a company with its dates far right
};

export type PdfProblem = 'empty' | 'too-large' | 'not-pdf';

// Trust the bytes, not the file name.
export function checkPdf(bytes: Uint8Array): PdfProblem | null {
  if (bytes.byteLength === 0) return 'empty';
  if (bytes.byteLength > MAX_PDF_BYTES) return 'too-large';
  const marker = [...'%PDF-'].map((ch) => ch.charCodeAt(0));
  return marker.every((code, i) => bytes[i] === code) ? null : 'not-pdf';
}

type Segment = { text: string; x: number; right: number; y: number; size: number };

let workerReady: Promise<void> | null = null;

// pdf.js normally parses in a Web Worker loaded from a URL. Loading its worker module here instead runs it
// on the main thread, which works the same in the browser bundle and in Node tests; resumes are small.
function ensureWorker(): Promise<void> {
  workerReady ??= import('pdfjs-dist/legacy/build/pdf.worker.mjs').then((worker) => {
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  });
  return workerReady;
}

export async function readPdfLines(bytes: Uint8Array): Promise<Line[]> {
  await ensureWorker();
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  const loading = getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await loading.promise;
  try {
    const lines: Line[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const width = page.getViewport({ scale: 1 }).width;
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is TextItem => 'str' in item);
      lines.push(...pageLines(items, width, p));
    }
    return lines;
  } finally {
    await loading.destroy();
  }
}

function pageLines(items: TextItem[], pageWidth: number, page: number): Line[] {
  const segments = toSegments(items);
  const gutter = findColumnGutter(segments, pageWidth);
  const columns = gutter === null ? [segments] : [segments.filter((s) => s.x < gutter), segments.filter((s) => s.x >= gutter)];
  return columns.flatMap((column, c) =>
    [...column]
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((s) => ({ text: s.text, size: s.size, row: `${page}:${c}:${Math.round(s.y)}` })),
  );
}

// Groups text items into rows by baseline, then splits a row wherever there is a wide gap, so a sidebar
// and the main column (or a company and its right-aligned dates) stay separate segments.
function toSegments(items: TextItem[]): Segment[] {
  const glyphs = items
    .filter((item) => item.str.trim() !== '')
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      size: Math.round(Math.hypot(item.transform[2], item.transform[3]) * 10) / 10 || item.height,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: (typeof glyphs)[] = [];
  for (const g of glyphs) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - g.y) <= Math.max(2, g.size * 0.3)) row.push(g);
    else rows.push([g]);
  }

  const segments: Segment[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let current: Segment | null = null;
    for (const g of row) {
      const gap = current ? g.x - current.right : Infinity;
      if (current && gap <= Math.max(12, g.size * 1.5)) {
        const space = gap > g.size * 0.15 && !current.text.endsWith(' ') && !g.str.startsWith(' ') ? ' ' : '';
        current.text += space + g.str;
        current.right = g.x + g.width;
        current.size = Math.max(current.size, g.size);
      } else {
        current = { text: g.str, x: g.x, right: g.x + g.width, y: g.y, size: g.size };
        segments.push(current);
      }
    }
  }
  return segments
    .map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text !== '');
}

// A two-column layout (LinkedIn's sidebar, many resume templates) has a vertical strip that no text crosses,
// with text on both sides. Without one, the page reads top to bottom.
function findColumnGutter(segments: Segment[], pageWidth: number): number | null {
  for (let x = pageWidth * 0.2; x <= pageWidth * 0.5; x += 2) {
    const crosses = segments.some((s) => s.x < x && s.right > x);
    if (crosses) continue;
    const left = segments.filter((s) => s.right <= x).length;
    const right = segments.filter((s) => s.x >= x).length;
    if (left >= 5 && right >= 5) return x;
  }
  return null;
}
