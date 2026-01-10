'use client';

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import ChartContainer from './ChartContainer';
import { RechartsLegend } from './ChartLegend';
import { CHART_COLORS, getSeriesColor } from './colors';

export interface PieChartDataItem {
  name: string;
  value: number;
  color?: string;
  [key: string]: string | number | undefined;
}

interface PieChartProps {
  data: PieChartDataItem[];
  title?: string;
  subtitle?: string;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLabels?: boolean;
  showLegend?: boolean;
  showPercentage?: boolean;
  colors?: string[];
  valueFormatter?: (value: number | string, name: string) => string;
  onClick?: (data: PieChartDataItem, index: number) => void;
  loading?: boolean;
  className?: string;
}

export default function PieChart({
  data,
  title,
  subtitle,
  height = 300,
  innerRadius = 0,
  outerRadius = 80,
  showLabels = false,
  showLegend = true,
  showPercentage = false,
  colors,
  valueFormatter,
  onClick,
  loading = false,
  className = '',
}: PieChartProps) {
  const isEmpty = !data || data.length === 0;
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const getColor = (index: number, item: PieChartDataItem) => {
    if (item.color) return item.color;
    if (colors && colors[index]) return colors[index];
    return getSeriesColor(index);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const entry = payload[0];
    const percentage = total > 0 ? ((entry.value as number) / total * 100).toFixed(1) : 0;

    return (
      <div
        className="rounded-lg px-3 py-2 shadow-lg border text-sm"
        style={{
          backgroundColor: CHART_COLORS.tooltip.bg,
          borderColor: CHART_COLORS.tooltip.border,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.payload?.fill || CHART_COLORS.primary }}
          />
          <span className="text-gray-300">{entry.name}</span>
        </div>
        <div className="mt-1 text-white font-medium">
          {valueFormatter ? valueFormatter(entry.value, entry.name) : entry.value}
          {showPercentage && <span className="text-gray-400 ml-1">({percentage}%)</span>}
        </div>
      </div>
    );
  };

  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } = props;
    if (percent < 0.05) return null;

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill={CHART_COLORS.text.secondary}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={11}
      >
        {name} ({(percent * 100).toFixed(0)}%)
      </text>
    );
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
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          dataKey="value"
          nameKey="name"
          onClick={(pieData, index) => {
            if (onClick) {
              onClick(pieData as PieChartDataItem, index);
            }
          }}
          label={showLabels ? renderCustomLabel : false}
          labelLine={showLabels}
          cursor={onClick ? 'pointer' : undefined}
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={getColor(index, entry)}
              stroke={CHART_COLORS.cardBg}
              strokeWidth={2}
            />
          ))}
        </Pie>

        <Tooltip content={<CustomTooltip />} />

        {showLegend && (
          <Legend content={<RechartsLegend />} />
        )}
      </RechartsPieChart>
    </ChartContainer>
  );
}

// Donut chart variant
interface DonutChartProps extends Omit<PieChartProps, 'innerRadius'> {
  thickness?: number;
}

export function DonutChart({
  thickness = 30,
  outerRadius = 80,
  ...props
}: DonutChartProps) {
  return (
    <PieChart
      {...props}
      innerRadius={outerRadius - thickness}
      outerRadius={outerRadius}
    />
  );
}

// Half donut / gauge chart
interface GaugeChartProps {
  value: number;
  max?: number;
  title?: string;
  subtitle?: string;
  height?: number;
  color?: string;
  label?: string;
  loading?: boolean;
  className?: string;
}

export function GaugeChart({
  value,
  max = 100,
  title,
  subtitle,
  height = 200,
  color = CHART_COLORS.primary,
  label,
  loading = false,
  className = '',
}: GaugeChartProps) {
  const percentage = Math.min(value / max, 1);
  const gaugeData = [
    { name: 'value', value: value },
    { name: 'remaining', value: max - value },
  ];

  return (
    <ChartContainer
      title={title}
      subtitle={subtitle}
      height={height}
      loading={loading}
      className={className}
    >
      <RechartsPieChart>
        <Pie
          data={gaugeData}
          cx="50%"
          cy="70%"
          startAngle={180}
          endAngle={0}
          innerRadius={60}
          outerRadius={80}
          dataKey="value"
          stroke="none"
        >
          <Cell fill={color} />
          <Cell fill={CHART_COLORS.grid} />
        </Pie>
        <text
          x="50%"
          y="60%"
          textAnchor="middle"
          fill={CHART_COLORS.text.primary}
          fontSize={24}
          fontWeight="bold"
        >
          {Math.round(percentage * 100)}%
        </text>
        {label && (
          <text
            x="50%"
            y="75%"
            textAnchor="middle"
            fill={CHART_COLORS.text.secondary}
            fontSize={12}
          >
            {label}
          </text>
        )}
      </RechartsPieChart>
    </ChartContainer>
  );
}
