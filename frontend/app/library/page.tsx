'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ChartBarIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  QueueListIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';
import { CollapsibleSection } from './components/CollapsibleSection';
import { CollapsiblePanel } from './components/CollapsiblePanel';

// Direct backend URL for SSE connections (bypasses Next.js proxy which can buffer streams)
const SSE_BACKEND_URL = process.env.NEXT_PUBLIC_SSE_BACKEND_URL || 'http://localhost:8000';

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
  last_status?: string | null;
  stop_requested?: boolean;
};

type MetadataStatus = {
  verification: MetadataTaskState;
  images: MetadataTaskState;
};

type CatalogSong = {
  sha_id: string;
  title?: string | null;
  album?: string | null;
  duration_sec?: number | null;
  release_year?: number | null;
  track_number?: number | null;
  verified?: boolean | null;
  verification_source?: string | null;
  artists: string[];
  primary_artist_id?: number | null;
  album_id?: string | null;
};

type CatalogResponse = {
  items: CatalogSong[];
  total: number;
  limit: number;
  offset: number;
  query?: string | null;
};

type SongDetail = CatalogSong & {
  genres: string[];
  labels: string[];
  producers: string[];
  verification_score?: number | null;
  musicbrainz_recording_id?: string | null;
  primary_artist_name?: string | null;
  album_artist_name?: string | null;
  album_release_year?: number | null;
  album_release_date?: string | null;
};

type SongEditForm = {
  title: string;
  artist: string;
  album: string;
  genre: string;
  releaseYear: string;
  trackNumber: string;
};

type AcquisitionBackend = {
  backend_type: string;
  enabled: boolean;
  auth_method?: string | null;
  cookies_file?: string | null;
  username?: string | null;
};

type AcquisitionSettings = {
  active_backend: string;
  backends: Record<string, AcquisitionBackend>;
};

type VggishConfig = {
  target_sample_rate: number;
  frame_sec: number;
  hop_sec: number;
  stft_window_sec: number;
  stft_hop_sec: number;
  num_mel_bins: number;
  mel_min_hz: number;
  mel_max_hz: number;
  log_offset: number;
  device_preference: string;
  gpu_memory_fraction: number;
  gpu_allow_growth: boolean;
  use_postprocess: boolean;
};

type VggishDevice = {
  device_type: string;
  device_name: string;
  available: boolean;
  details: Record<string, unknown>;
};

type VggishEmbeddingTask = {
  running: boolean;
  started_at?: string | null;
  finished_at?: string | null;
  last_error?: string | null;
  last_result?: {
    processed: number;
    recalculated: number;
    skipped: number;
    failed: number;
  } | null;
};

type VggishSettingsResponse = {
  config: VggishConfig;
  devices: VggishDevice[];
  embedding_task: VggishEmbeddingTask;
};

