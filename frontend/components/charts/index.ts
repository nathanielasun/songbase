// Songbase Charts Library
// Reusable chart components built on Recharts with consistent dark theme styling

// Colors and theming
export {
  CHART_COLORS,
  getSeriesColor,
  createGradient,
  KEY_COLORS,
  MOOD_COLORS,
  GENRE_COLORS,
} from './colors';

// Base components
export { default as ChartContainer } from './ChartContainer';
export { default as ChartTooltip, SongTooltip, AudioFeatureTooltip } from './ChartTooltip';
export type { TooltipPayloadItem } from './ChartTooltip';
export {
  default as ChartLegend,
  RechartsLegend,
  InlineLegend,
  ColorScaleLegend,
} from './ChartLegend';
export type { LegendItem } from './ChartLegend';

// Bar charts
export { default as BarChart, HorizontalBarChart, SimpleBarChart } from './BarChart';
export type { BarChartDataItem } from './BarChart';

// Line charts
export { default as LineChart, SimpleLineChart, ComparisonLineChart } from './LineChart';
export type { LineChartDataItem } from './LineChart';

// Pie and donut charts
export { default as PieChart, DonutChart, GaugeChart } from './PieChart';
export type { PieChartDataItem } from './PieChart';

// Area charts
export { default as AreaChart, SimpleAreaChart, StackedAreaChart, Sparkline } from './AreaChart';
export type { AreaChartDataItem } from './AreaChart';

// Radar charts
export { default as RadarChart, AudioFeaturesRadar, SimpleRadarChart } from './RadarChart';
export type { RadarChartDataItem } from './RadarChart';

// Scatter charts
export {
  default as ScatterChart,
  BpmEnergyScatter,
  DanceabilityEnergyScatter,
} from './ScatterChart';
export type { ScatterDataPoint, ScatterSeries } from './ScatterChart';

// Accessibility utilities
export {
  COLOR_BLIND_SAFE,
  CHART_PATTERNS,
  generatePatternDefs,
  CHART_ROLES,
  getChartAriaLabel,
  generateDataSummary,
  generateTimeSeriesSummary,
  KEYBOARD_KEYS,
  createKeyboardNavHandler,
  getFocusableElements,
  trapFocus,
  announceToScreenReader,
  SR_ONLY_STYLES,
  getContrastingTextColor,
  hasAdequateContrast,
  getAccessibleColor,
} from './accessibility';

// Chart animation styles
export { CHART_ANIMATION_STYLES } from './ChartContainer';

// Optimized/memoized chart components for performance
export {
  OptimizedBarChart,
  OptimizedLineChart,
  OptimizedAreaChart,
  OptimizedPieChart,
  OptimizedRadarChart,
  OptimizedScatterChart,
  useStableData,
  useDebouncedData,
} from './optimized';
