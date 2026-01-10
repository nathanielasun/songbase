'use client';

interface AcousticBadgeProps {
  acousticness: number | null;
  instrumentalness?: number | null;
  size?: 'sm' | 'md' | 'lg';
  showInstrumentalness?: boolean;
}

export function AcousticBadge({
  acousticness,
  instrumentalness,
  size = 'md',
  showInstrumentalness = false
}: AcousticBadgeProps) {
  if (acousticness === null) {
    return <span className="text-gray-500 text-sm">--</span>;
  }

  // Determine acoustic vs electronic label
  const getAcousticLabel = (value: number): { label: string; icon: string; style: string } => {
    if (value >= 80) return {
      label: 'Acoustic',
      icon: '🎸',
      style: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    };
    if (value >= 60) return {
      label: 'Mostly Acoustic',
      icon: '🎻',
      style: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    };
    if (value >= 40) return {
      label: 'Hybrid',
      icon: '🎹',
      style: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    };
    if (value >= 20) return {
      label: 'Electronic',
      icon: '🎛️',
      style: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    };
    return {
      label: 'Synth',
      icon: '🔊',
      style: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };
  };

  const getInstrumentalLabel = (value: number): { label: string; icon: string } => {
    if (value >= 80) return { label: 'Instrumental', icon: '🎼' };
    if (value >= 50) return { label: 'Light Vocals', icon: '🎤' };
    return { label: 'Vocal', icon: '🎙️' };
  };

  const acoustic = getAcousticLabel(acousticness);
  const instrumental = instrumentalness !== null && instrumentalness !== undefined
    ? getInstrumentalLabel(instrumentalness)
    : null;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`${acoustic.style} ${sizeClasses[size]} rounded-full border inline-flex items-center gap-1`}
      >
        <span>{acoustic.icon}</span>
        <span>{acoustic.label}</span>
      </span>
      {showInstrumentalness && instrumental && (
        <span
          className={`bg-gray-600/20 text-gray-400 border-gray-600/30 ${sizeClasses[size]} rounded-full border inline-flex items-center gap-1`}
        >
          <span>{instrumental.icon}</span>
          <span>{instrumental.label}</span>
        </span>
      )}
    </div>
  );
}

export default AcousticBadge;
