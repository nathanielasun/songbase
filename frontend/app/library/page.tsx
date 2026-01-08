'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  QueueListIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';

type QueueItem = {
  queue_id: number;
  title: string;
  artist?: string | null;
  album?: string | null;
  genre?: string | null;
  search_query?: string | null;
  source_url?: string | null;
  status: string;
  download_path?: string | null;
  sha_id?: string | null;
  stored_path?: string | null;
  attempts?: number | null;
  last_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  downloaded_at?: string | null;
  processed_at?: string | null;
  hashed_at?: string | null;
  embedded_at?: string | null;
  stored_at?: string | null;
};

type LibraryStats = {
  songs: number;
  verified_songs: number;
  embeddings: number;
  queue: Record<string, number>;
  last_updated?: string;
};

type PipelineStatus = {
  running: boolean;
  started_at?: string | null;
  finished_at?: string | null;
  last_error?: string | null;
  last_config?: Record<string, unknown> | null;
  events?: Record<string, unknown>[];
};

type SourceItem = {
  title: string;
  artist?: string | null;
  album?: string | null;
  genre?: string | null;
  search_query?: string | null;
  source_url?: string | null;
  queued?: boolean | null;
  queue_status?: string | null;
};

type SourceResponse = {
  items: SourceItem[];
  total: number;
  path: string;
  queue_available: boolean;
  last_seeded_at?: string | null;
};

type PipelineForm = {
  downloadLimit: string;
  processLimit: string;
  download: boolean;
  verify: boolean;
  images: boolean;
  runUntilEmpty: boolean;
};

type SettingsSnapshot = {
  paths: {
    preprocessed_cache_dir: string;
    song_cache_dir: string;
    metadata_dir: string;
  };
  pipeline: {
    download_limit: number | null;
    process_limit: number | null;
    verify: boolean;
    images: boolean;
  };
};

type MetadataTaskState = {
  running: boolean;
  started_at?: string | null;
  finished_at?: string | null;
  last_error?: string | null;
  last_result?: Record<string, unknown> | null;
  last_config?: Record<string, unknown> | null;
};

type MetadataStatus = {
  verification: MetadataTaskState;
  images: MetadataTaskState;
};

type UnlinkedSong = {
  sha_id: string;
  title: string;
  artist?: string | null;
  album?: string | null;
};

type UnlinkedResponse = {
  items: UnlinkedSong[];
  total: number;
  limit: number;
  offset: number;
};

type AlbumCatalogItem = {
  album_id: string;
  title: string;
  artist_name?: string | null;
  artist_id?: number | null;
  release_year?: number | null;
  track_count?: number | null;
  song_count?: number | null;
};

type AlbumCatalogResponse = {
  items: AlbumCatalogItem[];
  total: number;
  limit: number;
  offset: number;
  query?: string | null;
};

const statusStyles: Record<string, string> = {
  pending: 'bg-gray-700 text-gray-200',
  downloading: 'bg-blue-600 text-white',
  downloaded: 'bg-indigo-600 text-white',
  pcm_raw_ready: 'bg-yellow-600 text-black',
  hashed: 'bg-orange-500 text-black',
  embedded: 'bg-emerald-600 text-white',
  stored: 'bg-green-600 text-white',
  duplicate: 'bg-teal-600 text-white',
  failed: 'bg-red-600 text-white',
};

const tabs = [
  { id: 'manage', label: 'Manage Music' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'stats', label: 'Database' },
] as const;

type TabId = (typeof tabs)[number]['id'];

