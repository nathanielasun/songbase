'use client';

import { ReactNode } from 'react';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/solid';
import { Sparkline } from '@/components/charts';

interface StatCardProps {
  icon?: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: {
    value: number;
    isPositive?: boolean;
    label?: string;
  };
  sparklineData?: number[];
  sparklineColor?: string;
  size?: 'default' | 'large' | 'compact';
  className?: string;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  sparklineData,
  sparklineColor = '#ec4899',
  size = 'default',
  className = '',
}: StatCardProps) {
  const sizeClasses = {
    compact: 'p-3',
    default: 'p-5',
    large: 'p-6',
  };

  const valueSizeClasses = {
    compact: 'text-xl',
    default: 'text-2xl',
    large: 'text-3xl',
  };

  return (
    <div className={`bg-gray-900/70 rounded-2xl border border-gray-800 ${sizeClasses[size]} ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {Icon && <Icon className="w-5 h-5 text-pink-500" />}
            <span className="text-sm text-gray-400">{label}</span>
          </div>
          <div className={`font-bold text-white ${valueSizeClasses[size]}`}>{value}</div>
          {subValue && <div className="text-xs text-gray-500 mt-1">{subValue}</div>}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              {trend.isPositive !== undefined && (
                trend.isPositive ? (
                  <ArrowUpIcon className="w-3 h-3 text-green-400" />
                ) : (
                  <ArrowDownIcon className="w-3 h-3 text-red-400" />
                )
              )}
              <span className={`text-xs ${trend.isPositive ? 'text-green-400' : trend.isPositive === false ? 'text-red-400' : 'text-gray-400'}`}>
                {trend.value > 0 ? '+' : ''}{trend.value}%
              </span>
              {trend.label && <span className="text-xs text-gray-500">{trend.label}</span>}
            </div>
          )}
        </div>
        {sparklineData && sparklineData.length > 1 && (
          <div className="ml-4">
            <Sparkline data={sparklineData} color={sparklineColor} width={80} height={40} />
          </div>
        )}
      </div>
    </div>
  );
}

// Hero stat card - larger version for primary metrics
interface HeroStatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  description?: string;
  accentColor?: string;
}

export function HeroStatCard({
  icon: Icon,
  label,
  value,
  subValue,
  description,
  accentColor = 'pink',
}: HeroStatCardProps) {
  const colorClasses: Record<string, { icon: string; accent: string }> = {
    pink: { icon: 'text-pink-500', accent: 'from-pink-500/20' },
    purple: { icon: 'text-purple-500', accent: 'from-purple-500/20' },
    cyan: { icon: 'text-cyan-500', accent: 'from-cyan-500/20' },
    amber: { icon: 'text-amber-500', accent: 'from-amber-500/20' },
    green: { icon: 'text-green-500', accent: 'from-green-500/20' },
  };

  const colors = colorClasses[accentColor] || colorClasses.pink;

  return (
    <div className={`bg-gradient-to-br ${colors.accent} to-transparent bg-gray-900/70 rounded-2xl p-6 border border-gray-800`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg bg-gray-800/50`}>
          <Icon className={`w-6 h-6 ${colors.icon}`} />
        </div>
        <span className="text-sm text-gray-400 font-medium">{label}</span>
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      {subValue && <div className="text-sm text-gray-400">{subValue}</div>}
      {description && <div className="text-xs text-gray-500 mt-2">{description}</div>}
    </div>
  );
}

// Mini stat card for compact displays
interface MiniStatCardProps {
  label: string;
  value: string | number;
  icon?: React.ElementType;
  trend?: number;
}

export function MiniStatCard({ label, value, icon: Icon, trend }: MiniStatCardProps) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-400" />}
          <span className="text-xs text-gray-400">{label}</span>
        </div>
        {trend !== undefined && (
          <span className={`text-xs ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="text-lg font-semibold text-white mt-1">{value}</div>
    </div>
  );
}

// Insight item for quick facts
interface InsightItemProps {
  text: string;
  highlight?: string;
  icon?: ReactNode;
}

export function InsightItem({ text, highlight, icon }: InsightItemProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      {icon && <div className="text-gray-500">{icon}</div>}
      <span className="text-sm text-gray-300">
        {text}
        {highlight && <span className="text-pink-400 font-medium ml-1">{highlight}</span>}
      </span>
    </div>
  );
}
