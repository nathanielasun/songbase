export interface Artist {
  id: string;
  name: string;
  bio?: string;
  imageUrl?: string;
  genres?: string[];
}

// Lightweight artist reference for song listings
export interface ArtistRef {
  id: string;
  name: string;
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  type: 'album' | 'ep' | 'single';
  releaseDate?: Date;
  coverArt?: string;
  genres?: string[];
}

export interface Song {
  id: string;
  hashId: string;
  title: string;
  artist: string;           // Display string (for backward compat)
  artistId?: string;        // Primary artist ID (for backward compat)
  artists?: ArtistRef[];    // All artists with their IDs
  album?: string;
  albumId?: string;
  duration: number;
  albumArt?: string;
  filePath?: string;
  liked?: boolean;
  disliked?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverArt?: string;
  songs: Song[];
  createdAt: Date;
  updatedAt: Date;
}

export type RepeatMode = 'off' | 'once' | 'all';

export interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  queue: Song[];
  currentPlaylist: Playlist | null;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
}
