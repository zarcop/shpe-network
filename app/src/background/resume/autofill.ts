import type { DocumentPickerAsset } from 'expo-document-picker';
import { Platform } from 'react-native';

import { closestHub, loadKnownHubs } from '../data';
import { HUB_KINDS, type Hubs } from '../hubs';

import { parseResume } from './parse';
import { checkPdf, readPdfLines } from './pdf-lines';

export type AutofillResult = { ok: true; hubs: Hubs } | { ok: false; error: string };

const PROBLEMS = {
  empty: 'That file is empty. Pick your resume or LinkedIn PDF.',
  'too-large': 'That file is larger than 5 MB. Export a smaller PDF and try again.',
  'not-pdf': 'Pick a PDF. On LinkedIn: open your profile, tap More, then Save to PDF.',
};

// Reads a resume or LinkedIn PDF on the device and suggests a background. Nothing is uploaded or saved.
export async function autofillFromPdf(pdf: DocumentPickerAsset): Promise<AutofillResult> {
  let bytes: Uint8Array;
  try {
    const buffer = Platform.OS === 'web' && pdf.file ? await pdf.file.arrayBuffer() : await (await fetch(pdf.uri)).arrayBuffer();
    bytes = new Uint8Array(buffer);
  } catch {
    return { ok: false, error: 'Couldn’t open that file. Try picking it again.' };
  }
  const problem = checkPdf(bytes);
  if (problem) return { ok: false, error: PROBLEMS[problem] };

  try {
    const [lines, known] = await Promise.all([readPdfLines(bytes), loadKnownHubs()]);
    if (lines.length === 0) {
      return { ok: false, error: 'This PDF has no text we can read (it may be a scan). Fill in your background below.' };
    }
    const found = parseResume(lines, known);
    const knownNames = new Set(known.map((h) => `${h.kind}:${h.name}`));
    const hubs = { ...found };
    for (const kind of HUB_KINDS) {
      hubs[kind] = await Promise.all(
        found[kind].map((name) => (knownNames.has(`${kind}:${name}`) ? name : closestHub(kind, name))),
      );
    }
    return { ok: true, hubs };
  } catch {
    return { ok: false, error: 'We couldn’t read this file. Fill in your background below.' };
  }
}
