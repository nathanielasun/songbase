'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  CalendarIcon,
  FunnelIcon,
  XMarkIcon,
  ChevronDownIcon,
  AdjustmentsHorizontalIcon,
  MusicalNoteIcon,
  UserGroupIcon,
  QueueListIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

// Types
export interface StatsFilters {
  period: string;
  startDate: string | null;
  endDate: string | null;
  compareStartDate: string | null;
  compareEndDate: string | null;
  genres: string[];
  artists: number[];
  playlists: string[];
  energyRange: [number, number] | null;
  danceabilityRange: [number, number] | null;
  bpmRange: [number, number] | null;
}

export const defaultFilters: StatsFilters = {
  period: 'month',
  startDate: null,
  endDate: null,
  compareStartDate: null,
  compareEndDate: null,
  genres: [],
  artists: [],
  playlists: [],
  energyRange: null,
  danceabilityRange: null,
  bpmRange: null,
};

interface FilterBarProps {
  filters: StatsFilters;
  onFiltersChange: (filters: StatsFilters) => void;
  showPeriodSelector?: boolean;
  showAdvancedFilters?: boolean;
  className?: string;
}

interface GenreOption {
  name: string;
  count: number;
}

interface ArtistOption {
  artist_id: number;
  name: string;
  song_count: number;
}

interface PlaylistOption {
  playlist_id: string;
  name: string;
  song_count: number;
}

// Period presets
const periodPresets = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

