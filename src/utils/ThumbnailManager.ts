import ThumbnailWorker from '@/workers/thumbnail.worker?worker';

import { thumbnailDb } from './thumbnailDb';

interface PendingRequest {
  resolve: (url: string) => void;
  reject: (err: Error) => void;
  path: string;
  lastModified: number;
}

class ThumbnailManager {
  private worker: Worker;
  private pendingRequests = new Map<string, PendingRequest>();
  // Keep track of active blob URLs to revoke them later if needed
  private activeUrls = new Set<string>();

  constructor() {
    this.worker = new ThumbnailWorker();
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
  }

  private handleWorkerMessage(e: MessageEvent) {
    const { id, blob, success, error } = e.data as {
      id: string
      blob?: Blob
      success: boolean
      error?: string
    };
    const request = this.pendingRequests.get(id);
    
    if (!request) return;
    
    this.pendingRequests.delete(id);
    
    if (success && blob) {
      // 1. Save to DB asynchronously
      thumbnailDb.set(request.path, {
        path: request.path,
        lastModified: request.lastModified,
        blob: blob,
        generatedAt: Date.now()
      }).catch(err => console.warn('[ThumbnailManager] Failed to cache thumbnail:', err));

      // 2. Create URL and return
      const url = URL.createObjectURL(blob);
      this.activeUrls.add(url);
      request.resolve(url);
    } else {
      request.reject(new Error(error ?? 'Worker generation failed'));
    }
  }

  /**
   * Request a thumbnail for a file.
   * Checks IndexedDB first, then falls back to Worker generation.
   */
  async getThumbnail(file: File, path: string): Promise<string> {
    // 1. Try to load from DB
    try {
      const cached = await thumbnailDb.get(path);
      if (cached?.lastModified === file.lastModified) {
        const url = URL.createObjectURL(cached.blob);
        this.activeUrls.add(url);
        return url;
      }
    } catch (err) {
      console.warn('[ThumbnailManager] DB lookup failed, regenerating:', err);
    }

    // 2. Generate via Worker
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2, 10);
      
      this.pendingRequests.set(id, {
        resolve,
        reject,
        path,
        lastModified: file.lastModified
      });

      this.worker.postMessage({
        file,
        id,
        maxSize: 100, // 100x100 is enough for grid view
        quality: 0.7
      });
    });
  }

  /**
   * Release all created object URLs to free memory.
   * Call this when the file browser is closed.
   */
  cleanup() {
    this.activeUrls.forEach(url => URL.revokeObjectURL(url));
    this.activeUrls.clear();
    // We don't terminate the worker, as it can be reused
  }
}

// Export a singleton instance
export const thumbnailManager = new ThumbnailManager();