const statusStyles: Record<string, string> = {
  pending: 'bg-gray-700 text-gray-200',
  downloading: 'bg-blue-600 text-white',
  converting: 'bg-purple-600 text-white',
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

const MAX_IMPORT_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_IMPORT_LABEL = '5GB';

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<TabId>('manage');
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
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
  const [catalogItems, setCatalogItems] = useState<CatalogSong[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] = useState(25);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [songDetail, setSongDetail] = useState<SongDetail | null>(null);
  const [songDetailError, setSongDetailError] = useState<string | null>(null);
  const [songDetailBusy, setSongDetailBusy] = useState(false);
  const [songEditMode, setSongEditMode] = useState(false);
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const [queueBreakdownCollapsed, setQueueBreakdownCollapsed] = useState(false);
  const [songMetadataCollapsed, setSongMetadataCollapsed] = useState(false);
  const [metadataVerificationCollapsed, setMetadataVerificationCollapsed] = useState(false);
  const [imageSyncCollapsed, setImageSyncCollapsed] = useState(false);
  const [songEditForm, setSongEditForm] = useState<SongEditForm>({
    title: '',
    artist: '',
    album: '',
    genre: '',
    releaseYear: '',
    trackNumber: '',
  });
  const [songSaveBusy, setSongSaveBusy] = useState(false);
  const [songSaveMessage, setSongSaveMessage] = useState<string | null>(null);
  const [songSaveError, setSongSaveError] = useState<string | null>(null);
  const [songVerifyBusy, setSongVerifyBusy] = useState<Record<string, boolean>>({});
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(true);
  const [isBackendCollapsed, setIsBackendCollapsed] = useState(true);
  const [isPipelineCollapsed, setIsPipelineCollapsed] = useState(false);
  const [isRecentActivityCollapsed, setIsRecentActivityCollapsed] = useState(true);

  const [acquisitionSettings, setAcquisitionSettings] = useState<AcquisitionSettings | null>(null);
  const [backendCookiesFile, setBackendCookiesFile] = useState('');
  const [backendTestResult, setBackendTestResult] = useState<string | null>(null);
  const [backendBusy, setBackendBusy] = useState(false);

  const [searchTitle, setSearchTitle] = useState('');
  const [searchArtist, setSearchArtist] = useState('');
  const [searchUrl, setSearchUrl] = useState('');
  const [bulkList, setBulkList] = useState('');
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
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
  const [verificationProgress, setVerificationProgress] = useState<{
    verified: number;
    processed: number;
    skipped: number;
    album_images: number;
    artist_images: number;
  } | null>(null);

  // VGGish Embeddings state
  const [vggishSettings, setVggishSettings] = useState<VggishSettingsResponse | null>(null);
  const [vggishCollapsed, setVggishCollapsed] = useState(false);
  const [vggishBusy, setVggishBusy] = useState(false);
  const [vggishForm, setVggishForm] = useState({
    target_sample_rate: '16000',
    frame_sec: '0.96',
    hop_sec: '0.48',
    stft_window_sec: '0.025',
    stft_hop_sec: '0.010',
    num_mel_bins: '64',
    mel_min_hz: '125',
    mel_max_hz: '7500',
    log_offset: '0.01',
    device_preference: 'auto',
    gpu_memory_fraction: '0.8',
    gpu_allow_growth: true,
    use_postprocess: true,
  });
  const [vggishRecalcForm, setVggishRecalcForm] = useState({
    limit: '',
    force: false,
  });
  const [embeddingInProgress, setEmbeddingInProgress] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<{
    processed: number;
    recalculated: number;
    skipped: number;
    failed: number;
    total: number;
  } | null>(null);
  const [liveEmbeddingStatus, setLiveEmbeddingStatus] = useState<string[]>([]);
  const [currentEmbeddingStatus, setCurrentEmbeddingStatus] = useState<string | null>(null);
  const liveEmbeddingStatusRef = useRef<HTMLDivElement>(null);
  const embeddingStreamRef = useRef<EventSource | null>(null);
  const [currentVerificationStatus, setCurrentVerificationStatus] = useState<string | null>(
    null
  );
  const liveStatusRef = useRef<HTMLDivElement>(null);
  const verificationStreamRef = useRef<EventSource | null>(null);

  // Image sync live status state
  const [liveImageSyncStatus, setLiveImageSyncStatus] = useState<string[]>([]);
  const [imageSyncInProgress, setImageSyncInProgress] = useState(false);
  const [imageSyncProgress, setImageSyncProgress] = useState<{
    songs_processed: number;
    song_images: number;
    album_images: number;
    artist_profiles: number;
    artist_images: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [currentImageSyncStatus, setCurrentImageSyncStatus] = useState<string | null>(null);
  const liveImageSyncRef = useRef<HTMLDivElement>(null);
  const imageSyncStreamRef = useRef<EventSource | null>(null);

  // Auto-scroll to bottom when new status messages arrive
  useEffect(() => {
    if (liveStatusRef.current && verificationInProgress) {
      liveStatusRef.current.scrollTop = liveStatusRef.current.scrollHeight;
    }
  }, [liveVerificationStatus, verificationInProgress]);

  // Auto-scroll for embedding status
  useEffect(() => {
    if (liveEmbeddingStatusRef.current && embeddingInProgress) {
      liveEmbeddingStatusRef.current.scrollTop = liveEmbeddingStatusRef.current.scrollHeight;
    }
  }, [liveEmbeddingStatus, embeddingInProgress]);

  // Auto-scroll for image sync live status
  useEffect(() => {
    if (liveImageSyncRef.current && imageSyncInProgress) {
      liveImageSyncRef.current.scrollTop = liveImageSyncRef.current.scrollHeight;
    }
  }, [liveImageSyncStatus, imageSyncInProgress]);

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
  const catalogOffset = (catalogPage - 1) * catalogPageSize;

  const catalogPageCount = useMemo(() => {
    if (!catalogTotal) {
      return 1;
    }
    return Math.max(1, Math.ceil(catalogTotal / catalogPageSize));
  }, [catalogPageSize, catalogTotal]);

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

  const refreshVggishSettings = useCallback(async () => {
    try {
      const data = await fetchJson<VggishSettingsResponse>('/api/settings/vggish');
      setVggishSettings(data);
      // Update form with loaded config
      setVggishForm({
        target_sample_rate: String(data.config.target_sample_rate),
        frame_sec: String(data.config.frame_sec),
        hop_sec: String(data.config.hop_sec),
        stft_window_sec: String(data.config.stft_window_sec),
        stft_hop_sec: String(data.config.stft_hop_sec),
        num_mel_bins: String(data.config.num_mel_bins),
        mel_min_hz: String(data.config.mel_min_hz),
        mel_max_hz: String(data.config.mel_max_hz),
        log_offset: String(data.config.log_offset),
        device_preference: data.config.device_preference,
        gpu_memory_fraction: String(data.config.gpu_memory_fraction),
        gpu_allow_growth: data.config.gpu_allow_growth,
        use_postprocess: data.config.use_postprocess,
      });
      setActionError(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to load VGGish settings.'
      );
    }
  }, []);

  const refreshCatalog = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(catalogPageSize),
      offset: String(catalogOffset),
    });
    if (catalogQuery.trim()) {
      params.set('q', catalogQuery.trim());
    }
    try {
      const data = await fetchJson<CatalogResponse>(
        `/api/library/catalog?${params.toString()}`
      );
      setCatalogItems(data.items);
      setCatalogTotal(data.total);
      setCatalogError(null);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Failed to load songs.');
    }
  }, [catalogOffset, catalogPageSize, catalogQuery]);

  const refreshAcquisitionSettings = useCallback(async () => {
    try {
      const data = await fetchJson<AcquisitionSettings>('/api/acquisition/backends');
      setAcquisitionSettings(data);
      const activeBackend = data.backends[data.active_backend];
      if (activeBackend?.cookies_file) {
        setBackendCookiesFile(activeBackend.cookies_file);
      }
    } catch (error) {
      console.error('Failed to load acquisition settings:', error);
    }
  }, []);

  const updateAcquisitionBackend = async (backendId: string, cookiesFile: string) => {
    setBackendBusy(true);
    setBackendTestResult(null);
    try {
      const backend: AcquisitionBackend = {
        backend_type: backendId,
        enabled: true,
        auth_method: cookiesFile ? 'cookies' : null,
        cookies_file: cookiesFile || null,
      };
      await fetchJson(`/api/acquisition/backends/${backendId}`, {
        method: 'POST',
        body: JSON.stringify(backend),
      });
      await refreshAcquisitionSettings();
      setBackendTestResult('Backend updated successfully');
    } catch (error) {
      setBackendTestResult(
        error instanceof Error ? error.message : 'Failed to update backend'
      );
    } finally {
      setBackendBusy(false);
    }
  };

  const testAcquisitionBackend = async (backendId: string) => {
    setBackendBusy(true);
    setBackendTestResult(null);
    try {
      const result = await fetchJson<{ status: string; message: string; authenticated?: boolean }>(
        `/api/acquisition/backends/${backendId}/test`,
        { method: 'POST' }
      );
      if (result.status === 'success') {
        const authStatus = result.authenticated ? ' (authenticated)' : ' (not authenticated)';
        setBackendTestResult(`✓ ${result.message}${authStatus}`);
      } else {
        setBackendTestResult(`✗ ${result.message}`);
      }
    } catch (error) {
      setBackendTestResult(
        error instanceof Error ? error.message : 'Failed to test backend'
      );
    } finally {
      setBackendBusy(false);
    }
  };

  const buildSongEditForm = useCallback(
    (detail: SongDetail): SongEditForm => ({
      title: detail.title ?? '',
      artist: detail.artists?.join(', ') ?? '',
      album: detail.album ?? '',
      genre: detail.genres?.join(', ') ?? '',
      releaseYear: detail.release_year ? String(detail.release_year) : '',
      trackNumber: detail.track_number ? String(detail.track_number) : '',
    }),
    []
  );

  useEffect(() => {
    refreshStats();
    refreshPipeline();
    refreshSettings();
    refreshAcquisitionSettings();
    refreshVggishSettings();
  }, [refreshPipeline, refreshSettings, refreshStats, refreshAcquisitionSettings, refreshVggishSettings]);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (activeTab !== 'downloads') return;
    const intervalMs = pipelineStatus.running ? 1000 : 2500;
    const interval = window.setInterval(() => {
      refreshQueue();
      refreshPipeline();
      refreshStats();
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [
    activeTab,
    pipelineStatus.running,
    refreshPipeline,
    refreshQueue,
    refreshStats,
  ]);

  useEffect(() => {
    if (activeTab !== 'stats') return;
    refreshStats();
    refreshMetadataStatus();
    refreshCatalog();
    refreshVggishSettings();
  }, [
    activeTab,
    refreshCatalog,
    refreshMetadataStatus,
    refreshStats,
    refreshVggishSettings,
  ]);

  useEffect(() => {
    if (activeTab !== 'stats') return;
    const timeout = window.setTimeout(() => {
      refreshCatalog();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [activeTab, catalogPage, catalogPageSize, catalogQuery, refreshCatalog]);

  useEffect(() => {
    if (activeTab !== 'stats') return;
    const intervalMs =
      verificationInProgress || metadataStatus.verification.running || metadataStatus.images.running
        ? 1000
        : 2500;
    const interval = window.setInterval(() => {
      refreshStats();
      refreshMetadataStatus();
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [
    activeTab,
    metadataStatus.images.running,
    metadataStatus.verification.running,
    refreshMetadataStatus,
    refreshStats,
    verificationInProgress,
  ]);

  useEffect(() => {
    if (queuePage > queuePageCount) {
      setQueuePage(queuePageCount);
    }
  }, [queuePage, queuePageCount]);

  useEffect(() => {
    if (catalogPage > catalogPageCount) {
      setCatalogPage(catalogPageCount);
    }
  }, [catalogPage, catalogPageCount]);

  useEffect(() => {
    if (!selectedSongId) {
      setSongDetail(null);
      setSongDetailError(null);
      setSongEditMode(false);
      return;
    }
    let active = true;
    setSongDetailBusy(true);
    setSongDetailError(null);
    setSongSaveMessage(null);
    setSongSaveError(null);
    setSongEditMode(false);
    fetchJson<SongDetail>(`/api/library/songs/${selectedSongId}`)
      .then((data) => {
        if (!active) {
          return;
        }
        setSongDetail(data);
        setSongEditForm(buildSongEditForm(data));
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setSongDetailError(error instanceof Error ? error.message : 'Failed to load song.');
      })
      .finally(() => {
        if (active) {
          setSongDetailBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [buildSongEditForm, selectedSongId]);

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

  const formatList = (values?: string[] | null) => {
    if (!values || values.length === 0) {
      return '--';
    }
    return values.join(', ');
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
  const latestVerificationStatus =
    currentVerificationStatus || metadataStatus.verification?.last_status || null;

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

  const handleSelectSong = (shaId: string) => {
    setSelectedSongId(shaId);
  };

  const handleSongEdit = () => {
    if (!songDetail) {
      return;
    }
    setSongEditForm(buildSongEditForm(songDetail));
    setSongEditMode(true);
    setSongSaveMessage(null);
    setSongSaveError(null);
  };

  const handleSongCancel = () => {
    if (songDetail) {
      setSongEditForm(buildSongEditForm(songDetail));
    }
    setSongEditMode(false);
    setSongSaveMessage(null);
    setSongSaveError(null);
  };

  const handleSongSave = async () => {
    if (!selectedSongId) {
      return;
    }
    setSongSaveMessage(null);
    setSongSaveError(null);
    const releaseYear = parseOptionalNumber(songEditForm.releaseYear);
    if (songEditForm.releaseYear.trim() && releaseYear === null) {
      setSongSaveError('Release year must be a valid number.');
      return;
    }
    const trackNumber = parseOptionalNumber(songEditForm.trackNumber);
    if (songEditForm.trackNumber.trim() && trackNumber === null) {
      setSongSaveError('Track number must be a valid number.');
      return;
    }
    setSongSaveBusy(true);
    try {
      const payload = {
        title: songEditForm.title.trim() || null,
        artist: songEditForm.artist.trim() || null,
        album: songEditForm.album.trim() || null,
        genre: songEditForm.genre.trim() || null,
        release_year: releaseYear,
        track_number: trackNumber,
      };
      const data = await fetchJson<SongDetail>(
        `/api/library/songs/${selectedSongId}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      setSongDetail(data);
      setSongEditForm(buildSongEditForm(data));
      setSongEditMode(false);
      setSongSaveMessage('Song metadata updated.');
      setCatalogItems((prev) =>
        prev.map((item) =>
          item.sha_id === data.sha_id
            ? {
                ...item,
                title: data.title,
                album: data.album,
                release_year: data.release_year,
                track_number: data.track_number,
                artists: data.artists,
                primary_artist_id: data.primary_artist_id,
                album_id: data.album_id,
              }
            : item
        )
      );
      refreshStats();
    } catch (error) {
      setSongSaveError(error instanceof Error ? error.message : 'Failed to update song.');
    } finally {
      setSongSaveBusy(false);
    }
  };

  const handleVerifySong = async (shaId: string, title?: string | null) => {
    setActionMessage(null);
    setActionError(null);
    const minScore = parseOptionalNumber(verifyForm.minScore);
    const rateLimit = parseOptionalNumber(verifyForm.rateLimit);
    if (
      (verifyForm.minScore.trim() && minScore === null) ||
      (verifyForm.rateLimit.trim() && rateLimit === null)
    ) {
      setActionError('Verification settings must be valid numbers.');
      return;
    }
    setSongVerifyBusy((prev) => ({ ...prev, [shaId]: true }));
    setCurrentVerificationStatus(
      `Starting metadata verification for ${title || 'selected song'}...`
    );
    setMetadataBusy(true);
    try {
      const payload: Record<string, unknown> = { dry_run: verifyForm.dryRun };
      if (minScore !== null) payload.min_score = minScore;
      if (rateLimit !== null) payload.rate_limit = rateLimit;
      await fetchJson(`/api/library/songs/${shaId}/verify`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setActionMessage(`Verification started for ${title || 'song'}.`);
      await refreshMetadataStatus();
      setCurrentVerificationStatus(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to start verification.'
      );
    } finally {
      setSongVerifyBusy((prev) => ({ ...prev, [shaId]: false }));
      setMetadataBusy(false);
    }
  };

  const importTotalBytes = useMemo(
    () => importFiles.reduce((sum, file) => sum + file.size, 0),
    [importFiles]
  );
  const importOverLimit = importTotalBytes > MAX_IMPORT_BYTES;

  const formatBytes = (value: number) => {
    if (value <= 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    const adjusted = value / 1024 ** index;
    return `${adjusted.toFixed(adjusted >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  };

  const handleImportSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    setImportFiles(files);
    setImportMessage(null);
    if (totalBytes > MAX_IMPORT_BYTES) {
      setImportError(`Max upload size reached (${MAX_IMPORT_LABEL}).`);
    } else {
      setImportError(null);
    }
    event.target.value = '';
  };

  const handleImportUpload = async () => {
    setImportMessage(null);
    setImportError(null);
    if (importFiles.length === 0) {
      setImportError('Select at least one audio or video file to import.');
      return;
    }
    if (importOverLimit) {
      setImportError(`Max upload size reached (${MAX_IMPORT_LABEL}).`);
      return;
    }
    setImportBusy(true);
    try {
      const formData = new FormData();
      importFiles.forEach((file) => formData.append('files', file));

      const response = await fetch('/api/library/import', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Import failed.');
      }
      const result = (await response.json()) as {
        queued: number;
        imported: { filename: string }[];
        failed: { filename: string; error: string }[];
      };

      const failures = result.failed ?? [];
      if (failures.length) {
        const firstFailure = failures[0];
        setImportError(
          `Failed to import ${failures.length} file(s). Example: ${firstFailure.filename} - ${firstFailure.error}`
        );
      }
      setImportMessage(`Queued ${result.queued} file(s) for processing.`);
      setImportFiles([]);
      refreshQueue();
      refreshStats();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setImportBusy(false);
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

  const handleStopPipeline = async () => {
    setActionMessage(null);
    setActionError(null);
    setBusy(true);
    try {
      await fetchJson('/api/library/pipeline/stop', { method: 'POST' });
      setActionMessage('Pipeline stop requested. The current stage will finish first.');
      refreshPipeline();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to stop pipeline.'
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
    setCurrentVerificationStatus('Starting metadata verification...');
    setVerificationProgress(null);

    try {
      // Build query parameters for SSE endpoint
      const params = new URLSearchParams();
      if (limit !== null) params.set('limit', limit.toString());
      if (minScore !== null) params.set('min_score', minScore.toString());

      // Use direct backend URL for SSE to avoid Next.js proxy buffering
      const url = `${SSE_BACKEND_URL}/api/processing/metadata/verify-stream${params.toString() ? `?${params.toString()}` : ''}`;

      // Connect to SSE endpoint
      if (verificationStreamRef.current) {
        verificationStreamRef.current.close();
      }
      const eventSource = new EventSource(url);
      verificationStreamRef.current = eventSource;
      setMetadataBusy(false);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'status') {
            // Append status message
            setLiveVerificationStatus((prev) => [...prev, data.message]);
            setCurrentVerificationStatus(data.message);
          } else if (data.type === 'progress') {
            // Update progress counters after each song
            setVerificationProgress({
              verified: data.verified,
              processed: data.processed,
              skipped: data.skipped,
              album_images: data.album_images,
              artist_images: data.artist_images,
            });
            // Also refresh stats so the verified count updates in real-time
            refreshStats();
          } else if (data.type === 'complete') {
            // Verification complete
            const albumImagesMsg = data.album_images > 0 ? `, ${data.album_images} album covers` : '';
            const artistImagesMsg = data.artist_images > 0 ? `, ${data.artist_images} artist images` : '';
            setLiveVerificationStatus((prev) => [
              ...prev,
              `\nVerification complete: ${data.verified}/${data.processed} verified, ${data.skipped} skipped${albumImagesMsg}${artistImagesMsg}`,
            ]);
            setCurrentVerificationStatus(
              `Verification complete: ${data.verified}/${data.processed} verified`
            );
            setActionMessage(`Verification complete: ${data.verified}/${data.processed} verified`);
            eventSource.close();
            verificationStreamRef.current = null;
            setVerificationInProgress(false);
            setMetadataBusy(false);
            setVerificationProgress(null);
            refreshMetadataStatus();
            refreshStats();
          } else if (data.type === 'error') {
            // Error occurred
            setLiveVerificationStatus((prev) => [...prev, `\nError: ${data.message}`]);
            setCurrentVerificationStatus(`Error: ${data.message}`);
            setActionError(data.message);
            eventSource.close();
            verificationStreamRef.current = null;
            setVerificationInProgress(false);
            setMetadataBusy(false);
            setVerificationProgress(null);
          }
        } catch (parseError) {
          console.error('Failed to parse SSE message:', parseError);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setActionError('Connection to verification stream lost.');
        eventSource.close();
        verificationStreamRef.current = null;
        setVerificationInProgress(false);
        setMetadataBusy(false);
        setCurrentVerificationStatus('Connection to verification stream lost.');
      };

      // Store event source to allow cancellation
      (eventSource as any)._cleanup = () => {
        eventSource.close();
        verificationStreamRef.current = null;
        setVerificationInProgress(false);
        setMetadataBusy(false);
        setCurrentVerificationStatus('Verification stopped.');
      };
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to start verification.'
      );
      setVerificationInProgress(false);
      setMetadataBusy(false);
    }
  };

  const handleStopVerification = async () => {
    setActionMessage(null);
    setActionError(null);
    setMetadataBusy(true);
    try {
      const results = await Promise.allSettled([
        fetchJson('/api/processing/metadata/verify/stop', { method: 'POST' }),
        fetchJson('/api/library/metadata/stop', {
          method: 'POST',
          body: JSON.stringify({ task: 'verification' }),
        }),
      ]);
      const success = results.some((result) => result.status === 'fulfilled');
      if (!success) {
        throw new Error('Stop request failed.');
      }
      setActionMessage('Verification stop requested.');
      setCurrentVerificationStatus('Stop requested.');
      refreshMetadataStatus();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to stop verification.'
      );
    } finally {
      if (verificationStreamRef.current) {
        verificationStreamRef.current.close();
        verificationStreamRef.current = null;
      }
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

    setMetadataBusy(true);
    setImageSyncInProgress(true);
    setLiveImageSyncStatus(['Starting image & profile sync...']);
    setCurrentImageSyncStatus('Starting image & profile sync...');
    setImageSyncProgress(null);

    try {
      // Build query parameters for SSE endpoint
      const params = new URLSearchParams();
      if (limitSongs !== null) params.set('limit_songs', limitSongs.toString());
      if (limitArtists !== null) params.set('limit_artists', limitArtists.toString());
      if (rateLimit !== null) params.set('rate_limit', rateLimit.toString());
      if (imageForm.dryRun) params.set('dry_run', 'true');

      // Use direct backend URL for SSE to avoid Next.js proxy buffering
      const url = `${SSE_BACKEND_URL}/api/processing/metadata/images-stream${params.toString() ? `?${params.toString()}` : ''}`;

      // Connect to SSE endpoint
      if (imageSyncStreamRef.current) {
        imageSyncStreamRef.current.close();
      }
      const eventSource = new EventSource(url);
      imageSyncStreamRef.current = eventSource;
      setMetadataBusy(false);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'status') {
            // Append status message
            setLiveImageSyncStatus((prev) => [...prev, data.message]);
            setCurrentImageSyncStatus(data.message);
          } else if (data.type === 'progress') {
            // Update progress counters
            setImageSyncProgress({
              songs_processed: data.songs_processed,
              song_images: data.song_images,
              album_images: data.album_images,
              artist_profiles: data.artist_profiles,
              artist_images: data.artist_images,
              skipped: data.skipped,
              failed: data.failed,
            });
          } else if (data.type === 'complete') {
            // Sync complete
            setLiveImageSyncStatus((prev) => [
              ...prev,
              `\nSync complete: ${data.songs_processed} songs processed, ${data.song_images} song images, ${data.album_images} album images, ${data.artist_profiles} artist profiles, ${data.artist_images} artist images`,
            ]);
            setCurrentImageSyncStatus(
              `Sync complete: ${data.songs_processed} songs, ${data.song_images + data.album_images + data.artist_images} images`
            );
            setActionMessage(`Image sync complete: ${data.songs_processed} songs processed`);
            eventSource.close();
            imageSyncStreamRef.current = null;
            setImageSyncInProgress(false);
            setMetadataBusy(false);
            setImageSyncProgress(null);
            refreshMetadataStatus();
            refreshStats();
          } else if (data.type === 'error') {
            // Error occurred
            setLiveImageSyncStatus((prev) => [...prev, `\nError: ${data.message}`]);
            setCurrentImageSyncStatus(`Error: ${data.message}`);
            setActionError(data.message);
            eventSource.close();
            imageSyncStreamRef.current = null;
            setImageSyncInProgress(false);
            setMetadataBusy(false);
            setImageSyncProgress(null);
          }
        } catch (parseError) {
          console.error('Failed to parse SSE message:', parseError);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setActionError('Connection to image sync stream lost.');
        eventSource.close();
        imageSyncStreamRef.current = null;
        setImageSyncInProgress(false);
        setMetadataBusy(false);
        setCurrentImageSyncStatus('Connection to image sync stream lost.');
      };
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to start image sync.'
      );
      setImageSyncInProgress(false);
      setMetadataBusy(false);
    }
  };

  const handleStopImageSync = async () => {
    setActionMessage(null);
    setActionError(null);
    setMetadataBusy(true);
    try {
      const results = await Promise.allSettled([
        fetchJson('/api/processing/metadata/images/stop', { method: 'POST' }),
        fetchJson('/api/library/metadata/stop', {
          method: 'POST',
          body: JSON.stringify({ task: 'images' }),
        }),
      ]);
      const success = results.some((result) => result.status === 'fulfilled');
      if (!success) {
        throw new Error('Stop request failed.');
      }
      setActionMessage('Image sync stop requested.');
      setCurrentImageSyncStatus('Stop requested.');
      refreshMetadataStatus();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to stop image sync.'
      );
    } finally {
      if (imageSyncStreamRef.current) {
        imageSyncStreamRef.current.close();
        imageSyncStreamRef.current = null;
      }
      setImageSyncInProgress(false);
      setMetadataBusy(false);
    }
  };

  // VGGish Embedding handlers
  const handleSaveVggishConfig = async () => {
    setVggishBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const payload: Record<string, unknown> = {};
      const targetSr = parseInt(vggishForm.target_sample_rate, 10);
      if (!isNaN(targetSr)) payload.target_sample_rate = targetSr;
      const frameSec = parseFloat(vggishForm.frame_sec);
      if (!isNaN(frameSec)) payload.frame_sec = frameSec;
      const hopSec = parseFloat(vggishForm.hop_sec);
      if (!isNaN(hopSec)) payload.hop_sec = hopSec;
      const stftWin = parseFloat(vggishForm.stft_window_sec);
      if (!isNaN(stftWin)) payload.stft_window_sec = stftWin;
      const stftHop = parseFloat(vggishForm.stft_hop_sec);
      if (!isNaN(stftHop)) payload.stft_hop_sec = stftHop;
      const numMel = parseInt(vggishForm.num_mel_bins, 10);
      if (!isNaN(numMel)) payload.num_mel_bins = numMel;
      const melMin = parseInt(vggishForm.mel_min_hz, 10);
      if (!isNaN(melMin)) payload.mel_min_hz = melMin;
      const melMax = parseInt(vggishForm.mel_max_hz, 10);
      if (!isNaN(melMax)) payload.mel_max_hz = melMax;
      const logOff = parseFloat(vggishForm.log_offset);
      if (!isNaN(logOff)) payload.log_offset = logOff;
      payload.device_preference = vggishForm.device_preference;
      const gpuMem = parseFloat(vggishForm.gpu_memory_fraction);
      if (!isNaN(gpuMem)) payload.gpu_memory_fraction = gpuMem;
      payload.gpu_allow_growth = vggishForm.gpu_allow_growth;
      payload.use_postprocess = vggishForm.use_postprocess;

      await fetchJson<VggishSettingsResponse>('/api/settings/vggish', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setActionMessage('VGGish configuration saved.');
      refreshVggishSettings();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to save VGGish config.');
    } finally {
      setVggishBusy(false);
    }
  };

  const handleRecalculateEmbeddings = async () => {
    if (embeddingInProgress) return;

    // Close any existing stream
    if (embeddingStreamRef.current) {
      embeddingStreamRef.current.close();
      embeddingStreamRef.current = null;
    }

    setEmbeddingInProgress(true);
    setLiveEmbeddingStatus([]);
    setEmbeddingProgress(null);
    setCurrentEmbeddingStatus('Starting...');
    setActionError(null);

    const params = new URLSearchParams();
    if (vggishRecalcForm.limit.trim()) {
      params.set('limit', vggishRecalcForm.limit.trim());
    }
    if (vggishRecalcForm.force) {
      params.set('force', 'true');
    }

    const url = `${SSE_BACKEND_URL}/api/settings/vggish/recalculate-stream?${params.toString()}`;
    const eventSource = new EventSource(url);
    embeddingStreamRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status') {
          setLiveEmbeddingStatus((prev) => [...prev, data.message]);
          setCurrentEmbeddingStatus(data.message);
        } else if (data.type === 'progress') {
          setEmbeddingProgress({
            processed: data.processed,
            recalculated: data.recalculated,
            skipped: data.skipped,
            failed: data.failed,
            total: data.total,
          });
          refreshStats();
        } else if (data.type === 'complete') {
          setLiveEmbeddingStatus((prev) => [
            ...prev,
            `\nComplete: ${data.recalculated} recalculated, ${data.skipped} skipped, ${data.failed} failed`,
          ]);
          setCurrentEmbeddingStatus('Complete');
          eventSource.close();
          embeddingStreamRef.current = null;
          setEmbeddingInProgress(false);
          refreshVggishSettings();
          refreshStats();
        } else if (data.type === 'error') {
          setLiveEmbeddingStatus((prev) => [...prev, `\nError: ${data.message}`]);
          setCurrentEmbeddingStatus(`Error: ${data.message}`);
          setActionError(data.message);
          eventSource.close();
          embeddingStreamRef.current = null;
          setEmbeddingInProgress(false);
        }
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    };

    eventSource.onerror = () => {
      setCurrentEmbeddingStatus('Connection error');
      setEmbeddingInProgress(false);
      eventSource.close();
      embeddingStreamRef.current = null;
    };
  };

  const handleStopEmbeddingRecalc = async () => {
    try {
      await fetchJson('/api/settings/vggish/recalculate/stop', { method: 'POST' });
      setCurrentEmbeddingStatus('Stop requested...');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to stop recalculation.');
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
              <div className="space-y-6">
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

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center gap-3">
                    <ArrowUpTrayIcon className="h-5 w-5 text-gray-300" />
                    <h2 className="text-xl font-semibold">Import Local Files</h2>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">
                    Add audio or video files directly from your computer. Files are converted to MP3,
                    hashed, embedded, and stored like any other pipeline entry.
                  </p>

                  <input
                    ref={importInputRef}
                    type="file"
                    multiple
                    accept="audio/*,video/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.wma,.mp4,.mov,.mkv,.webm,.avi,.flv,.wmv,.m4v"
                    onChange={handleImportSelect}
                    className="hidden"
                  />

                  <div className="flex flex-wrap items-center gap-3 mt-5">
                    <button
                      onClick={() => importInputRef.current?.click()}
                      disabled={importBusy}
                      className="inline-flex items-center gap-2 rounded-full bg-gray-800 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
                    >
                      <ArrowUpTrayIcon className="h-4 w-4" />
                      Choose Files
                    </button>
                    <button
                      onClick={handleImportUpload}
                      disabled={importBusy || importFiles.length === 0 || importOverLimit}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                    >
                      {importBusy ? 'Importing...' : 'Import Selected'}
                    </button>
                    {importFiles.length > 0 && (
                      <button
                        onClick={() => {
                          setImportFiles([]);
                          setImportMessage(null);
                          setImportError(null);
                        }}
                        disabled={importBusy}
                        className="inline-flex items-center gap-2 rounded-full border border-gray-700 px-4 py-2 text-xs font-semibold text-gray-200 hover:border-gray-500 disabled:opacity-50"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>

                  {importFiles.length > 0 && (
                    <div className="mt-4 text-sm text-gray-300">
                      <p>
                        Selected {importFiles.length} file{importFiles.length === 1 ? '' : 's'} (
                        {formatBytes(importTotalBytes)} total).
                      </p>
                      <ul className="mt-2 space-y-1 text-gray-400">
                        {importFiles.slice(0, 4).map((file) => (
                          <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
                        ))}
                        {importFiles.length > 4 && (
                          <li>...and {importFiles.length - 4} more</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {(importMessage || importError) && (
                    <div
                      className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                        importError
                          ? 'border-red-500/40 bg-red-500/10 text-red-200'
                          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                      }`}
                    >
                      {importError ?? importMessage}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'downloads' && (
              <div className="space-y-6">
                {/* Acquisition Backend Configuration */}
                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <button
                      onClick={() => setIsBackendCollapsed(!isBackendCollapsed)}
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      <ArrowDownTrayIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">Acquisition Backend</h2>
                      {isBackendCollapsed ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>

                  {!isBackendCollapsed && acquisitionSettings && (
                    <div className="space-y-4 text-sm text-gray-300">
                      <div>
                        <p className="mb-3 text-gray-400">
                          Configure authentication for music acquisition. yt-dlp supports browser cookies for downloading age-restricted or member-only content.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Active Backend
                          </label>
                          <div className="text-sm">
                            <span className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium">
                              {acquisitionSettings.active_backend}
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Cookies File Path
                          </label>
                          <input
                            type="text"
                            value={backendCookiesFile}
                            onChange={(e) => setBackendCookiesFile(e.target.value)}
                            placeholder="~/.config/yt-dlp/cookies.txt"
                            className="w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                          />
                          <p className="mt-2 text-xs text-gray-500">
                            Export browser cookies using an extension like "Get cookies.txt LOCALLY" (Chrome/Firefox).
                            Cookies enable access to age-restricted content and authenticated downloads.
                          </p>
                          <div className="mt-2 p-2 rounded-lg bg-yellow-900/20 border border-yellow-700/30">
                            <p className="text-xs text-yellow-400">
                              <strong>Important:</strong> Cookies expire after a period of time (usually 1-2 weeks). If downloads start failing with "Sign in to confirm you're not a bot" errors, re-export fresh cookies from your browser and update the path.
                            </p>
                          </div>
                        </div>

                        {backendTestResult && (
                          <div className={`rounded-lg p-3 text-sm ${
                            backendTestResult.startsWith('✓')
                              ? 'bg-green-900/30 border border-green-700/50 text-green-400'
                              : 'bg-red-900/30 border border-red-700/50 text-red-400'
                          }`}>
                            {backendTestResult}
                          </div>
                        )}

                        <div className="flex gap-3">
                          <button
                            onClick={() => updateAcquisitionBackend(acquisitionSettings.active_backend, backendCookiesFile)}
                            disabled={backendBusy}
                            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                          >
                            {backendBusy ? 'Saving...' : 'Save Configuration'}
                          </button>
                          <button
                            onClick={() => testAcquisitionBackend(acquisitionSettings.active_backend)}
                            disabled={backendBusy}
                            className="rounded-xl bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                          >
                            {backendBusy ? 'Testing...' : 'Test Connection'}
                          </button>
                        </div>

                        <div className="pt-3 border-t border-gray-800">
                          <details className="text-xs text-gray-500">
                            <summary className="cursor-pointer hover:text-gray-400">
                              How to export cookies from your browser
                            </summary>
                            <div className="mt-3 space-y-2 pl-4">
                              <p><strong>Chrome/Edge:</strong></p>
                              <ol className="list-decimal list-inside space-y-1">
                                <li>Install "Get cookies.txt LOCALLY" extension</li>
                                <li>Navigate to youtube.com (while logged in)</li>
                                <li>Click the extension icon and select "Export"</li>
                                <li>Save the file and enter its path above</li>
                              </ol>
                              <p className="pt-2"><strong>Firefox:</strong></p>
                              <ol className="list-decimal list-inside space-y-1">
                                <li>Install "cookies.txt" extension</li>
                                <li>Navigate to youtube.com (while logged in)</li>
                                <li>Click the extension icon and export cookies</li>
                                <li>Save the file and enter its path above</li>
                              </ol>
                            </div>
                          </details>

                          <details className="text-xs text-gray-500 mt-2">
                            <summary className="cursor-pointer hover:text-gray-400">
                              Troubleshooting: "Sign in to confirm you're not a bot" error
                            </summary>
                            <div className="mt-3 space-y-2 pl-4">
                              <p><strong>This error means your cookies are expired or invalid. Try these steps:</strong></p>
                              <ol className="list-decimal list-inside space-y-1">
                                <li>Make sure you're logged into YouTube in your browser</li>
                                <li>Export fresh cookies (cookies expire every 1-2 weeks)</li>
                                <li>Verify the cookies file path is correct (use absolute path, not relative)</li>
                                <li>Check the file exists: run <code className="bg-gray-800 px-1 rounded">ls -la /path/to/cookies.txt</code></li>
                                <li>After updating cookies, click "Save Configuration" then "Test Connection"</li>
                                <li>If still failing, try logging out and back into YouTube, then re-export cookies</li>
                              </ol>
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <button
                      onClick={() => setIsPipelineCollapsed(!isPipelineCollapsed)}
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      <PlayIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">Run Pipeline</h2>
                      {isPipelineCollapsed ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        pipelineStatus.running ? 'bg-green-500/20 text-green-200' : 'bg-gray-800 text-gray-300'
                      }`}
                    >
                      {pipelineStatus.running ? 'Running' : 'Idle'}
                    </span>
                  </div>

                  {!isPipelineCollapsed && (
                    <>
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
                    <div className="flex flex-wrap items-center gap-3">
                      {pipelineStatus.running && (
                        <button
                          onClick={handleStopPipeline}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-full border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Stop pipeline
                        </button>
                      )}
                      <button
                        onClick={handleRunPipeline}
                        disabled={busy || pipelineStatus.running}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                      >
                        <PlayIcon className="h-4 w-4" />
                        Start pipeline
                      </button>
                    </div>
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
                    </>
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

                <CollapsibleSection
                  title="Recent Activity"
                  icon={<QueueListIcon className="h-5 w-5 text-gray-300" />}
                  isCollapsed={isRecentActivityCollapsed}
                  onToggle={() => setIsRecentActivityCollapsed(!isRecentActivityCollapsed)}
                >
                  <div className="space-y-3 text-sm text-gray-300">
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
                        {event.path ? (
                          <p className="text-xs text-gray-500 truncate">
                            {String(event.path)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <CollapsiblePanel
                    title="Database Overview"
                    icon={<ChartBarIcon className="h-5 w-5 text-gray-300" />}
                    isCollapsed={statsCollapsed}
                    onToggle={() => setStatsCollapsed(!statsCollapsed)}
                  >
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
                  </CollapsiblePanel>

                  <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <QueueListIcon className="h-5 w-5 text-gray-300" />
                        <h2 className="text-xl font-semibold">Queue Breakdown</h2>
                      </div>
                      <button
                        onClick={() => setQueueBreakdownCollapsed(!queueBreakdownCollapsed)}
                        className="rounded-full p-1 text-gray-400 hover:text-white"
                        title={queueBreakdownCollapsed ? "Expand" : "Collapse"}
                      >
                        {queueBreakdownCollapsed ? (
                          <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                          <ChevronUpIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    {!queueBreakdownCollapsed && (
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
                    )}
                  </section>
                </div>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <InformationCircleIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">Song Metadata</h2>
                    </div>
                    <button
                      onClick={() => setSongMetadataCollapsed(!songMetadataCollapsed)}
                      className="rounded-full p-1 text-gray-400 hover:text-white"
                      title={songMetadataCollapsed ? "Expand" : "Collapse"}
                    >
                      {songMetadataCollapsed ? (
                        <ChevronDownIcon className="h-5 w-5" />
                      ) : (
                        <ChevronUpIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {!songMetadataCollapsed && (
                    <>
                      <p className="text-sm text-gray-400 mt-2">
                        Review stored songs and edit metadata. Updates will reconcile artist and album
                        records when possible.
                      </p>

                  <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[220px]">
                          <MagnifyingGlassIcon className="h-4 w-4 text-gray-500 absolute left-3 top-3" />
                          <input
                            value={catalogQuery}
                            onChange={(e) => {
                              setCatalogQuery(e.target.value);
                              setCatalogPage(1);
                            }}
                            className="w-full rounded-xl bg-gray-800 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/30"
                            placeholder="Search by song, artist, or album"
                          />
                        </div>
                        <select
                          value={catalogPageSize}
                          onChange={(e) => {
                            setCatalogPageSize(Number(e.target.value));
                            setCatalogPage(1);
                          }}
                          className="rounded-xl bg-gray-800 px-3 py-2 text-sm text-white"
                        >
                          {[10, 25, 50, 100].map((value) => (
                            <option key={value} value={value}>
                              {value} per page
                            </option>
                          ))}
                        </select>
                      </div>

                      {catalogError && (
                        <p className="text-sm text-red-300">{catalogError}</p>
                      )}

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="text-gray-400">
                            <tr>
                              <th className="py-2 pr-4">Title</th>
                              <th className="py-2 pr-4">Artist</th>
                              <th className="py-2 pr-4">Album</th>
                              <th className="py-2 pr-4">Status</th>
                              <th className="py-2 pr-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catalogItems.length === 0 && (
                              <tr>
                                <td colSpan={5} className="py-6 text-gray-500">
                                  No songs found in the metadata catalog yet.
                                </td>
                              </tr>
                            )}
                            {catalogItems.map((item) => {
                              const selected = item.sha_id === selectedSongId;
                              const verifyBusy = Boolean(songVerifyBusy[item.sha_id]);
                              const disableVerify =
                                verifyBusy ||
                                metadataBusy ||
                                metadataStatus.verification.running ||
                                verificationInProgress;
                              return (
                                <tr
                                  key={item.sha_id}
                                  className={`border-t border-gray-800 ${
                                    selected ? 'bg-white/5' : ''
                                  }`}
                                >
                                  <td className="py-3 pr-4">
                                    <p className="font-medium text-white">
                                      {item.title || 'Untitled'}
                                    </p>
                                    {item.track_number && (
                                      <p className="text-xs text-gray-500">
                                        Track {item.track_number}
                                      </p>
                                    )}
                                  </td>
                                  <td className="py-3 pr-4 text-gray-300">
                                    {item.artists?.[0] || 'Unknown'}
                                  </td>
                                  <td className="py-3 pr-4 text-gray-400">
                                    {item.album || '--'}
                                  </td>
                                  <td className="py-3 pr-4">
                                    <span
                                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                        item.verified ? 'bg-emerald-500/20 text-emerald-200' : 'bg-gray-800 text-gray-300'
                                      }`}
                                    >
                                      {item.verified ? 'Verified' : 'Unverified'}
                                    </span>
                                  </td>
                                  <td className="py-3 pr-2 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => handleVerifySong(item.sha_id, item.title)}
                                        disabled={disableVerify}
                                        className="inline-flex items-center justify-center rounded-full border border-gray-700 p-2 text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50"
                                        title="Verify metadata"
                                      >
                                        <ArrowPathIcon
                                          className={`h-4 w-4 ${verifyBusy ? 'animate-spin' : ''}`}
                                        />
                                      </button>
                                      <button
                                        onClick={() => handleSelectSong(item.sha_id)}
                                        className="inline-flex items-center justify-center rounded-full border border-gray-700 p-2 text-gray-300 hover:border-gray-500 hover:text-white"
                                        title="View song info"
                                      >
                                        <InformationCircleIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
                        <span>
                          {catalogTotal} song{catalogTotal === 1 ? '' : 's'} · Page {catalogPage} of{' '}
                          {catalogPageCount}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCatalogPage((prev) => Math.max(1, prev - 1))}
                            disabled={catalogPage <= 1}
                            className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-200 disabled:opacity-50"
                          >
                            Prev
                          </button>
                          <button
                            onClick={() =>
                              setCatalogPage((prev) => Math.min(catalogPageCount, prev + 1))
                            }
                            disabled={catalogPage >= catalogPageCount}
                            className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-200 disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>

                    <aside className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5 lg:sticky lg:top-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Song Info</h3>
                        {selectedSongId && (
                          <button
                            onClick={() => setSelectedSongId(null)}
                            className="rounded-full border border-gray-700 p-1 text-gray-400 hover:border-gray-500 hover:text-white"
                            title="Close"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {!selectedSongId && (
                        <p className="mt-4 text-sm text-gray-500">
                          Select a song to view and edit metadata.
                        </p>
                      )}

                      {songDetailBusy && (
                        <p className="mt-4 text-sm text-gray-400">Loading song metadata…</p>
                      )}

                      {songDetailError && (
                        <p className="mt-4 text-sm text-red-300">{songDetailError}</p>
                      )}

                      {songDetail && !songDetailBusy && (
                        <div className="mt-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs uppercase text-gray-500">Title</p>
                              <p className="text-lg font-semibold text-white">
                                {songDetail.title || 'Untitled'}
                              </p>
                            </div>
                            {!songEditMode && (
                              <button
                                onClick={handleSongEdit}
                                className="inline-flex items-center gap-2 rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-200 hover:border-gray-500"
                              >
                                <PencilSquareIcon className="h-4 w-4" />
                                Edit
                              </button>
                            )}
                          </div>

                          {(songSaveError || songSaveMessage) && (
                            <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2 text-sm">
                              {songSaveError && (
                                <p className="text-sm text-red-300">{songSaveError}</p>
                              )}
                              {songSaveMessage && (
                                <p className="text-sm text-emerald-300">{songSaveMessage}</p>
                              )}
                            </div>
                          )}

                          {songEditMode ? (
                            <div className="space-y-3 text-sm text-gray-300">
                              <label className="block">
                                Song title
                                <input
                                  value={songEditForm.title}
                                  onChange={(e) =>
                                    setSongEditForm((prev) => ({
                                      ...prev,
                                      title: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-xl bg-gray-800 px-3 py-2 text-sm text-white"
                                />
                              </label>
                              <label className="block">
                                Artist (comma-separated)
                                <input
                                  value={songEditForm.artist}
                                  onChange={(e) =>
                                    setSongEditForm((prev) => ({
                                      ...prev,
                                      artist: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-xl bg-gray-800 px-3 py-2 text-sm text-white"
                                />
                              </label>
                              <label className="block">
                                Album
                                <input
                                  value={songEditForm.album}
                                  onChange={(e) =>
                                    setSongEditForm((prev) => ({
                                      ...prev,
                                      album: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-xl bg-gray-800 px-3 py-2 text-sm text-white"
                                />
                              </label>
                              <label className="block">
                                Genre (comma-separated)
                                <input
                                  value={songEditForm.genre}
                                  onChange={(e) =>
                                    setSongEditForm((prev) => ({
                                      ...prev,
                                      genre: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-xl bg-gray-800 px-3 py-2 text-sm text-white"
                                />
                              </label>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="block">
                                  Release year
                                  <input
                                    value={songEditForm.releaseYear}
                                    onChange={(e) =>
                                      setSongEditForm((prev) => ({
                                        ...prev,
                                        releaseYear: e.target.value,
                                      }))
                                    }
                                    className="mt-1 w-full rounded-xl bg-gray-800 px-3 py-2 text-sm text-white"
                                  />
                                </label>
                                <label className="block">
                                  Track number
                                  <input
                                    value={songEditForm.trackNumber}
                                    onChange={(e) =>
                                      setSongEditForm((prev) => ({
                                        ...prev,
                                        trackNumber: e.target.value,
                                      }))
                                    }
                                    className="mt-1 w-full rounded-xl bg-gray-800 px-3 py-2 text-sm text-white"
                                  />
                                </label>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 pt-2">
                                <button
                                  onClick={handleSongSave}
                                  disabled={songSaveBusy}
                                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                                >
                                  {songSaveBusy ? 'Saving...' : 'Save changes'}
                                </button>
                                <button
                                  onClick={handleSongCancel}
                                  disabled={songSaveBusy}
                                  className="rounded-full border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:border-gray-500 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3 text-sm text-gray-300">
                              <div>
                                <p className="text-xs uppercase text-gray-500">Artist</p>
                                {songDetail.primary_artist_id ? (
                                  <Link
                                    href={`/artist/${songDetail.primary_artist_id}`}
                                    className="text-white hover:underline"
                                  >
                                    {songDetail.primary_artist_name || songDetail.artists?.[0]}{' '}
                                    <span className="text-xs text-gray-500">(profile)</span>
                                  </Link>
                                ) : (
                                  <p className="text-white">
                                    {songDetail.primary_artist_name ||
                                      songDetail.artists?.[0] ||
                                      '--'}
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-500">Album</p>
                                {songDetail.album_id ? (
                                  <Link
                                    href={`/album/${songDetail.album_id}`}
                                    className="text-white hover:underline"
                                  >
                                    {songDetail.album || 'Unknown album'}{' '}
                                    <span className="text-xs text-gray-500">(album)</span>
                                  </Link>
                                ) : (
                                  <p className="text-white">{songDetail.album || '--'}</p>
                                )}
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <p className="text-xs uppercase text-gray-500">Track</p>
                                  <p className="text-white">
                                    {songDetail.track_number ?? '--'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs uppercase text-gray-500">Release</p>
                                  <p className="text-white">
                                    {songDetail.album_release_date ||
                                      songDetail.album_release_year ||
                                      songDetail.release_year ||
                                      '--'}
                                  </p>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-500">Genres</p>
                                <p className="text-white">{formatList(songDetail.genres)}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-500">Producers</p>
                                <p className="text-white">{formatList(songDetail.producers)}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-500">Labels</p>
                                <p className="text-white">{formatList(songDetail.labels)}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase text-gray-500">Verified</p>
                                <p className="text-white">
                                  {songDetail.verified ? 'Yes' : 'No'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </aside>
                  </div>
                    </>
                  )}
                </section>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ArrowPathIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">Metadata Verification</h2>
                    </div>
                    <button
                      onClick={() => setMetadataVerificationCollapsed(!metadataVerificationCollapsed)}
                      className="rounded-full p-1 text-gray-400 hover:text-white"
                      title={metadataVerificationCollapsed ? "Expand" : "Collapse"}
                    >
                      {metadataVerificationCollapsed ? (
                        <ChevronDownIcon className="h-5 w-5" />
                      ) : (
                        <ChevronUpIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {!metadataVerificationCollapsed && (
                    <>
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
                    <div className="flex flex-wrap items-center gap-3">
                      {(verificationInProgress || metadataStatus.verification.running) && (
                        <button
                          onClick={handleStopVerification}
                          disabled={metadataBusy}
                          className="inline-flex items-center gap-2 rounded-full border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Stop verification
                        </button>
                      )}
                      <button
                        onClick={handleVerifyMetadata}
                        disabled={metadataBusy || metadataStatus.verification.running || verificationInProgress}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                      >
                        Run verification
                      </button>
                    </div>
                  </div>

                  {(verificationInProgress || metadataStatus.verification.running || latestVerificationStatus) && (
                    <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-300">
                      <p className="text-xs uppercase text-gray-500 mb-2">Current status</p>
                      <p className="text-white">
                        {latestVerificationStatus || 'Waiting for updates...'}
                      </p>
                    </div>
                  )}

                  {/* Live Status Updates */}
                  {liveVerificationStatus.length > 0 && (
                    <div className="mt-4 space-y-4">
                      {/* Progress counters */}
                      {verificationProgress && (
                        <div className="rounded-xl bg-gray-950/50 border border-gray-700 p-4">
                          <p className="text-xs uppercase text-gray-500 mb-3">Progress</p>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div>
                              <div className="text-2xl font-bold text-green-400">{verificationProgress.verified}</div>
                              <div className="text-xs text-gray-400">Verified</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-blue-400">{verificationProgress.processed}</div>
                              <div className="text-xs text-gray-400">Processed</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-yellow-400">{verificationProgress.skipped}</div>
                              <div className="text-xs text-gray-400">Skipped</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-purple-400">{verificationProgress.album_images}</div>
                              <div className="text-xs text-gray-400">Album Covers</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-pink-400">{verificationProgress.artist_images}</div>
                              <div className="text-xs text-gray-400">Artist Images</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Live status log */}
                      <div
                        ref={liveStatusRef}
                        className="rounded-xl bg-gray-950/50 border border-gray-700 p-4 max-h-96 overflow-y-auto"
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
                    </>
                  )}
                </section>

                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ArrowDownTrayIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">Image & Artist Sync</h2>
                    </div>
                    <button
                      onClick={() => setImageSyncCollapsed(!imageSyncCollapsed)}
                      className="rounded-full p-1 text-gray-400 hover:text-white"
                      title={imageSyncCollapsed ? "Expand" : "Collapse"}
                    >
                      {imageSyncCollapsed ? (
                        <ChevronDownIcon className="h-5 w-5" />
                      ) : (
                        <ChevronUpIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {!imageSyncCollapsed && (
                    <>
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
                        {imageSyncInProgress || metadataStatus.images.running ? 'Running' : 'Idle'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {(imageSyncInProgress || metadataStatus.images.running) && (
                        <button
                          onClick={handleStopImageSync}
                          disabled={metadataBusy}
                          className="inline-flex items-center gap-2 rounded-full border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Stop image sync
                        </button>
                      )}
                      <button
                        onClick={handleSyncImages}
                        disabled={metadataBusy || metadataStatus.images.running || imageSyncInProgress}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                      >
                        Sync images & profiles
                      </button>
                    </div>
                  </div>

                  {(imageSyncInProgress || metadataStatus.images.running || currentImageSyncStatus) && (
                    <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-300">
                      <p className="text-xs uppercase text-gray-500 mb-2">Current status</p>
                      <p className="text-white">
                        {currentImageSyncStatus || 'Waiting for updates...'}
                      </p>
                    </div>
                  )}

                  {/* Live Status Updates */}
                  {liveImageSyncStatus.length > 0 && (
                    <div className="mt-4 space-y-4">
                      {/* Progress counters */}
                      {imageSyncProgress && (
                        <div className="rounded-xl bg-gray-950/50 border border-gray-700 p-4">
                          <p className="text-xs uppercase text-gray-500 mb-3">Progress</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <div className="text-2xl font-bold text-blue-400">{imageSyncProgress.songs_processed}</div>
                              <div className="text-xs text-gray-400">Songs Processed</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-green-400">{imageSyncProgress.song_images}</div>
                              <div className="text-xs text-gray-400">Song Images</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-purple-400">{imageSyncProgress.album_images}</div>
                              <div className="text-xs text-gray-400">Album Images</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-pink-400">{imageSyncProgress.artist_profiles}</div>
                              <div className="text-xs text-gray-400">Artist Profiles</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-orange-400">{imageSyncProgress.artist_images}</div>
                              <div className="text-xs text-gray-400">Artist Images</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-yellow-400">{imageSyncProgress.skipped}</div>
                              <div className="text-xs text-gray-400">Skipped</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-red-400">{imageSyncProgress.failed}</div>
                              <div className="text-xs text-gray-400">Failed</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Live status log */}
                      <div
                        ref={liveImageSyncRef}
                        className="rounded-xl bg-gray-950/50 border border-gray-700 p-4 max-h-96 overflow-y-auto"
                      >
                        <p className="text-xs uppercase text-gray-500 mb-2">Live Status</p>
                        <div className="space-y-1 font-mono text-xs text-gray-300">
                          {liveImageSyncStatus.map((status, idx) => (
                            <div key={idx} className="whitespace-pre-wrap">
                              {status}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

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
                    </>
                  )}
                </section>

                {/* VGGish Embeddings Configuration */}
                <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ChartBarIcon className="h-5 w-5 text-gray-300" />
                      <h2 className="text-xl font-semibold">VGGish Embeddings</h2>
                    </div>
                    <button
                      onClick={() => setVggishCollapsed(!vggishCollapsed)}
                      className="rounded-full p-1 text-gray-400 hover:text-white"
                      title={vggishCollapsed ? "Expand" : "Collapse"}
                    >
                      {vggishCollapsed ? (
                        <ChevronDownIcon className="h-5 w-5" />
                      ) : (
                        <ChevronUpIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {!vggishCollapsed && (
                    <>
                      <p className="text-sm text-gray-400 mt-2">
                        Configure VGGish audio embedding parameters and recalculate embeddings for similarity search.
                      </p>

                      {/* Device Info */}
                      {vggishSettings?.devices && vggishSettings.devices.length > 0 && (
                        <div className="mt-4 rounded-xl bg-gray-800/50 p-4">
                          <p className="text-xs uppercase text-gray-500 mb-2">Available Devices</p>
                          <div className="flex flex-wrap gap-2">
                            {vggishSettings.devices.map((device, idx) => (
                              <span
                                key={idx}
                                className={`px-3 py-1 rounded-lg text-xs font-medium ${
                                  device.available
                                    ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                                    : 'bg-gray-800 text-gray-500 border border-gray-700'
                                }`}
                              >
                                {device.device_type.toUpperCase()}: {device.device_name}
                                {device.available ? ' ✓' : ' ✗'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Configuration Form */}
                      <div className="mt-4 space-y-4">
                        <details className="group">
                          <summary className="cursor-pointer text-sm font-medium text-gray-300 hover:text-white">
                            Audio Configuration
                          </summary>
                          <div className="mt-3 grid gap-4 md:grid-cols-3 pl-4">
                            <label className="text-sm text-gray-300">
                              Sample Rate (Hz)
                              <input
                                value={vggishForm.target_sample_rate}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, target_sample_rate: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                                placeholder="16000"
                              />
                            </label>
                            <label className="text-sm text-gray-300">
                              Frame Duration (sec)
                              <input
                                value={vggishForm.frame_sec}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, frame_sec: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                                placeholder="0.96"
                              />
                            </label>
                            <label className="text-sm text-gray-300">
                              Hop Duration (sec)
                              <input
                                value={vggishForm.hop_sec}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, hop_sec: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                                placeholder="0.48"
                              />
                            </label>
                          </div>
                        </details>

                        <details className="group">
                          <summary className="cursor-pointer text-sm font-medium text-gray-300 hover:text-white">
                            Mel Spectrogram Settings
                          </summary>
                          <div className="mt-3 grid gap-4 md:grid-cols-3 pl-4">
                            <label className="text-sm text-gray-300">
                              STFT Window (sec)
                              <input
                                value={vggishForm.stft_window_sec}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, stft_window_sec: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                                placeholder="0.025"
                              />
                            </label>
                            <label className="text-sm text-gray-300">
                              STFT Hop (sec)
                              <input
                                value={vggishForm.stft_hop_sec}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, stft_hop_sec: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                                placeholder="0.010"
                              />
                            </label>
                            <label className="text-sm text-gray-300">
                              Mel Bins
                              <input
                                value={vggishForm.num_mel_bins}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, num_mel_bins: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                                placeholder="64"
                              />
                            </label>
                            <label className="text-sm text-gray-300">
                              Min Frequency (Hz)
                              <input
                                value={vggishForm.mel_min_hz}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, mel_min_hz: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                                placeholder="125"
                              />
                            </label>
                            <label className="text-sm text-gray-300">
                              Max Frequency (Hz)
                              <input
                                value={vggishForm.mel_max_hz}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, mel_max_hz: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                                placeholder="7500"
                              />
                            </label>
                            <label className="text-sm text-gray-300">
                              Log Offset
                              <input
                                value={vggishForm.log_offset}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, log_offset: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                                placeholder="0.01"
                              />
                            </label>
                          </div>
                        </details>

                        <details className="group" open>
                          <summary className="cursor-pointer text-sm font-medium text-gray-300 hover:text-white">
                            Device & Processing Settings
                          </summary>
                          <div className="mt-3 grid gap-4 md:grid-cols-3 pl-4">
                            <label className="text-sm text-gray-300">
                              Device Preference
                              <select
                                value={vggishForm.device_preference}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, device_preference: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                              >
                                <option value="auto">Auto (best available)</option>
                                <option value="cpu">CPU</option>
                                <option value="gpu">GPU (NVIDIA)</option>
                                <option value="metal">Metal (Apple Silicon)</option>
                              </select>
                            </label>
                            <label className="text-sm text-gray-300">
                              GPU Memory Fraction
                              <input
                                value={vggishForm.gpu_memory_fraction}
                                onChange={(e) =>
                                  setVggishForm((prev) => ({ ...prev, gpu_memory_fraction: e.target.value }))
                                }
                                className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                                placeholder="0.8"
                              />
                            </label>
                            <div className="flex flex-col gap-3 pt-6">
                              <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={vggishForm.gpu_allow_growth}
                                  onChange={(e) =>
                                    setVggishForm((prev) => ({ ...prev, gpu_allow_growth: e.target.checked }))
                                  }
                                  className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                                />
                                Allow GPU Memory Growth
                              </label>
                              <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={vggishForm.use_postprocess}
                                  onChange={(e) =>
                                    setVggishForm((prev) => ({ ...prev, use_postprocess: e.target.checked }))
                                  }
                                  className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                                />
                                PCA Postprocessing
                              </label>
                            </div>
                          </div>
                        </details>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={handleSaveVggishConfig}
                          disabled={vggishBusy}
                          className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {vggishBusy ? 'Saving...' : 'Save Configuration'}
                        </button>
                      </div>

                      {/* Recalculate Embeddings Section */}
                      <div className="mt-6 pt-6 border-t border-gray-800">
                        <h3 className="text-lg font-semibold text-white mb-2">Recalculate Embeddings</h3>
                        <p className="text-sm text-gray-400 mb-4">
                          Generate new embeddings for songs missing them, or force recalculate all embeddings with current settings.
                        </p>

                        <div className="grid gap-4 md:grid-cols-2 mb-4">
                          <label className="text-sm text-gray-300">
                            Limit (songs)
                            <input
                              value={vggishRecalcForm.limit}
                              onChange={(e) =>
                                setVggishRecalcForm((prev) => ({ ...prev, limit: e.target.value }))
                              }
                              className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white"
                              placeholder="Leave empty for all"
                            />
                          </label>
                          <div className="flex items-end pb-2">
                            <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                              <input
                                type="checkbox"
                                checked={vggishRecalcForm.force}
                                onChange={(e) =>
                                  setVggishRecalcForm((prev) => ({ ...prev, force: e.target.checked }))
                                }
                                className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                              />
                              Force recalculate (even if embedding exists)
                            </label>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="text-sm text-gray-400">
                            Status:{' '}
                            <span className="text-white font-semibold">
                              {embeddingInProgress || vggishSettings?.embedding_task?.running ? 'Running' : 'Idle'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            {(embeddingInProgress || vggishSettings?.embedding_task?.running) && (
                              <button
                                onClick={handleStopEmbeddingRecalc}
                                className="inline-flex items-center gap-2 rounded-full border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/10"
                              >
                                Stop
                              </button>
                            )}
                            <button
                              onClick={handleRecalculateEmbeddings}
                              disabled={embeddingInProgress || vggishSettings?.embedding_task?.running}
                              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                            >
                              {embeddingInProgress ? 'Processing...' : 'Recalculate'}
                            </button>
                          </div>
                        </div>

                        {/* Current Status */}
                        {(embeddingInProgress || currentEmbeddingStatus) && (
                          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-300">
                            <p className="text-xs uppercase text-gray-500 mb-2">Current status</p>
                            <p className="text-white">
                              {currentEmbeddingStatus || 'Waiting for updates...'}
                            </p>
                          </div>
                        )}

                        {/* Progress */}
                        {embeddingProgress && (
                          <div className="mt-4 rounded-xl bg-gray-950/50 border border-gray-700 p-4">
                            <p className="text-xs uppercase text-gray-500 mb-3">Progress</p>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div>
                                <div className="text-2xl font-bold text-blue-400">{embeddingProgress.processed}</div>
                                <div className="text-xs text-gray-400">Processed</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-green-400">{embeddingProgress.recalculated}</div>
                                <div className="text-xs text-gray-400">Generated</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-yellow-400">{embeddingProgress.skipped}</div>
                                <div className="text-xs text-gray-400">Skipped</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-red-400">{embeddingProgress.failed}</div>
                                <div className="text-xs text-gray-400">Failed</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-gray-400">{embeddingProgress.total}</div>
                                <div className="text-xs text-gray-400">Total</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Live Status Log */}
                        {liveEmbeddingStatus.length > 0 && (
                          <div
                            ref={liveEmbeddingStatusRef}
                            className="mt-4 rounded-xl bg-gray-950/50 border border-gray-700 p-4 max-h-64 overflow-y-auto"
                          >
                            <p className="text-xs uppercase text-gray-500 mb-2">Live Status</p>
                            <div className="space-y-1 font-mono text-xs text-gray-300">
                              {liveEmbeddingStatus.map((status, idx) => (
                                <div key={idx} className="whitespace-pre-wrap">
                                  {status}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Last Run Info */}
                        {vggishSettings?.embedding_task?.last_result && (
                          <div className="mt-4 grid gap-3 text-sm text-gray-300 md:grid-cols-2">
                            <div>
                              <p className="text-xs uppercase text-gray-500">Last run</p>
                              <p className="text-white">
                                {vggishSettings.embedding_task.finished_at
                                  ? new Date(vggishSettings.embedding_task.finished_at).toLocaleString()
                                  : '--'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-gray-500">Last result</p>
                              <p className="text-white">
                                Generated {vggishSettings.embedding_task.last_result.recalculated} ·
                                Skipped {vggishSettings.embedding_task.last_result.skipped} ·
                                Failed {vggishSettings.embedding_task.last_result.failed}
                              </p>
                            </div>
                          </div>
                        )}

                        {vggishSettings?.embedding_task?.last_error && (
                          <p className="mt-3 text-sm text-red-300">
                            {vggishSettings.embedding_task.last_error}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