export default function FilterBar({
  filters,
  onFiltersChange,
  showPeriodSelector = true,
  showAdvancedFilters = true,
  className = '',
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Local state for dropdowns
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  // Filter options from API
  const [genres, setGenres] = useState<GenreOption[]>([]);
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Load filter options
  useEffect(() => {
    const loadOptions = async () => {
      setLoadingOptions(true);
      try {
        const [genresRes, artistsRes, playlistsRes] = await Promise.all([
          fetch('/api/library/genres?limit=50'),
          fetch('/api/library/artists/popular?limit=50'),
          fetch('/api/smart-playlists'),
        ]);

        if (genresRes.ok) {
          const data = await genresRes.json();
          setGenres(data.genres || []);
        }
        if (artistsRes.ok) {
          const data = await artistsRes.json();
          setArtists(data.artists || []);
        }
        if (playlistsRes.ok) {
          const data = await playlistsRes.json();
          setPlaylists(data.playlists || []);
        }
      } catch (e) {
        console.error('Failed to load filter options:', e);
      } finally {
        setLoadingOptions(false);
      }
    };

    if (showAdvancedFilters) {
      loadOptions();
    }
  }, [showAdvancedFilters]);

  // Sync filters to URL
  const syncToUrl = useCallback(
    (newFilters: StatsFilters) => {
      const params = new URLSearchParams();

      if (newFilters.period !== 'month') {
        params.set('period', newFilters.period);
      }
      if (newFilters.startDate) {
        params.set('start', newFilters.startDate);
      }
      if (newFilters.endDate) {
        params.set('end', newFilters.endDate);
      }
      if (newFilters.compareStartDate) {
        params.set('cstart', newFilters.compareStartDate);
      }
      if (newFilters.compareEndDate) {
        params.set('cend', newFilters.compareEndDate);
      }
      if (newFilters.genres.length > 0) {
        params.set('genres', newFilters.genres.join(','));
      }
      if (newFilters.artists.length > 0) {
        params.set('artists', newFilters.artists.join(','));
      }
      if (newFilters.playlists.length > 0) {
        params.set('playlists', newFilters.playlists.join(','));
      }
      if (newFilters.energyRange) {
        params.set('energy', newFilters.energyRange.join('-'));
      }
      if (newFilters.danceabilityRange) {
        params.set('dance', newFilters.danceabilityRange.join('-'));
      }
      if (newFilters.bpmRange) {
        params.set('bpm', newFilters.bpmRange.join('-'));
      }

      const queryString = params.toString();
      router.replace(`${pathname}${queryString ? `?${queryString}` : ''}`, {
        scroll: false,
      });
    },
    [pathname, router]
  );

  // Read filters from URL on mount
  useEffect(() => {
    const urlFilters: StatsFilters = { ...defaultFilters };

    const period = searchParams.get('period');
    if (period) urlFilters.period = period;

    const start = searchParams.get('start');
    if (start) urlFilters.startDate = start;

    const end = searchParams.get('end');
    if (end) urlFilters.endDate = end;

    const cstart = searchParams.get('cstart');
    if (cstart) urlFilters.compareStartDate = cstart;

    const cend = searchParams.get('cend');
    if (cend) urlFilters.compareEndDate = cend;

    const genresParam = searchParams.get('genres');
    if (genresParam) urlFilters.genres = genresParam.split(',');

    const artistsParam = searchParams.get('artists');
    if (artistsParam) urlFilters.artists = artistsParam.split(',').map(Number);

    const playlistsParam = searchParams.get('playlists');
    if (playlistsParam) urlFilters.playlists = playlistsParam.split(',');

    const energyParam = searchParams.get('energy');
    if (energyParam) {
      const [min, max] = energyParam.split('-').map(Number);
      urlFilters.energyRange = [min, max];
    }

    const danceParam = searchParams.get('dance');
    if (danceParam) {
      const [min, max] = danceParam.split('-').map(Number);
      urlFilters.danceabilityRange = [min, max];
    }

    const bpmParam = searchParams.get('bpm');
    if (bpmParam) {
      const [min, max] = bpmParam.split('-').map(Number);
      urlFilters.bpmRange = [min, max];
    }

    // Only update if different from current
    if (JSON.stringify(urlFilters) !== JSON.stringify(filters)) {
      onFiltersChange(urlFilters);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update handler that syncs to URL
  const updateFilters = useCallback(
    (updates: Partial<StatsFilters>) => {
      const newFilters = { ...filters, ...updates };
      onFiltersChange(newFilters);
      syncToUrl(newFilters);
    },
    [filters, onFiltersChange, syncToUrl]
  );

  // Handle period change
  const handlePeriodChange = (period: string) => {
    if (period === 'custom') {
      setShowDatePicker(true);
      updateFilters({ period: 'custom' });
    } else {
      updateFilters({
        period,
        startDate: null,
        endDate: null,
      });
      setShowDatePicker(false);
    }
  };

  // Handle custom date range
  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    updateFilters({ [field]: value || null, period: 'custom' });
  };

  // Handle comparison dates
  const handleCompareChange = (
    field: 'compareStartDate' | 'compareEndDate',
    value: string
  ) => {
    updateFilters({ [field]: value || null });
  };

  // Toggle filter chip
  const toggleGenre = (genre: string) => {
    const newGenres = filters.genres.includes(genre)
      ? filters.genres.filter((g) => g !== genre)
      : [...filters.genres, genre];
    updateFilters({ genres: newGenres });
  };

  const toggleArtist = (artistId: number) => {
    const newArtists = filters.artists.includes(artistId)
      ? filters.artists.filter((a) => a !== artistId)
      : [...filters.artists, artistId];
    updateFilters({ artists: newArtists });
  };

  const togglePlaylist = (playlistId: string) => {
    const newPlaylists = filters.playlists.includes(playlistId)
      ? filters.playlists.filter((p) => p !== playlistId)
      : [...filters.playlists, playlistId];
    updateFilters({ playlists: newPlaylists });
  };

  // Set audio feature range
  const setFeatureRange = (
    feature: 'energyRange' | 'danceabilityRange' | 'bpmRange',
    range: [number, number] | null
  ) => {
    updateFilters({ [feature]: range });
  };

  // Clear all filters
  const clearFilters = () => {
    updateFilters(defaultFilters);
    setShowCompare(false);
    setShowDatePicker(false);
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.genres.length > 0) count += filters.genres.length;
    if (filters.artists.length > 0) count += filters.artists.length;
    if (filters.playlists.length > 0) count += filters.playlists.length;
    if (filters.energyRange) count += 1;
    if (filters.danceabilityRange) count += 1;
    if (filters.bpmRange) count += 1;
    return count;
  }, [filters]);

  // Get artist name by ID
  const getArtistName = (id: number) => {
    return artists.find((a) => a.artist_id === id)?.name || `Artist ${id}`;
  };

  // Get playlist name by ID
  const getPlaylistName = (id: string) => {
    return playlists.find((p) => p.playlist_id === id)?.name || id;
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Main Filter Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Period Selector */}
        {showPeriodSelector && (
          <div className="flex items-center gap-1 bg-gray-900/50 rounded-xl p-1">
            {periodPresets.map((preset) => (
              <button
                key={preset.key}
                onClick={() => handlePeriodChange(preset.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filters.period === preset.key ||
                  (preset.key === 'custom' && filters.startDate)
                    ? 'bg-pink-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {/* Advanced Filters Toggle */}
        {showAdvancedFilters && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-gray-800 text-white'
                : 'bg-gray-900/50 text-gray-400 hover:text-white'
            }`}
          >
            <FunnelIcon className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 bg-pink-600 text-white text-xs rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        {/* Compare Toggle */}
        <button
          onClick={() => setShowCompare(!showCompare)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showCompare || filters.compareStartDate
              ? 'bg-gray-800 text-white'
              : 'bg-gray-900/50 text-gray-400 hover:text-white'
          }`}
        >
          <AdjustmentsHorizontalIcon className="w-4 h-4" />
          Compare
        </button>

        {/* Clear Filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
            Clear all
          </button>
        )}
      </div>

      {/* Custom Date Range Picker */}
      {(showDatePicker || filters.period === 'custom') && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-900/50 rounded-xl">
          <CalendarIcon className="w-5 h-5 text-pink-500" />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">From:</label>
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-pink-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">To:</label>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-pink-500"
            />
          </div>
        </div>
      )}

      {/* Comparison Date Range */}
      {showCompare && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-900/50 rounded-xl border border-purple-900/50">
          <span className="text-sm text-purple-400 font-medium">Compare to:</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.compareStartDate || ''}
              onChange={(e) => handleCompareChange('compareStartDate', e.target.value)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <span className="text-gray-500">to</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.compareEndDate || ''}
              onChange={(e) => handleCompareChange('compareEndDate', e.target.value)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            onClick={() => {
              updateFilters({ compareStartDate: null, compareEndDate: null });
              setShowCompare(false);
            }}
            className="ml-auto text-gray-400 hover:text-white"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="p-4 bg-gray-900/50 rounded-xl space-y-4">
          {/* Genre Filters */}
          <FilterSection
            icon={MusicalNoteIcon}
            title="Genres"
            loading={loadingOptions}
          >
            <div className="flex flex-wrap gap-2">
              {genres.slice(0, 15).map((genre) => (
                <FilterChip
                  key={genre.name}
                  label={genre.name}
                  count={genre.count}
                  active={filters.genres.includes(genre.name)}
                  onClick={() => toggleGenre(genre.name)}
                />
              ))}
              {genres.length === 0 && !loadingOptions && (
                <p className="text-sm text-gray-500">No genres found</p>
              )}
            </div>
          </FilterSection>

          {/* Artist Filters */}
          <FilterSection
            icon={UserGroupIcon}
            title="Artists"
            loading={loadingOptions}
          >
            <div className="flex flex-wrap gap-2">
              {artists.slice(0, 12).map((artist) => (
                <FilterChip
                  key={artist.artist_id}
                  label={artist.name}
                  count={artist.song_count}
                  active={filters.artists.includes(artist.artist_id)}
                  onClick={() => toggleArtist(artist.artist_id)}
                />
              ))}
              {artists.length === 0 && !loadingOptions && (
                <p className="text-sm text-gray-500">No artists found</p>
              )}
            </div>
          </FilterSection>

          {/* Playlist Filters */}
          <FilterSection
            icon={QueueListIcon}
            title="Playlists"
            loading={loadingOptions}
          >
            <div className="flex flex-wrap gap-2">
              {playlists.slice(0, 10).map((playlist) => (
                <FilterChip
                  key={playlist.playlist_id}
                  label={playlist.name}
                  count={playlist.song_count}
                  active={filters.playlists.includes(playlist.playlist_id)}
                  onClick={() => togglePlaylist(playlist.playlist_id)}
                />
              ))}
              {playlists.length === 0 && !loadingOptions && (
                <p className="text-sm text-gray-500">No playlists found</p>
              )}
            </div>
          </FilterSection>

          {/* Audio Feature Ranges */}
          <FilterSection icon={SparklesIcon} title="Audio Features">
            <div className="grid sm:grid-cols-3 gap-4">
              <RangeFilter
                label="Energy"
                min={0}
                max={100}
                value={filters.energyRange}
                onChange={(range) => setFeatureRange('energyRange', range)}
              />
              <RangeFilter
                label="Danceability"
                min={0}
                max={100}
                value={filters.danceabilityRange}
                onChange={(range) => setFeatureRange('danceabilityRange', range)}
              />
              <RangeFilter
                label="BPM"
                min={60}
                max={200}
                value={filters.bpmRange}
                onChange={(range) => setFeatureRange('bpmRange', range)}
              />
            </div>
          </FilterSection>
        </div>
      )}

      {/* Active Filter Chips */}
      {activeFilterCount > 0 && !showFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.genres.map((genre) => (
            <ActiveFilterChip
              key={`genre-${genre}`}
              label={genre}
              onRemove={() => toggleGenre(genre)}
            />
          ))}
          {filters.artists.map((artistId) => (
            <ActiveFilterChip
              key={`artist-${artistId}`}
              label={getArtistName(artistId)}
              onRemove={() => toggleArtist(artistId)}
            />
          ))}
          {filters.playlists.map((playlistId) => (
            <ActiveFilterChip
              key={`playlist-${playlistId}`}
              label={getPlaylistName(playlistId)}
              onRemove={() => togglePlaylist(playlistId)}
            />
          ))}
          {filters.energyRange && (
            <ActiveFilterChip
              label={`Energy: ${filters.energyRange[0]}-${filters.energyRange[1]}`}
              onRemove={() => setFeatureRange('energyRange', null)}
            />
          )}
          {filters.danceabilityRange && (
            <ActiveFilterChip
              label={`Dance: ${filters.danceabilityRange[0]}-${filters.danceabilityRange[1]}`}
              onRemove={() => setFeatureRange('danceabilityRange', null)}
            />
          )}
          {filters.bpmRange && (
            <ActiveFilterChip
              label={`BPM: ${filters.bpmRange[0]}-${filters.bpmRange[1]}`}
              onRemove={() => setFeatureRange('bpmRange', null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Sub-components

function FilterSection({
  icon: Icon,
  title,
  children,
  loading = false,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div>
      <h4 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
        <Icon className="w-4 h-4 text-pink-500" />
        {title}
      </h4>
      {loading ? (
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-7 w-20 bg-gray-800 rounded-full animate-pulse"
            />
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-pink-600 text-white'
          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className="ml-1 text-gray-400">({count})</span>
      )}
    </button>
  );
}

function ActiveFilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-pink-600/20 text-pink-400 rounded-full text-xs">
      {label}
      <button
        onClick={onRemove}
        className="hover:text-white transition-colors"
      >
        <XMarkIcon className="w-3 h-3" />
      </button>
    </span>
  );
}

function RangeFilter({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: [number, number] | null;
  onChange: (range: [number, number] | null) => void;
}) {
  const [localMin, setLocalMin] = useState(value?.[0]?.toString() || '');
  const [localMax, setLocalMax] = useState(value?.[1]?.toString() || '');
  const [isActive, setIsActive] = useState(value !== null);

  useEffect(() => {
    if (value) {
      setLocalMin(value[0].toString());
      setLocalMax(value[1].toString());
      setIsActive(true);
    } else {
      setLocalMin('');
      setLocalMax('');
      setIsActive(false);
    }
  }, [value]);

  const handleApply = () => {
    const minVal = parseInt(localMin) || min;
    const maxVal = parseInt(localMax) || max;
    if (minVal <= maxVal) {
      onChange([minVal, maxVal]);
      setIsActive(true);
    }
  };

  const handleClear = () => {
    onChange(null);
    setLocalMin('');
    setLocalMax('');
    setIsActive(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400">{label}</label>
        {isActive && (
          <button
            onClick={handleClear}
            className="text-xs text-gray-500 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          placeholder={min.toString()}
          value={localMin}
          onChange={(e) => setLocalMin(e.target.value)}
          onBlur={handleApply}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          className="w-16 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white text-center focus:outline-none focus:border-pink-500"
        />
        <span className="text-gray-500 text-xs">to</span>
        <input
          type="number"
          min={min}
          max={max}
          placeholder={max.toString()}
          value={localMax}
          onChange={(e) => setLocalMax(e.target.value)}
          onBlur={handleApply}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          className="w-16 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white text-center focus:outline-none focus:border-pink-500"
        />
      </div>
    </div>
  );
}

// Helper hook for using filters with URL persistence
export function useStatsFilters() {
  const [filters, setFilters] = useState<StatsFilters>(defaultFilters);

  // Convert filters to API query params
  const getQueryParams = useCallback(() => {
    const params = new URLSearchParams();

    // Period handling
    if (filters.period === 'custom' && filters.startDate && filters.endDate) {
      params.set('start_date', filters.startDate);
      params.set('end_date', filters.endDate);
    } else if (filters.period !== 'custom') {
      params.set('period', filters.period);
    }

    // Comparison dates
    if (filters.compareStartDate && filters.compareEndDate) {
      params.set('compare_start', filters.compareStartDate);
      params.set('compare_end', filters.compareEndDate);
    }

    // Filter arrays
    if (filters.genres.length > 0) {
      params.set('genres', filters.genres.join(','));
    }
    if (filters.artists.length > 0) {
      params.set('artist_ids', filters.artists.join(','));
    }
    if (filters.playlists.length > 0) {
      params.set('playlist_ids', filters.playlists.join(','));
    }

    // Audio feature ranges
    if (filters.energyRange) {
      params.set('energy_min', filters.energyRange[0].toString());
      params.set('energy_max', filters.energyRange[1].toString());
    }
    if (filters.danceabilityRange) {
      params.set('danceability_min', filters.danceabilityRange[0].toString());
      params.set('danceability_max', filters.danceabilityRange[1].toString());
    }
    if (filters.bpmRange) {
      params.set('bpm_min', filters.bpmRange[0].toString());
      params.set('bpm_max', filters.bpmRange[1].toString());
    }

    return params.toString();
  }, [filters]);

  return {
    filters,
    setFilters,
    getQueryParams,
  };
}
