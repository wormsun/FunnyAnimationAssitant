import localforage from 'localforage';

const DB_NAME = 'EditorLocalCache'
const STORE_NAME = 'thumbnails';

const db = localforage.createInstance({
  name: DB_NAME,
  storeName: STORE_NAME
});

export interface ThumbnailRecord {
  path: string;        // Unique file path
  lastModified: number;// File last modified time (for cache validation)
  blob: Blob;          // The thumbnail data
  generatedAt: number; // Timestamp when thumbnail was created
}

export const thumbnailDb = {
  async get(path: string): Promise<ThumbnailRecord | null> {
    try {
      return await db.getItem<ThumbnailRecord>(path);
    } catch (error) {
      console.warn('[ThumbnailDB] Failed to get thumbnail:', error);
      return null;
    }
  },

  async set(path: string, record: ThumbnailRecord): Promise<void> {
    try {
      await db.setItem(path, record);
    } catch (error) {
      console.warn('[ThumbnailDB] Failed to set thumbnail:', error);
    }
  },

  async remove(path: string): Promise<void> {
    try {
      await db.removeItem(path);
    } catch (error) {
      console.warn('[ThumbnailDB] Failed to remove thumbnail:', error);
    }
  },

  async clear(): Promise<void> {
    await db.clear();
  }
};
