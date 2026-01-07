'use client';

import { useEffect, useState } from 'react';
import { Cog8ToothIcon, FolderIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

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
};

export default function SettingsPage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      };
      await fetchJson('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setStatusMessage('Settings saved. Changes apply on the next pipeline run.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save settings.');
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
          </div>
      </div>
    </div>
  );
}
