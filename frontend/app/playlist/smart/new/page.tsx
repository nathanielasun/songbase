'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, BoltIcon } from '@heroicons/react/24/outline';
import {
  RuleBuilder,
  TemplateGallery,
  Template,
  SmartPlaylistForm,
  rulesFromApi,
  rulesToApi,
} from '@/components/smart-playlists';

type Mode = 'select' | 'builder';

export default function NewSmartPlaylistPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('select');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setMode('builder');
  };

  const handleCreateFromScratch = () => {
    setSelectedTemplate(null);
    setMode('builder');
  };

  const handleBack = () => {
    if (mode === 'builder') {
      setMode('select');
      setSelectedTemplate(null);
    } else {
      router.back();
    }
  };

  const handleSave = async (data: SmartPlaylistForm) => {
    const apiRules = rulesToApi(data.rules);

    const response = await fetch('/api/playlists/smart', {
      method: 'POST',
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
      let errorMessage = 'Failed to create playlist';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        errorMessage = `Server error (${response.status})`;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    router.push(`/playlist/smart/${result.playlist_id}`);
  };

  const handleCancel = () => {
    router.back();
  };

  // Prepare initial data from template if selected
  const getInitialData = (): Partial<SmartPlaylistForm> | undefined => {
    if (!selectedTemplate) return undefined;

    return {
      name: selectedTemplate.name,
      description: selectedTemplate.description,
      rules: rulesFromApi(selectedTemplate.rules),
      sortBy: 'added_at',
      sortOrder: 'desc',
    };
  };

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
                  {mode === 'select'
                    ? 'New Smart Playlist'
                    : selectedTemplate
                    ? `Create from "${selectedTemplate.name}"`
                    : 'Create Smart Playlist'}
                </h1>
                <p className="text-sm text-neutral-400">
                  {mode === 'select'
                    ? 'Choose a template or start from scratch'
                    : 'Define rules to automatically populate your playlist'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {mode === 'select' ? (
          <TemplateGallery
            onSelectTemplate={handleSelectTemplate}
            onCreateFromScratch={handleCreateFromScratch}
          />
        ) : (
          <RuleBuilder
            initialData={getInitialData()}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}
      </div>
    </div>
  );
}
