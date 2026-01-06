'use client';

import Link from 'next/link';
import { HomeIcon, MagnifyingGlassIcon, MusicalNoteIcon, PlusCircleIcon } from '@heroicons/react/24/outline';

interface SidebarProps {
  playlists: { id: string; name: string }[];
  onCreatePlaylist: () => void;
}

export default function Sidebar({ playlists, onCreatePlaylist }: SidebarProps) {
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
              href="/library"
              className="flex items-center gap-4 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              <MusicalNoteIcon className="w-6 h-6" />
              <span className="font-semibold">Your Library</span>
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

          <div className="mt-4 space-y-2">
            {playlists.map((playlist) => (
              <Link
                key={playlist.id}
                href={`/playlist/${playlist.id}`}
                className="block px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors truncate"
              >
                {playlist.name}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
