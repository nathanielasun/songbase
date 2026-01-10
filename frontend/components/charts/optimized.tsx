'use client';

/**
 * Optimized Chart Components
 *
 * Memoized versions of chart components for better performance.
 * Use these when charts don't need to re-render on every parent update.
 */

import React, { memo, useMemo, useCallback } from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  AreaChart as RechartsAreaChart,
  Area,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  RadarChart as RechartsRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from './colors';
import CustomTooltip from './ChartTooltip';

// Type for chart data
interface DataPoint {
  [key: string]: string | number | null | undefined;
}

// Comparison function for memoization
function arePropsEqual<T extends Record<string, unknown>>(
  prevProps: T,
  nextProps: T
): boolean {
  // Compare data arrays by reference first (fastest)
  if (prevProps.data !== nextProps.data) {
    // If references differ, compare stringified versions
    if (JSON.stringify(prevProps.data) !== JSON.stringify(nextProps.data)) {
      return false;
    }
  }

  // Compare other props
  const keys = Object.keys(prevProps);
  for (const key of keys) {
    if (key === 'data') continue;
    if (prevProps[key] !== nextProps[key]) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Optimized Bar Chart
// ============================================================================

interface OptimizedBarChartProps {
  data: DataPoint[];
  xKey: string;
  yKey: string;
  height?: number;
  color?: string;
  horizontal?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  formatValue?: (value: number) => string;
  formatLabel?: (value: string) => string;
}

export const OptimizedBarChart = memo(function OptimizedBarChart({
  data,
  xKey,
  yKey,
  height = 300,
  color = CHART_COLORS.primary,
  horizontal = false,
  showGrid = true,
  showTooltip = true,
  formatValue,
  formatLabel,
}: OptimizedBarChartProps) {
  const memoizedData = useMemo(() => data, [data]);

  const tickFormatter = useCallback(
    (value: string) => formatLabel?.(value) ?? value,
    [formatLabel]
  );

  const valueFormatter = useCallback(
    (value: number) => formatValue?.(value) ?? String(value),
    [formatValue]
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={memoizedData}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_COLORS.grid}
            opacity={0.3}
          />
        )}
        {horizontal ? (
          <>
            <XAxis type="number" stroke={CHART_COLORS.text.primary} tickFormatter={valueFormatter} />
            <YAxis
              type="category"
              dataKey={xKey}
              stroke={CHART_COLORS.text.primary}
              tickFormatter={tickFormatter}
              width={100}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} stroke={CHART_COLORS.text.primary} tickFormatter={tickFormatter} />
            <YAxis stroke={CHART_COLORS.text.primary} tickFormatter={valueFormatter} />
          </>
        )}
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}, arePropsEqual);

// ============================================================================
// Optimized Line Chart
// ============================================================================

interface LineConfig {
  key: string;
  color?: string;
  name?: string;
}

interface OptimizedLineChartProps {
  data: DataPoint[];
  xKey: string;
  lines: LineConfig[];
  height?: number;
  showGrid?: boolean;
  showDots?: boolean;
  showTooltip?: boolean;
  formatValue?: (value: number) => string;
}

