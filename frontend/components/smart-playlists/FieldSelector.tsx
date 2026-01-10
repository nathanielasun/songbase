'use client';

import { FIELD_DEFINITIONS, FieldDefinition } from './types';

interface FieldSelectorProps {
  value: string;
  onChange: (field: string) => void;
  disabled?: boolean;
}

export default function FieldSelector({ value, onChange, disabled }: FieldSelectorProps) {
  // Group fields by category
  const groupedFields = Object.entries(FIELD_DEFINITIONS).reduce(
    (acc, [key, def]) => {
      if (!acc[def.category]) {
        acc[def.category] = [];
      }
      acc[def.category].push({ key, ...def });
      return acc;
    },
    {} as Record<string, (FieldDefinition & { key: string })[]>
  );

  const categoryLabels: Record<string, string> = {
    metadata: 'Metadata',
    playback: 'Playback Stats',
    preference: 'Preferences',
    audio: 'Audio Features',
    advanced: 'Advanced',
  };

  const categoryOrder = ['metadata', 'playback', 'preference', 'audio', 'advanced'];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[140px]"
    >
      {categoryOrder.map((category) => {
        const fields = groupedFields[category];
        if (!fields?.length) return null;

        return (
          <optgroup key={category} label={categoryLabels[category]}>
            {fields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
