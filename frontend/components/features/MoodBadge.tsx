'use client';

interface MoodBadgeProps {
  mood: string | null;
  secondary?: string | null;
  showSecondary?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

// Mood colors and icons
const MOOD_STYLES: Record<string, { bg: string; icon: string }> = {
  happy: { bg: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: '☀️' },
  sad: { bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '🌧️' },
  energetic: { bg: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '⚡' },
  calm: { bg: 'bg-green-500/20 text-green-400 border-green-500/30', icon: '🌿' },
  aggressive: { bg: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '🔥' },
  romantic: { bg: 'bg-pink-500/20 text-pink-400 border-pink-500/30', icon: '💕' },
  dark: { bg: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: '🌙' },
  uplifting: { bg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: '✨' },
};

export function MoodBadge({
  mood,
  secondary,
  showSecondary = false,
  size = 'md'
}: MoodBadgeProps) {
  if (!mood) {
    return <span className="text-gray-500 text-sm">--</span>;
  }

  const style = MOOD_STYLES[mood.toLowerCase()] || {
    bg: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    icon: '🎵'
  };

  const secondaryStyle = secondary
    ? MOOD_STYLES[secondary.toLowerCase()] || { bg: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: '🎵' }
    : null;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`${style.bg} ${sizeClasses[size]} rounded-full border inline-flex items-center gap-1`}
      >
        <span>{style.icon}</span>
        <span>{capitalize(mood)}</span>
      </span>
      {showSecondary && secondary && secondaryStyle && (
        <span
          className={`${secondaryStyle.bg} ${sizeClasses[size]} rounded-full border inline-flex items-center gap-1 opacity-70`}
        >
          <span>{secondaryStyle.icon}</span>
          <span>{capitalize(secondary)}</span>
        </span>
      )}
    </div>
  );
}

// Export mood categories for filters
export const MOOD_CATEGORIES = [
  'happy',
  'sad',
  'energetic',
  'calm',
  'aggressive',
  'romantic',
  'dark',
  'uplifting',
] as const;

export type MoodCategory = typeof MOOD_CATEGORIES[number];

export default MoodBadge;
