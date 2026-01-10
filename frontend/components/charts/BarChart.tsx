'use client';

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  LabelList,
} from 'recharts';
import ChartContainer from './ChartContainer';
import ChartTooltip from './ChartTooltip';
import { RechartsLegend } from './ChartLegend';
import { CHART_COLORS, getSeriesColor } from './colors';

export interface BarChartDataItem {
  name: string;
  [key: string]: string | number;
}

interface BarChartProps {
  data: BarChartDataItem[];
  dataKeys: string[];
  title?: string;
  subtitle?: string;
  height?: number;
  layout?: 'horizontal' | 'vertical';
  stacked?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  showLabels?: boolean;
  colors?: string[];
  valueFormatter?: (value: number | string, name: string) => string;
  labelFormatter?: (label: string | number) => string;
  onClick?: (data: BarChartDataItem, index: number) => void;
  loading?: boolean;
  className?: string;
}

export default function BarChart({
  data,
  dataKeys,
  title,
  subtitle,
  height = 300,
  layout = 'vertical',
  stacked = false,
  showGrid = true,
  showLegend = false,
  showLabels = false,
  colors,
  valueFormatter,
  labelFormatter,
  onClick,
  loading = false,
  className = '',
}: BarChartProps) {
  const isHorizontal = layout === 'horizontal';
  const isEmpty = !data || data.length === 0;

  const getColor = (index: number) => {
    if (colors && colors[index]) return colors[index];
    return getSeriesColor(index);
  };

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
      <RechartsBarChart
        data={data}
        layout={isHorizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_COLORS.grid}
            vertical={!isHorizontal}
            horizontal={isHorizontal}
          />
        )}

        {isHorizontal ? (
          <>
            <XAxis
              type="number"
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.text.secondary, fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.text.secondary, fontSize: 12 }}
              tickLine={false}
              width={80}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="name"
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.text.secondary, fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              stroke={CHART_COLORS.axis}
              tick={{ fill: CHART_COLORS.text.secondary, fontSize: 12 }}
              tickLine={false}
            />
          </>
        )}

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
          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
        />

        {showLegend && dataKeys.length > 1 && (
          <Legend content={<RechartsLegend />} />
        )}

        {dataKeys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            fill={getColor(index)}
            stackId={stacked ? 'stack' : undefined}
            radius={stacked ? 0 : [4, 4, 4, 4]}
            cursor={onClick ? 'pointer' : undefined}
            onClick={(barData, barIndex) => {
              if (onClick && barData) {
                onClick(barData as unknown as BarChartDataItem, barIndex);
              }
            }}
          >
            {showLabels && (
              <LabelList
                dataKey={key}
                position={isHorizontal ? 'right' : 'top'}
                fill={CHART_COLORS.text.secondary}
                fontSize={11}
              />
            )}
            {/* Apply different colors to individual bars when single dataKey */}
            {dataKeys.length === 1 && colors && colors.length > 1 && (
              data.map((_, i) => (
                <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />
              ))
            )}
          </Bar>
        ))}
      </RechartsBarChart>
    </ChartContainer>
  );
}

// Horizontal bar chart variant
interface HorizontalBarChartProps extends Omit<BarChartProps, 'layout'> {}

export function HorizontalBarChart(props: HorizontalBarChartProps) {
  return <BarChart {...props} layout="horizontal" />;
}

// Simple single-series bar chart
interface SimpleBarChartProps {
  data: { name: string; value: number }[];
  title?: string;
  subtitle?: string;
  height?: number;
  color?: string;
  horizontal?: boolean;
  showLabels?: boolean;
  valueFormatter?: (value: number | string, name: string) => string;
  onClick?: (data: { name: string; value: number }, index: number) => void;
  loading?: boolean;
  className?: string;
}

export function SimpleBarChart({
  data,
  title,
  subtitle,
  height = 300,
  color = CHART_COLORS.primary,
  horizontal = false,
  showLabels = false,
  valueFormatter,
  onClick,
  loading = false,
  className = '',
}: SimpleBarChartProps) {
  return (
    <BarChart
      data={data}
      dataKeys={['value']}
      title={title}
      subtitle={subtitle}
      height={height}
      layout={horizontal ? 'horizontal' : 'vertical'}
      showLabels={showLabels}
      colors={[color]}
      valueFormatter={valueFormatter}
      onClick={onClick as BarChartProps['onClick']}
      loading={loading}
      className={className}
    />
  );
}
