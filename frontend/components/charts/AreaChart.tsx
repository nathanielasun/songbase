'use client';

import {
  AreaChart as RechartsAreaChart,
  Area,
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

export interface AreaChartDataItem {
  name: string;
  [key: string]: string | number | null;
}

interface AreaConfig {
  dataKey: string;
  name?: string;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}

interface AreaChartProps {
  data: AreaChartDataItem[];
  areas: AreaConfig[];
  title?: string;
  subtitle?: string;
  height?: number;
  stacked?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  smooth?: boolean;
  xAxisKey?: string;
  yAxisDomain?: [number | 'auto', number | 'auto'];
  referenceLines?: { y: number; label?: string; color?: string }[];
  valueFormatter?: (value: number | string, name: string) => string;
  labelFormatter?: (label: string | number) => string;
  gradients?: boolean;
  loading?: boolean;
  className?: string;
}

export default function AreaChart({
  data,
  areas,
  title,
  subtitle,
  height = 300,
  stacked = false,
  showGrid = true,
  showLegend = false,
  smooth = true,
  xAxisKey = 'name',
  yAxisDomain,
  referenceLines = [],
  valueFormatter,
  labelFormatter,
  gradients = true,
  loading = false,
  className = '',
}: AreaChartProps) {
  const isEmpty = !data || data.length === 0;

  const getGradientId = (index: number) => `areaGradient-${index}`;

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
      <RechartsAreaChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        {/* Gradient definitions */}
        {gradients && (
          <defs>
            {areas.map((area, index) => {
              const color = area.color || getSeriesColor(index);
              return (
                <linearGradient
                  key={getGradientId(index)}
                  id={getGradientId(index)}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              );
            })}
          </defs>
        )}

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

        {showLegend && areas.length > 1 && (
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

        {areas.map((area, index) => {
          const color = area.color || getSeriesColor(index);
          return (
            <Area
              key={area.dataKey}
              type={smooth ? 'monotone' : 'linear'}
              dataKey={area.dataKey}
              name={area.name || area.dataKey}
              stroke={color}
              strokeWidth={area.strokeWidth || 2}
              fill={gradients ? `url(#${getGradientId(index)})` : color}
              fillOpacity={gradients ? 1 : (area.fillOpacity ?? 0.3)}
              stackId={stacked ? 'stack' : undefined}
              connectNulls
            />
          );
        })}
      </RechartsAreaChart>
    </ChartContainer>
  );
}

// Simple single-area chart
interface SimpleAreaChartProps {
  data: { name: string; value: number }[];
  title?: string;
  subtitle?: string;
  height?: number;
  color?: string;
  showGrid?: boolean;
  smooth?: boolean;
  valueFormatter?: (value: number | string, name: string) => string;
  loading?: boolean;
  className?: string;
}

export function SimpleAreaChart({
  data,
  title,
  subtitle,
  height = 300,
  color = CHART_COLORS.primary,
  showGrid = true,
  smooth = true,
  valueFormatter,
  loading = false,
  className = '',
}: SimpleAreaChartProps) {
  return (
    <AreaChart
      data={data}
      areas={[{ dataKey: 'value', color }]}
      title={title}
      subtitle={subtitle}
      height={height}
      showGrid={showGrid}
      smooth={smooth}
      valueFormatter={valueFormatter}
      loading={loading}
      className={className}
    />
  );
}

// Stacked area chart for composition over time
interface StackedAreaChartProps {
  data: AreaChartDataItem[];
  dataKeys: string[];
  title?: string;
  subtitle?: string;
  height?: number;
  colors?: string[];
  showGrid?: boolean;
  showLegend?: boolean;
  valueFormatter?: (value: number | string, name: string) => string;
  labelFormatter?: (label: string | number) => string;
  loading?: boolean;
  className?: string;
}

export function StackedAreaChart({
  data,
  dataKeys,
  title,
  subtitle,
  height = 300,
  colors,
  showGrid = true,
  showLegend = true,
  valueFormatter,
  labelFormatter,
  loading = false,
  className = '',
}: StackedAreaChartProps) {
  const areas: AreaConfig[] = dataKeys.map((key, index) => ({
    dataKey: key,
    color: colors?.[index],
  }));

  return (
    <AreaChart
      data={data}
      areas={areas}
      title={title}
      subtitle={subtitle}
      height={height}
      stacked
      showGrid={showGrid}
      showLegend={showLegend}
      valueFormatter={valueFormatter}
      labelFormatter={labelFormatter}
      loading={loading}
      className={className}
    />
  );
}

// Sparkline - minimal area chart for inline display
interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({
  data,
  color = CHART_COLORS.primary,
  width = 100,
  height = 30,
  className = '',
}: SparklineProps) {
  const chartData = data.map((value, index) => ({ name: index.toString(), value }));

  return (
    <div className={className} style={{ width, height }}>
      <RechartsAreaChart
        data={chartData}
        margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
        width={width}
        height={height}
      >
        <defs>
          <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill="url(#sparklineGradient)"
        />
      </RechartsAreaChart>
    </div>
  );
}
