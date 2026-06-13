
// Thumbnail Worker
// Handles image resizing and compression off the main thread

interface ThumbnailWorkerMessage {
  file: Blob;
  maxSize?: number;
  quality?: number;
  id: string;
}

self.onmessage = async (e: MessageEvent<ThumbnailWorkerMessage>) => {
  const { file, maxSize = 100, quality = 0.6, id } = e.data;

  try {
    // 1. Create ImageBitmap from the file
    // We use createImageBitmap which is available in workers
    let bitmap: ImageBitmap;
    
    // Try to use resize options during decoding if possible (faster)
    try {
      // Calculate aspect ratio logic is hard here without knowing dimensions first,
      // but we can ask for a larger box and scale down later, 
      // or just load full and scale down (safest for aspect ratio).
      // Let's load full first to get dimensions, then draw to canvas.
      bitmap = await createImageBitmap(file);
    } catch (err) {
      throw new Error('Failed to create ImageBitmap: ' + String(err));
    }

    // 2. Calculate target dimensions
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    // Scale down if needed
    if (originalWidth > maxSize || originalHeight > maxSize) {
      const scale = Math.min(maxSize / originalWidth, maxSize / originalHeight);
      targetWidth = Math.round(originalWidth * scale);
      targetHeight = Math.round(originalHeight * scale);
    }

    // 3. Draw to OffscreenCanvas
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get 2D context from OffscreenCanvas');
    }

    // Fill white background (for transparent PNGs converted to JPEG)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // High quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    
    // Release bitmap memory immediately
    bitmap.close();

    // 4. Convert to Blob (JPEG)
    const thumbnailBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality
    });

    // 5. Send back
    self.postMessage({ id, blob: thumbnailBlob, success: true });

  } catch (error) {
    self.postMessage({ 
      id, 
      error: error instanceof Error ? error.message : String(error), 
      success: false 
    });
  }
};
