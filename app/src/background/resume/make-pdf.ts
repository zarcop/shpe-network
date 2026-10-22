// Test helper: writes a minimal real PDF with text at exact positions (Helvetica, Latin-1), so tests run the
// same pdf.js path as the app on layouts we control: a LinkedIn export, one- and two-column resumes.

export type PdfText = { x: number; y: number; size: number; text: string };

export function makePdf(pages: PdfText[][], width = 612, height = 792): Uint8Array<ArrayBuffer> {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body); // the new length is the 1-based object number

  const catalog = add('');
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageRefs: number[] = [];
  for (const texts of pages) {
    const stream = texts
      .map((t) => `BT /F1 ${t.size} Tf ${t.x} ${t.y} Td (${escape(t.text)}) Tj ET`)
      .join('\n');
    const contents = add(`<< /Length ${latin1(stream).length} >>\nstream\n${stream}\nendstream`);
    pageRefs.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${width} ${height}] ` +
          `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(latin1(out).length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = latin1(out).length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1(out);
}

function escape(text: string): string {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

// WinAnsi is Latin-1 plus a few typographic characters resumes use.
const WIN_ANSI: Record<string, number> = { '•': 0x95, '–': 0x96, '—': 0x97, '’': 0x92, '“': 0x93, '”': 0x94 };

function latin1(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text, (ch) => {
    const code = WIN_ANSI[ch] ?? ch.charCodeAt(0);
    if (code > 255) throw new Error(`not in WinAnsi: ${ch}`);
    return code;
  });
}
