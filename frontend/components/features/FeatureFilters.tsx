'use client';

import { useState, useCallback } from 'react';
import { MOOD_CATEGORIES, type MoodCategory } from './MoodBadge';

export interface FeatureFilterState {
  bpmMin: number | null;
  bpmMax: number | null;
  keys: string[];
  mode: 'all' | 'major' | 'minor';
  energyMin: number | null;
  energyMax: number | null;
  moods: MoodCategory[];
  danceabilityMin: number | null;
  danceabilityMax: number | null;
  acousticType: 'all' | 'acoustic' | 'electronic' | 'hybrid';
}

interface FeatureFiltersProps {
  filters: FeatureFilterState;
  onChange: (filters: FeatureFilterState) => void;
  onClear: () => void;
  collapsed?: boolean;
}

const ALL_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const DEFAULT_FEATURE_FILTERS: FeatureFilterState = {
  bpmMin: null,
  bpmMax: null,
  keys: [],
  mode: 'all',
  energyMin: null,
  energyMax: null,
  moods: [],
  danceabilityMin: null,
  danceabilityMax: null,
  acousticType: 'all',
};

export function FeatureFilters({
  filters,
  onChange,
  onClear,
  collapsed = false
}: FeatureFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(!collapsed);

  const hasActiveFilters = useCallback(() => {
    return (
      filters.bpmMin !== null ||
      filters.bpmMax !== null ||
      filters.keys.length > 0 ||
      filters.mode !== 'all' ||
      filters.energyMin !== null ||
      filters.energyMax !== null ||
      filters.moods.length > 0 ||
      filters.danceabilityMin !== null ||
      filters.danceabilityMax !== null ||
      filters.acousticType !== 'all'
    );
  }, [filters]);

  const updateFilter = <K extends keyof FeatureFilterState>(
    key: K,
    value: FeatureFilterState[K]
  ) => {
    onChange({ ...filters, [key]: value });
  };

  const toggleKey = (key: string) => {
    const newKeys = filters.keys.includes(key)
      ? filters.keys.filter(k => k !== key)
      : [...filters.keys, key];
    updateFilter('keys', newKeys);
  };

  const toggleMood = (mood: MoodCategory) => {
    const newMoods = filters.moods.includes(mood)
      ? filters.moods.filter(m => m !== mood)
      : [...filters.moods, mood];
    updateFilter('moods', newMoods);
  };

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Audio Features</span>
          {hasActiveFilters() && (
            <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters() && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-xs text-gray-400 hover:text-white"
            >
              Clear
            </button>
          )}
          <span className="text-gray-500">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {/* Filter content */}
      {isExpanded && (
        <div className="p-3 pt-0 space-y-4 border-t border-gray-700">
          {/* BPM Range */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">BPM Range</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                placeholder="Min"
                value={filters.bpmMin ?? ''}
                onChange={(e) => updateFilter('bpmMin', e.target.value ? parseInt(e.target.value) : null)}
                className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                min={60}
                max={180}
              />
              <span className="text-gray-500">-</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.bpmMax ?? ''}
                onChange={(e) => updateFilter('bpmMax', e.target.value ? parseInt(e.target.value) : null)}
                className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                min={60}
                max={180}
              />
              <span className="text-xs text-gray-500">BPM</span>
            </div>
            {/* Quick BPM presets */}
            <div className="flex gap-1 mt-2 flex-wrap">
              {[
                { label: 'Slow', min: 60, max: 100 },
                { label: 'Medium', min: 100, max: 120 },
                { label: 'Fast', min: 120, max: 140 },
                { label: 'High', min: 140, max: 180 },
              ].map(({ label, min, max }) => (
                <button
                  key={label}
                  onClick={() => {
                    updateFilter('bpmMin', min);
                    updateFilter('bpmMax', max);
                  }}
                  className={`text-xs px-2 py-0.5 rounded ${
                    filters.bpmMin === min && filters.bpmMax === max
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Key Selector */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Key</label>
            <div className="flex gap-1 mt-1 flex-wrap">
              {ALL_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => toggleKey(key)}
                  className={`w-8 h-8 text-xs rounded ${
                    filters.keys.includes(key)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
            {/* Mode toggle */}
            <div className="flex gap-2 mt-2">
              {(['all', 'major', 'minor'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => updateFilter('mode', mode)}
                  className={`text-xs px-3 py-1 rounded ${
                    filters.mode === mode
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {mode === 'all' ? 'Any Mode' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Energy Range */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Energy</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="range"
                min={0}
                max={100}
                value={filters.energyMin ?? 0}
                onChange={(e) => updateFilter('energyMin', parseInt(e.target.value) || null)}
                className="flex-1 accent-blue-500"
              />
              <span className="text-sm text-gray-400 w-8">{filters.energyMin ?? 0}</span>
              <span className="text-gray-500">-</span>
              <input
                type="range"
                min={0}
                max={100}
                value={filters.energyMax ?? 100}
                onChange={(e) => updateFilter('energyMax', parseInt(e.target.value) || null)}
                className="flex-1 accent-blue-500"
              />
              <span className="text-sm text-gray-400 w-8">{filters.energyMax ?? 100}</span>
            </div>
          </div>

          {/* Mood Chips */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Mood</label>
            <div className="flex gap-1 mt-1 flex-wrap">
              {MOOD_CATEGORIES.map((mood) => (
                <button
                  key={mood}
                  onClick={() => toggleMood(mood)}
                  className={`text-xs px-2 py-1 rounded-full capitalize ${
                    filters.moods.includes(mood)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {mood}
                </button>
              ))}
            </div>
          </div>

          {/* Acoustic Type */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Character</label>
            <div className="flex gap-2 mt-1">
              {([
                { value: 'all', label: 'All' },
                { value: 'acoustic', label: 'Acoustic' },
                { value: 'hybrid', label: 'Hybrid' },
                { value: 'electronic', label: 'Electronic' },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => updateFilter('acousticType', value)}
                  className={`text-xs px-3 py-1 rounded ${
                    filters.acousticType === value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Danceability */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Danceability</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="range"
                min={0}
                max={100}
                value={filters.danceabilityMin ?? 0}
                onChange={(e) => updateFilter('danceabilityMin', parseInt(e.target.value) || null)}
                className="flex-1 accent-purple-500"
              />
              <span className="text-sm text-gray-400 w-8">{filters.danceabilityMin ?? 0}</span>
              <span className="text-gray-500">-</span>
              <input
                type="range"
                min={0}
                max={100}
                value={filters.danceabilityMax ?? 100}
                onChange={(e) => updateFilter('danceabilityMax', parseInt(e.target.value) || null)}
                className="flex-1 accent-purple-500"
              />
              <span className="text-sm text-gray-400 w-8">{filters.danceabilityMax ?? 100}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to convert filters to API query params
export function featureFiltersToQueryParams(filters: FeatureFilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.bpmMin !== null) params.set('bpm_min', filters.bpmMin.toString());
  if (filters.bpmMax !== null) params.set('bpm_max', filters.bpmMax.toString());
  if (filters.keys.length > 0) params.set('keys', filters.keys.join(','));
  if (filters.mode !== 'all') params.set('key_mode', filters.mode);
  if (filters.energyMin !== null) params.set('energy_min', filters.energyMin.toString());
  if (filters.energyMax !== null) params.set('energy_max', filters.energyMax.toString());
  if (filters.moods.length > 0) params.set('moods', filters.moods.join(','));
  if (filters.danceabilityMin !== null) params.set('danceability_min', filters.danceabilityMin.toString());
  if (filters.danceabilityMax !== null) params.set('danceability_max', filters.danceabilityMax.toString());
  if (filters.acousticType !== 'all') params.set('acoustic_type', filters.acousticType);

  return params;
}

export default FeatureFilters;
