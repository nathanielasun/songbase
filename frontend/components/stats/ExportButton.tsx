'use client';

import { useState, useRef } from 'react';
import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  TableCellsIcon,
  PhotoIcon,
  DocumentIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

type ExportFormat = 'json' | 'csv' | 'png' | 'pdf';
type ReportType = 'overview' | 'library' | 'listening' | 'audio' | 'discoveries' | 'full';

interface ExportButtonProps {
  /** The report type to export */
  reportType?: ReportType;
  /** Period for the export */
  period?: string;
  /** Reference to element to capture for PNG export */
  captureRef?: React.RefObject<HTMLElement>;
  /** Available export formats */
  formats?: ExportFormat[];
  /** Custom filename prefix */
  filename?: string;
  /** Additional class names */
  className?: string;
  /** Button variant */
  variant?: 'default' | 'compact' | 'icon-only';
  /** Callback when export starts */
  onExportStart?: (format: ExportFormat) => void;
  /** Callback when export completes */
  onExportComplete?: (format: ExportFormat, success: boolean) => void;
}

interface ExportOption {
  format: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    format: 'json',
    label: 'JSON',
    description: 'Structured data',
    icon: <DocumentTextIcon className="w-4 h-4" />,
  },
  {
    format: 'csv',
    label: 'CSV',
    description: 'Spreadsheet format',
    icon: <TableCellsIcon className="w-4 h-4" />,
  },
  {
    format: 'png',
    label: 'PNG',
    description: 'Image snapshot',
    icon: <PhotoIcon className="w-4 h-4" />,
  },
  {
    format: 'pdf',
    label: 'PDF',
    description: 'Print-ready document',
    icon: <DocumentIcon className="w-4 h-4" />,
  },
];

/**
 * ExportButton - Dropdown button for exporting stats in various formats
 *
 * Supports:
 * - JSON: Raw structured data download
 * - CSV: Spreadsheet-compatible format
 * - PNG: Screenshot of the current view
 * - PDF: Print-ready document (opens print dialog)
 */
