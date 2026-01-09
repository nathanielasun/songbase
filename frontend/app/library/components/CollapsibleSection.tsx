'use client';

import { ReactNode } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  isCollapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  headerRight?: ReactNode;
  defaultPadding?: boolean;
}

export function CollapsibleSection({
  title,
  icon,
  isCollapsed,
  onToggle,
  children,
  headerRight,
  defaultPadding = true,
}: CollapsibleSectionProps) {
  return (
    <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
      <div className="flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          {icon}
          <h2 className="text-xl font-semibold">{title}</h2>
          {isCollapsed ? (
            <ChevronDownIcon className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronUpIcon className="h-5 w-5 text-gray-400" />
          )}
        </button>
        {headerRight}
      </div>
      {!isCollapsed && (
        <div className={defaultPadding ? 'mt-4' : ''}>
          {children}
        </div>
      )}
    </section>
  );
}
