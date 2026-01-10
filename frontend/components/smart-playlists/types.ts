// Smart Playlist Types

export interface Condition {
  id: string;
  field: string;
  operator: string;
  value: any;
}

export interface ConditionGroup {
  id: string;
  match: 'all' | 'any';
  conditions: (Condition | ConditionGroup)[];
}

export interface SmartPlaylistForm {
  name: string;
  description: string;
  rules: ConditionGroup;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  limitCount: number | null;
}

export interface SmartPlaylist {
  playlist_id: string;
  name: string;
  description: string | null;
  rules: any;
  sort_by: string;
  sort_order: string;
  limit_count: number | null;
  created_at: string;
  updated_at: string;
  last_refreshed_at: string | null;
  auto_refresh: boolean;
  song_count: number;
  total_duration_sec: number;
  is_template: boolean;
  template_category: string | null;
}

export interface SmartPlaylistSong {
  sha_id: string;
  title: string;
  artist: string;
  album: string | null;
  album_id: string | null;
  duration_sec: number;
  position: number;
  release_year: number | null;
  artists: string[];
  artist_ids: string[];
  primary_artist_id: string | null;
}

export interface Template {
  playlist_id: string;
  name: string;
  description: string;
  category: string;
  rules: any;
}

// Field definitions for the rule builder
export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'similarity';

export interface FieldDefinition {
  label: string;
  type: FieldType;
  category: 'metadata' | 'playback' | 'preference' | 'audio' | 'advanced';
  description?: string;
}

export const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  title: { label: 'Title', type: 'string', category: 'metadata', description: 'Song title' },
  artist: { label: 'Artist', type: 'string', category: 'metadata', description: 'Artist name' },
  album: { label: 'Album', type: 'string', category: 'metadata', description: 'Album name' },
  genre: { label: 'Genre', type: 'string', category: 'metadata', description: 'Music genre' },
  release_year: { label: 'Release Year', type: 'number', category: 'metadata', description: 'Year released' },
  duration_sec: { label: 'Duration', type: 'number', category: 'metadata', description: 'Length in seconds' },
  track_number: { label: 'Track Number', type: 'number', category: 'metadata', description: 'Position on album' },
  added_at: { label: 'Date Added', type: 'date', category: 'metadata', description: 'When added to library' },
  verified: { label: 'Verified', type: 'boolean', category: 'metadata', description: 'Metadata verified' },
  play_count: { label: 'Play Count', type: 'number', category: 'playback', description: 'Total times played' },
  last_played: { label: 'Last Played', type: 'date', category: 'playback', description: 'Most recent play' },
  skip_count: { label: 'Skip Count', type: 'number', category: 'playback', description: 'Times skipped' },
  completion_rate: { label: 'Completion Rate', type: 'number', category: 'playback', description: 'Average % completed' },
  last_week_plays: { label: 'Plays Last Week', type: 'number', category: 'playback', description: 'Plays in the last 7 days' },
  trending: { label: 'Trending', type: 'boolean', category: 'playback', description: 'Plays are increasing' },
  declining: { label: 'Declining', type: 'boolean', category: 'playback', description: 'Plays are decreasing' },
  is_liked: { label: 'Is Liked', type: 'boolean', category: 'preference', description: 'Song is liked' },
  is_disliked: { label: 'Is Disliked', type: 'boolean', category: 'preference', description: 'Song is disliked' },
  has_embedding: { label: 'Has Embedding', type: 'boolean', category: 'audio', description: 'Audio analyzed' },
  bpm: { label: 'BPM', type: 'number', category: 'audio', description: 'Beats per minute (60-180)' },
  energy: { label: 'Energy', type: 'number', category: 'audio', description: 'Energy score (0-100)' },
  key: { label: 'Key', type: 'string', category: 'audio', description: 'Musical key (C, C#, D, etc.)' },
  key_mode: { label: 'Key Mode', type: 'string', category: 'audio', description: 'Major or Minor' },
  key_camelot: { label: 'Camelot Key', type: 'string', category: 'audio', description: 'DJ-friendly key notation (8A, 11B, etc.)' },
  danceability: { label: 'Danceability', type: 'number', category: 'audio', description: 'Danceability score (0-100)' },
  acousticness: { label: 'Acousticness', type: 'number', category: 'audio', description: 'Acoustic vs electronic (0-100, 100=acoustic)' },
  instrumentalness: { label: 'Instrumentalness', type: 'number', category: 'audio', description: 'Vocal presence (0-100, 100=instrumental)' },
  mood: { label: 'Mood', type: 'string', category: 'audio', description: 'Primary mood (happy, sad, energetic, calm, etc.)' },
  similar_to: { label: 'Similar To', type: 'similarity', category: 'advanced', description: 'Top similar songs to a seed' },
};

// Operators by field type
export const OPERATORS_BY_TYPE: Record<FieldType, { value: string; label: string }[]> = {
  string: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'ends_with', label: 'ends with' },
    { value: 'same_as', label: 'same as playlist' },
    { value: 'in_list', label: 'is one of' },
    { value: 'not_in_list', label: 'is not one of' },
    { value: 'is_null', label: 'is empty' },
    { value: 'is_not_null', label: 'is not empty' },
  ],
  number: [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'greater', label: 'is greater than' },
    { value: 'greater_or_equal', label: 'is at least' },
    { value: 'less', label: 'is less than' },
    { value: 'less_or_equal', label: 'is at most' },
    { value: 'between', label: 'is between' },
    { value: 'years_ago', label: 'is at least years ago' },
    { value: 'is_null', label: 'is empty' },
    { value: 'is_not_null', label: 'is not empty' },
  ],
  date: [
    { value: 'within_days', label: 'is within the last' },
    { value: 'before', label: 'is before' },
    { value: 'after', label: 'is after' },
    { value: 'between', label: 'is between' },
    { value: 'never', label: 'never occurred' },
    { value: 'is_null', label: 'is empty' },
    { value: 'is_not_null', label: 'is not empty' },
  ],
  boolean: [
    { value: 'is_true', label: 'is true' },
    { value: 'is_false', label: 'is false' },
  ],
  similarity: [
    { value: 'top_n', label: 'top similar songs' },
  ],
};

// Helper to generate unique IDs
export const generateId = () => Math.random().toString(36).substring(2, 11);

// Helper to create empty condition
export const createEmptyCondition = (): Condition => ({
  id: generateId(),
  field: 'title',
  operator: 'contains',
  value: '',
});

// Helper to create empty group
export const createEmptyGroup = (): ConditionGroup => ({
  id: generateId(),
  match: 'all',
  conditions: [createEmptyCondition()],
});

// Sort options
export const SORT_OPTIONS = [
  { value: 'added_at', label: 'Date Added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'release_year', label: 'Release Year' },
  { value: 'duration_sec', label: 'Duration' },
  { value: 'play_count', label: 'Play Count' },
  { value: 'last_played', label: 'Last Played' },
  { value: 'last_week_plays', label: 'Plays Last Week' },
  { value: 'bpm', label: 'BPM' },
  { value: 'energy', label: 'Energy' },
  { value: 'danceability', label: 'Danceability' },
  { value: 'acousticness', label: 'Acousticness' },
  { value: 'mood', label: 'Mood' },
  { value: 'random', label: 'Random' },
];
