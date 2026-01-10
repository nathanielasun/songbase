'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  SparklesIcon,
  MusicalNoteIcon,
  UserGroupIcon,
  FolderPlusIcon,
  PlayIcon,
  ArrowPathIcon,
  LightBulbIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon as PlayIconSolid } from '@heroicons/react/24/solid';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { SimpleBarChart, CHART_COLORS, getSeriesColor } from '@/components/charts';

// Types for API responses
interface SongItem {
  sha_id: string;
  title: string;
  album: string | null;
  duration_sec: number | null;
  release_year: number | null;
  artist: string;
  artist_id: number | null;
  added_at?: string;
  played_at?: string;
  was_completed?: boolean;
  completion_percent?: number;
  play_count?: number;
  avg_completion?: number;
}

interface DiscoverySummary {
  period: string;
  songs_added: number;
  new_artists: number;
  new_genres: number;
  first_listens: number;
}

interface RecentlyAddedGroup {
  date: string;
  songs: SongItem[];
}

interface NewArtist {
  artist_id: number;
  name: string;
  discovered_at: string;
  first_song: {
    sha_id: string;
    title: string;
    album: string | null;
  };
  total_plays: number;
  unique_songs: number;
}

interface NewGenre {
  genre: string;
  first_played: string;
}

interface UnplayedData {
  total_unplayed: number;
  total_library: number;
  unplayed_percentage: number;
  songs: SongItem[];
}

interface DiscoveriesTabProps {
  period: string;
}

export default function DiscoveriesTab({ period }: DiscoveriesTabProps) {
  const [summary, setSummary] = useState<DiscoverySummary | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<RecentlyAddedGroup[]>([]);
  const [newArtists, setNewArtists] = useState<NewArtist[]>([]);
  const [newGenres, setNewGenres] = useState<NewGenre[]>([]);
  const [unplayed, setUnplayed] = useState<UnplayedData | null>(null);
  const [oneHitWonders, setOneHitWonders] = useState<SongItem[]>([]);
  const [hiddenGems, setHiddenGems] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [
          summaryRes,
          recentRes,
          artistsRes,
          genresRes,
          unplayedRes,
          wondersRes,
          gemsRes,
        ] = await Promise.all([
          fetch(`/api/stats/discoveries/summary?period=${period}`),
          fetch(`/api/stats/discoveries/recently-added?days=30&limit=30`),
          fetch(`/api/stats/discoveries/new-artists?period=${period}&limit=10`),
          fetch(`/api/stats/discoveries/genre-exploration?period=${period}`),
          fetch(`/api/stats/discoveries/unplayed?limit=20`),
          fetch(`/api/stats/discoveries/one-hit-wonders?period=${period}&limit=15`),
          fetch(`/api/stats/discoveries/hidden-gems?limit=10`),
        ]);

        const [
          summaryData,
          recentData,
          artistsData,
          genresData,
          unplayedData,
          wondersData,
          gemsData,
        ] = await Promise.all([
          summaryRes.ok ? summaryRes.json() : null,
          recentRes.ok ? recentRes.json() : { grouped_by_date: [] },
          artistsRes.ok ? artistsRes.json() : { artists: [] },
          genresRes.ok ? genresRes.json() : { new_genres: [] },
          unplayedRes.ok ? unplayedRes.json() : null,
          wondersRes.ok ? wondersRes.json() : { songs: [] },
          gemsRes.ok ? gemsRes.json() : { songs: [] },
        ]);

        setSummary(summaryData);
        setRecentlyAdded(recentData.grouped_by_date || []);
        setNewArtists(artistsData.artists || []);
        setNewGenres(genresData.new_genres || []);
        setUnplayed(unplayedData);
        setOneHitWonders(wondersData.songs || []);
        setHiddenGems(gemsData.songs || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period]);

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-xl p-4">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <SummaryCards summary={summary} loading={loading} />

      {/* Row 1: Recently Added and New Artists */}
      <div className="grid md:grid-cols-2 gap-6">
        <RecentlyAddedPanel data={recentlyAdded} loading={loading} />
        <NewArtistsPanel data={newArtists} loading={loading} />
      </div>

      {/* Row 2: Unplayed Songs and Hidden Gems */}
      <div className="grid md:grid-cols-2 gap-6">
        <UnplayedSongsPanel data={unplayed} loading={loading} />
        <HiddenGemsPanel data={hiddenGems} loading={loading} />
      </div>

      {/* Row 3: One-Hit Wonders and New Genres */}
      <div className="grid md:grid-cols-2 gap-6">
        <OneHitWondersPanel data={oneHitWonders} loading={loading} />
        <NewGenresPanel data={newGenres} loading={loading} />
      </div>
    </div>
  );
}

