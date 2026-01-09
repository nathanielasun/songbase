'use client';

import Link from 'next/link';
import { ArtistRef } from '@/lib/types';

interface ArtistLinksProps {
  artists?: ArtistRef[];
  fallbackArtist?: string;
  fallbackArtistId?: string;
  className?: string;
  linkClassName?: string;
  separator?: string;
}

export default function ArtistLinks({
  artists,
  fallbackArtist,
  fallbackArtistId,
  className = 'text-gray-400 truncate',
  linkClassName = 'hover:text-white hover:underline',
  separator = ', ',
}: ArtistLinksProps) {
  // If we have artists array with IDs, render clickable links
  if (artists && artists.length > 0) {
    return (
      <span className={className}>
        {artists.map((artist, idx) => (
          <span key={artist.id || idx}>
            {artist.id ? (
              <Link
                href={`/artist/${artist.id}`}
                onClick={(e) => e.stopPropagation()}
                className={linkClassName}
              >
                {artist.name}
              </Link>
            ) : (
              <span>{artist.name}</span>
            )}
            {idx < artists.length - 1 && separator}
          </span>
        ))}
      </span>
    );
  }

  // Fallback: single artist string with optional ID
  if (fallbackArtistId) {
    return (
      <Link
        href={`/artist/${fallbackArtistId}`}
        onClick={(e) => e.stopPropagation()}
        className={`${className} ${linkClassName}`}
      >
        {fallbackArtist || 'Unknown Artist'}
      </Link>
    );
  }

  // No clickable link available
  return (
    <span className={className}>
      {fallbackArtist || 'Unknown Artist'}
    </span>
  );
}
