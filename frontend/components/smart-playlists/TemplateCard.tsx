'use client';

import {
  ClockIcon,
  FireIcon,
  SparklesIcon,
  MusicalNoteIcon,
  TrashIcon,
  HeartIcon,
} from '@heroicons/react/24/outline';
import { Template } from './types';

interface TemplateCardProps {
  template: Template;
  onSelect: (template: Template) => void;
}

// Category icons and colors
const categoryConfig: Record<
  string,
  { icon: typeof ClockIcon; color: string; bgColor: string }
> = {
  time: {
    icon: ClockIcon,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
  },
  favorites: {
    icon: HeartIcon,
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
  },
  discovery: {
    icon: SparklesIcon,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
  },
  duration: {
    icon: MusicalNoteIcon,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
  },
  cleanup: {
    icon: TrashIcon,
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
  },
};

export default function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const config = categoryConfig[template.category] || {
    icon: FireIcon,
    color: 'text-neutral-400',
    bgColor: 'bg-neutral-400/10',
  };
  const Icon = config.icon;

  return (
    <button
      onClick={() => onSelect(template)}
      className="group p-4 bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 hover:border-neutral-600 rounded-lg text-left transition-all"
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${config.bgColor}`}>
          <Icon className={`w-5 h-5 ${config.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white group-hover:text-blue-400 transition-colors truncate">
            {template.name}
          </h3>
          <p className="text-sm text-neutral-400 mt-0.5 line-clamp-2">
            {template.description}
          </p>
        </div>
      </div>
    </button>
  );
}