// Sub-components

function SummaryCards({
  summary,
  loading,
}: {
  summary: DiscoverySummary | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse"
          >
            <div className="h-4 w-20 bg-gray-700 rounded mb-3" />
            <div className="h-8 w-16 bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      icon: FolderPlusIcon,
      label: 'Songs Added',
      value: summary?.songs_added || 0,
      color: CHART_COLORS.primary,
    },
    {
      icon: UserGroupIcon,
      label: 'New Artists',
      value: summary?.new_artists || 0,
      color: CHART_COLORS.secondary,
    },
    {
      icon: TagIcon,
      label: 'New Genres',
      value: summary?.new_genres || 0,
      color: CHART_COLORS.tertiary,
    },
    {
      icon: SparklesIcon,
      label: 'First Listens',
      value: summary?.first_listens || 0,
      color: CHART_COLORS.quaternary,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800"
        >
          <div className="flex items-center gap-3 mb-3">
            <card.icon className="w-5 h-5" style={{ color: card.color }} />
            <span className="text-sm text-gray-400">{card.label}</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {card.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentlyAddedPanel({
  data,
  loading,
}: {
  data: RecentlyAddedGroup[];
  loading: boolean;
}) {
  const { playSong } = useMusicPlayer();

  const handlePlay = (song: SongItem, e: React.MouseEvent) => {
    e.stopPropagation();
    playSong({
      id: song.sha_id,
      hashId: song.sha_id,
      title: song.title,
      artist: song.artist,
      album: song.album || '',
      duration: song.duration_sec || 0,
      albumArt: `/api/library/images/song/${song.sha_id}`,
    });
  };

  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-32 bg-gray-700 rounded mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const allSongs = data.flatMap((group) => group.songs).slice(0, 10);

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <FolderPlusIcon className="w-5 h-5 text-pink-500" />
        Recently Added
      </h3>

      {allSongs.length === 0 ? (
        <p className="text-gray-500 text-sm">No songs added recently</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {allSongs.map((song) => (
            <div
              key={song.sha_id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/50 group"
            >
              <div className="relative flex-shrink-0">
                <img
                  src={`/api/library/images/song/${song.sha_id}`}
                  alt=""
                  className="w-10 h-10 rounded bg-gray-800 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/default-album.svg';
                  }}
                />
                <button
                  onClick={(e) => handlePlay(song, e)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <PlayIconSolid className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{song.title}</p>
                <p className="text-xs text-gray-400 truncate">
                  {song.artist_id ? (
                    <Link
                      href={`/artist/${song.artist_id}`}
                      className="hover:text-white hover:underline"
                    >
                      {song.artist}
                    </Link>
                  ) : (
                    song.artist
                  )}
                </p>
              </div>
              {song.release_year && (
                <span className="text-xs text-gray-500">{song.release_year}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewArtistsPanel({
  data,
  loading,
}: {
  data: NewArtist[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-32 bg-gray-700 rounded mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <UserGroupIcon className="w-5 h-5 text-purple-500" />
        New Artists Discovered
      </h3>

      {data.length === 0 ? (
        <p className="text-gray-500 text-sm">No new artists discovered this period</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto">
          {data.map((artist) => (
            <Link
              key={artist.artist_id}
              href={`/artist/${artist.artist_id}`}
              className="p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <img
                  src={`/api/library/images/artist/${artist.artist_id}`}
                  alt=""
                  className="w-10 h-10 rounded-full bg-gray-700 object-cover flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/default-album.svg';
                  }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{artist.name}</p>
                  <p className="text-xs text-gray-400">
                    {artist.total_plays} plays
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2 truncate">
                First: {artist.first_song.title}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function UnplayedSongsPanel({
  data,
  loading,
}: {
  data: UnplayedData | null;
  loading: boolean;
}) {
  const { playSong } = useMusicPlayer();

  const handlePlay = (song: SongItem, e: React.MouseEvent) => {
    e.stopPropagation();
    playSong({
      id: song.sha_id,
      hashId: song.sha_id,
      title: song.title,
      artist: song.artist,
      album: song.album || '',
      duration: song.duration_sec || 0,
      albumArt: `/api/library/images/song/${song.sha_id}`,
    });
  };

  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-32 bg-gray-700 rounded mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <MusicalNoteIcon className="w-5 h-5 text-cyan-500" />
          Unplayed Songs
        </h3>
        <p className="text-gray-500 text-sm">Unable to load data</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <MusicalNoteIcon className="w-5 h-5 text-cyan-500" />
        Unplayed Songs
      </h3>

      {/* Stats bar */}
      <div className="mb-4 p-3 bg-gray-800/50 rounded-lg">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-400">Library exploration</span>
          <span className="text-white">
            {(100 - data.unplayed_percentage).toFixed(1)}% played
          </span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full transition-all"
            style={{ width: `${100 - data.unplayed_percentage}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {data.total_unplayed.toLocaleString()} of {data.total_library.toLocaleString()} songs
          never played
        </p>
      </div>

      {data.songs.length === 0 ? (
        <p className="text-green-400 text-sm">You've played every song!</p>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {data.songs.slice(0, 8).map((song) => (
            <div
              key={song.sha_id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/50 group"
            >
              <button
                onClick={(e) => handlePlay(song, e)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 rounded-full transition-colors"
              >
                <PlayIconSolid className="w-4 h-4 text-white" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{song.title}</p>
                <p className="text-xs text-gray-400 truncate">{song.artist}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HiddenGemsPanel({
  data,
  loading,
}: {
  data: SongItem[];
  loading: boolean;
}) {
  const { playSong } = useMusicPlayer();

  const handlePlay = (song: SongItem, e: React.MouseEvent) => {
    e.stopPropagation();
    playSong({
      id: song.sha_id,
      hashId: song.sha_id,
      title: song.title,
      artist: song.artist,
      album: song.album || '',
      duration: song.duration_sec || 0,
      albumArt: `/api/library/images/song/${song.sha_id}`,
    });
  };

  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-32 bg-gray-700 rounded mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <LightBulbIcon className="w-5 h-5 text-amber-500" />
        Hidden Gems
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Songs you liked but haven't revisited much
      </p>

      {data.length === 0 ? (
        <p className="text-gray-500 text-sm">No hidden gems found yet</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {data.map((song) => (
            <div
              key={song.sha_id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/50 group"
            >
              <div className="relative flex-shrink-0">
                <img
                  src={`/api/library/images/song/${song.sha_id}`}
                  alt=""
                  className="w-10 h-10 rounded bg-gray-800 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/default-album.svg';
                  }}
                />
                <button
                  onClick={(e) => handlePlay(song, e)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <PlayIconSolid className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{song.title}</p>
                <p className="text-xs text-gray-400 truncate">{song.artist}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-amber-400">{song.avg_completion}%</p>
                <p className="text-xs text-gray-500">{song.play_count} plays</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OneHitWondersPanel({
  data,
  loading,
}: {
  data: SongItem[];
  loading: boolean;
}) {
  const { playSong } = useMusicPlayer();

  const handlePlay = (song: SongItem, e: React.MouseEvent) => {
    e.stopPropagation();
    playSong({
      id: song.sha_id,
      hashId: song.sha_id,
      title: song.title,
      artist: song.artist,
      album: song.album || '',
      duration: song.duration_sec || 0,
      albumArt: `/api/library/images/song/${song.sha_id}`,
    });
  };

  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-32 bg-gray-700 rounded mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <ArrowPathIcon className="w-5 h-5 text-orange-500" />
        One-Hit Wonders
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Songs you've only played once - give them another chance!
      </p>

      {data.length === 0 ? (
        <p className="text-gray-500 text-sm">No one-hit wonders found</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {data.map((song) => (
            <div
              key={song.sha_id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/50 group"
            >
              <div className="relative flex-shrink-0">
                <img
                  src={`/api/library/images/song/${song.sha_id}`}
                  alt=""
                  className="w-10 h-10 rounded bg-gray-800 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/default-album.svg';
                  }}
                />
                <button
                  onClick={(e) => handlePlay(song, e)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <PlayIconSolid className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{song.title}</p>
                <p className="text-xs text-gray-400 truncate">{song.artist}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {song.was_completed ? (
                  <span className="text-xs text-green-400">Completed</span>
                ) : (
                  <span className="text-xs text-gray-500">
                    {song.completion_percent?.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewGenresPanel({
  data,
  loading,
}: {
  data: NewGenre[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800 animate-pulse">
        <div className="h-5 w-32 bg-gray-700 rounded mb-4" />
        <div className="flex flex-wrap gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 w-20 bg-gray-800 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/70 rounded-2xl p-5 border border-gray-800">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <TagIcon className="w-5 h-5 text-emerald-500" />
        New Genres Explored
      </h3>

      {data.length === 0 ? (
        <p className="text-gray-500 text-sm">No new genres explored this period</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {data.map((genre, index) => (
            <span
              key={genre.genre}
              className="px-3 py-1.5 rounded-full text-sm font-medium"
              style={{
                backgroundColor: `${getSeriesColor(index)}20`,
                color: getSeriesColor(index),
              }}
            >
              {genre.genre}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
