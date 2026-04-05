import type { ThemeId } from '@/themes';
import type { SoundType } from '@/hooks/useAudio';
import { AUDIO_MANIFEST } from './manifest';

/**
 * Caches decoded AudioBuffers per skin so we never re-fetch.
 * Preloads all files for the current skin; on skin switch,
 * preloads the new skin's files (old cache entries are kept).
 */
export class AudioBufferCache {
  private cache = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private preloadedSkins = new Set<ThemeId>();

  private cacheKey(skinId: ThemeId, sound: SoundType): string {
    return `${skinId}:${sound}`;
  }

  /** Get a cached buffer, or null if not yet loaded */
  get(skinId: ThemeId, sound: SoundType): AudioBuffer | null {
    return this.cache.get(this.cacheKey(skinId, sound)) ?? null;
  }

  /** Check if a sound has a file entry in the manifest */
  hasManifestEntry(skinId: ThemeId, sound: SoundType): boolean {
    return !!AUDIO_MANIFEST[skinId]?.[sound];
  }

  /** Check if a specific sound is currently loading */
  isLoading(skinId: ThemeId, sound: SoundType): boolean {
    return this.loading.has(this.cacheKey(skinId, sound));
  }

  /** Clear all cached buffers and preload state */
  clear(): void {
    this.cache.clear();
    this.loading.clear();
    this.preloadedSkins.clear();
  }

  /**
   * Fetch + decode a single audio file. Returns the buffer on success,
   * null on failure (missing file, decode error, network issue).
   */
  async load(
    ctx: AudioContext,
    skinId: ThemeId,
    sound: SoundType,
  ): Promise<AudioBuffer | null> {
    const key = this.cacheKey(skinId, sound);

    // Already cached
    const existing = this.cache.get(key);
    if (existing) return existing;

    // Already loading — return the pending promise
    const pending = this.loading.get(key);
    if (pending) return pending;

    const filePath = AUDIO_MANIFEST[skinId]?.[sound];
    if (!filePath) return null;

    const promise = this.fetchAndDecode(ctx, filePath, key);
    this.loading.set(key, promise);

    const result = await promise;
    this.loading.delete(key);
    return result;
  }

  /**
   * Preload all audio files for a given skin (non-blocking).
   * Skips skins that have already been preloaded.
   */
  preloadSkin(ctx: AudioContext, skinId: ThemeId): void {
    if (this.preloadedSkins.has(skinId)) return;
    this.preloadedSkins.add(skinId);

    const manifest = AUDIO_MANIFEST[skinId];
    if (!manifest) return;

    for (const sound of Object.keys(manifest) as SoundType[]) {
      // Fire and forget — errors are swallowed per-file
      void this.load(ctx, skinId, sound);
    }
  }

  private async fetchAndDecode(
    ctx: AudioContext,
    filePath: string,
    cacheKey: string,
  ): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(filePath);
      if (!response.ok) return null;

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.cache.set(cacheKey, audioBuffer);
      return audioBuffer;
    } catch {
      // File missing, network error, or decode failure — fall back to procedural
      return null;
    }
  }
}
