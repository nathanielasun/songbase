'use client';

import { CHART_COLORS, getSeriesColor } from './colors';

export interface LegendItem {
  name: string;
  color?: string;
  value?: string | number;
}

interface ChartLegendProps {
  items: LegendItem[];
  direction?: 'horizontal' | 'vertical';
  align?: 'left' | 'center' | 'right';
  showValues?: boolean;
  interactive?: boolean;
  activeItems?: string[];
  onItemClick?: (name: string) => void;
  className?: string;
}

export default function ChartLegend({
  items,
  direction = 'horizontal',
  align = 'center',
  showValues = false,
  interactive = false,
  activeItems,
  onItemClick,
  className = '',
}: ChartLegendProps) {
  const alignClass = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  }[align];

  const isActive = (name: string) => {
    if (!activeItems) return true;
    return activeItems.includes(name);
  };

  return (
    <div
      className={`flex ${direction === 'horizontal' ? `flex-wrap gap-x-4 gap-y-2 ${alignClass}` : 'flex-col gap-2'} ${className}`}
    >
      {items.map((item, index) => {
        const color = item.color || getSeriesColor(index);
        const active = isActive(item.name);

        return (
          <button
            key={item.name}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onItemClick?.(item.name)}
            className={`
              flex items-center gap-2 text-sm transition-opacity
              ${interactive ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
              ${active ? 'opacity-100' : 'opacity-40'}
            `}
          >
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-gray-300">{item.name}</span>
            {showValues && item.value !== undefined && (
              <span className="text-gray-500">({item.value})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Recharts-compatible legend component
interface RechartsLegendPayload {
  value: string;
  type?: string;
  id?: string;
  color?: string;
  dataKey?: string;
}

interface RechartsLegendProps {
  payload?: RechartsLegendPayload[];
  direction?: 'horizontal' | 'vertical';
  align?: 'left' | 'center' | 'right';
}

export function RechartsLegend({
  payload = [],
  direction = 'horizontal',
  align = 'center',
}: RechartsLegendProps) {
  if (!payload || payload.length === 0) return null;

  const items: LegendItem[] = payload.map((entry) => ({
    name: entry.value,
    color: entry.color,
  }));

  return (
    <ChartLegend
      items={items}
      direction={direction}
      align={align}
      className="mt-4"
    />
  );
}

// Compact inline legend for small charts
interface InlineLegendProps {
  items: LegendItem[];
  className?: string;
}

export function InlineLegend({ items, className = '' }: InlineLegendProps) {
  return (
    <div className={`flex items-center gap-3 text-xs ${className}`}>
      {items.map((item, index) => (
        <div key={item.name} className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: item.color || getSeriesColor(index) }}
          />
          <span className="text-gray-400">{item.name}</span>
        </div>
      ))}
    </div>
  );
}

// Color scale legend for heatmaps
interface ColorScaleLegendProps {
  colors: string[];
  labels: { min: string; max: string };
  className?: string;
}

export function ColorScaleLegend({ colors, labels, className = '' }: ColorScaleLegendProps) {
  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <span className="text-gray-500">{labels.min}</span>
      <div
        className="h-2 w-24 rounded"
        style={{
          background: `linear-gradient(to right, ${colors.join(', ')})`,
        }}
      />
      <span className="text-gray-500">{labels.max}</span>
    </div>
  );
}
