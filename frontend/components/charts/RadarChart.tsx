'use client';

import {
  RadarChart as RechartsRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
} from 'recharts';
import ChartContainer from './ChartContainer';
import ChartTooltip from './ChartTooltip';
import { RechartsLegend } from './ChartLegend';
import { CHART_COLORS, getSeriesColor } from './colors';

export interface RadarChartDataItem {
  subject: string;
  fullMark?: number;
  [key: string]: string | number | undefined;
}

interface RadarConfig {
  dataKey: string;
  name?: string;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}

interface RadarChartProps {
  data: RadarChartDataItem[];
  radars: RadarConfig[];
  title?: string;
  subtitle?: string;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  maxValue?: number;
  valueFormatter?: (value: number | string, name: string) => string;
  loading?: boolean;
  className?: string;
}

export default function RadarChart({
  data,
  radars,
  title,
  subtitle,
  height = 300,
  showLegend = false,
  showGrid = true,
  showLabels = true,
  maxValue,
  valueFormatter,
  loading = false,
  className = '',
}: RadarChartProps) {
  const isEmpty = !data || data.length === 0;

  // Calculate domain if not provided
  const calculatedMax = maxValue ?? Math.max(
    ...data.flatMap(item =>
      radars.map(r => (typeof item[r.dataKey] === 'number' ? item[r.dataKey] as number : 0))
    )
  );

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
      <RechartsRadarChart
        data={data}
        margin={{ top: 20, right: 30, left: 30, bottom: 20 }}
      >
        {showGrid && (
          <PolarGrid
            stroke={CHART_COLORS.grid}
            gridType="polygon"
          />
        )}

        {showLabels && (
          <PolarAngleAxis
            dataKey="subject"
            tick={{
              fill: CHART_COLORS.text.secondary,
              fontSize: 11,
            }}
          />
        )}

        <PolarRadiusAxis
          angle={90}
          domain={[0, calculatedMax]}
          tick={{
            fill: CHART_COLORS.text.muted,
            fontSize: 10,
          }}
          axisLine={false}
        />

        <Tooltip
          content={(props) => (
            <ChartTooltip
              active={props.active}
              payload={props.payload as any}
              label={props.label}
              valueFormatter={valueFormatter}
              showLabel={false}
            />
          )}
        />

        {showLegend && radars.length > 1 && (
          <Legend content={<RechartsLegend />} />
        )}

        {radars.map((radar, index) => {
          const color = radar.color || getSeriesColor(index);
          return (
            <Radar
              key={radar.dataKey}
              name={radar.name || radar.dataKey}
              dataKey={radar.dataKey}
              stroke={color}
              strokeWidth={radar.strokeWidth || 2}
              fill={color}
              fillOpacity={radar.fillOpacity ?? 0.25}
            />
          );
        })}
      </RechartsRadarChart>
    </ChartContainer>
  );
}

// Audio features radar chart - specialized for audio feature visualization
interface AudioFeaturesRadarProps {
  features: {
    energy?: number;
    danceability?: number;
    acousticness?: number;
    instrumentalness?: number;
    speechiness?: number;
    valence?: number;
  };
  comparisonFeatures?: {
    energy?: number;
    danceability?: number;
    acousticness?: number;
    instrumentalness?: number;
    speechiness?: number;
    valence?: number;
  };
  title?: string;
  subtitle?: string;
  height?: number;
  mainLabel?: string;
  comparisonLabel?: string;
  mainColor?: string;
  comparisonColor?: string;
  loading?: boolean;
  className?: string;
}

export function AudioFeaturesRadar({
  features,
  comparisonFeatures,
  title = 'Audio Features',
  subtitle,
  height = 300,
  mainLabel = 'Your Library',
  comparisonLabel = 'Average',
  mainColor = CHART_COLORS.primary,
  comparisonColor = CHART_COLORS.tertiary,
  loading = false,
  className = '',
}: AudioFeaturesRadarProps) {
  const featureLabels: Record<string, string> = {
    energy: 'Energy',
    danceability: 'Danceability',
    acousticness: 'Acousticness',
    instrumentalness: 'Instrumental',
    speechiness: 'Speechiness',
    valence: 'Valence',
  };

  const data: RadarChartDataItem[] = Object.keys(featureLabels).map(key => ({
    subject: featureLabels[key],
    main: (features[key as keyof typeof features] ?? 0) * 100,
    comparison: comparisonFeatures
      ? (comparisonFeatures[key as keyof typeof comparisonFeatures] ?? 0) * 100
      : undefined,
    fullMark: 100,
  }));

  const radars: RadarConfig[] = [
    { dataKey: 'main', name: mainLabel, color: mainColor, fillOpacity: 0.3 },
  ];

  if (comparisonFeatures) {
    radars.push({
      dataKey: 'comparison',
      name: comparisonLabel,
      color: comparisonColor,
      fillOpacity: 0.15,
    });
  }

  return (
    <RadarChart
      data={data}
      radars={radars}
      title={title}
      subtitle={subtitle}
      height={height}
      showLegend={!!comparisonFeatures}
      maxValue={100}
      valueFormatter={(value) => `${Math.round(value as number)}%`}
      loading={loading}
      className={className}
    />
  );
}

// Simple single-radar chart
interface SimpleRadarChartProps {
  data: { subject: string; value: number }[];
  title?: string;
  subtitle?: string;
  height?: number;
  color?: string;
  maxValue?: number;
  valueFormatter?: (value: number | string, name: string) => string;
  loading?: boolean;
  className?: string;
}

export function SimpleRadarChart({
  data,
  title,
  subtitle,
  height = 300,
  color = CHART_COLORS.primary,
  maxValue,
  valueFormatter,
  loading = false,
  className = '',
}: SimpleRadarChartProps) {
  const chartData: RadarChartDataItem[] = data.map(item => ({
    subject: item.subject,
    value: item.value,
  }));

  return (
    <RadarChart
      data={chartData}
      radars={[{ dataKey: 'value', color }]}
      title={title}
      subtitle={subtitle}
      height={height}
      maxValue={maxValue}
      valueFormatter={valueFormatter}
      loading={loading}
      className={className}
    />
  );
}
