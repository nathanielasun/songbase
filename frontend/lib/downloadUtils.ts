import { Song } from './types';

/**
 * Helper to trigger a download from a blob
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Extract filename from Content-Disposition header
 */
function getFilenameFromHeader(response: Response, defaultFilename: string): string {
  const contentDisposition = response.headers.get('Content-Disposition');
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="(.+)"/);
    if (filenameMatch) {
      return filenameMatch[1];
    }
  }
  return defaultFilename;
}

/**
 * Downloads a song from the backend with ID3 metadata included
 */
export async function downloadSong(song: Song): Promise<void> {
  try {
    const response = await fetch(`/api/library/download/song/${song.hashId}`);
    if (!response.ok) {
      throw new Error('Download failed');
    }

    const blob = await response.blob();
    const filename = getFilenameFromHeader(response, `${song.artist} - ${song.title}.mp3`);
    triggerDownload(blob, filename);
  } catch (error) {
    console.error('Download failed:', error);
    alert('Failed to download song');
  }
}

/**
 * Downloads an album as a zip file with all songs including ID3 metadata
 */
export async function downloadAlbum(albumId: string, albumTitle: string, artistName?: string): Promise<void> {
  try {
    const response = await fetch(`/api/library/download/album/${albumId}`);
    if (!response.ok) {
      throw new Error('Download failed');
    }

    const blob = await response.blob();
    const defaultFilename = artistName
      ? `${artistName} - ${albumTitle}.zip`
      : `${albumTitle}.zip`;
    const filename = getFilenameFromHeader(response, defaultFilename);
    triggerDownload(blob, filename);
  } catch (error) {
    console.error('Album download failed:', error);
    alert('Failed to download album');
  }
}

/**
 * Downloads multiple songs as a zip file (for playlists)
 */
export async function downloadPlaylist(
  songs: Song[],
  playlistName: string
): Promise<void> {
  try {
    const songIds = songs.map(s => s.hashId).filter(Boolean);
    if (songIds.length === 0) {
      alert('No songs to download');
      return;
    }

    const response = await fetch('/api/library/download/songs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        song_ids: songIds,
        archive_name: playlistName,
      }),
    });

    if (!response.ok) {
      throw new Error('Download failed');
    }

    const blob = await response.blob();
    const filename = getFilenameFromHeader(response, `${playlistName}.zip`);
    triggerDownload(blob, filename);
  } catch (error) {
    console.error('Playlist download failed:', error);
    alert('Failed to download playlist');
  }
}
