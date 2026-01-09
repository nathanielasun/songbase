'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeftIcon, PlayIcon, PencilIcon, TrashIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { formatDate, getTotalDuration } from '@/lib/mockData';
import { Song } from '@/lib/types';
import SongList from '@/components/SongList';
import EditPlaylistModal from '@/components/EditPlaylistModal';
import AddToPlaylistModal from '@/components/AddToPlaylistModal';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import { usePlaylist } from '@/contexts/PlaylistContext';
import { downloadSong, downloadPlaylist } from '@/lib/downloadUtils';

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

  const handleDownload = downloadSong;

  const handleDownloadPlaylist = () => {
    if (playlist.songs.length > 0) {
      downloadPlaylist(playlist.songs, playlist.name);
    }
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
          onClick={handleDownloadPlaylist}
          disabled={playlist.songs.length === 0}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Download playlist"
        >
          <ArrowDownTrayIcon className="w-8 h-8" />
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
          <SongList
            songs={playlist.songs}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onSongClick={handleSongClick}
            onAddToQueue={addToQueue}
            onAddToPlaylist={handleAddToPlaylist}
            onDownload={handleDownload}
            onRemove={(song) => handleRemoveSong(song.id)}
            removeTitle="Remove from playlist"
          />
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
