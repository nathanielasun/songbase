'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeftIcon, PlayIcon, PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { formatDate, getTotalDuration } from '@/lib/mockData';
import { Song } from '@/lib/types';
import SongList from '@/components/SongList';
import EditPlaylistModal from '@/components/EditPlaylistModal';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { usePlaylist } from '@/contexts/PlaylistContext';

export default function PlaylistPage() {
  const params = useParams();
  const router = useRouter();
  const playlistId = params.id as string;
  const { currentSong, isPlaying, playSong, addToQueue } = useMusicPlayer();
  const {
    playlists,
    getPlaylistById,
    updatePlaylist,
    deletePlaylist,
    removeSongFromPlaylist,
    addSongToPlaylist,
  } = usePlaylist();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  const playlist = getPlaylistById(playlistId);

  if (!playlist) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Playlist Not Found</h1>
          <Link href="/" className="text-pink-500 hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const coverArt = playlist.coverArt || playlist.songs[0]?.albumArt || 'https://picsum.photos/seed/playlist/300/300';
  const totalDuration = getTotalDuration(playlist.songs);
  const totalMinutes = Math.floor(totalDuration / 60);

  const handleSongClick = (song: Song) => {
    playSong(song, playlist.songs);
  };

  const handleEditSave = (id: string, name: string, description?: string) => {
    updatePlaylist(id, { name, description });
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${playlist.name}"?`)) {
      deletePlaylist(playlistId);
      router.push('/');
    }
  };

  const handleRemoveSong = (songId: string) => {
    removeSongFromPlaylist(playlistId, songId);
  };

  const handleAddToPlaylist = (song: Song) => {
    setSelectedSong(song);
    setIsAddToPlaylistModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white pb-32">
      {/* Header */}
      <div className="bg-gradient-to-b from-pink-900/40 to-transparent">
        <div className="p-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back
          </Link>

          <div className="flex items-end gap-6">
            <Image
              src={coverArt}
              alt={playlist.name}
              width={232}
              height={232}
              className="rounded-lg shadow-2xl"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold mb-2">PLAYLIST</p>
              <h1 className="text-6xl font-bold mb-4">{playlist.name}</h1>
              {playlist.description && (
                <p className="text-gray-300 mb-4">{playlist.description}</p>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <span>{playlist.songs.length} songs</span>
                <span>•</span>
                <span>{totalMinutes} min</span>
                {playlist.createdAt && (
                  <>
                    <span>•</span>
                    <span>{formatDate(playlist.createdAt)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-8 py-6 flex items-center gap-4">
        <button
          onClick={() => playlist.songs.length > 0 && handleSongClick(playlist.songs[0])}
          disabled={playlist.songs.length === 0}
          className="bg-pink-500 hover:bg-pink-600 text-white rounded-full p-4 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PlayIcon className="w-6 h-6" />
        </button>
        <button
          onClick={() => setIsEditModalOpen(true)}
          className="text-gray-400 hover:text-white transition-colors"
          title="Edit playlist"
        >
          <PencilIcon className="w-8 h-8" />
        </button>
        <button
          onClick={handleDelete}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Delete playlist"
        >
          <TrashIcon className="w-8 h-8" />
        </button>
      </div>

      {/* Song List */}
      <div className="px-8">
        {playlist.songs.length > 0 ? (
          <div className="w-full">
            {/* Table Header */}
            <div className="grid grid-cols-[auto_3fr_2fr_2fr_1fr_auto_auto_auto] gap-4 px-4 py-2 text-sm text-gray-400 border-b border-gray-800">
              <div className="w-10">#</div>
              <div>Title</div>
              <div>Album</div>
              <div>Artist</div>
              <div>Duration</div>
              <div className="w-10"></div>
              <div className="w-10"></div>
              <div className="w-10"></div>
            </div>

            {/* Song Rows */}
            <div className="divide-y divide-gray-800">
              {playlist.songs.map((song, index) => {
                const isCurrentSong = currentSong?.id === song.id;
                return (
                  <div
                    key={song.id}
                    className={`grid grid-cols-[auto_3fr_2fr_2fr_1fr_auto_auto_auto] gap-4 px-4 py-3 group hover:bg-gray-800 transition-colors cursor-pointer ${
                      isCurrentSong ? 'bg-gray-800' : ''
                    }`}
                    onClick={() => handleSongClick(song)}
                  >
                    {/* Index / Play/Pause Button */}
                    <div className="w-10 flex items-center justify-center">
                      {isCurrentSong && isPlaying ? (
                        <PlayIcon className="w-4 h-4 text-pink-500" />
                      ) : (
                        <>
                          <span className={`group-hover:hidden ${isCurrentSong ? 'text-pink-500' : ''}`}>
                            {index + 1}
                          </span>
                          <PlayIcon className={`w-4 h-4 hidden group-hover:block ${isCurrentSong ? 'text-pink-500' : 'text-white'}`} />
                        </>
                      )}
                    </div>

                    {/* Title with Album Art */}
                    <div className="flex items-center gap-3 min-w-0">
                      {song.albumArt && (
                        <Image
                          src={song.albumArt}
                          alt={song.title}
                          width={40}
                          height={40}
                          className="rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`truncate ${isCurrentSong ? 'text-pink-500' : 'text-white'}`}>
                          {song.title}
                        </p>
                      </div>
                    </div>

                    {/* Album */}
                    <div className="flex items-center text-gray-400 truncate">
                      {song.albumId ? (
                        <Link
                          href={`/album/${song.albumId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-white hover:underline truncate"
                        >
                          {song.album || 'Unknown Album'}
                        </Link>
                      ) : (
                        <span className="truncate">{song.album || 'Unknown Album'}</span>
                      )}
                    </div>

                    {/* Artist */}
                    <div className="flex items-center text-gray-400 truncate">
                      {song.artistId ? (
                        <Link
                          href={`/artist/${song.artistId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-white hover:underline truncate"
                        >
                          {song.artist}
                        </Link>
                      ) : (
                        <span className="truncate">{song.artist}</span>
                      )}
                    </div>

                    {/* Duration */}
                    <div className="flex items-center text-gray-400">
                      {Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, '0')}
                    </div>

                    {/* Add to Queue */}
                    <div className="w-10 flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToQueue(song);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Add to queue"
                      >
                        <PlayIcon className="w-5 h-5 text-gray-400 hover:text-pink-500" />
                      </button>
                    </div>

                    {/* Add to Playlist */}
                    <div className="w-10 flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToPlaylist(song);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Add to another playlist"
                      >
                        <PlayIcon className="w-5 h-5 text-gray-400 hover:text-white" />
                      </button>
                    </div>

                    {/* Remove from Playlist */}
                    <div className="w-10 flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSong(song.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove from playlist"
                      >
                        <XMarkIcon className="w-5 h-5 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">This playlist is empty</p>
            <p className="text-sm text-gray-500 mt-2">Add songs from your library</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <EditPlaylistModal
        isOpen={isEditModalOpen}
        playlist={playlist}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleEditSave}
      />
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
          router.push('/');
        }}
      />
    </div>
  );
}
