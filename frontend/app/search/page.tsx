'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { MagnifyingGlassIcon, XMarkIcon, ArrowLeftIcon, ArrowDownTrayIcon, RadioIcon, MusicalNoteIcon } from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import { Song, Playlist } from '@/lib/types';
import SongList from '@/components/SongList';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { usePlaylist } from '@/contexts/PlaylistContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { downloadSong } from '@/lib/downloadUtils';

type SearchCategory = 'all' | 'songs' | 'artists' | 'albums' | 'playlists' | 'genres';
type SortOption = 'relevance' | 'alphabetical' | 'recent';

type BackendSong = {
  sha_id: string;
  title: string;
  album?: string | null;
  album_id?: string | null;
  duration_sec?: number | null;
  release_year?: number | null;
  genre?: string | null;
  artists: string[];
  artist_ids: number[];
  primary_artist_id?: number | null;
};

type BackendArtist = {
  artist_id: number;
  name: string;
  song_count: number;
  album_count: number;
};

type BackendAlbum = {
  album_id: string;
  title: string;
  song_count: number;
  artists: string[];
  artist_ids: number[];
  release_year?: number | null;
};

type BackendGenre = {
  name: string;
  count: number;
};

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentSong, isPlaying, playSong, addToQueue } = useMusicPlayer();
  const { playlists, addSongToPlaylist, createPlaylist } = usePlaylist();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // Read genre from URL params on mount
  useEffect(() => {
    const genreParam = searchParams.get('genre');
    if (genreParam) {
      setSelectedGenre(genreParam);
      setActiveCategory('songs');
    }
  }, [searchParams]);
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  // Data states
  const [songs, setSongs] = useState<Song[]>([]);
  const [artists, setArtists] = useState<BackendArtist[]>([]);
  const [albums, setAlbums] = useState<BackendAlbum[]>([]);
  const [genres, setGenres] = useState<BackendGenre[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load genres on mount
  useEffect(() => {
    fetchJson<{ genres: BackendGenre[] }>('/api/library/genres?limit=100')
      .then((data) => setGenres(data.genres))
      .catch((err) => console.error('Failed to load genres:', err));
  }, []);

  // Load popular data when no search query
  useEffect(() => {
    if (searchQuery || selectedGenre) return;

    setLoading(true);
    setError(null);

    Promise.all([
      fetchJson<{ albums: BackendAlbum[] }>('/api/library/albums/popular?limit=50'),
      fetchJson<{ artists: BackendArtist[] }>('/api/library/artists/popular?limit=50'),
    ])
      .then(([albumsData, artistsData]) => {
        setAlbums(albumsData.albums);
        setArtists(artistsData.artists);
        setSongs([]);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [searchQuery, selectedGenre]);

  // Search when query or genre changes
  useEffect(() => {
    if (!searchQuery && !selectedGenre) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedGenre) params.set('genre', selectedGenre);
    params.set('limit', '100');

    // Search songs, artists, and albums in parallel
    const searchPromises: Promise<void>[] = [];

    // Always search songs
    searchPromises.push(
      fetchJson<{ songs: BackendSong[]; total: number }>(`/api/library/search?${params.toString()}`)
        .then((data) => {
          const mappedSongs = data.songs.map((song) => ({
            id: song.sha_id,
            hashId: song.sha_id,
            title: song.title || 'Unknown Title',
            artist: song.artists.length > 0 ? song.artists.join(', ') : 'Unknown Artist',
            artistId: song.primary_artist_id ? String(song.primary_artist_id) : undefined,
            album: song.album || 'Unknown Album',
            albumId: song.album_id || undefined,
            duration: song.duration_sec || 0,
            albumArt: song.album_id
              ? `/api/library/images/album/${song.album_id}`
              : `/api/library/images/song/${song.sha_id}`,
          }));
          setSongs(mappedSongs);
        })
        .catch(() => {
          setSongs([]);
        })
    );

    // Search artists if query provided (not just genre filter)
    if (searchQuery) {
      searchPromises.push(
        fetchJson<{ items: BackendArtist[]; total: number }>(`/api/library/artists?q=${encodeURIComponent(searchQuery)}&limit=50`)
          .then((data) => {
            setArtists(data.items);
          })
          .catch(() => {
            setArtists([]);
          })
      );

      // Search albums
      searchPromises.push(
        fetchJson<{ items: BackendAlbum[] }>(`/api/library/albums?q=${encodeURIComponent(searchQuery)}&limit=50`)
          .then((data) => {
            // Map to expected format (items has slightly different structure)
            const mappedAlbums = data.items.map((item: any) => ({
              album_id: item.album_id,
              title: item.title,
              song_count: item.song_count || 0,
              artists: item.artist_name ? [item.artist_name] : [],
              artist_ids: item.artist_id ? [item.artist_id] : [],
              release_year: item.release_year,
            }));
            setAlbums(mappedAlbums);
          })
          .catch(() => {
            setAlbums([]);
          })
      );
    } else {
      // No text query, just genre filter - show popular artists/albums
      searchPromises.push(
        fetchJson<{ artists: BackendArtist[] }>('/api/library/artists/popular?limit=20')
          .then((data) => setArtists(data.artists))
          .catch(() => setArtists([]))
      );
      searchPromises.push(
        fetchJson<{ albums: BackendAlbum[] }>('/api/library/albums/popular?limit=20')
          .then((data) => setAlbums(data.albums))
          .catch(() => setAlbums([]))
      );
    }

    Promise.all(searchPromises)
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [searchQuery, selectedGenre]);

  const clearSearch = () => {
    setSearchQuery('');
    setSelectedGenre(null);
    // Clear URL params if present
    if (searchParams.get('genre')) {
      router.push('/search');
    }
  };

  const handleSongClick = (song: Song) => {
    playSong(song, songs);
  };

  const handleAddToPlaylist = (song: Song) => {
    setSelectedSong(song);
    setIsAddToPlaylistModalOpen(true);
  };

  const handleDownloadSong = downloadSong;

  const handleDownloadAlbum = (albumId: string, albumTitle: string) => {
    console.log('Download album:', albumTitle, albumId, '(stub - will interface with backend)');
  };

  const handleArtistRadio = (artistId: number, artistName: string) => {
    router.push(`/radio/artist/${artistId}`);
  };

  const handleGenreClick = (genreName: string) => {
    // Navigate to search page with genre parameter
    router.push(`/search?genre=${encodeURIComponent(genreName)}`);
  };

  // Filter playlists by search query (client-side)
  const filteredPlaylists = useMemo(() => {
    if (!searchQuery) return playlists;
    const query = searchQuery.toLowerCase();
    return playlists.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.description && p.description.toLowerCase().includes(query))
    );
  }, [playlists, searchQuery]);

  // Filter genres by search query (client-side)
  const filteredGenres = useMemo(() => {
    if (!searchQuery) return genres;
    const query = searchQuery.toLowerCase();
    return genres.filter((g) => g.name.toLowerCase().includes(query));
  }, [genres, searchQuery]);

  // Calculate total results based on active category
  const totalResults = useMemo(() => {
    switch (activeCategory) {
      case 'songs':
        return songs.length;
      case 'artists':
        return artists.length;
      case 'albums':
        return albums.length;
      case 'playlists':
        return filteredPlaylists.length;
      case 'genres':
        return filteredGenres.length;
      case 'all':
      default:
        return songs.length + artists.length + albums.length + filteredPlaylists.length;
    }
  }, [activeCategory, songs.length, artists.length, albums.length, filteredPlaylists.length, filteredGenres.length]);

  const showResults = searchQuery || selectedGenre;

  // Filter displayed results by category
  const displayedSongs = activeCategory === 'songs' ? songs : activeCategory === 'all' ? songs.slice(0, 10) : [];
  const displayedArtists =
    activeCategory === 'artists' ? artists : activeCategory === 'all' ? artists.slice(0, 5) : [];
  const displayedAlbums =
    activeCategory === 'albums' ? albums : activeCategory === 'all' ? albums.slice(0, 5) : [];
  const displayedPlaylists =
    activeCategory === 'playlists' ? filteredPlaylists : activeCategory === 'all' ? filteredPlaylists.slice(0, 5) : [];
  const displayedGenres =
    activeCategory === 'genres' ? filteredGenres : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white pb-32">
      {/* Header */}
      <div className="p-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Back
        </Link>

        <h1 className="text-4xl font-bold mb-8">Search</h1>

        {/* Search Input */}
        <div className="relative max-w-2xl">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="What do you want to listen to?"
            className="w-full pl-14 pr-12 py-4 bg-gray-800 text-white rounded-full focus:outline-none focus:ring-2 focus:ring-pink-500 placeholder-gray-400"
            autoFocus
          />
          {(searchQuery || selectedGenre) && (
            <button
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Category Filters */}
        <div className="flex gap-3 mt-6 flex-wrap">
          {(['all', 'songs', 'artists', 'albums', 'playlists', 'genres'] as SearchCategory[]).map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-6 py-2 rounded-full font-semibold transition-colors ${
                activeCategory === category
                  ? 'bg-white text-black'
                  : 'bg-gray-800 text-white hover:bg-gray-700'
              }`}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>

        {/* Selected Genre Display */}
        {selectedGenre && (
          <div className="mt-4">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-full">
              Genre: {selectedGenre}
              <button onClick={() => setSelectedGenre(null)} className="hover:text-gray-200">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Search Results */}
      {loading ? (
        <div className="px-8 py-16 text-center text-gray-400">
          <div className="inline-block w-8 h-8 border-4 border-gray-600 border-t-pink-500 rounded-full animate-spin mb-4"></div>
          <p>Searching...</p>
        </div>
      ) : error ? (
        <div className="px-8 py-16 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : activeCategory === 'genres' ? (
        // Genres List
        <div className="px-8">
          <h2 className="text-2xl font-bold mb-6">
            {searchQuery ? `Genres matching "${searchQuery}"` : 'Browse All Genres'}
          </h2>
          {filteredGenres.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredGenres.map((genre) => (
                <button
                  key={genre.name}
                  onClick={() => handleGenreClick(genre.name)}
                  className="flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-left group"
                >
                  <span className="font-medium text-white group-hover:text-pink-400 transition-colors">
                    {genre.name}
                  </span>
                  <span className="text-sm text-gray-400">{genre.count}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-gray-400">No genres found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      ) : showResults && totalResults === 0 ? (
        <div className="px-8 text-center py-16">
          <MagnifyingGlassIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">No results found</h2>
          <p className="text-gray-400">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="px-8">
          {/* Songs */}
          {(activeCategory === 'all' || activeCategory === 'songs') && displayedSongs.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold mb-6">Songs</h2>
              <SongList
                songs={displayedSongs}
                currentSong={currentSong}
                isPlaying={isPlaying}
                onSongClick={handleSongClick}
                onAddToPlaylist={handleAddToPlaylist}
                onDownload={handleDownloadSong}
                onAddToQueue={addToQueue}
              />
              {activeCategory === 'all' && songs.length > 10 && (
                <button
                  onClick={() => setActiveCategory('songs')}
                  className="mt-4 text-gray-400 hover:text-white transition-colors text-sm"
                >
                  See all {songs.length} songs
                </button>
              )}
            </div>
          )}

          {/* Artists */}
          {(activeCategory === 'all' || activeCategory === 'artists') && displayedArtists.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold mb-6">Artists</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {displayedArtists.map((artist) => (
                  <div key={artist.artist_id} className="group">
                    <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-all text-center">
                      <Link href={`/artist/${artist.artist_id}`}>
                        <div className="aspect-square rounded-full mb-4 bg-gray-700 overflow-hidden">
                          <img
                            src={`/api/library/images/artist/${artist.artist_id}`}
                            alt={artist.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                        <h3 className="font-semibold text-white mb-1 truncate">{artist.name}</h3>
                        <p className="text-sm text-gray-400">
                          {artist.song_count} song{artist.song_count !== 1 ? 's' : ''}
                        </p>
                      </Link>
                      <button
                        onClick={() => handleArtistRadio(artist.artist_id, artist.name)}
                        className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-pink-600 hover:bg-pink-500 rounded-full text-sm font-medium transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <RadioIcon className="w-4 h-4" />
                        Artist Radio
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {activeCategory === 'all' && artists.length > 5 && (
                <button
                  onClick={() => setActiveCategory('artists')}
                  className="mt-4 text-gray-400 hover:text-white transition-colors text-sm"
                >
                  See all {artists.length} artists
                </button>
              )}
            </div>
          )}

          {/* Albums */}
          {(activeCategory === 'all' || activeCategory === 'albums') && displayedAlbums.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold mb-6">Albums</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {displayedAlbums.map((album) => (
                  <Link key={album.album_id} href={`/album/${album.album_id}`} className="group">
                    <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-all relative">
                      <div className="relative">
                        <div className="aspect-square rounded mb-4 bg-gray-700 overflow-hidden">
                          <img
                            src={`/api/library/images/album/${album.album_id}`}
                            alt={album.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDownloadAlbum(album.album_id, album.title);
                          }}
                          className="absolute top-2 right-2 p-2 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                          title="Download album"
                        >
                          <ArrowDownTrayIcon className="w-5 h-5 text-gray-400 hover:text-pink-500" />
                        </button>
                      </div>
                      <h3 className="font-semibold text-white truncate mb-1">{album.title}</h3>
                      <p className="text-sm text-gray-400 truncate">
                        {album.artists.join(', ')}
                        {album.release_year && ` • ${album.release_year}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {album.song_count} song{album.song_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
              {activeCategory === 'all' && albums.length > 5 && (
                <button
                  onClick={() => setActiveCategory('albums')}
                  className="mt-4 text-gray-400 hover:text-white transition-colors text-sm"
                >
                  See all {albums.length} albums
                </button>
              )}
            </div>
          )}

          {/* Playlists */}
          {(activeCategory === 'all' || activeCategory === 'playlists') && displayedPlaylists.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold mb-6">Playlists</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {displayedPlaylists.map((playlist) => (
                  <Link key={playlist.id} href={`/playlist/${playlist.id}`} className="group">
                    <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-all">
                      <div className="aspect-square rounded mb-4 bg-gradient-to-br from-pink-600 to-purple-700 overflow-hidden flex items-center justify-center">
                        {playlist.coverArt ? (
                          <img
                            src={playlist.coverArt}
                            alt={playlist.name}
                            className="w-full h-full object-cover"
                          />
                        ) : playlist.songs[0]?.albumArt ? (
                          <img
                            src={playlist.songs[0].albumArt}
                            alt={playlist.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <MusicalNoteIcon className="w-16 h-16 text-white/70" />
                        )}
                      </div>
                      <h3 className="font-semibold text-white truncate mb-1">{playlist.name}</h3>
                      {playlist.description && (
                        <p className="text-sm text-gray-400 truncate mb-1">{playlist.description}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        {playlist.songs.length} song{playlist.songs.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
              {activeCategory === 'all' && filteredPlaylists.length > 5 && (
                <button
                  onClick={() => setActiveCategory('playlists')}
                  className="mt-4 text-gray-400 hover:text-white transition-colors text-sm"
                >
                  See all {filteredPlaylists.length} playlists
                </button>
              )}
            </div>
          )}

          {/* Empty State for browse */}
          {!showResults && totalResults === 0 && (
            <div className="text-center py-16">
              <MagnifyingGlassIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Start Searching</h2>
              <p className="text-gray-400">Search for songs, artists, albums, playlists, or browse by genre</p>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AddToPlaylistModal
        isOpen={isAddToPlaylistModalOpen}
        song={selectedSong}
        playlists={playlists}
        onClose={() => {
          setIsAddToPlaylistModalOpen(false);
          setSelectedSong(null);
        }}
        onAddToPlaylist={addSongToPlaylist}
        onCreateNew={() => {
          setIsAddToPlaylistModalOpen(false);
          setSelectedSong(null);
          createPlaylist(`My Playlist #${playlists.length + 1}`);
        }}
      />
    </div>
  );
}
