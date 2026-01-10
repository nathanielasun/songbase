'use client';

import { useState, useEffect } from 'react';
import { PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Template } from './types';
import TemplateCard from './TemplateCard';

interface TemplateGalleryProps {
  onSelectTemplate: (template: Template) => void;
  onCreateFromScratch: () => void;
}

// Category labels
const categoryLabels: Record<string, string> = {
  time: 'Time-Based',
  favorites: 'Favorites & Stats',
  discovery: 'Discovery',
  duration: 'Duration',
  cleanup: 'Library Cleanup',
};

export default function TemplateGallery({
  onSelectTemplate,
  onCreateFromScratch,
}: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/playlists/smart/templates');
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      setTemplates(data.templates || []);
      setCategories(data.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Group templates by category
  const groupedTemplates = templates.reduce(
    (acc, template) => {
      const category = template.category || 'other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(template);
      return acc;
    },
    {} as Record<string, Template[]>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="w-6 h-6 text-neutral-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchTemplates}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Create from scratch option */}
      <button
        onClick={onCreateFromScratch}
        className="w-full p-4 border-2 border-dashed border-neutral-700 hover:border-blue-500 rounded-lg text-center transition-colors group"
      >
        <div className="flex items-center justify-center gap-2">
          <div className="p-2 bg-neutral-800 group-hover:bg-blue-500/10 rounded-lg transition-colors">
            <PlusIcon className="w-5 h-5 text-neutral-400 group-hover:text-blue-400 transition-colors" />
          </div>
          <span className="font-medium text-neutral-300 group-hover:text-blue-400 transition-colors">
            Create from Scratch
          </span>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Build your own rules from the ground up
        </p>
      </button>

      {/* Templates by category */}
      {categories.map((category) => {
        const categoryTemplates = groupedTemplates[category];
        if (!categoryTemplates?.length) return null;

        return (
          <div key={category}>
            <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">
              {categoryLabels[category] || category}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categoryTemplates.map((template) => (
                <TemplateCard
                  key={template.playlist_id}
                  template={template}
                  onSelect={onSelectTemplate}
                />
              ))}
            </div>
          </div>
        );
      })}

      {templates.length === 0 && (
        <p className="text-center text-neutral-500 py-8">
          No templates available. Create your own smart playlist!
        </p>
      )}
    </div>
  );
}
