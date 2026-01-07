'use client';

import { useEffect } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface ToastProps {
  message: string;
  onClose: () => void;
}

export default function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 animate-toast">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl px-4 py-3 flex items-center gap-3 min-w-[300px]">
        <CheckCircleIcon className="w-5 h-5 text-pink-500 flex-shrink-0" />
        <p className="text-white text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}
