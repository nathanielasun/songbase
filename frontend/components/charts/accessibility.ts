/**
 * Accessibility Utilities for Charts
 *
 * Provides color-blind friendly palettes, ARIA utilities,
 * and screen reader helpers for chart components.
 */

// Color-blind friendly palette (distinguishable for most types of color blindness)
// Based on Paul Tol's color schemes and IBM Design Color Blind Safe palette
export const COLOR_BLIND_SAFE = {
  // Main palette - optimized for deuteranopia, protanopia, and tritanopia
  series: [
    '#648FFF', // Blue
    '#DC267F', // Magenta
    '#FFB000', // Gold
    '#FE6100', // Orange
    '#785EF0', // Purple
    '#22A699', // Teal
    '#F94144', // Red (distinct from orange)
    '#90BE6D', // Green (distinct from blue)
  ],

  // Categorical colors with high contrast
  categorical: {
    blue: '#648FFF',
    magenta: '#DC267F',
    gold: '#FFB000',
    orange: '#FE6100',
    purple: '#785EF0',
    teal: '#22A699',
  },

  // Sequential scales (single hue progressions)
  sequential: {
    blue: ['#EBF3FF', '#B8D4FF', '#648FFF', '#3D6FD9', '#1E4FB3'],
    purple: ['#F3EDFF', '#D4C4FF', '#785EF0', '#5A3ED9', '#3C1EB3'],
    warm: ['#FFF3E0', '#FFD699', '#FFB000', '#E69500', '#CC7A00'],
  },

  // Diverging scale (for positive/negative data)
  diverging: ['#648FFF', '#A0C4FF', '#FFFFFF', '#FFCFA0', '#FE6100'],

  // Status colors (accessible)
  status: {
    success: '#22A699',
    warning: '#FFB000',
    error: '#DC267F',
    info: '#648FFF',
  },
};

// Pattern definitions for charts (supplement color with patterns)
export const CHART_PATTERNS = [
  { id: 'solid', name: 'Solid', pattern: null },
  { id: 'diagonal', name: 'Diagonal Lines', pattern: 'M0,0 L10,10 M-2,8 L2,12 M8,-2 L12,2' },
  { id: 'dots', name: 'Dots', pattern: 'circle' },
  { id: 'horizontal', name: 'Horizontal Lines', pattern: 'M0,5 L10,5' },
  { id: 'vertical', name: 'Vertical Lines', pattern: 'M5,0 L5,10' },
  { id: 'crosshatch', name: 'Crosshatch', pattern: 'M0,0 L10,10 M10,0 L0,10' },
  { id: 'zigzag', name: 'Zigzag', pattern: 'M0,5 L2.5,0 L5,5 L7.5,0 L10,5' },
  { id: 'waves', name: 'Waves', pattern: 'M0,5 Q2.5,0 5,5 T10,5' },
];

/**
 * Generate SVG pattern definitions for a chart
 */
export function generatePatternDefs(colors: string[]): string {
  return colors
    .map((color, index) => {
      const pattern = CHART_PATTERNS[index % CHART_PATTERNS.length];
      if (!pattern.pattern) return '';

      if (pattern.pattern === 'circle') {
        return `
          <pattern id="pattern-${index}" patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill="${color}" />
            <circle cx="5" cy="5" r="2" fill="rgba(255,255,255,0.3)" />
          </pattern>
        `;
      }

      return `
        <pattern id="pattern-${index}" patternUnits="userSpaceOnUse" width="10" height="10">
          <rect width="10" height="10" fill="${color}" />
          <path d="${pattern.pattern}" stroke="rgba(255,255,255,0.3)" stroke-width="1" fill="none" />
        </pattern>
      `;
    })
    .join('');
}

// ARIA role mappings for chart types
export const CHART_ROLES = {
  bar: 'graphics-document',
  line: 'graphics-document',
  pie: 'graphics-document',
  area: 'graphics-document',
  scatter: 'graphics-document',
  radar: 'graphics-document',
  heatmap: 'grid',
} as const;

/**
 * Generate accessible label for a chart
 */
export function getChartAriaLabel(
  chartType: keyof typeof CHART_ROLES,
  title: string,
  dataDescription?: string
): string {
  const typeDescriptions: Record<keyof typeof CHART_ROLES, string> = {
    bar: 'bar chart',
    line: 'line chart',
    pie: 'pie chart',
    area: 'area chart',
    scatter: 'scatter plot',
    radar: 'radar chart',
    heatmap: 'heatmap',
  };

  const baseLabel = `${title} ${typeDescriptions[chartType]}`;
  return dataDescription ? `${baseLabel}. ${dataDescription}` : baseLabel;
}

