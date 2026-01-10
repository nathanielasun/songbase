'use client';

interface DanceabilityMeterProps {
  danceability: number | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showValue?: boolean;
}

export function DanceabilityMeter({
  danceability,
  size = 'md',
  showLabel = true,
  showValue = true
}: DanceabilityMeterProps) {
  if (danceability === null) {
    return (
      <div className="flex items-center gap-2">
        {showLabel && <span className="text-xs text-gray-500">Dance</span>}
        <span className="text-gray-500">--</span>
      </div>
    );
  }

  // Clamp to 0-100
  const normalized = Math.max(0, Math.min(100, danceability));

  // Icon based on danceability level
  const getDanceIcon = (value: number): string => {
    if (value < 25) return '🚶';  // Walking
    if (value < 50) return '🕺';  // Light dance
    if (value < 75) return '💃';  // Dancing
    return '🪩';  // Disco ball - party!
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const barSizes = {
    sm: 'h-1.5 w-16',
    md: 'h-2 w-24',
    lg: 'h-3 w-32',
  };

  return (
    <div className="flex items-center gap-2">
      {showLabel && (
        <span className={`text-gray-400 ${textSizes[size]}`}>
          {getDanceIcon(normalized)}
        </span>
      )}
      <div className={`${barSizes[size]} bg-gray-700 rounded-full overflow-hidden`}>
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
          style={{ width: `${normalized}%` }}
        />
      </div>
      {showValue && (
        <span className={`font-mono ${textSizes[size]} text-gray-300`}>
          {normalized}
        </span>
      )}
    </div>
  );
}

export default DanceabilityMeter;
