'use client';

import { BpmDisplay } from './BpmDisplay';
import { KeyDisplay } from './KeyDisplay';
import { EnergyMeter } from './EnergyMeter';
import { MoodBadge } from './MoodBadge';
import { DanceabilityMeter } from './DanceabilityMeter';
import { AcousticBadge } from './AcousticBadge';

export interface AudioFeatures {
  bpm: number | null;
  bpm_confidence?: number;
  key: string | null;
  key_mode: string | null;
  key_camelot?: string | null;
  key_confidence?: number;
  energy: number | null;
  mood_primary: string | null;
  mood_secondary?: string | null;
  danceability: number | null;
  acousticness: number | null;
  instrumentalness?: number | null;
}

interface FeaturePanelProps {
  features: AudioFeatures | null;
  layout?: 'compact' | 'full' | 'inline';
  showCamelot?: boolean;
  showConfidence?: boolean;
}

export function FeaturePanel({
  features,
  layout = 'full',
  showCamelot = false,
  showConfidence = false
}: FeaturePanelProps) {
  if (!features) {
    return (
      <div className="text-gray-500 text-sm p-4 text-center">
        No audio features available
      </div>
    );
  }

  if (layout === 'inline') {
    return (
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <BpmDisplay bpm={features.bpm} confidence={features.bpm_confidence} size="sm" />
        <KeyDisplay
          keyName={features.key}
          mode={features.key_mode}
          camelot={features.key_camelot}
          showCamelot={showCamelot}
          size="sm"
        />
        <MoodBadge mood={features.mood_primary} size="sm" />
      </div>
    );
  }

  if (layout === 'compact') {
    return (
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <BpmDisplay bpm={features.bpm} confidence={features.bpm_confidence} size="sm" />
        </div>
        <div className="flex flex-col gap-1">
          <KeyDisplay
            keyName={features.key}
            mode={features.key_mode}
            camelot={features.key_camelot}
            showCamelot={showCamelot}
            size="sm"
          />
        </div>
        <MoodBadge mood={features.mood_primary} size="sm" />
        <EnergyMeter energy={features.energy} size="sm" showLabel={false} />
      </div>
    );
  }

  // Full layout
  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-800/50 rounded-lg">
      {/* Tempo & Key */}
      <div className="space-y-3">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Tempo</div>
          <BpmDisplay
            bpm={features.bpm}
            confidence={features.bpm_confidence}
            size="lg"
            showLabel={false}
          />
          {showConfidence && features.bpm_confidence !== undefined && (
            <div className="text-xs text-gray-500 mt-0.5">
              {Math.round(features.bpm_confidence * 100)}% confidence
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Key</div>
          <KeyDisplay
            keyName={features.key}
            mode={features.key_mode}
            camelot={features.key_camelot}
            showCamelot={showCamelot}
            size="lg"
          />
          {showConfidence && features.key_confidence !== undefined && (
            <div className="text-xs text-gray-500 mt-0.5">
              {Math.round(features.key_confidence * 100)}% confidence
            </div>
          )}
        </div>
      </div>

      {/* Energy & Danceability */}
      <div className="space-y-3">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Energy</div>
          <EnergyMeter energy={features.energy} size="md" showLabel={false} />
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Danceability</div>
          <DanceabilityMeter danceability={features.danceability} size="md" showLabel={false} />
        </div>
      </div>

      {/* Mood - Full width */}
      <div className="col-span-2">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Mood</div>
        <MoodBadge
          mood={features.mood_primary}
          secondary={features.mood_secondary}
          showSecondary={true}
          size="md"
        />
      </div>

      {/* Acoustic/Electronic */}
      <div className="col-span-2">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Character</div>
        <AcousticBadge
          acousticness={features.acousticness}
          instrumentalness={features.instrumentalness}
          showInstrumentalness={true}
          size="md"
        />
      </div>
    </div>
  );
}

export default FeaturePanel;
