'use client';

import { useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  XMarkIcon,
  ArrowsPointingOutIcon,
  TableCellsIcon,
  ChartBarIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon as PlayIconSolid } from '@heroicons/react/24/solid';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';

// Types
interface Column<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (value: any, row: T) => ReactNode;
}

interface DetailModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  data: T[];
  columns: Column<T>[];
  chart?: ReactNode;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchKey?: keyof T;
  onExport?: (format: 'csv' | 'json') => void;
  emptyMessage?: string;
  // For playable items
  playable?: boolean;
  getPlayableData?: (row: T) => {
    id: string;
    hashId: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    albumArt?: string;
  };
}

type SortDirection = 'asc' | 'desc' | null;

export default function DetailModal<T extends Record<string, any>>({
  isOpen,
  onClose,
  title,
  subtitle,
  data,
  columns,
  chart,
  loading = false,
  searchable = true,
  searchPlaceholder = 'Search...',
  searchKey,
  onExport,
  emptyMessage = 'No data available',
  playable = false,
  getPlayableData,
}: DetailModalProps<T>) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>(chart ? 'chart' : 'table');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [mounted, setMounted] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const { playSong } = useMusicPlayer();

  // Handle client-side mounting for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSortColumn(null);
      setSortDirection(null);
      setViewMode(chart ? 'chart' : 'table');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, chart]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Filter data based on search
  const filteredData = searchable && searchQuery && searchKey
    ? data.filter((row) => {
        const value = row[searchKey];
        if (typeof value === 'string') {
          return value.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
      })
    : data;

  // Sort data
  const sortedData = sortColumn
    ? [...filteredData].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        const comparison = aVal < bVal ? -1 : 1;
        return sortDirection === 'desc' ? -comparison : comparison;
      })
    : filteredData;

  // Handle sort
  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  // Handle play
  const handlePlay = useCallback((row: T) => {
    if (playable && getPlayableData) {
      const songData = getPlayableData(row);
      playSong(songData);
    }
  }, [playable, getPlayableData, playSong]);

  // Handle export
  const handleExport = (format: 'csv' | 'json') => {
    if (onExport) {
      onExport(format);
    } else {
      // Default export behavior
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(sortedData, null, 2)], {
          type: 'application/json',
        });
        downloadBlob(blob, `${title.toLowerCase().replace(/\s+/g, '-')}.json`);
      } else {
        const csv = convertToCSV(sortedData, columns);
        const blob = new Blob([csv], { type: 'text/csv' });
        downloadBlob(blob, `${title.toLowerCase().replace(/\s+/g, '-')}.csv`);
      }
    }
  };

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fadeIn"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-5xl bg-gray-900 rounded-2xl shadow-xl border border-gray-800 overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {subtitle && (
              <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            {chart && (
              <div className="flex bg-gray-800 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('chart')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewMode === 'chart'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <ChartBarIcon className="w-4 h-4" />
                  Chart
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewMode === 'table'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <TableCellsIcon className="w-4 h-4" />
                  Table
                </button>
              </div>
            )}

            {/* Export */}
            <div className="relative group">
              <button className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800">
                <ArrowDownTrayIcon className="w-5 h-5" />
              </button>
              <div className="absolute right-0 top-full mt-1 py-1 bg-gray-800 rounded-lg shadow-lg border border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[120px]">
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                  Export JSON
                </button>
              </div>
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {searchable && viewMode === 'table' && (
          <div className="px-4 py-3 border-b border-gray-800">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full mx-auto" />
              <p className="mt-4 text-gray-400">Loading...</p>
            </div>
          ) : viewMode === 'chart' && chart ? (
            <div className="p-4">{chart}</div>
          ) : sortedData.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {searchQuery ? 'No results found' : emptyMessage}
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-900 z-10">
                <tr className="border-b border-gray-800">
                  {playable && (
                    <th className="w-12 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    </th>
                  )}
                  {columns.map((col) => (
                    <th
                      key={col.key.toString()}
                      className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase ${
                        col.sortable ? 'cursor-pointer hover:text-white' : ''
                      }`}
                      style={{ width: col.width }}
                      onClick={() => col.sortable && handleSort(col.key.toString())}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {col.sortable && sortColumn === col.key && (
                          sortDirection === 'asc' ? (
                            <ChevronUpIcon className="w-3 h-3" />
                          ) : (
                            <ChevronDownIcon className="w-3 h-3" />
                          )
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedData.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="hover:bg-gray-800/50 transition-colors group"
                  >
                    {playable && getPlayableData && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handlePlay(row)}
                          className="p-1.5 rounded-full bg-pink-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <PlayIconSolid className="w-3 h-3" />
                        </button>
                      </td>
                    )}
                    {columns.map((col) => {
                      const value = row[col.key as keyof T];
                      return (
                        <td
                          key={col.key.toString()}
                          className="px-4 py-3 text-sm text-gray-300"
                        >
                          {col.render ? col.render(value, row) : String(value ?? '-')}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {searchQuery && sortedData.length !== data.length
              ? `Showing ${sortedData.length} of ${data.length} items`
              : `${data.length} items`}
          </p>
        </div>
      </div>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// Helper functions
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function convertToCSV<T extends Record<string, any>>(
  data: T[],
  columns: Column<T>[]
): string {
  const headers = columns.map((c) => c.label).join(',');
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key as keyof T];
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(',')
  );
  return [headers, ...rows].join('\n');
}

// Expand button component for chart cards
interface ExpandButtonProps {
  onClick: () => void;
  className?: string;
}

export function ExpandButton({ onClick, className = '' }: ExpandButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors ${className}`}
      title="Expand"
    >
      <ArrowsPointingOutIcon className="w-4 h-4" />
    </button>
  );
}

// Helper hook for managing modal state
export function useDetailModal<T>() {
  const [isOpen, setIsOpen] = useState(false);
  const [modalData, setModalData] = useState<T[]>([]);
  const [modalTitle, setModalTitle] = useState('');

  const openModal = useCallback((data: T[], title: string) => {
    setModalData(data);
    setModalTitle(title);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    modalData,
    modalTitle,
    openModal,
    closeModal,
  };
}