const emptyStats: LibraryStats = {
  songs: 0,
  verified_songs: 0,
  embeddings: 0,
  queue: {},
};

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<TabId>('manage');
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const [sourceMeta, setSourceMeta] = useState<SourceResponse | null>(null);
  const [stats, setStats] = useState<LibraryStats>(emptyStats);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({
    running: false,
  });
  const [metadataStatus, setMetadataStatus] = useState<MetadataStatus>({
    verification: { running: false },
    images: { running: false },
  });
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [queuePage, setQueuePage] = useState(1);
  const [queuePageSize, setQueuePageSize] = useState(25);
  const [unlinkedSongs, setUnlinkedSongs] = useState<UnlinkedSong[]>([]);
  const [unlinkedTotal, setUnlinkedTotal] = useState(0);
  const [albumCatalog, setAlbumCatalog] = useState<AlbumCatalogItem[]>([]);
  const [albumSearch, setAlbumSearch] = useState('');
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(true);
  const [isSourcesCollapsed, setIsSourcesCollapsed] = useState(true);

  const [searchTitle, setSearchTitle] = useState('');
  const [searchArtist, setSearchArtist] = useState('');
  const [searchUrl, setSearchUrl] = useState('');
  const [bulkList, setBulkList] = useState('');
  const [appendSources, setAppendSources] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [pipelineForm, setPipelineForm] = useState<PipelineForm>({
    downloadLimit: '8',
    processLimit: '8',
    download: true,
    verify: true,
    images: true,
    runUntilEmpty: false,
  });
  const [verifyForm, setVerifyForm] = useState({
    limit: '',
    minScore: '',
    rateLimit: '',
    dryRun: false,
  });
  const [imageForm, setImageForm] = useState({
    limitSongs: '',
    limitArtists: '',
    rateLimit: '',
    dryRun: false,
  });
  const [liveVerificationStatus, setLiveVerificationStatus] = useState<string[]>([]);
  const [verificationInProgress, setVerificationInProgress] = useState(false);
  const liveStatusRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new status messages arrive
  useEffect(() => {
    if (liveStatusRef.current && verificationInProgress) {
      liveStatusRef.current.scrollTop = liveStatusRef.current.scrollHeight;
    }
  }, [liveVerificationStatus, verificationInProgress]);

  const queueSummary = useMemo(() => {
    const queueCounts = stats.queue || {};
    const total = Object.values(queueCounts).reduce((sum, value) => sum + value, 0);
    const pending = queueCounts.pending ?? 0;
    const downloading = queueCounts.downloading ?? 0;
    return { total, pending, downloading };
  }, [stats.queue]);

  const queueTotal = queueSummary.total || queueItems.length;

  const queuePageCount = useMemo(() => {
    if (!queueTotal) {
      return 1;
    }
    return Math.max(1, Math.ceil(queueTotal / queuePageSize));
  }, [queuePageSize, queueTotal]);

  const queueOffset = (queuePage - 1) * queuePageSize;

  const lastEvent = useMemo(() => {
    const events = pipelineStatus.events ?? [];
    return events.length ? events[events.length - 1] : null;
  }, [pipelineStatus.events]);

  const pipelineConfig = useMemo(() => {
    const config = pipelineStatus.last_config?.config;
    return (config as Record<string, unknown>) || {};
  }, [pipelineStatus.last_config]);

  const pipelinePaths = useMemo(() => {
    const paths = pipelineStatus.last_config?.paths;
    return (paths as Record<string, unknown>) || {};
  }, [pipelineStatus.last_config]);

  const visibleSourceItems = useMemo(() => {
    if (!sourceMeta?.queue_available) {
      return sourceItems;
    }
    return sourceItems.filter((item) => !(item.queued || item.queue_status));
  }, [sourceItems, sourceMeta?.queue_available]);

  const sourceTotal = sourceMeta?.total ?? sourceItems.length;
  const sourceRemaining = visibleSourceItems.length;
  const sourceQueued = sourceMeta?.queue_available
    ? Math.max(0, sourceTotal - sourceRemaining)
    : 0;

  const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
    }
    return response.json();
  };

  const refreshQueue = useCallback(async () => {
    try {
      const data = await fetchJson<QueueItem[]>(
        `/api/library/queue?limit=${queuePageSize}&offset=${queueOffset}`
      );
      setQueueItems(data);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to load queue.');
    }
  }, [queueOffset, queuePageSize]);

  const refreshStats = useCallback(async () => {
    try {
      const data = await fetchJson<LibraryStats>('/api/library/stats');
      setStats(data);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to load stats.');
    }
  }, []);

  const refreshPipeline = useCallback(async () => {
    try {
      const data = await fetchJson<PipelineStatus>('/api/library/pipeline/status?events_limit=25');
      setPipelineStatus(data);
      setActionError(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to load pipeline status.'
      );
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const data = await fetchJson<SettingsSnapshot>('/api/settings');
      setSettings(data);
      setActionError(null);
      setPipelineForm((prev) => ({
        ...prev,
        downloadLimit: data.pipeline.download_limit?.toString() ?? prev.downloadLimit,
        processLimit: data.pipeline.process_limit?.toString() ?? prev.processLimit,
        verify: data.pipeline.verify ?? prev.verify,
        images: data.pipeline.images ?? prev.images,
      }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to load settings.');
    }
  }, []);

  const refreshSources = useCallback(async () => {
    try {
      const data = await fetchJson<SourceResponse>('/api/library/sources?limit=200');
      setSourceItems(data.items);
      setSourceMeta(data);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to load sources.');
    }
  }, []);

  const refreshMetadataStatus = useCallback(async () => {
    try {
      const data = await fetchJson<MetadataStatus>('/api/library/metadata/status');
      setMetadataStatus(data);
      setActionError(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to load metadata status.'
      );
    }
  }, []);

  const refreshUnlinked = useCallback(async () => {
    try {
      const data = await fetchJson<UnlinkedResponse>(
        '/api/library/songs/unlinked?limit=25&offset=0'
      );
      setUnlinkedSongs(data.items);
      setUnlinkedTotal(data.total);
      setLinkError(null);
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : 'Failed to load unlinked songs.');
    }
  }, []);

  const refreshAlbumCatalog = useCallback(
    async (query: string) => {
      const params = new URLSearchParams({ limit: '20', offset: '0' });
      if (query.trim()) {
        params.set('q', query.trim());
      }
      try {
        const data = await fetchJson<AlbumCatalogResponse>(
          `/api/library/albums?${params.toString()}`
        );
        setAlbumCatalog(data.items);
        setLinkError(null);
      } catch (error) {
        setLinkError(
          error instanceof Error ? error.message : 'Failed to load album catalog.'
        );
      }
    },
    []
  );

  useEffect(() => {
    refreshStats();
    refreshPipeline();
    refreshSettings();
    refreshSources();
  }, [refreshPipeline, refreshSettings, refreshStats, refreshSources]);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (activeTab !== 'downloads') return;
    const interval = window.setInterval(() => {
      refreshQueue();
      refreshPipeline();
      refreshSources();
      refreshStats();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [activeTab, refreshPipeline, refreshQueue, refreshSources, refreshStats]);

  useEffect(() => {
    if (activeTab !== 'stats') return;
    refreshStats();
    refreshMetadataStatus();
    refreshUnlinked();
    refreshAlbumCatalog(albumSearch);
  }, [activeTab, refreshAlbumCatalog, refreshMetadataStatus, refreshStats, refreshUnlinked]);

  useEffect(() => {
    if (activeTab !== 'stats') return;
    const timeout = window.setTimeout(() => {
      refreshAlbumCatalog(albumSearch);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [activeTab, albumSearch, refreshAlbumCatalog]);

  useEffect(() => {
    if (activeTab !== 'stats') return;
    if (!metadataStatus.verification.running && !metadataStatus.images.running) {
      return;
    }
    const interval = window.setInterval(() => {
      refreshMetadataStatus();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [
    activeTab,
    metadataStatus.images.running,
    metadataStatus.verification.running,
    refreshMetadataStatus,
  ]);

  useEffect(() => {
    if (queuePage > queuePageCount) {
      setQueuePage(queuePageCount);
    }
  }, [queuePage, queuePageCount]);

  const formatTimestamp = (value?: string | null) => {
    if (!value) {
      return '--';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  };

  const formatValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') {
      return '--';
    }
    return String(value);
  };

  const formatBool = (value: unknown) => {
    if (value === null || value === undefined) {
      return '--';
    }
    return value ? 'Yes' : 'No';
  };

  const formatDuration = (ms: number | null) => {
    if (!ms || ms < 0) {
      return '--';
    }
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const parseOptionalNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return parsed;
  };

  const elapsedMs = pipelineStatus.started_at
    ? Date.now() - new Date(pipelineStatus.started_at).getTime()
    : null;
  const verificationResult = metadataStatus.verification?.last_result as
    | Record<string, unknown>
    | null;
  const imageResult = metadataStatus.images?.last_result as Record<string, unknown> | null;

  const handleQueueSingle = async () => {
    setActionMessage(null);
    setActionError(null);
    const title = searchTitle.trim();
    if (!title) {
      setActionError('Enter a song title or search query.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        items: [
          {
            title,
            artist: searchArtist.trim() || undefined,
            search_query: title,
            source_url: searchUrl.trim() || undefined,
          },
        ],
        append_sources: appendSources,
      };
      const result = await fetchJson<{ queued: number }>(
        '/api/library/queue',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      setActionMessage(`Queued ${result.queued} song(s).`);
      setSearchTitle('');
      setSearchArtist('');
      setSearchUrl('');
      refreshQueue();
      refreshStats();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Queue request failed.');
    } finally {
      setBusy(false);
    }
  };

  const parseBulkLines = (text: string) => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (line.includes('|')) {
          const [title, artist, album] = line.split('|').map((part) => part.trim());
          return {
            title,
            artist: artist || undefined,
            album: album || undefined,
            search_query: title,
          };
        }
        const dashed = line.split(' - ');
        if (dashed.length >= 2) {
          const [artist, ...titleParts] = dashed;
          const title = titleParts.join(' - ').trim();
          return {
            title,
            artist: artist.trim() || undefined,
            search_query: title,
          };
        }
        return { title: line, search_query: line };
      });
  };

  const handleQueueBulk = async () => {
    setActionMessage(null);
    setActionError(null);
    const items = parseBulkLines(bulkList);
    if (items.length === 0) {
      setActionError('Add at least one song line before queueing.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        items,
        append_sources: appendSources,
      };
      const result = await fetchJson<{ queued: number }>(
        '/api/library/queue',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      setActionMessage(`Queued ${result.queued} song(s).`);
      setBulkList('');
      refreshQueue();
      refreshStats();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Bulk queue failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRunPipeline = async () => {
    setActionMessage(null);
    setActionError(null);
    setBusy(true);
    try {
      const payload = {
        seed_sources: false,
        download: pipelineForm.download,
        download_limit: pipelineForm.downloadLimit ? Number(pipelineForm.downloadLimit) : undefined,
        process_limit: pipelineForm.processLimit ? Number(pipelineForm.processLimit) : undefined,
        verify: pipelineForm.verify,
        images: pipelineForm.images,
        run_until_empty: pipelineForm.runUntilEmpty,
      };
      await fetchJson('/api/library/pipeline/run', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setActionMessage('Pipeline started. Status will update automatically.');
      refreshPipeline();
      refreshQueue();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to start pipeline.');
    } finally {
      setBusy(false);
    }
  };

  const handleSeedSources = async () => {
    setActionMessage(null);
    setActionError(null);
    setBusy(true);
    try {
      const result = await fetchJson<{ inserted: number; total: number; last_seeded_at?: string | null }>(
        '/api/library/seed-sources',
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      setActionMessage(
        `Seeded ${result.inserted} of ${result.total} sources into the queue.`
      );
      setSourceMeta((prev) =>
        prev
          ? {
              ...prev,
              last_seeded_at: result.last_seeded_at ?? prev.last_seeded_at,
            }
          : prev
      );
      refreshQueue();
      refreshSources();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to seed sources.jsonl.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleClearSources = async () => {
    const total = sourceMeta?.total ?? sourceItems.length;
    if (
      !window.confirm(
        `Clear ${total} sources from sources.jsonl? This cannot be undone.`
      )
    ) {
      return;
    }
    setActionMessage(null);
    setActionError(null);
    setBusy(true);
    try {
      const result = await fetchJson<{ cleared: number; last_seeded_at?: string | null }>(
        '/api/library/sources/clear',
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      setActionMessage(`Cleared ${result.cleared} sources.jsonl entries.`);
      setSourceMeta((prev) =>
        prev
          ? {
              ...prev,
              total: 0,
              last_seeded_at: result.last_seeded_at ?? prev.last_seeded_at,
            }
          : prev
      );
      setSourceItems([]);
      refreshSources();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to clear sources.jsonl.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleClearQueue = async () => {
    const total = queueTotal;
    if (
      !window.confirm(
        `Clear ${total} queued item(s) from the pipeline queue? This cannot be undone.`
      )
    ) {
      return;
    }
    setActionMessage(null);
    setActionError(null);
    setBusy(true);
    try {
      const result = await fetchJson<{ cleared: number }>(
        '/api/library/queue/clear',
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      setActionMessage(`Cleared ${result.cleared} queued item(s).`);
      refreshQueue();
      refreshStats();
      refreshSources();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to clear the pipeline queue.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyMetadata = async () => {
    setActionMessage(null);
    setActionError(null);
    const limit = parseOptionalNumber(verifyForm.limit);
    const minScore = parseOptionalNumber(verifyForm.minScore);
    const rateLimit = parseOptionalNumber(verifyForm.rateLimit);
    if (
      (verifyForm.limit.trim() && limit === null) ||
      (verifyForm.minScore.trim() && minScore === null) ||
      (verifyForm.rateLimit.trim() && rateLimit === null)
    ) {
      setActionError('Verification settings must be valid numbers.');
      return;
    }

    setMetadataBusy(true);
    setVerificationInProgress(true);
    setLiveVerificationStatus(['Starting metadata verification...']);

    try {
      // Build query parameters for SSE endpoint
      const params = new URLSearchParams();
      if (limit !== null) params.set('limit', limit.toString());
      if (minScore !== null) params.set('min_score', minScore.toString());

      const url = `/api/processing/metadata/verify-stream${params.toString() ? `?${params.toString()}` : ''}`;

      // Connect to SSE endpoint
      const eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'status') {
            // Append status message
            setLiveVerificationStatus((prev) => [...prev, data.message]);
          } else if (data.type === 'complete') {
            // Verification complete
            const albumImagesMsg = data.album_images > 0 ? `, ${data.album_images} album covers` : '';
            const artistImagesMsg = data.artist_images > 0 ? `, ${data.artist_images} artist images` : '';
            setLiveVerificationStatus((prev) => [
              ...prev,
              `\nVerification complete: ${data.verified}/${data.processed} verified, ${data.skipped} skipped${albumImagesMsg}${artistImagesMsg}`,
            ]);
            setActionMessage(`Verification complete: ${data.verified}/${data.processed} verified`);
            eventSource.close();
            setVerificationInProgress(false);
            setMetadataBusy(false);
            refreshMetadataStatus();
            refreshStats();
          } else if (data.type === 'error') {
            // Error occurred
            setLiveVerificationStatus((prev) => [...prev, `\nError: ${data.message}`]);
            setActionError(data.message);
            eventSource.close();
            setVerificationInProgress(false);
            setMetadataBusy(false);
          }
        } catch (parseError) {
          console.error('Failed to parse SSE message:', parseError);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setActionError('Connection to verification stream lost.');
        eventSource.close();
        setVerificationInProgress(false);
        setMetadataBusy(false);
      };

      // Store event source to allow cancellation
      (eventSource as any)._cleanup = () => {
        eventSource.close();
        setVerificationInProgress(false);
        setMetadataBusy(false);
      };
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to start verification.'
      );
      setVerificationInProgress(false);
      setMetadataBusy(false);
    }
  };

  const handleSyncImages = async () => {
    setActionMessage(null);
    setActionError(null);
    const limitSongs = parseOptionalNumber(imageForm.limitSongs);
    const limitArtists = parseOptionalNumber(imageForm.limitArtists);
    const rateLimit = parseOptionalNumber(imageForm.rateLimit);
    if (
      (imageForm.limitSongs.trim() && limitSongs === null) ||
      (imageForm.limitArtists.trim() && limitArtists === null) ||
      (imageForm.rateLimit.trim() && rateLimit === null)
    ) {
      setActionError('Image sync settings must be valid numbers.');
      return;
    }
    const payload: Record<string, unknown> = {
      dry_run: imageForm.dryRun,
    };
    if (limitSongs !== null) payload.limit_songs = limitSongs;
    if (limitArtists !== null) payload.limit_artists = limitArtists;
    if (rateLimit !== null) payload.rate_limit = rateLimit;

    setMetadataBusy(true);
    try {
      await fetchJson('/api/library/metadata/images', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setActionMessage('Image/profile sync started.');
      refreshMetadataStatus();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to start image sync.'
      );
    } finally {
      setMetadataBusy(false);
    }
  };

  const toggleSongSelection = (shaId: string) => {
    setSelectedSongIds((prev) =>
      prev.includes(shaId) ? prev.filter((id) => id !== shaId) : [...prev, shaId]
    );
  };

  const handleLinkSongs = async () => {
    setLinkMessage(null);
    setLinkError(null);
    if (!selectedAlbumId) {
      setLinkError('Select an album to link.');
      return;
    }
    if (selectedSongIds.length === 0) {
      setLinkError('Select at least one song to link.');
      return;
    }
    setLinkBusy(true);
    try {
      const result = await fetchJson<{ linked: number }>('/api/library/songs/link', {
        method: 'POST',
        body: JSON.stringify({
          album_id: selectedAlbumId,
          sha_ids: selectedSongIds,
          mark_verified: true,
        }),
      });
      setLinkMessage(`Linked ${result.linked} song(s) to album.`);
      setSelectedSongIds([]);
      refreshUnlinked();
      refreshStats();
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : 'Failed to link songs.');
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <div className="bg-gradient-to-b from-gray-900 to-black min-h-full pb-32">
      <div>
          <div className="p-8 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold">Your Library</h1>
                <p className="text-gray-400 mt-2">
                  Queue new songs, monitor processing, and audit storage health.
                </p>
              </div>
              <button
                onClick={() => {
                  refreshStats();
                  refreshQueue();
                  refreshPipeline();
                  refreshMetadataStatus();
                  refreshUnlinked();
                  refreshAlbumCatalog(albumSearch);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Refresh
              </button>
            </div>

            <div className="grid gap-4 mt-6 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-gray-900/80 p-4">
                <p className="text-sm text-gray-400">Songs Stored</p>
                <p className="text-2xl font-semibold mt-2">{stats.songs}</p>
              </div>
              <div className="rounded-2xl bg-gray-900/80 p-4">
                <p className="text-sm text-gray-400">Verified Tracks</p>
                <p className="text-2xl font-semibold mt-2">{stats.verified_songs}</p>
              </div>
              <div className="rounded-2xl bg-gray-900/80 p-4">
                <p className="text-sm text-gray-400">Embeddings</p>
                <p className="text-2xl font-semibold mt-2">{stats.embeddings}</p>
              </div>
              <div className="rounded-2xl bg-gray-900/80 p-4">
                <p className="text-sm text-gray-400">Queue Backlog</p>
                <p className="text-2xl font-semibold mt-2">{queueSummary.total}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-2 rounded-full font-semibold transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-black'
                      : 'bg-gray-800 text-white hover:bg-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {(actionMessage || actionError) && (
              <div
                className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
                  actionError
                    ? 'border-red-500/40 bg-red-500/10 text-red-200'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {actionError ?? actionMessage}
              </div>
            )}
          </div>

          <div className="px-8 pb-24">
            {activeTab === 'manage' && (
              <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center gap-3">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-300" />
                    <h2 className="text-xl font-semibold">Search and Queue</h2>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">
                    Enter a song title or search query to enqueue a new download task.
                  </p>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="text-sm text-gray-300">Song title or query</label>
                      <input
                        value={searchTitle}
                        onChange={(e) => setSearchTitle(e.target.value)}
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/40"
                        placeholder="Artist - Track name"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-300">Artist (optional)</label>
                      <input
                        value={searchArtist}
                        onChange={(e) => setSearchArtist(e.target.value)}
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/40"
                        placeholder="Artist name"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-300">Source URL (optional)</label>
                      <input
                        value={searchUrl}
                        onChange={(e) => setSearchUrl(e.target.value)}
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/40"
                        placeholder="https://youtube.com/..."
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={appendSources}
                        onChange={(e) => setAppendSources(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                      />
                      Append to sources.jsonl
                    </label>
                    <button
                      onClick={handleQueueSingle}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      Queue Song
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center gap-3">
                    <QueueListIcon className="h-5 w-5 text-gray-300" />
                    <h2 className="text-xl font-semibold">Bulk List</h2>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">
                    Paste one song per line. Use "Artist - Title" or "Title | Artist | Album".
                  </p>
                  <textarea
                    value={bulkList}
                    onChange={(e) => setBulkList(e.target.value)}
                    rows={10}
                    className="mt-4 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/40"
                    placeholder="Artist - Track name"
                  />
                  <div className="flex justify-end mt-4">
                    <button
                      onClick={handleQueueBulk}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      Queue List
                    </button>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'downloads' && (
              <div className="space-y-6">
                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <button
                      onClick={() => setIsSourcesCollapsed(!isSourcesCollapsed)}
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      <QueueListIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">Sources.jsonl</h2>
                      {isSourcesCollapsed ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span>{sourceMeta?.path ?? 'backend/processing/acquisition_pipeline/sources.jsonl'}</span>
                      {sourceMeta?.queue_available ? (
                        <>
                          <span className="rounded-full bg-gray-800 px-3 py-1 text-gray-300">
                            {sourceRemaining} remaining
                          </span>
                          {sourceQueued > 0 && (
                            <span className="rounded-full bg-gray-800 px-3 py-1 text-gray-300">
                              {sourceQueued} in pipeline
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="rounded-full bg-gray-800 px-3 py-1 text-gray-300">
                          {sourceTotal} entries
                        </span>
                      )}
                      <span className="text-gray-500">
                        Last seeded:{' '}
                        {sourceMeta?.last_seeded_at
                          ? new Date(sourceMeta.last_seeded_at).toLocaleString()
                          : '--'}
                      </span>
                      <button
                        onClick={handleSeedSources}
                        disabled={busy || sourceMeta?.queue_available === false}
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                      >
                        Seed into queue
                      </button>
                      <button
                        onClick={handleClearSources}
                        disabled={busy}
                        className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Clear sources
                      </button>
                    </div>
                  </div>

                  {!isSourcesCollapsed && (
                    <>
                      <p className="text-sm text-gray-400 mt-2">
                        Items listed in the local sources file that are not yet in the pipeline queue.
                      </p>
                      {!sourceMeta?.queue_available && (
                        <p className="text-xs text-amber-300 mt-2">
                          Queue status unavailable (database offline).
                        </p>
                      )}
                      {sourceMeta?.queue_available && (
                        <p className="text-xs text-gray-500 mt-2">
                          Sources already queued appear in the pipeline list below.
                        </p>
                      )}
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="text-gray-400">
                            <tr>
                              <th className="py-2 pr-4">Title</th>
                              <th className="py-2 pr-4">Artist</th>
                              <th className="py-2 pr-4">Queued</th>
                              <th className="py-2 pr-4">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleSourceItems.length === 0 && (
                              <tr>
                                <td colSpan={4} className="py-4 text-gray-500">
                                  {sourceMeta?.queue_available
                                    ? 'All sources.jsonl entries are already in the pipeline queue.'
                                    : 'No sources.jsonl entries found.'}
                                </td>
                              </tr>
                            )}
                            {visibleSourceItems.map((item, index) => (
                              <tr key={`${item.title}-${index}`} className="border-t border-gray-800">
                                <td className="py-3 pr-4">
                                  <p className="font-medium">{item.title}</p>
                                  {item.album && (
                                    <p className="text-xs text-gray-500">{item.album}</p>
                                  )}
                                </td>
                                <td className="py-3 pr-4 text-gray-300">
                                  {item.artist || 'Unknown'}
                                </td>
                                <td className="py-3 pr-4 text-gray-300">
                                  {item.queued === null ? '--' : item.queued ? 'Yes' : 'No'}
                                </td>
                                <td className="py-3 pr-4">
                                  {item.queue_status ? (
                                    <span
                                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                        statusStyles[item.queue_status] ||
                                        'bg-gray-800 text-gray-200'
                                      }`}
                                    >
                                      {item.queue_status.replace(/_/g, ' ')}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-500">--</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <PlayIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">Run Pipeline</h2>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        pipelineStatus.running ? 'bg-green-500/20 text-green-200' : 'bg-gray-800 text-gray-300'
                      }`}
                    >
                      {pipelineStatus.running ? 'Running' : 'Idle'}
                    </span>
                  </div>

                  <div className="grid gap-4 mt-5 md:grid-cols-2">
                    <label className="text-sm text-gray-300">
                      Download limit
                      <input
                        type="number"
                        min={1}
                        value={pipelineForm.downloadLimit}
                        onChange={(e) =>
                          setPipelineForm((prev) => ({
                            ...prev,
                            downloadLimit: e.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                      />
                    </label>
                    <label className="text-sm text-gray-300">
                      Process batch size
                      <input
                        type="number"
                        min={1}
                        value={pipelineForm.processLimit}
                        onChange={(e) =>
                          setPipelineForm((prev) => ({
                            ...prev,
                            processLimit: e.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 mt-4 text-sm text-gray-300">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={pipelineForm.download}
                        onChange={(e) =>
                          setPipelineForm((prev) => ({
                            ...prev,
                            download: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                      />
                      Download pending items
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={pipelineForm.verify}
                        onChange={(e) =>
                          setPipelineForm((prev) => ({
                            ...prev,
                            verify: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                      />
                      Verify metadata
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={pipelineForm.images}
                        onChange={(e) =>
                          setPipelineForm((prev) => ({
                            ...prev,
                            images: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                      />
                      Sync images
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={pipelineForm.runUntilEmpty}
                        onChange={(e) =>
                          setPipelineForm((prev) => ({
                            ...prev,
                            runUntilEmpty: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                      />
                      Run until queue is empty
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
                    <div className="text-sm text-gray-400">
                      Temp cache: {settings?.paths.preprocessed_cache_dir ?? 'default'}
                    </div>
                    <button
                      onClick={handleRunPipeline}
                      disabled={busy || pipelineStatus.running}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                    >
                      <PlayIcon className="h-4 w-4" />
                      Start pipeline
                    </button>
                  </div>

                  {pipelineStatus.last_config && (
                    <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                        <span className="uppercase tracking-wide">
                          {pipelineStatus.running ? 'Active run details' : 'Last run details'}
                        </span>
                        {pipelineStatus.running && (
                          <span className="text-emerald-300">
                            Elapsed: {formatDuration(elapsedMs)}
                          </span>
                        )}
                      </div>
                      <div className="mt-4 grid gap-3 text-xs text-gray-300 md:grid-cols-2">
                        <div>
                          <span className="text-gray-500">Started</span>
                          <span className="ml-2 text-gray-200">
                            {formatTimestamp(pipelineStatus.started_at)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Last event</span>
                          <span className="ml-2 text-gray-200">
                            {lastEvent
                              ? `${formatValue(lastEvent.stage)} · ${formatTimestamp(
                                  lastEvent.ts as string
                                )}`
                              : '--'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Last error</span>
                          <span className="ml-2 text-rose-200">
                            {pipelineStatus.last_error || '--'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Seed sources</span>
                          <span className="ml-2 text-gray-200">
                            {formatBool(pipelineConfig.seed_sources)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 text-xs text-gray-400 md:grid-cols-2">
                        <div>
                          Download limit: {formatValue(pipelineConfig.download_limit)}
                        </div>
                        <div>
                          Process limit: {formatValue(pipelineConfig.process_limit)}
                        </div>
                        <div>
                          Workers: dl {formatValue(pipelineConfig.download_workers)}, pcm{' '}
                          {formatValue(pipelineConfig.pcm_workers)}, hash{' '}
                          {formatValue(pipelineConfig.hash_workers)}, embed{' '}
                          {formatValue(pipelineConfig.embed_workers)}
                        </div>
                        <div>
                          Verify: {formatBool(pipelineConfig.verify)} · Images:{' '}
                          {formatBool(pipelineConfig.images)}
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-500">
                        Cache: {formatValue(pipelinePaths.preprocessed_cache_dir)} · Song
                        cache: {formatValue(pipelinePaths.song_cache_dir)}
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <button
                      onClick={() => setIsQueueCollapsed(!isQueueCollapsed)}
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      <ArrowDownTrayIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">Queue Status</h2>
                      {isQueueCollapsed ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                    <button
                      onClick={handleClearQueue}
                      disabled={busy}
                      className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Clear pipeline queue
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-4 text-xs font-semibold text-gray-200">
                    {Object.entries(stats.queue).length === 0 && (
                      <span className="rounded-full bg-gray-800 px-3 py-1">No queue data</span>
                    )}
                    {Object.entries(stats.queue).map(([status, count]) => (
                      <span
                        key={status}
                        className={`rounded-full px-3 py-1 ${statusStyles[status] || 'bg-gray-800 text-gray-200'}`}
                      >
                        {status.replace(/_/g, ' ')}: {count}
                      </span>
                    ))}
                  </div>

                  {!isQueueCollapsed && (
                    <>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
                        <div className="flex items-center gap-2">
                          <span>Show</span>
                          <select
                            value={queuePageSize}
                            onChange={(e) => {
                              setQueuePageSize(Number(e.target.value));
                              setQueuePage(1);
                            }}
                            className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-200 focus:outline-none"
                          >
                            {[10, 25, 50, 100].map((size) => (
                              <option key={size} value={size}>
                                {size}
                              </option>
                            ))}
                          </select>
                        </div>
                        <span>
                          {queueTotal === 0
                            ? 'No queued songs'
                            : `Showing ${queueOffset + 1}-${queueOffset + queueItems.length} of ${queueTotal}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setQueuePage((prev) => Math.max(1, prev - 1))}
                            disabled={queuePage <= 1}
                            className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-200 disabled:opacity-50"
                          >
                            Prev
                          </button>
                          <span>
                            Page {queuePage} of {queuePageCount}
                          </span>
                          <button
                            onClick={() =>
                              setQueuePage((prev) => Math.min(queuePageCount, prev + 1))
                            }
                            disabled={queuePage >= queuePageCount}
                            className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-200 disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="text-gray-400">
                            <tr>
                              <th className="py-2 pr-4">Title</th>
                              <th className="py-2 pr-4">Artist</th>
                              <th className="py-2 pr-4">Status</th>
                              <th className="py-2 pr-4">Attempts</th>
                              <th className="py-2 pr-4">Updated</th>
                              <th className="py-2 pr-4">Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {queueItems.length === 0 && (
                              <tr>
                                <td colSpan={6} className="py-6 text-gray-500">
                                  No queued songs yet.
                                </td>
                              </tr>
                            )}
                            {queueItems.map((item) => (
                              <tr key={item.queue_id} className="border-t border-gray-800">
                                <td className="py-3 pr-4">
                                  <p className="font-medium">{item.title}</p>
                                  {item.album && (
                                    <p className="text-xs text-gray-500">{item.album}</p>
                                  )}
                                </td>
                                <td className="py-3 pr-4 text-gray-300">
                                  {item.artist || 'Unknown'}
                                </td>
                                <td className="py-3 pr-4">
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                      statusStyles[item.status] || 'bg-gray-800 text-gray-200'
                                    }`}
                                  >
                                    {item.status.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="py-3 pr-4 text-gray-300">
                                  {item.attempts ?? 0}
                                </td>
                                <td className="py-3 pr-4 text-gray-400">
                                  {item.updated_at ? new Date(item.updated_at).toLocaleString() : '--'}
                                </td>
                                <td className="py-3 pr-4 text-xs text-red-300">
                                  {item.last_error || '--'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </section>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center gap-3">
                    <QueueListIcon className="h-5 w-5 text-gray-300" />
                    <h2 className="text-xl font-semibold">Recent Activity</h2>
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-gray-300">
                    {(pipelineStatus.events ?? []).length === 0 && (
                      <p className="text-gray-500">Pipeline events will appear here.</p>
                    )}
                    {(pipelineStatus.events ?? []).map((event, index) => (
                      <div
                        key={`event-${index}`}
                        className="rounded-xl border border-gray-800 bg-gray-900/60 p-3"
                      >
                        <p className="font-medium text-white">
                          {(event.stage as string) || 'stage'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {(event.ts as string) || 'timestamp'}
                        </p>
                        {event.path && (
                          <p className="text-xs text-gray-500 truncate">
                            {String(event.path)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                    <div className="flex items-center gap-3">
                      <ChartBarIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">Database Overview</h2>
                    </div>
                    <p className="text-sm text-gray-400 mt-2">
                      Core metadata metrics from Postgres and pgvector.
                    </p>
                    <div className="grid gap-4 mt-5 md:grid-cols-2">
                      <div className="rounded-xl bg-gray-800/70 p-4">
                        <p className="text-xs uppercase text-gray-400">Songs</p>
                        <p className="text-2xl font-semibold mt-2">{stats.songs}</p>
                      </div>
                      <div className="rounded-xl bg-gray-800/70 p-4">
                        <p className="text-xs uppercase text-gray-400">Verified</p>
                        <p className="text-2xl font-semibold mt-2">{stats.verified_songs}</p>
                      </div>
                      <div className="rounded-xl bg-gray-800/70 p-4">
                        <p className="text-xs uppercase text-gray-400">Embeddings</p>
                        <p className="text-2xl font-semibold mt-2">{stats.embeddings}</p>
                      </div>
                      <div className="rounded-xl bg-gray-800/70 p-4">
                        <p className="text-xs uppercase text-gray-400">Queue Total</p>
                        <p className="text-2xl font-semibold mt-2">{queueSummary.total}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">
                      Last updated:{' '}
                      {stats.last_updated
                        ? new Date(stats.last_updated).toLocaleString()
                        : '--'}
                    </p>
                  </section>

                  <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                    <div className="flex items-center gap-3">
                      <QueueListIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">Queue Breakdown</h2>
                    </div>
                    <div className="mt-5 space-y-3 text-sm text-gray-300">
                      {Object.entries(stats.queue).length === 0 && (
                        <p className="text-gray-500">No queue metrics available yet.</p>
                      )}
                      {Object.entries(stats.queue).map(([status, count]) => (
                        <div
                          key={status}
                          className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3"
                        >
                          <span className="capitalize">{status.replace(/_/g, ' ')}</span>
                          <span className="text-white font-semibold">{count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center gap-3">
                    <ArrowPathIcon className="h-5 w-5 text-gray-300" />
                    <h2 className="text-xl font-semibold">Metadata Verification</h2>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">
                    Resolve unverified songs using MusicBrainz, Spotify, Wikidata, and Cover Art Archive. Intelligently parses filenames and tries all sources to find the best metadata match.
                  </p>
                  <div className="grid gap-4 mt-4 md:grid-cols-3">
                    <label className="text-sm text-gray-300">
                      Limit
                      <input
                        value={verifyForm.limit}
                        onChange={(e) =>
                          setVerifyForm((prev) => ({ ...prev, limit: e.target.value }))
                        }
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                        placeholder="Leave blank for all"
                      />
                    </label>
                    <label className="text-sm text-gray-300">
                      Min score
                      <input
                        value={verifyForm.minScore}
                        onChange={(e) =>
                          setVerifyForm((prev) => ({
                            ...prev,
                            minScore: e.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                        placeholder="Optional"
                      />
                    </label>
                    <label className="text-sm text-gray-300">
                      Rate limit (sec)
                      <input
                        value={verifyForm.rateLimit}
                        onChange={(e) =>
                          setVerifyForm((prev) => ({
                            ...prev,
                            rateLimit: e.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                        placeholder="Optional"
                      />
                    </label>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-300 mt-4">
                    <input
                      type="checkbox"
                      checked={verifyForm.dryRun}
                      onChange={(e) =>
                        setVerifyForm((prev) => ({ ...prev, dryRun: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                    />
                    Dry run (no DB writes)
                  </label>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="text-sm text-gray-400">
                      Status:{' '}
                      <span className="text-white font-semibold">
                        {verificationInProgress || metadataStatus.verification.running ? 'Running' : 'Idle'}
                      </span>
                    </div>
                    <button
                      onClick={handleVerifyMetadata}
                      disabled={metadataBusy || metadataStatus.verification.running || verificationInProgress}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                    >
                      Run verification
                    </button>
                  </div>

                  {/* Live Status Updates */}
                  {verificationInProgress && liveVerificationStatus.length > 0 && (
                    <div
                      ref={liveStatusRef}
                      className="mt-4 rounded-xl bg-gray-950/50 border border-gray-700 p-4 max-h-96 overflow-y-auto"
                    >
                      <p className="text-xs uppercase text-gray-500 mb-2">Live Status</p>
                      <div className="space-y-1 font-mono text-xs text-gray-300">
                        {liveVerificationStatus.map((status, idx) => (
                          <div key={idx} className="whitespace-pre-wrap">
                            {status}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 text-sm text-gray-300 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase text-gray-500">Last run</p>
                      <p className="text-white">
                        {formatTimestamp(metadataStatus.verification.finished_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-500">Last result</p>
                      <p className="text-white">
                        Processed {formatValue(verificationResult?.['processed'])} · Verified{' '}
                        {formatValue(verificationResult?.['verified'])} · Skipped{' '}
                        {formatValue(verificationResult?.['skipped'])}
                      </p>
                    </div>
                  </div>
                  {metadataStatus.verification.last_error && (
                    <p className="mt-3 text-sm text-red-300">
                      {metadataStatus.verification.last_error}
                    </p>
                  )}
                </section>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center gap-3">
                    <ArrowDownTrayIcon className="h-5 w-5 text-gray-300" />
                    <h2 className="text-xl font-semibold">Image & Artist Sync</h2>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">
                    Sync cover art, album images, and artist profiles for verified songs.
                  </p>
                  <div className="grid gap-4 mt-4 md:grid-cols-3">
                    <label className="text-sm text-gray-300">
                      Song limit
                      <input
                        value={imageForm.limitSongs}
                        onChange={(e) =>
                          setImageForm((prev) => ({ ...prev, limitSongs: e.target.value }))
                        }
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                        placeholder="Optional"
                      />
                    </label>
                    <label className="text-sm text-gray-300">
                      Artist limit
                      <input
                        value={imageForm.limitArtists}
                        onChange={(e) =>
                          setImageForm((prev) => ({ ...prev, limitArtists: e.target.value }))
                        }
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                        placeholder="Optional"
                      />
                    </label>
                    <label className="text-sm text-gray-300">
                      Rate limit (sec)
                      <input
                        value={imageForm.rateLimit}
                        onChange={(e) =>
                          setImageForm((prev) => ({
                            ...prev,
                            rateLimit: e.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                        placeholder="Optional"
                      />
                    </label>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-300 mt-4">
                    <input
                      type="checkbox"
                      checked={imageForm.dryRun}
                      onChange={(e) =>
                        setImageForm((prev) => ({ ...prev, dryRun: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                    />
                    Dry run (no DB writes)
                  </label>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="text-sm text-gray-400">
                      Status:{' '}
                      <span className="text-white font-semibold">
                        {metadataStatus.images.running ? 'Running' : 'Idle'}
                      </span>
                    </div>
                    <button
                      onClick={handleSyncImages}
                      disabled={metadataBusy || metadataStatus.images.running}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                    >
                      Sync images & profiles
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-gray-300 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase text-gray-500">Last run</p>
                      <p className="text-white">
                        {formatTimestamp(metadataStatus.images.finished_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-500">Last result</p>
                      <p className="text-white">
                        Songs {formatValue(imageResult?.['songs_processed'])} · Song images{' '}
                        {formatValue(imageResult?.['song_images'])} · Album images{' '}
                        {formatValue(imageResult?.['album_images'])} · Album metadata{' '}
                        {formatValue(imageResult?.['album_metadata'])} · Album tracks{' '}
                        {formatValue(imageResult?.['album_tracks'])} · Artist profiles{' '}
                        {formatValue(imageResult?.['artist_profiles'])} · Artist images{' '}
                        {formatValue(imageResult?.['artist_images'])}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-500">Skipped</p>
                      <p className="text-white">{formatValue(imageResult?.['skipped'])}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-gray-500">Failed</p>
                      <p className="text-white">{formatValue(imageResult?.['failed'])}</p>
                    </div>
                  </div>
                  {metadataStatus.images.last_error && (
                    <p className="mt-3 text-sm text-red-300">
                      {metadataStatus.images.last_error}
                    </p>
                  )}
                </section>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center gap-3">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-300" />
                    <h2 className="text-xl font-semibold">Link Unassigned Songs</h2>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">
                    Attach songs missing album or artist metadata to an existing album record.
                  </p>
                  <div className="grid gap-4 mt-4 md:grid-cols-2">
                    <label className="text-sm text-gray-300">
                      Album search
                      <input
                        value={albumSearch}
                        onChange={(e) => setAlbumSearch(e.target.value)}
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                        placeholder="Search albums or artists"
                      />
                    </label>
                    <label className="text-sm text-gray-300">
                      Album selection
                      <select
                        value={selectedAlbumId}
                        onChange={(e) => setSelectedAlbumId(e.target.value)}
                        className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                      >
                        <option value="">Select an album</option>
                        {albumCatalog.map((album) => (
                          <option key={album.album_id} value={album.album_id}>
                            {album.title} — {album.artist_name || 'Unknown Artist'}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleLinkSongs}
                      disabled={linkBusy || !selectedAlbumId || selectedSongIds.length === 0}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                    >
                      Link selected
                    </button>
                    <span className="text-sm text-gray-400">
                      Selected {selectedSongIds.length} · Unassigned {unlinkedTotal}
                    </span>
                  </div>
                  {linkMessage && <p className="mt-3 text-sm text-emerald-300">{linkMessage}</p>}
                  {linkError && <p className="mt-3 text-sm text-red-300">{linkError}</p>}

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-gray-400">
                        <tr>
                          <th className="py-2 pr-4">Select</th>
                          <th className="py-2 pr-4">Title</th>
                          <th className="py-2 pr-4">Artist</th>
                          <th className="py-2 pr-4">Album</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unlinkedSongs.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-6 text-gray-500">
                              No unassigned songs found.
                            </td>
                          </tr>
                        )}
                        {unlinkedSongs.map((song) => {
                          const checked = selectedSongIds.includes(song.sha_id);
                          return (
                            <tr key={song.sha_id} className="border-t border-gray-800">
                              <td className="py-3 pr-4">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSongSelection(song.sha_id)}
                                  className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                                />
                              </td>
                              <td className="py-3 pr-4 text-white">{song.title}</td>
                              <td className="py-3 pr-4 text-gray-300">
                                {song.artist || 'Unknown'}
                              </td>
                              <td className="py-3 pr-4 text-gray-400">
                                {song.album || 'Unknown'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
