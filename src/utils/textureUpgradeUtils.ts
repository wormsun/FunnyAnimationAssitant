/**
 * 收集可用纹理，过滤 undefined URL 和空纹理占位符。
 */
export function collectNonEmptyTextures<T>(
  urls: (string | undefined)[],
  getTexture: (url: string) => T,
  emptyTexture: T,
): T[] {
  const textures: T[] = []
  for (const url of urls) {
    if (!url) continue
    const texture = getTexture(url)
    if (texture && texture !== emptyTexture) {
      textures.push(texture)
    }
  }
  return textures
}

