'use client';

import { ReactNode } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface CollapsiblePanelProps {
  title: string;
  icon?: ReactNode;
  isCollapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function CollapsiblePanel({
  title,
  icon,
  isCollapsed,
  onToggle,
  children,
}: CollapsiblePanelProps) {
  return (
    <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        <button
          onClick={onToggle}
          className="rounded-full p-1 text-gray-400 hover:text-white"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? (
            <ChevronDownIcon className="h-5 w-5" />
          ) : (
            <ChevronUpIcon className="h-5 w-5" />
          )}
        </button>
      </div>
      {!isCollapsed && (
        <>
          {children}
        </>
      )}
    </section>
  );
}
