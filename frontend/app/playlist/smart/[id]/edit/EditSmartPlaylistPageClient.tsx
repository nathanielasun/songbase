'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeftIcon, BoltIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import {
  RuleBuilder,
  SmartPlaylist,
  SmartPlaylistForm,
  rulesFromApi,
  rulesToApi,
} from '@/components/smart-playlists';

export default function EditSmartPlaylistPageClient() {
  const router = useRouter();
  const params = useParams();
  const playlistId = params.id as string;

  const [playlist, setPlaylist] = useState<SmartPlaylist | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlaylist = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/playlists/smart/${playlistId}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Playlist not found');
          }
          throw new Error('Failed to load playlist');
        }

        const data = await response.json();
        setPlaylist(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load playlist');
      } finally {
        setIsLoading(false);
      }
    };

    if (playlistId) {
      fetchPlaylist();
    }
  }, [playlistId]);

  const handleSave = async (data: SmartPlaylistForm) => {
    const apiRules = rulesToApi(data.rules);

    const response = await fetch(`/api/playlists/smart/${playlistId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        description: data.description || null,
        rules: apiRules,
        sort_by: data.sortBy,
        sort_order: data.sortOrder,
        limit_count: data.limitCount,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to update playlist');
    }

    router.push(`/playlist/smart/${playlistId}`);
  };

  const handleCancel = () => {
    router.push(`/playlist/smart/${playlistId}`);
  };

  const handleBack = () => {
    router.back();
  };

  // Prepare initial data from existing playlist
  const getInitialData = (): Partial<SmartPlaylistForm> | undefined => {
    if (!playlist) return undefined;

    return {
      name: playlist.name,
      description: playlist.description || '',
      rules: rulesFromApi(playlist.rules),
      sortBy: playlist.sort_by,
      sortOrder: playlist.sort_order as 'asc' | 'desc',
      limitCount: playlist.limit_count,
    };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <ArrowPathIcon className="w-8 h-8 text-neutral-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="text-blue-400 hover:text-blue-300"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-400 mb-4">Playlist not found</p>
          <button
            onClick={() => router.push('/library')}
            className="text-blue-400 hover:text-blue-300"
          >
            Go to library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur-sm border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <BoltIcon className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">
                  Edit Smart Playlist
                </h1>
                <p className="text-sm text-neutral-400">
                  Modify rules for &ldquo;{playlist.name}&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <RuleBuilder
          initialData={getInitialData()}
          onSave={handleSave}
          onCancel={handleCancel}
          isEditing
        />
      </div>
    </div>
  );
}
