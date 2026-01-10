'use client';

import { useState, useEffect, useCallback } from 'react';
import { MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import {
  ConditionGroup as ConditionGroupType,
  SmartPlaylistForm,
  SmartPlaylistSong,
  SORT_OPTIONS,
  createEmptyGroup,
} from './types';
import ConditionGroup from './ConditionGroup';

interface RuleBuilderProps {
  initialData?: Partial<SmartPlaylistForm>;
  onSave: (data: SmartPlaylistForm) => Promise<void>;
  onCancel: () => void;
  isEditing?: boolean;
}

interface RulePreset {
  id: string;
  label: string;
  description?: string;
  rules: any;
}

// Convert frontend rule format to API format
function rulesToApi(rules: ConditionGroupType): any {
  return {
    version: 1,
    match: rules.match,
    conditions: rules.conditions.map((item) => {
      if ('conditions' in item) {
        return rulesToApi(item);
      }
      return {
        field: item.field,
        operator: item.operator,
        value: item.value,
      };
    }),
  };
}

// Convert API rule format to frontend format (add IDs)
function rulesFromApi(rules: any): ConditionGroupType {
  const generateId = () => Math.random().toString(36).substring(2, 11);

  const parseCondition = (cond: any): any => {
    if (cond.conditions) {
      return {
        id: generateId(),
        match: cond.match || 'all',
        conditions: cond.conditions.map(parseCondition),
      };
    }
    return {
      id: generateId(),
      field: cond.field,
      operator: cond.operator,
      value: cond.value,
    };
  };

  return {
    id: generateId(),
    match: rules.match || 'all',
    conditions: (rules.conditions || []).map(parseCondition),
  };
}

export default function RuleBuilder({
  initialData,
  onSave,
  onCancel,
  isEditing = false,
}: RuleBuilderProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [rules, setRules] = useState<ConditionGroupType>(() => {
    if (initialData?.rules) {
      return typeof initialData.rules === 'object' && 'id' in initialData.rules
        ? initialData.rules
        : rulesFromApi(initialData.rules);
    }
    return createEmptyGroup();
  });
  const [sortBy, setSortBy] = useState(initialData?.sortBy || 'added_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    initialData?.sortOrder || 'desc'
  );
  const [limitCount, setLimitCount] = useState<number | null>(
    initialData?.limitCount ?? null
  );
  const [hasLimit, setHasLimit] = useState(initialData?.limitCount != null);
  const [presets, setPresets] = useState<RulePreset[]>([]);
  const [suggestions, setSuggestions] = useState<RulePreset[]>([]);
  const [presetError, setPresetError] = useState<string | null>(null);

  // Preview state
  const [previewSongs, setPreviewSongs] = useState<SmartPlaylistSong[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (preset: RulePreset) => {
    const presetGroup = rulesFromApi(preset.rules);
    setRules((prev) => ({
      ...prev,
      conditions: [...prev.conditions, ...presetGroup.conditions],
    }));
  };

  const loadPresets = useCallback(async () => {
    setPresetError(null);
    try {
      const response = await fetch('/api/playlists/smart/presets');
      if (!response.ok) {
        throw new Error('Failed to load presets');
      }
      const data = await response.json();
      setPresets(data.presets || []);
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : 'Failed to load presets');
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    setPresetError(null);
    try {
      const response = await fetch('/api/playlists/smart/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error('Failed to load suggestions');
      }
      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : 'Failed to load suggestions');
    }
  }, []);

  // Fetch preview with debounce
  const fetchPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    setPreviewError(null);

    try {
      const apiRules = rulesToApi(rules);
      const response = await fetch('/api/playlists/smart/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: apiRules,
          sort_by: sortBy,
          sort_order: sortOrder,
          limit: 10,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to preview';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // Response was not valid JSON (e.g., plain text 500 error)
          errorMessage = `Server error (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setPreviewSongs(data.songs || []);
      setTotalMatches(data.total_matches || 0);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed');
      setPreviewSongs([]);
      setTotalMatches(0);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [rules, sortBy, sortOrder]);

  // Debounced preview fetch
  useEffect(() => {
    const timer = setTimeout(fetchPreview, 500);
    return () => clearTimeout(timer);
  }, [fetchPreview]);

  useEffect(() => {
    loadPresets();
    loadSuggestions();
  }, [loadPresets, loadSuggestions]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a playlist name');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        rules,
        sortBy,
        sortOrder,
        limitCount: hasLimit ? limitCount : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Name and Description */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">
            Playlist Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Smart Playlist"
            className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this playlist contains..."
            rows={2}
            className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>
      </div>

      {/* Presets and Suggestions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-neutral-300">
            Presets
          </label>
          <button
            onClick={loadSuggestions}
            type="button"
            className="text-xs text-neutral-400 hover:text-white transition-colors"
          >
            Refresh suggestions
          </button>
        </div>

        {presetError && (
          <div className="text-xs text-red-400">{presetError}</div>
        )}

        {presets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="px-3 py-1.5 text-xs text-neutral-200 bg-neutral-800 border border-neutral-700 rounded-full hover:bg-neutral-700 transition-colors"
                title={preset.description}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Suggestions
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => applyPreset(suggestion)}
                  className="text-left p-3 bg-neutral-800/60 border border-neutral-700/50 rounded-lg hover:border-neutral-500 transition-colors"
                >
                  <div className="text-sm text-white">{suggestion.label}</div>
                  {suggestion.description && (
                    <div className="text-xs text-neutral-400 mt-1">
                      {suggestion.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rules */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-3">
          Rules
        </label>
        <ConditionGroup group={rules} onChange={setRules} />
      </div>

      {/* Sort and Limit */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-300">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-300">Order:</label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
            className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={hasLimit}
              onChange={(e) => {
                setHasLimit(e.target.checked);
                if (!e.target.checked) setLimitCount(null);
                else setLimitCount(100);
              }}
              className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            Limit to
          </label>
          {hasLimit && (
            <>
              <input
                type="number"
                value={limitCount ?? ''}
                onChange={(e) => setLimitCount(Number(e.target.value) || null)}
                min={1}
                className="w-20 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-sm text-neutral-300">songs</span>
            </>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-neutral-800/50 rounded-lg border border-neutral-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MagnifyingGlassIcon className="w-5 h-5 text-neutral-400" />
            <span className="text-sm font-medium text-neutral-300">
              Preview
              {!isLoadingPreview && (
                <span className="ml-2 text-neutral-400">
                  ({totalMatches} song{totalMatches !== 1 ? 's' : ''} match)
                </span>
              )}
            </span>
          </div>
          <button
            onClick={fetchPreview}
            disabled={isLoadingPreview}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh preview"
          >
            <ArrowPathIcon
              className={`w-4 h-4 ${isLoadingPreview ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {previewError && (
          <div className="text-sm text-red-400 mb-3">{previewError}</div>
        )}

        {isLoadingPreview ? (
          <div className="text-sm text-neutral-500">Loading preview...</div>
        ) : previewSongs.length > 0 ? (
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {previewSongs.map((song, index) => (
              <div
                key={song.sha_id}
                className="flex items-center gap-3 py-1.5 text-sm"
              >
                <span className="w-6 text-neutral-500 text-right">
                  {index + 1}.
                </span>
                <span className="flex-1 text-white truncate">{song.title}</span>
                <span className="text-neutral-400 truncate max-w-[150px]">
                  {song.artist}
                </span>
                <span className="text-neutral-500 text-xs">
                  {formatDuration(song.duration_sec)}
                </span>
              </div>
            ))}
            {totalMatches > previewSongs.length && (
              <div className="text-sm text-neutral-500 pt-2">
                ... and {totalMatches - previewSongs.length} more
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">
            No songs match the current rules
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-700">
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving
            ? 'Saving...'
            : isEditing
            ? 'Update Playlist'
            : 'Create Smart Playlist'}
        </button>
      </div>
    </div>
  );
}

// Export utility functions
export { rulesToApi, rulesFromApi };
