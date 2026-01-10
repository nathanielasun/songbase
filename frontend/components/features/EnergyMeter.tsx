'use client';

interface EnergyMeterProps {
  energy: number | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showValue?: boolean;
}

export function EnergyMeter({
  energy,
  size = 'md',
  showLabel = true,
  showValue = true
}: EnergyMeterProps) {
  if (energy === null) {
    return (
      <div className="flex items-center gap-2">
        {showLabel && <span className="text-xs text-gray-500">Energy</span>}
        <span className="text-gray-500">--</span>
      </div>
    );
  }

  // Clamp energy to 0-100
  const normalizedEnergy = Math.max(0, Math.min(100, energy));

  // Color gradient based on energy level
  const getEnergyColor = (value: number): string => {
    if (value < 30) return 'bg-blue-500';
    if (value < 50) return 'bg-green-500';
    if (value < 70) return 'bg-yellow-500';
    if (value < 85) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const barSizes = {
    sm: 'h-1.5 w-16',
    md: 'h-2 w-24',
    lg: 'h-3 w-32',
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className="flex items-center gap-2">
      {showLabel && (
        <span className={`text-gray-400 ${textSizes[size]}`}>Energy</span>
      )}
      <div className={`${barSizes[size]} bg-gray-700 rounded-full overflow-hidden`}>
        <div
          className={`h-full ${getEnergyColor(normalizedEnergy)} rounded-full transition-all duration-300`}
          style={{ width: `${normalizedEnergy}%` }}
        />
      </div>
      {showValue && (
        <span className={`font-mono ${textSizes[size]} text-gray-300`}>
          {normalizedEnergy}
        </span>
      )}
    </div>
  );
}

export default EnergyMeter;
