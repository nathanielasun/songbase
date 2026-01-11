'use client';

import { useEffect, useState } from 'react';
import { ArrowDownTrayIcon, Cog8ToothIcon, CpuChipIcon, FolderIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

type SettingsPayload = {
  pipeline: {
    download_limit: number | null;
    process_limit: number | null;
    download_workers: number | null;
    pcm_workers: number | null;
    hash_workers: number | null;
    embed_workers: number | null;
    verify: boolean;
    images: boolean;
  };
  paths: {
    preprocessed_cache_dir: string;
    metadata_dir: string;
    song_cache_dir: string;
  };
  download_filename_format?: string;
  vggish?: {
    target_sample_rate: number;
    device_preference: string;
    gpu_memory_fraction: number;
    gpu_allow_growth: boolean;
    use_postprocess: boolean;
  };
};

type ResetResponse = {
  songs_deleted: number;
  embeddings_deleted: number;
  song_cache_entries_deleted: number;
  embedding_files_deleted: number;
  albums_deleted: number;
  album_tracks_deleted: number;
  artist_profiles_deleted: number;
  album_images_deleted: number;
  song_images_deleted: number;
  image_assets_deleted: number;
};

type FormState = {
  downloadLimit: string;
  processLimit: string;
  downloadWorkers: string;
  pcmWorkers: string;
  hashWorkers: string;
  embedWorkers: string;
  verify: boolean;
  images: boolean;
  preprocessedCacheDir: string;
  metadataDir: string;
  songCacheDir: string;
  downloadFilenameFormat: string;
  // PCM Processing settings
  targetSampleRate: string;
  devicePreference: string;
  gpuMemoryFraction: string;
  gpuAllowGrowth: boolean;
  usePostprocess: boolean;
};

const emptyForm: FormState = {
  downloadLimit: '',
  processLimit: '',
  downloadWorkers: '',
  pcmWorkers: '',
  hashWorkers: '',
  embedWorkers: '',
  verify: true,
  images: true,
  preprocessedCacheDir: '',
  metadataDir: '',
  songCacheDir: '',
  downloadFilenameFormat: '{artist} - {title}',
  // PCM Processing defaults
  targetSampleRate: '16000',
  devicePreference: 'auto',
  gpuMemoryFraction: '0.8',
  gpuAllowGrowth: true,
  usePostprocess: true,
};

export default function SettingsPage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetEmbeddings, setResetEmbeddings] = useState(false);
  const [resetHashedMusic, setResetHashedMusic] = useState(false);
  const [resetArtistAlbum, setResetArtistAlbum] = useState(false);
  const [resetSongMetadata, setResetSongMetadata] = useState(false);

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

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await fetchJson<SettingsPayload>('/api/settings');
        setForm({
          downloadLimit: data.pipeline.download_limit?.toString() ?? '',
          processLimit: data.pipeline.process_limit?.toString() ?? '',
          downloadWorkers: data.pipeline.download_workers?.toString() ?? '',
          pcmWorkers: data.pipeline.pcm_workers?.toString() ?? '',
          hashWorkers: data.pipeline.hash_workers?.toString() ?? '',
          embedWorkers: data.pipeline.embed_workers?.toString() ?? '',
          verify: data.pipeline.verify,
          images: data.pipeline.images,
          preprocessedCacheDir: data.paths.preprocessed_cache_dir ?? '',
          metadataDir: data.paths.metadata_dir ?? '',
          songCacheDir: data.paths.song_cache_dir ?? '',
          downloadFilenameFormat: data.download_filename_format ?? '{artist} - {title}',
          // PCM Processing settings
          targetSampleRate: data.vggish?.target_sample_rate?.toString() ?? '16000',
          devicePreference: data.vggish?.device_preference ?? 'auto',
          gpuMemoryFraction: data.vggish?.gpu_memory_fraction?.toString() ?? '0.8',
          gpuAllowGrowth: data.vggish?.gpu_allow_growth ?? true,
          usePostprocess: data.vggish?.use_postprocess ?? true,
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load settings.');
      }
    };
    loadSettings();
  }, []);

  const parseNumber = (value: string) => {
    if (!value.trim()) {
      return null;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new Error('Numeric fields must contain valid numbers.');
    }
    return parsed;
  };

  const handleSave = async () => {
    setStatusMessage(null);
    setErrorMessage(null);
    setBusy(true);
    try {
      if (
        !form.preprocessedCacheDir.trim() ||
        !form.metadataDir.trim() ||
        !form.songCacheDir.trim()
      ) {
        throw new Error('Storage paths cannot be empty.');
      }
      const payload = {
        pipeline: {
          download_limit: parseNumber(form.downloadLimit),
          process_limit: parseNumber(form.processLimit),
          download_workers: parseNumber(form.downloadWorkers),
          pcm_workers: parseNumber(form.pcmWorkers),
          hash_workers: parseNumber(form.hashWorkers),
          embed_workers: parseNumber(form.embedWorkers),
          verify: form.verify,
          images: form.images,
        },
        paths: {
          preprocessed_cache_dir: form.preprocessedCacheDir.trim(),
          metadata_dir: form.metadataDir.trim(),
          song_cache_dir: form.songCacheDir.trim(),
        },
        download_filename_format: form.downloadFilenameFormat.trim(),
      };
      await fetchJson('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      // Save VGGish/PCM settings via dedicated endpoint
      const vggishPayload = {
        target_sample_rate: parseNumber(form.targetSampleRate) ?? 16000,
        device_preference: form.devicePreference,
        gpu_memory_fraction: parseFloat(form.gpuMemoryFraction) || 0.8,
        gpu_allow_growth: form.gpuAllowGrowth,
        use_postprocess: form.usePostprocess,
      };
      await fetchJson('/api/settings/vggish', {
        method: 'PUT',
        body: JSON.stringify(vggishPayload),
      });

      setStatusMessage('Settings saved. Changes apply on the next pipeline run.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setStatusMessage(null);
    setErrorMessage(null);
    if (!resetEmbeddings && !resetHashedMusic && !resetArtistAlbum && !resetSongMetadata) {
      setErrorMessage('Select at least one reset option.');
      return;
    }
    const confirm = window.prompt(
      'Type CLEAR to confirm wiping selected data. This cannot be undone.'
    );
    if (confirm !== 'CLEAR') {
      setErrorMessage('Reset cancelled. Type CLEAR to confirm.');
      return;
    }
    setBusy(true);
    try {
      const result = await fetchJson<ResetResponse>('/api/settings/reset', {
        method: 'POST',
        body: JSON.stringify({
          clear_embeddings: resetEmbeddings,
          clear_hashed_music: resetHashedMusic,
          clear_artist_album: resetArtistAlbum,
          clear_song_metadata: resetSongMetadata,
          confirm,
        }),
      });
      const parts = [];
      if (resetHashedMusic) {
        parts.push(`songs removed: ${result.songs_deleted}`);
        parts.push(`cache entries removed: ${result.song_cache_entries_deleted}`);
      } else if (resetSongMetadata) {
        parts.push(`songs removed: ${result.songs_deleted}`);
      }
      if (resetEmbeddings || resetHashedMusic || resetSongMetadata) {
        parts.push(`embeddings removed: ${result.embeddings_deleted}`);
        parts.push(`embedding files removed: ${result.embedding_files_deleted}`);
      }
      if (resetArtistAlbum) {
        parts.push(`albums removed: ${result.albums_deleted}`);
        parts.push(`album tracks removed: ${result.album_tracks_deleted}`);
        parts.push(`artist profiles removed: ${result.artist_profiles_deleted}`);
        parts.push(`album images removed: ${result.album_images_deleted}`);
        parts.push(`song images removed: ${result.song_images_deleted}`);
        parts.push(`image assets removed: ${result.image_assets_deleted}`);
      }
      setStatusMessage(`Reset complete. ${parts.join(', ')}.`);
      setResetEmbeddings(false);
      setResetHashedMusic(false);
      setResetArtistAlbum(false);
      setResetSongMetadata(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-gradient-to-b from-gray-900 to-black min-h-full pb-32">
      <div>
          <div className="p-8 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold">Settings</h1>
                <p className="text-gray-400 mt-2">
                  Configure processing defaults and storage paths.
                </p>
              </div>
              <button
                onClick={handleSave}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
              >
                <Cog8ToothIcon className="h-4 w-4" />
                Save settings
              </button>
            </div>

            {(statusMessage || errorMessage) && (
              <div
                className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
                  errorMessage
                    ? 'border-red-500/40 bg-red-500/10 text-red-200'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {errorMessage ?? statusMessage}
              </div>
            )}
          </div>

          <div className="px-8 pb-24 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
              <div className="flex items-center gap-3">
                <WrenchScrewdriverIcon className="h-5 w-5 text-gray-300" />
                <h2 className="text-xl font-semibold">Processing Defaults</h2>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                Apply batch sizes and worker settings for the pipeline.
              </p>

              <div className="grid gap-4 mt-5 md:grid-cols-2">
                <label className="text-sm text-gray-300">
                  Download limit
                  <input
                    type="number"
                    min={1}
                    value={form.downloadLimit}
                    onChange={(e) => setForm((prev) => ({ ...prev, downloadLimit: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  Process batch size
                  <input
                    type="number"
                    min={1}
                    value={form.processLimit}
                    onChange={(e) => setForm((prev) => ({ ...prev, processLimit: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  Download workers
                  <input
                    type="number"
                    min={1}
                    value={form.downloadWorkers}
                    onChange={(e) => setForm((prev) => ({ ...prev, downloadWorkers: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  PCM workers
                  <input
                    type="number"
                    min={1}
                    value={form.pcmWorkers}
                    onChange={(e) => setForm((prev) => ({ ...prev, pcmWorkers: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  Hash workers
                  <input
                    type="number"
                    min={1}
                    value={form.hashWorkers}
                    onChange={(e) => setForm((prev) => ({ ...prev, hashWorkers: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  Embed workers
                  <input
                    type="number"
                    min={1}
                    value={form.embedWorkers}
                    onChange={(e) => setForm((prev) => ({ ...prev, embedWorkers: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-6 mt-4 text-sm text-gray-300">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.verify}
                    onChange={(e) => setForm((prev) => ({ ...prev, verify: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                  />
                  Verify metadata by default
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.images}
                    onChange={(e) => setForm((prev) => ({ ...prev, images: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                  />
                  Sync images by default
                </label>
              </div>
            </section>

            <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
              <div className="flex items-center gap-3">
                <FolderIcon className="h-5 w-5 text-gray-300" />
                <h2 className="text-xl font-semibold">Storage Paths</h2>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                Update local directories for cached MP3s, Postgres data, and hashed files.
              </p>
              <div className="mt-5 space-y-4">
                <label className="text-sm text-gray-300">
                  Temp MP3 directory
                  <input
                    value={form.preprocessedCacheDir}
                    onChange={(e) => setForm((prev) => ({ ...prev, preprocessedCacheDir: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  SQL database directory
                  <input
                    value={form.metadataDir}
                    onChange={(e) => setForm((prev) => ({ ...prev, metadataDir: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  Hashed song cache directory
                  <input
                    value={form.songCacheDir}
                    onChange={(e) => setForm((prev) => ({ ...prev, songCacheDir: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                Changes apply when the backend restarts or the next pipeline run begins.
              </p>
            </section>

            <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800 lg:col-span-2">
              <div className="flex items-center gap-3">
                <CpuChipIcon className="h-5 w-5 text-gray-300" />
                <h2 className="text-xl font-semibold">PCM Processing</h2>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                Configure audio processing settings for VGGish embeddings.
              </p>

              <div className="grid gap-4 mt-5 md:grid-cols-3">
                <label className="text-sm text-gray-300">
                  Sample rate (Hz)
                  <input
                    type="number"
                    min={8000}
                    max={48000}
                    step={1000}
                    value={form.targetSampleRate}
                    onChange={(e) => setForm((prev) => ({ ...prev, targetSampleRate: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  Device preference
                  <select
                    value={form.devicePreference}
                    onChange={(e) => setForm((prev) => ({ ...prev, devicePreference: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  >
                    <option value="auto">Auto (detect best)</option>
                    <option value="cpu">CPU</option>
                    <option value="gpu">GPU (CUDA)</option>
                    <option value="metal">Metal (Apple Silicon)</option>
                  </select>
                </label>
                <label className="text-sm text-gray-300">
                  GPU memory fraction
                  <input
                    type="number"
                    min={0.1}
                    max={1.0}
                    step={0.1}
                    value={form.gpuMemoryFraction}
                    onChange={(e) => setForm((prev) => ({ ...prev, gpuMemoryFraction: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-6 mt-4 text-sm text-gray-300">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.gpuAllowGrowth}
                    onChange={(e) => setForm((prev) => ({ ...prev, gpuAllowGrowth: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                  />
                  Allow GPU memory growth
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.usePostprocess}
                    onChange={(e) => setForm((prev) => ({ ...prev, usePostprocess: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-white focus:ring-0"
                  />
                  Use postprocessing (PCA/whitening)
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                Sample rate of 16000 Hz is recommended for VGGish. Changing these settings requires re-embedding songs.
              </p>
            </section>

            <section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800 lg:col-span-2">
              <div className="flex items-center gap-3">
                <ArrowDownTrayIcon className="h-5 w-5 text-gray-300" />
                <h2 className="text-xl font-semibold">Download Settings</h2>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                Customize the filename format for downloaded songs. Use placeholders to include metadata.
              </p>
              <div className="mt-5">
                <label className="text-sm text-gray-300">
                  Filename format
                  <input
                    value={form.downloadFilenameFormat}
                    onChange={(e) => setForm((prev) => ({ ...prev, downloadFilenameFormat: e.target.value }))}
                    className="mt-2 w-full rounded-xl bg-gray-800 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                    placeholder="{artist} - {title}"
                  />
                </label>
                <p className="text-xs text-gray-500 mt-2">
                  Available placeholders: <code className="text-gray-400">{'{artist}'}</code>, <code className="text-gray-400">{'{title}'}</code>, <code className="text-gray-400">{'{album}'}</code>
                </p>
                <div className="mt-3 text-xs text-gray-500">
                  <p className="font-semibold mb-1">Examples:</p>
                  <ul className="space-y-1 ml-4">
                    <li><code className="text-gray-400">{'{artist} - {title}'}</code> → Artist Name - Song Title.mp3</li>
                    <li><code className="text-gray-400">{'{title} ({album})'}</code> → Song Title (Album Name).mp3</li>
                    <li><code className="text-gray-400">{'{artist} - {album} - {title}'}</code> → Artist - Album - Title.mp3</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-red-500/10 p-6 border border-red-500/30 lg:col-span-2">
              <div className="flex items-center gap-3">
                <WrenchScrewdriverIcon className="h-5 w-5 text-red-200" />
                <h2 className="text-xl font-semibold text-red-100">Danger Zone</h2>
              </div>
              <p className="text-sm text-red-200/80 mt-2">
                Reset stored data to recover from pipeline issues. This is permanent.
              </p>

              <div className="mt-4 mb-6 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                <div>
                  <span className="font-semibold text-red-100">Clear liked/disliked preferences</span>
                  <span className="block text-xs text-red-200/70">
                    Removes all liked and disliked song preferences stored in your browser.
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('Clear all liked/disliked song preferences? This cannot be undone.')) {
                      localStorage.removeItem('songbase_user_preferences');
                      setStatusMessage('Preferences cleared. Refresh the page to see changes.');
                    }
                  }}
                  className="shrink-0 rounded-full border border-red-400 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/30"
                >
                  Clear Preferences
                </button>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-red-100">
                <label className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={resetEmbeddings}
                    onChange={(e) => setResetEmbeddings(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-red-500/40 bg-red-500/10 text-red-200 focus:ring-0"
                  />
                  <span>
                    <span className="font-semibold">Clear embeddings</span>
                    <span className="block text-xs text-red-200/70">
                      Removes VGGish vectors from Postgres and deletes cached embedding files.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={resetHashedMusic}
                    onChange={(e) => setResetHashedMusic(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-red-500/40 bg-red-500/10 text-red-200 focus:ring-0"
                  />
                  <span>
                    <span className="font-semibold">Clear hashed music</span>
                    <span className="block text-xs text-red-200/70">
                      Deletes `.song_cache` files and removes song metadata (this also clears embeddings).
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={resetSongMetadata}
                    onChange={(e) => setResetSongMetadata(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-red-500/40 bg-red-500/10 text-red-200 focus:ring-0"
                  />
                  <span>
                    <span className="font-semibold">Clear song metadata</span>
                    <span className="block text-xs text-red-200/70">
                      Removes all song metadata from the database but keeps the hashed music files (also clears embeddings).
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={resetArtistAlbum}
                    onChange={(e) => setResetArtistAlbum(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-red-500/40 bg-red-500/10 text-red-200 focus:ring-0"
                  />
                  <span>
                    <span className="font-semibold">Clear artist &amp; album data</span>
                    <span className="block text-xs text-red-200/70">
                      Clears cached album metadata and artist/album images from the separate media database.
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleReset}
                  disabled={busy}
                  className="rounded-full border border-red-400 bg-red-500/20 px-5 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-50"
                >
                  Clear selected data
                </button>
              </div>
            </section>
          </div>
      </div>
    </div>
  );
}
