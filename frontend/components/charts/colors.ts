// Songbase Stats Color Palette
// Consistent theming for all chart components

export const CHART_COLORS = {
  // Primary brand colors
  primary: '#ec4899',      // Pink (brand color)
  secondary: '#8b5cf6',    // Purple
  tertiary: '#06b6d4',     // Cyan
  quaternary: '#f59e0b',   // Amber
  success: '#10b981',      // Emerald
  warning: '#f97316',      // Orange
  danger: '#ef4444',       // Red

  // Extended palette for multi-series charts
  series: [
    '#ec4899', // Pink
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#f59e0b', // Amber
    '#10b981', // Emerald
    '#f97316', // Orange
    '#3b82f6', // Blue
    '#84cc16', // Lime
    '#f43f5e', // Rose
    '#14b8a6', // Teal
  ],

  // Gradients for specific features
  energy: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],  // Blue → Green → Amber → Red
  mood: ['#8b5cf6', '#ec4899', '#f97316', '#06b6d4'],    // Purple → Pink → Orange → Cyan
  tempo: ['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'],   // Cyan → Blue → Purple → Pink

  // Background colors
  cardBg: 'rgba(17, 24, 39, 0.7)',  // gray-900/70
  chartBg: 'rgba(31, 41, 55, 0.5)', // gray-800/50

  // Text colors
  text: {
    primary: '#ffffff',
    secondary: '#9ca3af',   // gray-400
    muted: '#6b7280',       // gray-500
  },

  // Grid and axis colors
  grid: '#374151',          // gray-700
  axis: '#4b5563',          // gray-600

  // Tooltip colors
  tooltip: {
    bg: 'rgba(17, 24, 39, 0.95)',  // gray-900/95
    border: '#374151',              // gray-700
    text: '#ffffff',
  },
} as const;

// Helper function to get a color from the series by index
export function getSeriesColor(index: number): string {
  return CHART_COLORS.series[index % CHART_COLORS.series.length];
}

// Helper function to create a gradient array based on a base color
export function createGradient(baseColor: string, steps: number = 5): string[] {
  const gradients: string[] = [];
  for (let i = 0; i < steps; i++) {
    const opacity = 1 - (i * 0.15);
    gradients.push(`${baseColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`);
  }
  return gradients;
}

// Musical key colors for the Camelot wheel visualization
export const KEY_COLORS: Record<string, string> = {
  // Major keys (outer ring - brighter)
  'C': '#ec4899',
  'G': '#f43f5e',
  'D': '#f97316',
  'A': '#f59e0b',
  'E': '#84cc16',
  'B': '#10b981',
  'F#': '#14b8a6',
  'Gb': '#14b8a6',
  'Db': '#06b6d4',
  'C#': '#06b6d4',
  'Ab': '#3b82f6',
  'G#': '#3b82f6',
  'Eb': '#6366f1',
  'D#': '#6366f1',
  'Bb': '#8b5cf6',
  'A#': '#8b5cf6',
  'F': '#a855f7',

  // Minor keys (inner ring - darker variants)
  'Am': '#be185d',
  'Em': '#be123c',
  'Bm': '#c2410c',
  'F#m': '#b45309',
  'Gbm': '#b45309',
  'C#m': '#4d7c0f',
  'Dbm': '#4d7c0f',
  'G#m': '#047857',
  'Abm': '#047857',
  'D#m': '#0e7490',
  'Ebm': '#0e7490',
  'A#m': '#1d4ed8',
  'Bbm': '#1d4ed8',
  'Fm': '#4338ca',
  'Cm': '#6d28d9',
  'Gm': '#7c3aed',
  'Dm': '#7e22ce',
};

// Mood colors for mood-based visualizations
export const MOOD_COLORS: Record<string, string> = {
  'energetic': '#ef4444',
  'happy': '#f59e0b',
  'uplifting': '#10b981',
  'calm': '#06b6d4',
  'melancholic': '#3b82f6',
  'dark': '#6366f1',
  'aggressive': '#dc2626',
  'romantic': '#ec4899',
  'peaceful': '#14b8a6',
  'mysterious': '#8b5cf6',
};

// Genre colors for genre-based visualizations
export const GENRE_COLORS: Record<string, string> = {
  'pop': '#ec4899',
  'rock': '#ef4444',
  'hip-hop': '#f59e0b',
  'electronic': '#06b6d4',
  'jazz': '#8b5cf6',
  'classical': '#3b82f6',
  'r&b': '#f97316',
  'country': '#84cc16',
  'metal': '#374151',
  'indie': '#10b981',
  'folk': '#a78bfa',
  'blues': '#1d4ed8',
  'soul': '#f43f5e',
  'punk': '#dc2626',
  'reggae': '#16a34a',
  'latin': '#fbbf24',
  'other': '#6b7280',
};
