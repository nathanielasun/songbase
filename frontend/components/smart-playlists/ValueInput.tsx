'use client';

import { FIELD_DEFINITIONS } from './types';

interface ValueInputProps {
  field: string;
  operator: string;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
}

export default function ValueInput({
  field,
  operator,
  value,
  onChange,
  disabled,
}: ValueInputProps) {
  const fieldDef = FIELD_DEFINITIONS[field];
  const fieldType = fieldDef?.type || 'string';

  // Operators that don't need value input
  const noValueOperators = ['is_true', 'is_false', 'is_null', 'is_not_null', 'never'];
  if (noValueOperators.includes(operator)) {
    return null;
  }

  // Handle "between" operator (needs two inputs)
  if (operator === 'between') {
    const [min, max] = Array.isArray(value) ? value : [null, null];

    if (fieldType === 'date') {
      return (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={min || ''}
            onChange={(e) => onChange([e.target.value, max])}
            disabled={disabled}
            className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="text-neutral-400 text-sm">and</span>
          <input
            type="date"
            value={max || ''}
            onChange={(e) => onChange([min, e.target.value])}
            disabled={disabled}
            className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={min ?? ''}
          onChange={(e) => onChange([Number(e.target.value), max])}
          disabled={disabled}
          placeholder="Min"
          className="w-20 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <span className="text-neutral-400 text-sm">and</span>
        <input
          type="number"
          value={max ?? ''}
          onChange={(e) => onChange([min, Number(e.target.value)])}
          disabled={disabled}
          placeholder="Max"
          className="w-20 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    );
  }

  // Handle list operators (comma-separated input)
  if (operator === 'in_list' || operator === 'not_in_list') {
    const listValue = Array.isArray(value) ? value.join(', ') : value || '';
    return (
      <input
        type="text"
        value={listValue}
        onChange={(e) => {
          const items = e.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(items.length > 0 ? items : e.target.value);
        }}
        disabled={disabled}
        placeholder="Value 1, Value 2, ..."
        className="flex-1 min-w-[200px] px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    );
  }

  if (operator === 'same_as') {
    return (
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="playlist:<id>"
        className="flex-1 min-w-[200px] px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    );
  }

  // Handle "within_days" operator
  if (operator === 'within_days') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          min={1}
          placeholder="30"
          className="w-20 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <span className="text-neutral-400 text-sm">days</span>
      </div>
    );
  }

  if (operator === 'years_ago') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          min={1}
          placeholder="10"
          className="w-20 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <span className="text-neutral-400 text-sm">years</span>
      </div>
    );
  }

  if (operator === 'top_n') {
    const current = value && typeof value === 'object' ? value : {};
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={current.sha_id || ''}
          onChange={(e) => onChange({ ...current, sha_id: e.target.value })}
          disabled={disabled}
          placeholder="Seed SHA"
          className="min-w-[160px] px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="number"
          value={current.count ?? 10}
          onChange={(e) => onChange({ ...current, count: Number(e.target.value) })}
          disabled={disabled}
          min={1}
          max={100}
          className="w-20 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <span className="text-neutral-400 text-sm">songs</span>
      </div>
    );
  }

  // Handle date fields
  if (fieldType === 'date') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    );
  }

  // Handle number fields
  if (fieldType === 'number') {
    // Special handling for duration_sec field (show as minutes:seconds)
    if (field === 'duration_sec') {
      const seconds = Number(value) || 0;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;

      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={minutes}
            onChange={(e) => {
              const newMinutes = Number(e.target.value) || 0;
              onChange(newMinutes * 60 + secs);
            }}
            disabled={disabled}
            min={0}
            placeholder="0"
            className="w-16 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="text-neutral-400 text-sm">:</span>
          <input
            type="number"
            value={secs}
            onChange={(e) => {
              const newSecs = Math.min(59, Math.max(0, Number(e.target.value) || 0));
              onChange(minutes * 60 + newSecs);
            }}
            disabled={disabled}
            min={0}
            max={59}
            placeholder="00"
            className="w-16 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="text-neutral-400 text-xs">(m:s)</span>
        </div>
      );
    }

    // Special handling for completion_rate (percentage)
    if (field === 'completion_rate') {
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={disabled}
            min={0}
            max={100}
            placeholder="0"
            className="w-20 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="text-neutral-400 text-sm">%</span>
        </div>
      );
    }

    if (field === 'energy' || field === 'danceability') {
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={disabled}
            min={0}
            max={100}
            placeholder="0"
            className="w-20 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="text-neutral-400 text-sm">%</span>
        </div>
      );
    }

    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        placeholder="0"
        className="w-24 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    );
  }

  // Default: string input
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="Enter value..."
      className="flex-1 min-w-[150px] px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  );
}