export const OptimizedLineChart = memo(function OptimizedLineChart({
  data,
  xKey,
  lines,
  height = 300,
  showGrid = true,
  showDots = true,
  showTooltip = true,
  formatValue,
}: OptimizedLineChartProps) {
  const memoizedData = useMemo(() => data, [data]);

  const colors = [
    CHART_COLORS.primary,
    CHART_COLORS.secondary,
    CHART_COLORS.tertiary,
    CHART_COLORS.quaternary,
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={memoizedData}
        margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_COLORS.grid}
            opacity={0.3}
          />
        )}
        <XAxis dataKey={xKey} stroke={CHART_COLORS.text.primary} />
        <YAxis stroke={CHART_COLORS.text.primary} tickFormatter={formatValue} />
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        <Legend />
        {lines.map((line, index) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            stroke={line.color || colors[index % colors.length]}
            name={line.name || line.key}
            strokeWidth={2}
            dot={showDots}
            activeDot={{ r: 6 }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}, arePropsEqual);

// ============================================================================
// Optimized Area Chart
// ============================================================================

interface AreaConfig {
  key: string;
  color?: string;
  name?: string;
}

interface OptimizedAreaChartProps {
  data: DataPoint[];
  xKey: string;
  areas: AreaConfig[];
  height?: number;
  stacked?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
}

export const OptimizedAreaChart = memo(function OptimizedAreaChart({
  data,
  xKey,
  areas,
  height = 300,
  stacked = false,
  showGrid = true,
  showTooltip = true,
}: OptimizedAreaChartProps) {
  const memoizedData = useMemo(() => data, [data]);

  const colors = [
    CHART_COLORS.primary,
    CHART_COLORS.secondary,
    CHART_COLORS.tertiary,
    CHART_COLORS.quaternary,
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart
        data={memoizedData}
        margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_COLORS.grid}
            opacity={0.3}
          />
        )}
        <XAxis dataKey={xKey} stroke={CHART_COLORS.text.primary} />
        <YAxis stroke={CHART_COLORS.text.primary} />
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        <Legend />
        {areas.map((area, index) => (
          <Area
            key={area.key}
            type="monotone"
            dataKey={area.key}
            stroke={area.color || colors[index % colors.length]}
            fill={area.color || colors[index % colors.length]}
            fillOpacity={0.3}
            name={area.name || area.key}
            stackId={stacked ? 'stack' : undefined}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}, arePropsEqual);

// ============================================================================
// Optimized Pie Chart
// ============================================================================

interface PieDataPoint {
  name: string;
  value: number;
  color?: string;
  [key: string]: string | number | undefined;
}

interface OptimizedPieChartProps {
  data: PieDataPoint[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLabels?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
}

export const OptimizedPieChart = memo(function OptimizedPieChart({
  data,
  height = 300,
  innerRadius = 60,
  outerRadius = 100,
  showLabels = false,
  showTooltip = true,
  showLegend = true,
}: OptimizedPieChartProps) {
  const memoizedData = useMemo(() => data, [data]);

  const colors = [
    CHART_COLORS.primary,
    CHART_COLORS.secondary,
    CHART_COLORS.tertiary,
    CHART_COLORS.quaternary,
    CHART_COLORS.success,
    CHART_COLORS.warning,
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={memoizedData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          label={showLabels}
          labelLine={showLabels}
        >
          {memoizedData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.color || colors[index % colors.length]}
            />
          ))}
        </Pie>
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        {showLegend && <Legend />}
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}, arePropsEqual);

// ============================================================================
// Optimized Radar Chart
// ============================================================================

interface RadarDataPoint {
  subject: string;
  value: number;
  fullMark?: number;
  [key: string]: string | number | undefined;
}

interface OptimizedRadarChartProps {
  data: RadarDataPoint[];
  height?: number;
  color?: string;
  fillOpacity?: number;
  showTooltip?: boolean;
}

export const OptimizedRadarChart = memo(function OptimizedRadarChart({
  data,
  height = 300,
  color = CHART_COLORS.primary,
  fillOpacity = 0.3,
  showTooltip = true,
}: OptimizedRadarChartProps) {
  const memoizedData = useMemo(() => data, [data]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadarChart data={memoizedData}>
        <PolarGrid stroke={CHART_COLORS.grid} />
        <PolarAngleAxis dataKey="subject" stroke={CHART_COLORS.text.primary} />
        <PolarRadiusAxis stroke={CHART_COLORS.text.primary} />
        <Radar
          name="Value"
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={fillOpacity}
        />
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}, arePropsEqual);

// ============================================================================
// Optimized Scatter Chart
// ============================================================================

interface ScatterDataPoint {
  x: number;
  y: number;
  z?: number;
  name?: string;
  color?: string;
  [key: string]: string | number | undefined;
}

interface OptimizedScatterChartProps {
  data: ScatterDataPoint[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  color?: string;
  showTooltip?: boolean;
}

export const OptimizedScatterChart = memo(function OptimizedScatterChart({
  data,
  height = 300,
  xLabel = 'X',
  yLabel = 'Y',
  color = CHART_COLORS.primary,
  showTooltip = true,
}: OptimizedScatterChartProps) {
  const memoizedData = useMemo(() => data, [data]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} opacity={0.3} />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          stroke={CHART_COLORS.text.primary}
          label={{ value: xLabel, position: 'bottom', fill: CHART_COLORS.text.primary }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          stroke={CHART_COLORS.text.primary}
          label={{ value: yLabel, angle: -90, position: 'left', fill: CHART_COLORS.text.primary }}
        />
        {showTooltip && <Tooltip content={<CustomTooltip />} />}
        <Scatter name="Data" data={memoizedData} fill={color}>
          {memoizedData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color || color} />
          ))}
        </Scatter>
      </RechartsScatterChart>
    </ResponsiveContainer>
  );
}, arePropsEqual);

// ============================================================================
// Data Comparison Hook
// ============================================================================

/**
 * Hook for comparing previous and current data to avoid unnecessary re-renders.
 * Returns stable data reference if data hasn't changed.
 */
export function useStableData<T>(data: T): T {
  const ref = React.useRef<T>(data);
  const prevRef = React.useRef<string>('');

  const currentString = JSON.stringify(data);
  if (currentString !== prevRef.current) {
    ref.current = data;
    prevRef.current = currentString;
  }

  return ref.current;
}

/**
 * Hook for debouncing chart data updates.
 * Prevents rapid re-renders during data streaming.
 */
export function useDebouncedData<T>(data: T, delay: number = 100): T {
  const [debouncedData, setDebouncedData] = React.useState(data);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedData(data);
    }, delay);

    return () => clearTimeout(timer);
  }, [data, delay]);

  return debouncedData;
}
