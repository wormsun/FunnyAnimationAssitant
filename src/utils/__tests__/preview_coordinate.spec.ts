import { describe, expect, it } from 'vitest'

interface ObjLike {
  id: string
  x: number
  y: number
  parentId?: string
}

function shiftTopLevelByAnchor(objects: ObjLike[], anchor: { x: number; y: number }): ObjLike[] {
  const copied = JSON.parse(JSON.stringify(objects)) as ObjLike[]
  for (const obj of copied) {
    if (!obj.parentId) {
      obj.x += anchor.x
      obj.y += anchor.y
    }
  }
  return copied
}

describe('preview coordinate conversion', () => {
  it('applies anchor once when converting persisted zeroed coordinates to canvas coordinates', () => {
    const persisted = [{ id: 'root', x: -120, y: 60 }] as ObjLike[]
    const anchor = { x: 800, y: 450 }

    const restored = shiftTopLevelByAnchor(persisted, anchor)

    expect(restored[0]?.x).toBe(680)
    expect(restored[0]?.y).toBe(510)
  })

  it('double shift happens if already-restored editor coordinates are shifted again in preview', () => {
    const persisted = [{ id: 'root', x: -120, y: 60 }] as ObjLike[]
    const anchor = { x: 800, y: 450 }

    const editorRuntime = shiftTopLevelByAnchor(persisted, anchor)
    const previewRuntime = shiftTopLevelByAnchor(editorRuntime, anchor)

    // If preview re-applies anchor to editorRuntime objects, object moves by +anchor again.
    expect(previewRuntime[0]?.x).toBe(1480)
    expect(previewRuntime[0]?.y).toBe(960)
    expect((previewRuntime[0]?.x ?? 0) - (editorRuntime[0]?.x ?? 0)).toBe(anchor.x)
    expect((previewRuntime[0]?.y ?? 0) - (editorRuntime[0]?.y ?? 0)).toBe(anchor.y)
  })
})

