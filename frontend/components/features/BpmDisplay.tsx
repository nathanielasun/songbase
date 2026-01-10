'use client';

interface BpmDisplayProps {
  bpm: number | null;
  confidence?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function BpmDisplay({
  bpm,
  confidence = 1,
  size = 'md',
  showLabel = true
}: BpmDisplayProps) {
  if (bpm === null) {
    return (
      <div className="flex items-center gap-1 text-gray-500">
        <span className={size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-lg'}>
          --
        </span>
        {showLabel && <span className="text-xs text-gray-600">BPM</span>}
      </div>
    );
  }

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-mono font-semibold ${sizeClasses[size]}`}>
        {Math.round(bpm)}
      </span>
      {showLabel && <span className="text-xs text-gray-400">BPM</span>}
      {confidence < 0.7 && (
        <span className="text-xs text-yellow-500" title="Low confidence">~</span>
      )}
    </div>
  );
}

export default BpmDisplay;
