'use client';

import {
  ScatterChart as RechartsScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ZAxis,
  Cell,
  ReferenceLine,
} from 'recharts';
import ChartContainer from './ChartContainer';
import { CHART_COLORS, getSeriesColor } from './colors';

export interface ScatterDataPoint {
  x: number;
  y: number;
  z?: number; // Optional size dimension
  name?: string;
  color?: string;
  [key: string]: string | number | undefined;
}

export interface ScatterSeries {
  name: string;
  data: ScatterDataPoint[];
  color?: string;
}

interface ScatterChartProps {
  series: ScatterSeries[];
  title?: string;
  subtitle?: string;
  height?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  showGrid?: boolean;
  showLegend?: boolean;
  showSizeScale?: boolean;
  sizeRange?: [number, number];
  referenceLines?: {
    x?: number;
    y?: number;
    label?: string;
    color?: string;
  }[];
  onClick?: (point: ScatterDataPoint, seriesIndex: number) => void;
  loading?: boolean;
  className?: string;
}

export default function ScatterChart({
  series,
  title,
  subtitle,
  height = 300,
  xAxisLabel,
  yAxisLabel,
  xDomain,
  yDomain,
  showGrid = true,
  showLegend = false,
  showSizeScale = false,
  sizeRange = [30, 200],
  referenceLines = [],
  onClick,
  loading = false,
  className = '',
}: ScatterChartProps) {
  const isEmpty = series.every(s => !s.data || s.data.length === 0);

  const renderTooltip = ({ active, payload }: {
    active?: boolean;
    payload?: Array<{ payload: ScatterDataPoint; name: string }>;
  }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    const point = payload[0].payload;

    return (
      <div
        className="rounded-lg px-3 py-2 shadow-lg border text-sm"
        style={{
          backgroundColor: CHART_COLORS.tooltip.bg,
          borderColor: CHART_COLORS.tooltip.border,
        }}
      >
        {point.name && (
          <p className="font-medium text-white mb-1">{point.name}</p>
        )}
        <div className="space-y-0.5">
          <p className="text-xs">
            <span className="text-gray-400">{xAxisLabel || 'X'}:</span>{' '}
            <span className="text-white">{point.x.toFixed(1)}</span>
          </p>
          <p className="text-xs">
            <span className="text-gray-400">{yAxisLabel || 'Y'}:</span>{' '}
            <span className="text-white">{point.y.toFixed(1)}</span>
          </p>
          {point.z !== undefined && (
            <p className="text-xs">
              <span className="text-gray-400">Size:</span>{' '}
              <span className="text-white">{point.z}</span>
            </p>
          )}
        </div>
      </div>
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
      <RechartsScatterChart
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_COLORS.grid}
          />
        )}

        <XAxis
          type="number"
          dataKey="x"
          name={xAxisLabel}
          domain={xDomain || ['auto', 'auto']}
          stroke={CHART_COLORS.axis}
          tick={{ fill: CHART_COLORS.text.secondary, fontSize: 12 }}
          tickLine={false}
          label={xAxisLabel ? {
            value: xAxisLabel,
            position: 'bottom',
            fill: CHART_COLORS.text.secondary,
            fontSize: 12,
          } : undefined}
        />

        <YAxis
          type="number"
          dataKey="y"
          name={yAxisLabel}
          domain={yDomain || ['auto', 'auto']}
          stroke={CHART_COLORS.axis}
          tick={{ fill: CHART_COLORS.text.secondary, fontSize: 12 }}
          tickLine={false}
          label={yAxisLabel ? {
            value: yAxisLabel,
            angle: -90,
            position: 'left',
            fill: CHART_COLORS.text.secondary,
            fontSize: 12,
          } : undefined}
        />

        {showSizeScale && (
          <ZAxis
            type="number"
            dataKey="z"
            range={sizeRange}
          />
        )}

        <Tooltip content={renderTooltip as any} />

        {showLegend && series.length > 1 && (
          <Legend
            wrapperStyle={{ paddingTop: 20 }}
          />
        )}

        {referenceLines.map((ref, index) => (
          <ReferenceLine
            key={index}
            x={ref.x}
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

        {series.map((s, seriesIndex) => (
          <Scatter
            key={s.name}
            name={s.name}
            data={s.data}
            fill={s.color || getSeriesColor(seriesIndex)}
            cursor={onClick ? 'pointer' : undefined}
            onClick={(data) => {
              if (onClick && data) {
                onClick(data as ScatterDataPoint, seriesIndex);
              }
            }}
          >
            {s.data.map((point, pointIndex) => (
              <Cell
                key={`cell-${pointIndex}`}
                fill={point.color || s.color || getSeriesColor(seriesIndex)}
              />
            ))}
          </Scatter>
        ))}
      </RechartsScatterChart>
    </ChartContainer>
  );
}

// BPM vs Energy scatter - specialized for audio analysis
interface BpmEnergyScatterProps {
  data: Array<{
    bpm: number;
    energy: number;
    name?: string;
    artist?: string;
    playCount?: number;
    mood?: string;
  }>;
  title?: string;
  subtitle?: string;
  height?: number;
  colorByMood?: boolean;
  sizeByPlayCount?: boolean;
  onClick?: (point: ScatterDataPoint) => void;
  loading?: boolean;
  className?: string;
}

const MOOD_TO_COLOR: Record<string, string> = {
  energetic: '#ef4444',
  happy: '#f59e0b',
  calm: '#06b6d4',
  melancholic: '#3b82f6',
  dark: '#6366f1',
  aggressive: '#dc2626',
  romantic: '#ec4899',
  peaceful: '#14b8a6',
};

export function BpmEnergyScatter({
  data,
  title = 'BPM vs Energy',
  subtitle,
  height = 300,
  colorByMood = false,
  sizeByPlayCount = false,
  onClick,
  loading = false,
  className = '',
}: BpmEnergyScatterProps) {
  const scatterData: ScatterDataPoint[] = data.map(item => ({
    x: item.bpm,
    y: item.energy * 100, // Convert 0-1 to 0-100
    z: sizeByPlayCount ? Math.min(item.playCount || 1, 50) : undefined,
    name: item.name,
    artist: item.artist,
    color: colorByMood && item.mood
      ? MOOD_TO_COLOR[item.mood.toLowerCase()] || CHART_COLORS.primary
      : undefined,
  }));

  return (
    <ScatterChart
      series={[{ name: 'Songs', data: scatterData }]}
      title={title}
      subtitle={subtitle}
      height={height}
      xAxisLabel="BPM"
      yAxisLabel="Energy"
      xDomain={[60, 200]}
      yDomain={[0, 100]}
      showSizeScale={sizeByPlayCount}
      sizeRange={[20, 150]}
      referenceLines={[
        { y: 50, label: 'Medium Energy', color: CHART_COLORS.text.muted },
        { x: 120, label: '120 BPM', color: CHART_COLORS.text.muted },
      ]}
      onClick={onClick ? (point) => onClick(point) : undefined}
      loading={loading}
      className={className}
    />
  );
}

// Danceability vs Energy scatter
interface DanceabilityEnergyScatterProps {
  data: Array<{
    danceability: number;
    energy: number;
    name?: string;
    artist?: string;
    playCount?: number;
  }>;
  title?: string;
  subtitle?: string;
  height?: number;
  onClick?: (point: ScatterDataPoint) => void;
  loading?: boolean;
  className?: string;
}

export function DanceabilityEnergyScatter({
  data,
  title = 'Danceability vs Energy',
  subtitle,
  height = 300,
  onClick,
  loading = false,
  className = '',
}: DanceabilityEnergyScatterProps) {
  const scatterData: ScatterDataPoint[] = data.map(item => ({
    x: item.danceability * 100,
    y: item.energy * 100,
    name: item.name,
    artist: item.artist,
    z: item.playCount,
  }));

  return (
    <ScatterChart
      series={[{ name: 'Songs', data: scatterData, color: CHART_COLORS.secondary }]}
      title={title}
      subtitle={subtitle}
      height={height}
      xAxisLabel="Danceability"
      yAxisLabel="Energy"
      xDomain={[0, 100]}
      yDomain={[0, 100]}
      onClick={onClick ? (point) => onClick(point) : undefined}
      loading={loading}
      className={className}
    />
  );
}