export default function ExportButton({
  reportType = 'overview',
  period = 'month',
  captureRef,
  formats = ['json', 'csv', 'png', 'pdf'],
  filename,
  className = '',
  variant = 'default',
  onExportStart,
  onExportComplete,
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const availableOptions = EXPORT_OPTIONS.filter((opt) => formats.includes(opt.format));

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    setIsOpen(false);
    onExportStart?.(format);

    try {
      switch (format) {
        case 'json':
          await exportJson();
          break;
        case 'csv':
          await exportCsv();
          break;
        case 'png':
          await exportPng();
          break;
        case 'pdf':
          await exportPdf();
          break;
      }
      onExportComplete?.(format, true);
    } catch (error) {
      console.error(`Export failed (${format}):`, error);
      onExportComplete?.(format, false);
    } finally {
      setExporting(null);
    }
  };

  const exportJson = async () => {
    const response = await fetch(
      `/api/export/report/${reportType}?format=json&period=${period}`
    );
    if (!response.ok) throw new Error('Failed to fetch data');

    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(blob, `${getFilename()}.json`);
  };

  const exportCsv = async () => {
    const response = await fetch(
      `/api/export/report/${reportType}?format=csv&period=${period}`
    );
    if (!response.ok) throw new Error('Failed to fetch data');

    const blob = await response.blob();
    downloadBlob(blob, `${getFilename()}.csv`);
  };

  const exportPng = async () => {
    const element = captureRef?.current;
    if (!element) {
      // Fallback: capture the main content area
      const mainContent = document.querySelector('main') as HTMLElement;
      if (!mainContent) {
        throw new Error('No element to capture');
      }
      await captureElementAsPng(mainContent);
    } else {
      await captureElementAsPng(element);
    }
  };

  const captureElementAsPng = async (element: HTMLElement) => {
    // Dynamic import of html2canvas for PNG export
    try {
      const html2canvas = (await import('html2canvas')).default;

      const canvas = await html2canvas(element, {
        backgroundColor: '#111827', // gray-900
        scale: 2, // Higher resolution
        logging: false,
        useCORS: true,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${getFilename()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // Fallback if html2canvas is not available
      console.warn('html2canvas not available, opening print dialog instead');
      window.print();
    }
  };

  const exportPdf = async () => {
    // Open print dialog for PDF export
    // This allows users to save as PDF using their browser's print-to-PDF feature
    window.print();
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getFilename = () => {
    if (filename) return filename;
    const date = new Date().toISOString().split('T')[0];
    return `songbase_${reportType}_${period}_${date}`;
  };

  // Close dropdown when clicking outside
  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  };

  // Add/remove click listener
  if (typeof window !== 'undefined') {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
  }

  if (variant === 'icon-only') {
    return (
      <div ref={dropdownRef} className={`relative ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
          title="Export"
        >
          {exporting ? (
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <ArrowDownTrayIcon className="w-5 h-5" />
          )}
        </button>

        {isOpen && (
          <ExportDropdown options={availableOptions} onSelect={handleExport} />
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div ref={dropdownRef} className={`relative ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
        >
          {exporting ? (
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <ArrowDownTrayIcon className="w-4 h-4" />
          )}
          <span>Export</span>
          <ChevronDownIcon className="w-3 h-3" />
        </button>

        {isOpen && (
          <ExportDropdown options={availableOptions} onSelect={handleExport} />
        )}
      </div>
    );
  }

  // Default variant
  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={exporting !== null}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {exporting ? (
          <>
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span>Exporting...</span>
          </>
        ) : (
          <>
            <ArrowDownTrayIcon className="w-5 h-5" />
            <span>Export</span>
            <ChevronDownIcon className="w-4 h-4" />
          </>
        )}
      </button>

      {isOpen && (
        <ExportDropdown options={availableOptions} onSelect={handleExport} />
      )}
    </div>
  );
}

interface ExportDropdownProps {
  options: ExportOption[];
  onSelect: (format: ExportFormat) => void;
}

function ExportDropdown({ options, onSelect }: ExportDropdownProps) {
  return (
    <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-1 z-50">
      {options.map((option) => (
        <button
          key={option.format}
          onClick={() => onSelect(option.format)}
          className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-700 transition-colors"
        >
          <span className="text-gray-400">{option.icon}</span>
          <div>
            <p className="text-sm font-medium text-white">{option.label}</p>
            <p className="text-xs text-gray-500">{option.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

/**
 * QuickExportButton - A simpler single-format export button
 */
interface QuickExportButtonProps {
  format: ExportFormat;
  reportType?: ReportType;
  period?: string;
  captureRef?: React.RefObject<HTMLElement>;
  className?: string;
  children?: React.ReactNode;
}

export function QuickExportButton({
  format,
  reportType = 'overview',
  period = 'month',
  captureRef,
  className = '',
  children,
}: QuickExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const option = EXPORT_OPTIONS.find((o) => o.format === format);

  const handleExport = async () => {
    setExporting(true);
    try {
      if (format === 'json' || format === 'csv') {
        const response = await fetch(
          `/api/export/report/${reportType}?format=${format}&period=${period}`
        );
        if (!response.ok) throw new Error('Failed to fetch data');

        const blob = await response.blob();
        const date = new Date().toISOString().split('T')[0];
        const filename = `songbase_${reportType}_${period}_${date}.${format}`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else if (format === 'png' && captureRef?.current) {
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(captureRef.current, {
          backgroundColor: '#111827',
          scale: 2,
          logging: false,
          useCORS: true,
        });
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        link.download = `songbase_${reportType}_${period}_${date}.png`;
        link.href = dataUrl;
        link.click();
      } else if (format === 'pdf') {
        window.print();
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors disabled:opacity-50 ${className}`}
    >
      {exporting ? (
        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      ) : (
        option?.icon
      )}
      <span>{children || option?.label}</span>
    </button>
  );
}

/**
 * ExportHistoryButton - Specialized button for exporting play history
 */
interface ExportHistoryButtonProps {
  format?: 'json' | 'csv';
  period?: string;
  limit?: number;
  className?: string;
}

export function ExportHistoryButton({
  format = 'csv',
  period = 'all',
  limit = 10000,
  className = '',
}: ExportHistoryButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch(
        `/api/export/history?format=${format}&period=${period}&limit=${limit}`
      );
      if (!response.ok) throw new Error('Failed to fetch data');

      const blob = await response.blob();
      const date = new Date().toISOString().split('T')[0];
      const filename = `songbase_history_${period}_${date}.${format}`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 text-white transition-colors disabled:opacity-50 ${className}`}
    >
      {exporting ? (
        <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
        <ArrowDownTrayIcon className="w-5 h-5" />
      )}
      <span>Export History ({format.toUpperCase()})</span>
    </button>
  );
}
