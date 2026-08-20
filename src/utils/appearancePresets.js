/**
 * Appearance settings for the Classical identity.
 *
 * The old build shipped seven colour presets on top of a green palette. The
 * rework has one ground — paper in daylight, ink on near-black in lamplight —
 * and the only colour choice left is the rule colour, which is used as a stroke
 * and never as a fill.
 */

export const APPEARANCE_STORAGE_KEY = 'hsc_appearance';

export const APPEARANCE_DEFAULTS = {
  mode: 'system',
  preset: 'classical',
  accent: 'gold',
  density: 'book',
  layout: 'standard',
  showRecommendations: true,
};

/**
 * One ground, kept as a map so the stored-settings shape and getAppearanceVars
 * contract stay the same as before.
 */
export const APPEARANCE_PRESETS = {
  classical: {
    label: 'Classical',
    description: 'Paper in daylight, ink on near-black in lamplight.',
    swatches: ['#f3f2f2', '#201f1d', '#b68235'],
    vars: {},
    darkVars: {},
  },
};

export const MODE_OPTIONS = [
  { value: 'system', label: 'System', description: 'Follow your device' },
  { value: 'light', label: 'Daylight', description: 'The paper ground' },
  { value: 'dark', label: 'Lamplight', description: 'Ink on near-black' },
];

/**
 * Rule colours. Each carries a daylight and a lamplight cut so the stroke keeps
 * its weight against both grounds.
 */
export const ACCENT_OPTIONS = {
  gold: {
    label: 'Gold',
    description: 'The house rule colour.',
    accent: '#b68235',
    hover: '#7d5411',
    active: '#5a3b0a',
    tint: '#fff3e4',
    positive: '#a06f24',
    dark: { accent: '#c9993f', hover: '#dbb164', active: '#ebcd97', tint: '#2e2517', positive: '#dbb164' },
  },
  oxblood: {
    label: 'Oxblood',
    description: 'A darker stroke for heavier pages.',
    accent: '#8f3d3d',
    hover: '#6b2b2b',
    active: '#4d1f1f',
    tint: '#fbeaea',
    positive: '#7d3434',
    dark: { accent: '#c06a6a', hover: '#d38f8f', active: '#e3b3b3', tint: '#2c1c1c', positive: '#d38f8f' },
  },
  ink: {
    label: 'Ink',
    description: 'No colour at all — the rule matches the type.',
    accent: '#3c4a52',
    hover: '#2b363c',
    active: '#1e262b',
    tint: '#e9eef1',
    positive: '#33414a',
    dark: { accent: '#8fa4b0', hover: '#adbec7', active: '#c9d5db', tint: '#1c2429', positive: '#adbec7' },
  },
  sage: {
    label: 'Sage',
    description: 'A quieter green, closer to the old portal.',
    accent: '#4f6f5c',
    hover: '#3a5344',
    active: '#2a3d31',
    tint: '#e9f0eb',
    positive: '#456351',
    dark: { accent: '#8ab09a', hover: '#a8c4b4', active: '#c6d8cd', tint: '#1b2620', positive: '#a8c4b4' },
  },
};

/** Density moves the index rows and gutters. It never touches the type sizes. */
export const DENSITY_OPTIONS = [
  { value: 'compact', label: 'Compact', description: 'Tighter rows, more of the index on screen.' },
  { value: 'book', label: 'Book', description: 'The measured default.' },
  { value: 'airy', label: 'Airy', description: 'Wider margins and looser rows.' },
];

export const LAYOUT_OPTIONS = [
  { value: 'standard', label: 'Standard', description: 'Keeps the complete study workspace.' },
  { value: 'focus', label: 'Focus', description: 'Hides extras so papers and search stay front and centre.' },
];

export const APPEARANCE_VARIABLE_KEYS = [
  '--color-accent',
  '--color-accent-100',
  '--color-accent-700',
  '--color-accent-800',
  '--accent-brand',
  '--brand-experiment',
  '--brand-experiment-hover',
  '--brand-experiment-active',
  '--status-positive',
  '--status-positive-background',
];

/** Resolves a rule colour to the cut that suits the current ground. */
export function getAccentVars(accentKey, theme) {
  const option = ACCENT_OPTIONS[accentKey] || ACCENT_OPTIONS[APPEARANCE_DEFAULTS.accent];
  const cut = theme === 'dark' ? option.dark : option;

  return {
    '--color-accent': cut.accent,
    '--color-accent-100': cut.tint,
    '--color-accent-700': cut.hover,
    '--color-accent-800': cut.active,
    '--accent-brand': cut.accent,
    '--brand-experiment': cut.accent,
    '--brand-experiment-hover': cut.hover,
    '--brand-experiment-active': cut.active,
    '--status-positive': cut.positive,
    '--status-positive-background': cut.tint,
  };
}

export function getAppearanceVars(presetKey, theme) {
  const preset = APPEARANCE_PRESETS[presetKey] || APPEARANCE_PRESETS[APPEARANCE_DEFAULTS.preset];
  return (theme === 'dark' ? preset.darkVars : preset.vars) || {};
}

export function loadAppearanceSettings() {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return { ...APPEARANCE_DEFAULTS };

    const parsed = JSON.parse(raw);
    const mode = ['system', 'light', 'dark'].includes(parsed?.mode) ? parsed.mode : APPEARANCE_DEFAULTS.mode;
    const preset = APPEARANCE_PRESETS[parsed?.preset] ? parsed.preset : APPEARANCE_DEFAULTS.preset;
    const accent = ACCENT_OPTIONS[parsed?.accent] ? parsed.accent : APPEARANCE_DEFAULTS.accent;
    const density = DENSITY_OPTIONS.some((option) => option.value === parsed?.density)
      ? parsed.density
      : APPEARANCE_DEFAULTS.density;
    const layout = LAYOUT_OPTIONS.some((option) => option.value === parsed?.layout)
      ? parsed.layout
      : APPEARANCE_DEFAULTS.layout;
    const showRecommendations = parsed?.showRecommendations !== false;

    return { mode, preset, accent, density, layout, showRecommendations };
  } catch (error) {
    return { ...APPEARANCE_DEFAULTS };
  }
}
