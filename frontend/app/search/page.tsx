'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MagnifyingGlassIcon, XMarkIcon, ArrowLeftIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import { mockSongs, mockArtists, mockAlbums, mockPlaylists } from '@/lib/mockData';
import { Song, Artist, Album, Playlist } from '@/lib/types';
import SongList from '@/components/SongList';

type SearchCategory = 'all' | 'songs' | 'artists' | 'albums' | 'playlists';
type SortOption = 'relevance' | 'alphabetical' | 'recent';

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Extract all unique genres
  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    mockArtists.forEach(artist => artist.genres?.forEach(g => genres.add(g)));
    mockAlbums.forEach(album => album.genres?.forEach(g => genres.add(g)));
    return Array.from(genres).sort();
  }, []);

  // Filter and search logic
  const searchResults = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    // Filter songs
    let songs = mockSongs.filter(song => {
      if (!query) return true;
      return (
        song.title.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        song.album?.toLowerCase().includes(query)
      );
    });

    // Filter artists
    let artists = mockArtists.filter(artist => {
      const matchesQuery = !query || artist.name.toLowerCase().includes(query);
      const matchesGenre = selectedGenres.length === 0 ||
        artist.genres?.some(g => selectedGenres.includes(g));
      return matchesQuery && matchesGenre;
    });

    // Filter albums
    let albums = mockAlbums.filter(album => {
      const matchesQuery = !query ||
        album.title.toLowerCase().includes(query) ||
        album.artistName.toLowerCase().includes(query);
      const matchesGenre = selectedGenres.length === 0 ||
        album.genres?.some(g => selectedGenres.includes(g));
      return matchesQuery && matchesGenre;
    });

    // Filter playlists
    let playlists = mockPlaylists.filter(playlist => {
      if (!query) return true;
      return (
        playlist.name.toLowerCase().includes(query) ||
        playlist.description?.toLowerCase().includes(query)
      );
    });

    // Sort results
    if (sortBy === 'alphabetical') {
      songs = songs.sort((a, b) => a.title.localeCompare(b.title));
      artists = artists.sort((a, b) => a.name.localeCompare(b.name));
      albums = albums.sort((a, b) => a.title.localeCompare(b.title));
      playlists = playlists.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'recent') {
      albums = albums.sort((a, b) => {
        if (!a.releaseDate || !b.releaseDate) return 0;
        return b.releaseDate.getTime() - a.releaseDate.getTime();
      });
      playlists = playlists.sort((a, b) =>
        b.updatedAt.getTime() - a.updatedAt.getTime()
      );
    }

    return { songs, artists, albums, playlists };
  }, [searchQuery, selectedGenres, sortBy]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSelectedGenres([]);
  };

  const handleSongClick = (song: Song) => {
    if (currentSong?.id === song.id) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentSong(song);
      setIsPlaying(true);
    }
  };

  const handleDownloadSong = (song: Song) => {
    console.log('Download song:', song.title, '(stub - will interface with backend)');
  };

  const handleDownloadAlbum = (albumId: string, albumTitle: string) => {
    console.log('Download album:', albumTitle, '(stub - will interface with backend)');
  };

  const handleDownloadPlaylist = (playlistId: string, playlistName: string) => {
    console.log('Download playlist:', playlistName, '(stub - will interface with backend)');
  };

  const totalResults =
    searchResults.songs.length +
    searchResults.artists.length +
    searchResults.albums.length +
    searchResults.playlists.length;

  const showResults = searchQuery || selectedGenres.length > 0;

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
          {searchQuery && (
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
          {(['all', 'songs', 'artists', 'albums', 'playlists'] as SearchCategory[]).map((category) => (
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

        {/* Genre Filters */}
        {allGenres.length > 0 && (
          <div className="mt-6">
            <p className="text-sm text-gray-400 mb-3">Filter by genre:</p>
            <div className="flex gap-2 flex-wrap">
              {allGenres.map((genre) => (
                <button
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedGenres.includes(genre)
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sort Options */}
        {showResults && totalResults > 0 && (
          <div className="mt-6 flex items-center gap-4">
            <span className="text-sm text-gray-400">Sort by:</span>
            <div className="flex gap-2">
              {(['relevance', 'alphabetical', 'recent'] as SortOption[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setSortBy(option)}
                  className={`px-4 py-1 rounded-full text-sm transition-colors ${
                    sortBy === option
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search Results */}
      {showResults ? (
        <div className="px-8">
          {totalResults === 0 ? (
            <div className="text-center py-16">
              <MagnifyingGlassIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">No results found</h2>
              <p className="text-gray-400">Try adjusting your search or filters</p>
            </div>
          ) : (
            <>
              {/* Songs */}
              {(activeCategory === 'all' || activeCategory === 'songs') &&
                searchResults.songs.length > 0 && (
                  <div className="mb-12">
                    <h2 className="text-2xl font-bold mb-6">Songs</h2>
                    <SongList
                      songs={searchResults.songs.slice(0, activeCategory === 'all' ? 5 : undefined)}
                      currentSong={currentSong}
                      isPlaying={isPlaying}
                      onSongClick={handleSongClick}
                      onDownload={handleDownloadSong}
                    />
                    {activeCategory === 'all' && searchResults.songs.length > 5 && (
                      <button
                        onClick={() => setActiveCategory('songs')}
                        className="mt-4 text-gray-400 hover:text-white transition-colors text-sm"
                      >
                        See all {searchResults.songs.length} songs
                      </button>
                    )}
                  </div>
                )}

              {/* Artists */}
              {(activeCategory === 'all' || activeCategory === 'artists') &&
                searchResults.artists.length > 0 && (
                  <div className="mb-12">
                    <h2 className="text-2xl font-bold mb-6">Artists</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {(activeCategory === 'all'
                        ? searchResults.artists.slice(0, 5)
                        : searchResults.artists
                      ).map((artist) => (
                        <Link
                          key={artist.id}
                          href={`/artist/${artist.id}`}
                          className="group"
                        >
                          <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-all text-center">
                            {artist.imageUrl && (
                              <Image
                                src={artist.imageUrl}
                                alt={artist.name}
                                width={160}
                                height={160}
                                className="rounded-full mb-4 w-full"
                              />
                            )}
                            <h3 className="font-semibold text-white mb-1">{artist.name}</h3>
                            <p className="text-sm text-gray-400">Artist</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                    {activeCategory === 'all' && searchResults.artists.length > 5 && (
                      <button
                        onClick={() => setActiveCategory('artists')}
                        className="mt-4 text-gray-400 hover:text-white transition-colors text-sm"
                      >
                        See all {searchResults.artists.length} artists
                      </button>
                    )}
                  </div>
                )}

              {/* Albums */}
              {(activeCategory === 'all' || activeCategory === 'albums') &&
                searchResults.albums.length > 0 && (
                  <div className="mb-12">
                    <h2 className="text-2xl font-bold mb-6">Albums</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {(activeCategory === 'all'
                        ? searchResults.albums.slice(0, 5)
                        : searchResults.albums
                      ).map((album) => (
                        <Link
                          key={album.id}
                          href={`/album/${album.id}`}
                          className="group"
                        >
                          <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-all relative">
                            <div className="relative">
                              {album.coverArt && (
                                <Image
                                  src={album.coverArt}
                                  alt={album.title}
                                  width={200}
                                  height={200}
                                  className="rounded mb-4 w-full"
                                />
                              )}
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDownloadAlbum(album.id, album.title);
                                }}
                                className="absolute top-2 right-2 p-2 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                                title="Download album"
                              >
                                <ArrowDownTrayIcon className="w-5 h-5 text-gray-400 hover:text-pink-500" />
                              </button>
                            </div>
                            <h3 className="font-semibold text-white truncate mb-1">
                              {album.title}
                            </h3>
                            <p className="text-sm text-gray-400 truncate">
                              {album.artistName} • {album.type.toUpperCase()}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                    {activeCategory === 'all' && searchResults.albums.length > 5 && (
                      <button
                        onClick={() => setActiveCategory('albums')}
                        className="mt-4 text-gray-400 hover:text-white transition-colors text-sm"
                      >
                        See all {searchResults.albums.length} albums
                      </button>
                    )}
                  </div>
                )}

              {/* Playlists */}
              {(activeCategory === 'all' || activeCategory === 'playlists') &&
                searchResults.playlists.length > 0 && (
                  <div className="mb-12">
                    <h2 className="text-2xl font-bold mb-6">Playlists</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {(activeCategory === 'all'
                        ? searchResults.playlists.slice(0, 5)
                        : searchResults.playlists
                      ).map((playlist) => (
                        <Link
                          key={playlist.id}
                          href={`/playlist/${playlist.id}`}
                          className="group"
                        >
                          <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-all relative">
                            <div className="relative aspect-square bg-gradient-to-br from-pink-900 to-gray-900 rounded mb-4 flex items-center justify-center">
                              <PlayIcon className="w-12 h-12 text-white opacity-60" />
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDownloadPlaylist(playlist.id, playlist.name);
                                }}
                                className="absolute top-2 right-2 p-2 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                                title="Download playlist"
                              >
                                <ArrowDownTrayIcon className="w-5 h-5 text-gray-400 hover:text-pink-500" />
                              </button>
                            </div>
                            <h3 className="font-semibold text-white truncate mb-1">
                              {playlist.name}
                            </h3>
                            <p className="text-sm text-gray-400 truncate">
                              {playlist.songs.length} songs
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                    {activeCategory === 'all' && searchResults.playlists.length > 5 && (
                      <button
                        onClick={() => setActiveCategory('playlists')}
                        className="mt-4 text-gray-400 hover:text-white transition-colors text-sm"
                      >
                        See all {searchResults.playlists.length} playlists
                      </button>
                    )}
                  </div>
                )}
            </>
          )}
        </div>
      ) : (
        // Browse genres when no search
        <div className="px-8">
          <h2 className="text-2xl font-bold mb-6">Browse All</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {allGenres.map((genre) => (
              <button
                key={genre}
                onClick={() => toggleGenre(genre)}
                className="aspect-square bg-gradient-to-br from-pink-900 to-purple-900 rounded-lg p-6 hover:scale-105 transition-transform"
              >
                <h3 className="text-2xl font-bold">{genre}</h3>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
