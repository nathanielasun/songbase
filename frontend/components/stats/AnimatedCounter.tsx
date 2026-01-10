'use client';

import { useState, useEffect, useRef } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  formatter?: (value: number) => string;
  className?: string;
  showPulse?: boolean;
}

/**
 * AnimatedCounter - Smoothly animates between number values
 *
 * Features:
 * - Smooth easing animation between values
 * - Optional pulse effect on value change
 * - Customizable formatting
 * - Handles both increases and decreases
 */
export default function AnimatedCounter({
  value,
  duration = 500,
  formatter = (v) => v.toLocaleString(),
  className = '',
  showPulse = true,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isPulsing, setIsPulsing] = useState(false);
  const previousValueRef = useRef(value);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const previousValue = previousValueRef.current;

    // If value hasn't changed, do nothing
    if (previousValue === value) return;

    // Trigger pulse animation
    if (showPulse && previousValue !== value) {
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 300);
    }

    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startTime = performance.now();
    const startValue = displayValue;
    const endValue = value;
    const diff = endValue - startValue;

    // Easing function (ease-out cubic)
    const easeOutCubic = (t: number): number => {
      return 1 - Math.pow(1 - t, 3);
    };

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      const currentValue = Math.round(startValue + diff * easedProgress);
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        previousValueRef.current = value;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration, showPulse, displayValue]);

  // Update previous value ref after animation completes
  useEffect(() => {
    previousValueRef.current = value;
  }, [value]);

  return (
    <span
      className={`
        inline-block transition-transform
        ${isPulsing ? 'scale-110' : 'scale-100'}
        ${className}
      `}
    >
      {formatter(displayValue)}
    </span>
  );
}

/**
 * AnimatedDuration - Animated counter for duration strings
 */
interface AnimatedDurationProps {
  durationMs: number;
  className?: string;
  showPulse?: boolean;
}

export function AnimatedDuration({
  durationMs,
  className = '',
  showPulse = true,
}: AnimatedDurationProps) {
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <AnimatedCounter
      value={durationMs}
      formatter={formatDuration}
      className={className}
      showPulse={showPulse}
      duration={300}
    />
  );
}

/**
 * PulsingDot - Visual indicator for live updates
 */
interface PulsingDotProps {
  active?: boolean;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PulsingDot({
  active = true,
  color = 'bg-green-500',
  size = 'sm',
}: PulsingDotProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  if (!active) {
    return (
      <span className={`inline-block rounded-full bg-gray-500 ${sizeClasses[size]}`} />
    );
  }

  return (
    <span className="relative inline-flex">
      <span
        className={`
          inline-block rounded-full ${color} ${sizeClasses[size]}
        `}
      />
      <span
        className={`
          absolute inline-flex h-full w-full rounded-full ${color} opacity-75
          animate-ping
        `}
      />
    </span>
  );
}

/**
 * LiveIndicator - Shows "Live" with pulsing dot
 */
interface LiveIndicatorProps {
  connected: boolean;
  className?: string;
}

export function LiveIndicator({ connected, className = '' }: LiveIndicatorProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <PulsingDot active={connected} color={connected ? 'bg-green-500' : 'bg-gray-500'} />
      <span className={`text-xs font-medium ${connected ? 'text-green-400' : 'text-gray-500'}`}>
        {connected ? 'Live' : 'Offline'}
      </span>
    </div>
  );
}

/**
 * StatCardWithAnimation - A stat card that animates value changes
 */
interface StatCardWithAnimationProps {
  icon: React.ElementType;
  label: string;
  value: number;
  subValue?: string;
  formatter?: (value: number) => string;
  iconColor?: string;
  showLive?: boolean;
  isLive?: boolean;
}

export function StatCardWithAnimation({
  icon: Icon,
  label,
  value,
  subValue,
  formatter,
  iconColor = 'text-pink-500',
  showLive = false,
  isLive = false,
}: StatCardWithAnimationProps) {
  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 relative">
      {showLive && (
        <div className="absolute top-3 right-3">
          <LiveIndicator connected={isLive} />
        </div>
      )}
      <div className="flex items-center gap-3 mb-3">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">
        <AnimatedCounter value={value} formatter={formatter} />
      </div>
      {subValue && <div className="text-xs text-gray-500 mt-1">{subValue}</div>}
    </div>
  );
}