/**
 * Generate data summary for screen readers
 */
export function generateDataSummary(
  data: Array<{ name: string; value: number }>,
  valueLabel: string = 'value'
): string {
  if (!data || data.length === 0) {
    return 'No data available.';
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const maxItem = data.find((d) => d.value === max);
  const minItem = data.find((d) => d.value === min);

  return `Contains ${data.length} items. Total ${valueLabel}: ${total.toLocaleString()}. ` +
    `Highest: ${maxItem?.name} with ${max.toLocaleString()}. ` +
    `Lowest: ${minItem?.name} with ${min.toLocaleString()}.`;
}

/**
 * Generate time series summary for screen readers
 */
export function generateTimeSeriesSummary(
  data: Array<{ date: string; value: number }>,
  valueLabel: string = 'value'
): string {
  if (!data || data.length === 0) {
    return 'No data available.';
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const trend = values[values.length - 1] > values[0] ? 'increasing' : 'decreasing';

  return `Time series with ${data.length} data points. ` +
    `${valueLabel} ranges from ${min.toLocaleString()} to ${max.toLocaleString()}, ` +
    `averaging ${avg.toFixed(1).toLocaleString()}. Overall trend is ${trend}.`;
}

/**
 * Keyboard navigation helpers
 */
export const KEYBOARD_KEYS = {
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  HOME: 'Home',
  END: 'End',
  TAB: 'Tab',
} as const;

/**
 * Create keyboard navigation handler for data points
 */
export function createKeyboardNavHandler(
  dataLength: number,
  currentIndex: number,
  setCurrentIndex: (index: number) => void,
  onSelect?: (index: number) => void
) {
  return (event: React.KeyboardEvent) => {
    switch (event.key) {
      case KEYBOARD_KEYS.ARROW_RIGHT:
      case KEYBOARD_KEYS.ARROW_DOWN:
        event.preventDefault();
        setCurrentIndex((currentIndex + 1) % dataLength);
        break;
      case KEYBOARD_KEYS.ARROW_LEFT:
      case KEYBOARD_KEYS.ARROW_UP:
        event.preventDefault();
        setCurrentIndex((currentIndex - 1 + dataLength) % dataLength);
        break;
      case KEYBOARD_KEYS.HOME:
        event.preventDefault();
        setCurrentIndex(0);
        break;
      case KEYBOARD_KEYS.END:
        event.preventDefault();
        setCurrentIndex(dataLength - 1);
        break;
      case KEYBOARD_KEYS.ENTER:
      case KEYBOARD_KEYS.SPACE:
        event.preventDefault();
        onSelect?.(currentIndex);
        break;
    }
  };
}

/**
 * Hook-friendly keyboard navigation state manager
 */
export interface KeyboardNavState {
  currentIndex: number;
  focusedElement: HTMLElement | null;
}

/**
 * Focus trap utilities for modals and dialogs
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'a[href]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll(focusableSelectors));
}

export function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== KEYBOARD_KEYS.TAB) return;

  const focusableElements = getFocusableElements(container);
  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

/**
 * Announce message to screen readers
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement is read
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Screen reader only CSS class (should be added to global styles)
 */
export const SR_ONLY_STYLES = `
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.sr-only-focusable:focus,
.sr-only-focusable:active {
  position: static;
  width: auto;
  height: auto;
  margin: 0;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
`;

/**
 * Get contrasting text color for a background
 */
export function getContrastingTextColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');

  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Check if two colors have sufficient contrast ratio (WCAG AA = 4.5:1)
 */
export function hasAdequateContrast(
  color1: string,
  color2: string,
  minRatio: number = 4.5
): boolean {
  const getLuminance = (hex: string): number => {
    const rgb = hex.replace('#', '').match(/.{2}/g)!;
    const [r, g, b] = rgb.map((c) => {
      const val = parseInt(c, 16) / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  return ratio >= minRatio;
}

/**
 * Get accessible color from palette ensuring minimum contrast
 */
export function getAccessibleColor(
  preferredColor: string,
  backgroundColor: string = '#111827'
): string {
  if (hasAdequateContrast(preferredColor, backgroundColor)) {
    return preferredColor;
  }

  // Fall back to color-blind safe colors
  for (const color of COLOR_BLIND_SAFE.series) {
    if (hasAdequateContrast(color, backgroundColor)) {
      return color;
    }
  }

  // Ultimate fallback
  return '#ffffff';
}
