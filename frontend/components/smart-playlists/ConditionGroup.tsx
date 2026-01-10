'use client';

import { PlusIcon, XMarkIcon, FolderPlusIcon } from '@heroicons/react/24/outline';
import {
  Condition,
  ConditionGroup as ConditionGroupType,
  createEmptyCondition,
  createEmptyGroup,
} from './types';
import ConditionRow from './ConditionRow';

interface ConditionGroupProps {
  group: ConditionGroupType;
  onChange: (group: ConditionGroupType) => void;
  onRemove?: () => void;
  depth?: number;
  disabled?: boolean;
}

// Helper type guard
function isConditionGroup(item: Condition | ConditionGroupType): item is ConditionGroupType {
  return 'conditions' in item;
}

export default function ConditionGroup({
  group,
  onChange,
  onRemove,
  depth = 0,
  disabled,
}: ConditionGroupProps) {
  const maxDepth = 3;
  const canNest = depth < maxDepth;

  const handleMatchChange = (match: 'all' | 'any') => {
    onChange({ ...group, match });
  };

  const handleConditionChange = (index: number, item: Condition | ConditionGroupType) => {
    const newConditions = [...group.conditions];
    newConditions[index] = item;
    onChange({ ...group, conditions: newConditions });
  };

  const handleRemoveCondition = (index: number) => {
    const newConditions = group.conditions.filter((_, i) => i !== index);
    onChange({ ...group, conditions: newConditions });
  };

  const handleAddCondition = () => {
    onChange({
      ...group,
      conditions: [...group.conditions, createEmptyCondition()],
    });
  };

  const handleAddGroup = () => {
    if (canNest) {
      onChange({
        ...group,
        conditions: [...group.conditions, createEmptyGroup()],
      });
    }
  };

  // Calculate minimum conditions (can't remove if only 1)
  const canRemoveConditions = group.conditions.length > 1;

  // Background color based on depth
  const bgColors = [
    'bg-neutral-900/50',
    'bg-neutral-800/30',
    'bg-neutral-700/20',
    'bg-neutral-600/10',
  ];

  return (
    <div
      className={`${bgColors[depth] || bgColors[0]} rounded-lg border border-neutral-700/50 p-4`}
    >
      {/* Group header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-300">Match</span>
          <select
            value={group.match}
            onChange={(e) => handleMatchChange(e.target.value as 'all' | 'any')}
            disabled={disabled}
            className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">ALL</option>
            <option value="any">ANY</option>
          </select>
          <span className="text-sm text-neutral-300">of the following rules:</span>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
            title="Remove group"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        {group.conditions.map((item, index) => {
          if (isConditionGroup(item)) {
            return (
              <ConditionGroup
                key={item.id}
                group={item}
                onChange={(updated) => handleConditionChange(index, updated)}
                onRemove={
                  canRemoveConditions ? () => handleRemoveCondition(index) : undefined
                }
                depth={depth + 1}
                disabled={disabled}
              />
            );
          }

          return (
            <ConditionRow
              key={item.id}
              condition={item}
              onChange={(updated) => handleConditionChange(index, updated)}
              onRemove={() => handleRemoveCondition(index)}
              canRemove={canRemoveConditions}
              disabled={disabled}
            />
          );
        })}
      </div>

      {/* Add buttons */}
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={handleAddCondition}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add condition
        </button>
        {canNest && (
          <button
            type="button"
            onClick={handleAddGroup}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-400 hover:text-purple-300 hover:bg-purple-400/10 rounded-lg transition-colors"
          >
            <FolderPlusIcon className="w-4 h-4" />
            Add group
          </button>
        )}
      </div>
    </div>
  );
}
