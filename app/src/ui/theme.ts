// LinkedIn's neutral surfaces and blue, with a SHPE-style navy and orange for the brand mark.
export const colors = {
  background: '#F4F2EE',
  surface: '#FFFFFF',
  border: '#E0DFDC',
  text: '#1D2226',
  muted: '#5E6670',
  primary: '#0A66C2',
  primaryPressed: '#004182',
  navy: '#0B2D5B',
  orange: '#F58025',
  error: '#B3261E',
};

// One color per hub kind in the graph, checked as a set for color-blind separation (dataviz validator, all pairs).
// Kinds also differ by shape and every hub is labeled, so color is never the only cue.
export const hubColors = {
  school: '#2A78D6',
  company: '#EB6834',
  major: '#1BAF7A',
  country: '#B0306A',
} as const;
