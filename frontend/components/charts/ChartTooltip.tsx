'use client';

import { CHART_COLORS } from './colors';

export interface TooltipPayloadItem {
  name: string;
  value: number | string;
  color?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
  valueFormatter?: (value: number | string, name: string) => string;
  showLabel?: boolean;
}

export default function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  showLabel = true,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formattedLabel = labelFormatter && label !== undefined
    ? labelFormatter(label)
    : label;

  return (
    <div
      className="rounded-lg px-3 py-2 shadow-lg border text-sm"
      style={{
        backgroundColor: CHART_COLORS.tooltip.bg,
        borderColor: CHART_COLORS.tooltip.border,
      }}
    >
      {showLabel && formattedLabel && (
        <p className="text-gray-400 mb-1.5 text-xs font-medium">
          {formattedLabel}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const formattedValue = valueFormatter
            ? valueFormatter(entry.value, entry.name)
            : entry.value;

          return (
            <div key={index} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color || CHART_COLORS.primary }}
              />
              <span className="text-gray-300">{entry.name}:</span>
              <span className="font-medium text-white">{formattedValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Specialized tooltip for song/artist data
interface SongTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

export function SongTooltip({ active, payload }: SongTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload as {
    title?: string;
    artist?: string;
    album?: string;
    playCount?: number;
    duration?: string;
  } | undefined;

  if (!data) return null;

  return (
    <div
      className="rounded-lg px-3 py-2 shadow-lg border text-sm max-w-xs"
      style={{
        backgroundColor: CHART_COLORS.tooltip.bg,
        borderColor: CHART_COLORS.tooltip.border,
      }}
    >
      {data.title && (
        <p className="font-medium text-white truncate">{data.title}</p>
      )}
      {data.artist && (
        <p className="text-gray-400 text-xs truncate">{data.artist}</p>
      )}
      {data.album && (
        <p className="text-gray-500 text-xs truncate">{data.album}</p>
      )}
      <div className="mt-1.5 pt-1.5 border-t border-gray-700 space-y-0.5">
        {data.playCount !== undefined && (
          <p className="text-xs">
            <span className="text-gray-400">Plays:</span>{' '}
            <span className="text-pink-400 font-medium">{data.playCount}</span>
          </p>
        )}
        {data.duration && (
          <p className="text-xs">
            <span className="text-gray-400">Duration:</span>{' '}
            <span className="text-white">{data.duration}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// Tooltip for audio features
interface AudioFeatureTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

export function AudioFeatureTooltip({ active, payload }: AudioFeatureTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload as {
    feature?: string;
    value?: number;
    count?: number;
    percentage?: number;
  } | undefined;

  if (!data) return null;

  return (
    <div
      className="rounded-lg px-3 py-2 shadow-lg border text-sm"
      style={{
        backgroundColor: CHART_COLORS.tooltip.bg,
        borderColor: CHART_COLORS.tooltip.border,
      }}
    >
      {data.feature && (
        <p className="font-medium text-white mb-1">{data.feature}</p>
      )}
      <div className="space-y-0.5">
        {data.value !== undefined && (
          <p className="text-xs">
            <span className="text-gray-400">Value:</span>{' '}
            <span className="text-cyan-400 font-medium">
              {typeof data.value === 'number' ? data.value.toFixed(2) : data.value}
            </span>
          </p>
        )}
        {data.count !== undefined && (
          <p className="text-xs">
            <span className="text-gray-400">Songs:</span>{' '}
            <span className="text-white">{data.count.toLocaleString()}</span>
          </p>
        )}
        {data.percentage !== undefined && (
          <p className="text-xs">
            <span className="text-gray-400">Percentage:</span>{' '}
            <span className="text-white">{data.percentage.toFixed(1)}%</span>
          </p>
        )}
      </div>
    </div>
  );
}
