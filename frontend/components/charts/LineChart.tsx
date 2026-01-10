'use client';

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import ChartContainer from './ChartContainer';
import ChartTooltip from './ChartTooltip';
import { RechartsLegend } from './ChartLegend';
import { CHART_COLORS, getSeriesColor } from './colors';

export interface LineChartDataItem {
  name: string;
  [key: string]: string | number | null;
}

interface LineConfig {
  dataKey: string;
  name?: string;
  color?: string;
  strokeWidth?: number;
  dashed?: boolean;
  dot?: boolean;
}

interface LineChartProps {
  data: LineChartDataItem[];
  lines: LineConfig[];
  title?: string;
  subtitle?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  showDots?: boolean;
  smooth?: boolean;
  xAxisKey?: string;
  yAxisDomain?: [number | 'auto', number | 'auto'];
  referenceLines?: { y: number; label?: string; color?: string }[];
  valueFormatter?: (value: number | string, name: string) => string;
  labelFormatter?: (label: string | number) => string;
  loading?: boolean;
  className?: string;
}

export default function LineChart({
  data,
  lines,
  title,
  subtitle,
  height = 300,
  showGrid = true,
  showLegend = false,
  showDots = true,
  smooth = true,
  xAxisKey = 'name',
  yAxisDomain,
  referenceLines = [],
  valueFormatter,
  labelFormatter,
  loading = false,
  className = '',
}: LineChartProps) {
  const isEmpty = !data || data.length === 0;

  return (
    <ChartContainer
      title={title}
      subtitle={subtitle}
      height={height}
      loading={loading}
      empty={isEmpty}
      emptyMessage="No data available"
      className={className}
    >
      <RechartsLineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_COLORS.grid}
            vertical={false}
          />
        )}

        <XAxis
          dataKey={xAxisKey}
          stroke={CHART_COLORS.axis}
          tick={{ fill: CHART_COLORS.text.secondary, fontSize: 12 }}
          tickLine={false}
        />

        <YAxis
          stroke={CHART_COLORS.axis}
          tick={{ fill: CHART_COLORS.text.secondary, fontSize: 12 }}
          tickLine={false}
          domain={yAxisDomain}
        />

        <Tooltip
          content={(props) => (
            <ChartTooltip
              active={props.active}
              payload={props.payload as any}
              label={props.label}
              valueFormatter={valueFormatter}
              labelFormatter={labelFormatter}
            />
          )}
        />

        {showLegend && lines.length > 1 && (
          <Legend content={<RechartsLegend />} />
        )}

        {referenceLines.map((ref, index) => (
          <ReferenceLine
            key={index}
            y={ref.y}
            stroke={ref.color || CHART_COLORS.text.muted}
            strokeDasharray="5 5"
            label={ref.label ? {
              value: ref.label,
              fill: CHART_COLORS.text.secondary,
              fontSize: 11,
            } : undefined}
          />
        ))}

        {lines.map((line, index) => (
          <Line
            key={line.dataKey}
            type={smooth ? 'monotone' : 'linear'}
            dataKey={line.dataKey}
            name={line.name || line.dataKey}
            stroke={line.color || getSeriesColor(index)}
            strokeWidth={line.strokeWidth || 2}
            strokeDasharray={line.dashed ? '5 5' : undefined}
            dot={line.dot ?? showDots ? {
              fill: line.color || getSeriesColor(index),
              strokeWidth: 0,
              r: 3,
            } : false}
            activeDot={{
              fill: line.color || getSeriesColor(index),
              strokeWidth: 2,
              stroke: CHART_COLORS.cardBg,
              r: 5,
            }}
            connectNulls
          />
        ))}
      </RechartsLineChart>
    </ChartContainer>
  );
}

// Simple single-line chart
interface SimpleLineChartProps {
  data: { name: string; value: number }[];
  title?: string;
  subtitle?: string;
  height?: number;
  color?: string;
  showDots?: boolean;
  smooth?: boolean;
  showGrid?: boolean;
  valueFormatter?: (value: number | string, name: string) => string;
  loading?: boolean;
  className?: string;
}

export function SimpleLineChart({
  data,
  title,
  subtitle,
  height = 300,
  color = CHART_COLORS.primary,
  showDots = true,
  smooth = true,
  showGrid = true,
  valueFormatter,
  loading = false,
  className = '',
}: SimpleLineChartProps) {
  return (
    <LineChart
      data={data}
      lines={[{ dataKey: 'value', color }]}
      title={title}
      subtitle={subtitle}
      height={height}
      showDots={showDots}
      smooth={smooth}
      showGrid={showGrid}
      valueFormatter={valueFormatter}
      loading={loading}
      className={className}
    />
  );
}

// Comparison line chart (current vs previous period)
interface ComparisonLineChartProps {
  data: { name: string; current: number; previous: number }[];
  title?: string;
  subtitle?: string;
  height?: number;
  currentLabel?: string;
  previousLabel?: string;
  currentColor?: string;
  previousColor?: string;
  valueFormatter?: (value: number | string, name: string) => string;
  loading?: boolean;
  className?: string;
}

export function ComparisonLineChart({
  data,
  title,
  subtitle,
  height = 300,
  currentLabel = 'Current',
  previousLabel = 'Previous',
  currentColor = CHART_COLORS.primary,
  previousColor = CHART_COLORS.text.muted,
  valueFormatter,
  loading = false,
  className = '',
}: ComparisonLineChartProps) {
  return (
    <LineChart
      data={data}
      lines={[
        { dataKey: 'current', name: currentLabel, color: currentColor },
        { dataKey: 'previous', name: previousLabel, color: previousColor, dashed: true },
      ]}
      title={title}
      subtitle={subtitle}
      height={height}
      showLegend
      valueFormatter={valueFormatter}
      loading={loading}
      className={className}
    />
  );
}
