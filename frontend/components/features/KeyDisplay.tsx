'use client';

interface KeyDisplayProps {
  keyName: string | null;
  mode: string | null;
  camelot?: string | null;
  showCamelot?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

// Camelot wheel colors for visual matching
const CAMELOT_COLORS: Record<string, string> = {
  '1A': 'bg-green-600', '1B': 'bg-green-500',
  '2A': 'bg-green-700', '2B': 'bg-green-600',
  '3A': 'bg-teal-600', '3B': 'bg-teal-500',
  '4A': 'bg-cyan-600', '4B': 'bg-cyan-500',
  '5A': 'bg-blue-600', '5B': 'bg-blue-500',
  '6A': 'bg-indigo-600', '6B': 'bg-indigo-500',
  '7A': 'bg-purple-600', '7B': 'bg-purple-500',
  '8A': 'bg-pink-600', '8B': 'bg-pink-500',
  '9A': 'bg-red-600', '9B': 'bg-red-500',
  '10A': 'bg-orange-600', '10B': 'bg-orange-500',
  '11A': 'bg-amber-600', '11B': 'bg-amber-500',
  '12A': 'bg-yellow-600', '12B': 'bg-yellow-500',
};

export function KeyDisplay({
  keyName,
  mode,
  camelot,
  showCamelot = false,
  size = 'md'
}: KeyDisplayProps) {
  if (!keyName) {
    return <span className="text-gray-500">--</span>;
  }

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  const camelotColor = camelot ? CAMELOT_COLORS[camelot] || 'bg-gray-600' : '';

  return (
    <div className={`flex items-center gap-1.5 ${sizeClasses[size]}`}>
      <span className="font-semibold">{keyName}</span>
      {mode && (
        <span className="text-gray-400 text-sm">
          {mode === 'Major' ? 'maj' : 'min'}
        </span>
      )}
      {showCamelot && camelot && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded font-mono ${camelotColor} text-white`}
          title="Camelot wheel notation"
        >
          {camelot}
        </span>
      )}
    </div>
  );
}

// Helper to get compatible keys for DJ mixing
export function getCompatibleKeys(camelot: string): string[] {
  if (!camelot || camelot.length < 2) return [];

  const num = parseInt(camelot);
  const letter = camelot.slice(-1);

  if (isNaN(num) || num < 1 || num > 12) return [];

  return [
    `${num}${letter}`,                           // Same key
    `${num}${letter === 'A' ? 'B' : 'A'}`,       // Parallel major/minor
    `${((num - 2 + 12) % 12) + 1}${letter}`,     // -1 on wheel
    `${(num % 12) + 1}${letter}`,                // +1 on wheel
  ];
}

export default KeyDisplay;
