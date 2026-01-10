'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BoltIcon, ChartBarIcon, Cog8ToothIcon, HomeIcon, MagnifyingGlassIcon, PlusCircleIcon, RectangleStackIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { HeartIcon } from '@heroicons/react/24/solid';
import { Playlist } from '@/lib/types';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';

interface SmartPlaylistSummary {
  playlist_id: string;
  name: string;
  song_count: number;
}

interface SidebarProps {
  playlists: Playlist[];
  onCreatePlaylist: () => void;
}

export default function Sidebar({ playlists, onCreatePlaylist }: SidebarProps) {
  const pathname = usePathname();
  const { likedCount } = useUserPreferences();
  const [smartPlaylists, setSmartPlaylists] = useState<SmartPlaylistSummary[]>([]);
  const [isLoadingSmartPlaylists, setIsLoadingSmartPlaylists] = useState(true);

  // Fetch smart playlists
  useEffect(() => {
    const fetchSmartPlaylists = async () => {
      try {
        const response = await fetch('/api/playlists/smart');
        if (response.ok) {
          const data = await response.json();
          setSmartPlaylists(data.playlists || []);
        }
      } catch (err) {
        console.error('Failed to fetch smart playlists:', err);
      } finally {
        setIsLoadingSmartPlaylists(false);
      }
    };

    fetchSmartPlaylists();
  }, [pathname]); // Refetch when pathname changes (e.g., after creating a new one)
  return (
    <div className="w-64 bg-black text-white flex flex-col h-full">
      {/* Logo */}
      <div className="p-6">
        <h1 className="text-2xl font-bold">Songbase</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        <ul className="space-y-2">
          <li>
            <Link
              href="/"
              className="flex items-center gap-4 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              <HomeIcon className="w-6 h-6" />
              <span className="font-semibold">Home</span>
            </Link>
          </li>
          <li>
            <Link
              href="/search"
              className="flex items-center gap-4 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              <MagnifyingGlassIcon className="w-6 h-6" />
              <span className="font-semibold">Search</span>
            </Link>
          </li>
          <li>
            <Link
              href="/radio/for-you"
              className="flex items-center gap-4 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              <SparklesIcon className="w-6 h-6" />
              <span className="font-semibold">For You</span>
            </Link>
          </li>
          <li>
            <Link
              href="/stats"
              className="flex items-center gap-4 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              <ChartBarIcon className="w-6 h-6" />
              <span className="font-semibold">Your Stats</span>
            </Link>
          </li>
          <li>
            <Link
              href="/library"
              className="flex items-center gap-4 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              <RectangleStackIcon className="w-6 h-6" />
              <span className="font-semibold">Manage library</span>
            </Link>
          </li>
          <li>
            <Link
              href="/settings"
              className="flex items-center gap-4 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              <Cog8ToothIcon className="w-6 h-6" />
              <span className="font-semibold">Settings</span>
            </Link>
          </li>
        </ul>

        {/* Playlists Section */}
        <div className="mt-8">
          <button
            onClick={onCreatePlaylist}
            className="flex items-center gap-4 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors w-full"
          >
            <PlusCircleIcon className="w-6 h-6" />
            <span className="font-semibold">Create Playlist</span>
          </button>

          <div className="mt-4 space-y-1">
            {/* Liked Songs - Special System Playlist */}
            <Link
              href="/playlist/liked"
              className="flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800"
            >
              <div className="w-6 h-6 bg-gradient-to-br from-pink-500 to-purple-600 rounded flex items-center justify-center flex-shrink-0">
                <HeartIcon className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="truncate">Liked Songs</span>
              {likedCount > 0 && (
                <span className="text-xs text-gray-500 ml-auto">{likedCount}</span>
              )}
            </Link>

            {/* User-created Playlists */}
            {playlists.map((playlist) => (
              <Link
                key={playlist.id}
                href={`/playlist/${playlist.id}`}
                className="flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800"
              >
                {playlist.coverArt ? (
                  <img
                    src={playlist.coverArt}
                    alt={playlist.name}
                    className="w-6 h-6 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 bg-gradient-to-br from-gray-600 to-gray-800 rounded flex items-center justify-center flex-shrink-0">
                    <RectangleStackIcon className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                )}
                <span className="truncate flex-1">{playlist.name}</span>
                {playlist.songs.length > 0 && (
                  <span className="text-xs text-gray-500">{playlist.songs.length}</span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Smart Playlists Section */}
        <div className="mt-6">
          <Link
            href="/playlist/smart/new"
            className="flex items-center gap-4 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors w-full"
          >
            <BoltIcon className="w-6 h-6 text-purple-400" />
            <span className="font-semibold">Smart Playlist</span>
          </Link>

          <div className="mt-2 space-y-1">
            {isLoadingSmartPlaylists ? (
              <div className="px-3 py-2 text-sm text-gray-600">Loading...</div>
            ) : smartPlaylists.length > 0 ? (
              smartPlaylists.map((smartPlaylist) => (
                <Link
                  key={smartPlaylist.playlist_id}
                  href={`/playlist/smart/${smartPlaylist.playlist_id}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800"
                >
                  <div className="w-6 h-6 bg-purple-500/20 rounded flex items-center justify-center flex-shrink-0">
                    <BoltIcon className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <span className="truncate flex-1">{smartPlaylist.name}</span>
                  <span className="text-xs text-gray-500">{smartPlaylist.song_count}</span>
                </Link>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-600">No smart playlists</div>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
