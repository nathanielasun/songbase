'use client';

import { ReactNode, useRef, useId } from 'react';
import { ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from './colors';
import {
  CHART_ROLES,
  getChartAriaLabel,
  generateDataSummary,
} from './accessibility';

type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'radar' | 'heatmap';

interface ChartContainerProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  height?: number | string;
  className?: string;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  emptyDescription?: string;
  action?: ReactNode;
  /** Chart type for accessibility labeling */
  chartType?: ChartType;
  /** Data summary for screen readers */
  dataSummary?: string;
  /** Data for generating automatic summary */
  data?: Array<{ name: string; value: number }>;
  /** Value label for data summary */
  valueLabel?: string;
  /** ID for accessibility linking */
  id?: string;
  /** Whether the chart is focusable */
  focusable?: boolean;
  /** Animation on mount */
  animate?: boolean;
}

export default function ChartContainer({
  children,
  title,
  subtitle,
  height = 300,
  className = '',
  loading = false,
  empty = false,
  emptyMessage = 'No data available',
  emptyDescription,
  action,
  chartType = 'bar',
  dataSummary,
  data,
  valueLabel = 'value',
  id,
  focusable = false,
  animate = true,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const chartId = id || generatedId;
  const titleId = `${chartId}-title`;
  const descId = `${chartId}-desc`;

  // Generate accessibility description
  const accessibleSummary =
    dataSummary || (data ? generateDataSummary(data, valueLabel) : undefined);

  // Generate ARIA label
  const ariaLabel = title
    ? getChartAriaLabel(chartType, title, accessibleSummary)
    : `${chartType} chart`;

  return (
    <div
      ref={containerRef}
      id={chartId}
      className={`rounded-2xl border border-gray-800 p-5 ${animate ? 'animate-fadeIn' : ''} ${className}`}
      style={{ backgroundColor: CHART_COLORS.cardBg }}
      role={CHART_ROLES[chartType]}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={accessibleSummary ? descId : undefined}
      tabIndex={focusable ? 0 : undefined}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && (
              <h3 id={titleId} className="text-lg font-semibold text-white">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}

      {/* Screen reader only description */}
      {accessibleSummary && (
        <p id={descId} className="sr-only">
          {accessibleSummary}
        </p>
      )}

      {loading ? (
        <ChartSkeleton height={height} />
      ) : empty ? (
        <ChartEmpty
          height={height}
          message={emptyMessage}
          description={emptyDescription}
        />
      ) : (
        <div
          style={{ height: typeof height === 'number' ? `${height}px` : height }}
          aria-hidden="false"
        >
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ChartSkeleton({ height }: { height: number | string }) {
  const h = typeof height === 'number' ? height : 300;

  return (
    <div
      className="animate-pulse flex flex-col justify-end gap-2"
      style={{ height: `${h}px` }}
      role="status"
      aria-label="Loading chart data"
    >
      <div className="flex items-end gap-2 h-full">
        {[40, 65, 45, 80, 55, 70, 50, 60, 75, 45].map((percent, i) => (
          <div
            key={i}
            className="flex-1 bg-gray-700 rounded-t"
            style={{ height: `${percent}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="flex justify-between">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-3 w-8 bg-gray-700 rounded" aria-hidden="true" />
        ))}
      </div>
      <span className="sr-only">Loading chart...</span>
    </div>
  );
}

interface ChartEmptyProps {
  height: number | string;
  message: string;
  description?: string;
}

function ChartEmpty({ height, message, description }: ChartEmptyProps) {
  const h = typeof height === 'number' ? height : 300;

  return (
    <div
      className="flex flex-col items-center justify-center text-gray-500"
      style={{ height: `${h}px` }}
      role="status"
      aria-label={message}
    >
      <svg
        className="w-12 h-12 mb-3 text-gray-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
      <p className="text-sm font-medium">{message}</p>
      {description && (
        <p className="text-xs text-gray-600 mt-1 max-w-xs text-center">{description}</p>
      )}
    </div>
  );
}

/**
 * CSS animations for charts (add to global styles)
 */
export const CHART_ANIMATION_STYLES = `
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out;
}

@keyframes chartGrow {
  from {
    transform: scaleY(0);
    transform-origin: bottom;
  }
  to {
    transform: scaleY(1);
    transform-origin: bottom;
  }
}

.animate-chartGrow {
  animation: chartGrow 0.5s ease-out;
}

/* Screen reader only class */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`;
