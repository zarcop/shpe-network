// Lowercase without accents, for matching what people type ("México", "Sofía") against names. Keeps the length of
// precomposed text, so positions found in the folded string line up with the original.
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
