import { describe, expect, it } from 'vitest'

import {
  analyzePauseSegments,
  buildSpeechSegments,
  createTTSTimingFile,
  getTTSTimingPath,
  isTTSTimingUsable,
  type TTSTimingAnalyzerConfig,
} from '@/utils/ttsTiming'

const analyzer: TTSTimingAnalyzerConfig = {
  method: 'rms_silence_detect',
  frameMs: 10,
  thresholdDb: -35,
  minPauseMs: 80,
  mergeGapMs: 0,
  minSpeechMs: 40,
  animationStopPauseMs: 150,
}

function makeAudioBuffer(amplitudes: number[], sampleRate = 1000): AudioBuffer {
  const samples = new Float32Array(amplitudes)
  return {
    duration: samples.length / sampleRate,
    sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer
}

function repeat(value: number, count: number): number[] {
  return Array.from({ length: count }, () => value)
}

describe('ttsTiming', () => {
  it('derives timing sidecar path from mp3 path', () => {
    expect(getTTSTimingPath('project_cache/tts/abc123.mp3')).toBe('project_cache/tts/abc123.timing.json')
  })

  it('detects pause segments from low-energy frames', () => {
    const audioBuffer = makeAudioBuffer([
      ...repeat(0.5, 100),
      ...repeat(0, 200),
      ...repeat(0.5, 100),
    ])

    const pauseSegments = analyzePauseSegments(audioBuffer, analyzer)

    expect(pauseSegments).toEqual([
      { startMs: 100, endMs: 300, durationMs: 200 },
    ])
  })

  it('builds speech segments from pause segments', () => {
    const speechSegments = buildSpeechSegments(400, [
      { startMs: 100, endMs: 300, durationMs: 200 },
    ], 40)

    expect(speechSegments).toEqual([
      { startMs: 0, endMs: 100, durationMs: 100 },
      { startMs: 300, endMs: 400, durationMs: 100 },
    ])
  })

  it('keeps short pauses in raw data while merging them for animation speech', () => {
    const audioBuffer = makeAudioBuffer([
      ...repeat(0.5, 100),
      ...repeat(0, 100),
      ...repeat(0.5, 100),
    ])

    const timing = createTTSTimingFile('project_cache/tts/short.mp3', audioBuffer, analyzer)

    expect(timing.pauseSegments).toEqual([
      { startMs: 100, endMs: 200, durationMs: 100 },
    ])
    expect(timing.speechSegments).toEqual([
      { startMs: 0, endMs: 100, durationMs: 100 },
      { startMs: 200, endMs: 300, durationMs: 100 },
    ])
    expect(timing.animationSpeechSegments).toEqual([
      { startMs: 0, endMs: 300, durationMs: 300 },
    ])
  })

  it('validates timing files against audio path, duration, and analyzer config', () => {
    const audioBuffer = makeAudioBuffer([...repeat(0.5, 100)])
    const timing = createTTSTimingFile('project_cache/tts/a.mp3', audioBuffer, analyzer)

    expect(isTTSTimingUsable(timing, 'project_cache/tts/a.mp3', 100, analyzer)).toBe(true)
    expect(isTTSTimingUsable(timing, 'project_cache/tts/b.mp3', 100, analyzer)).toBe(false)
    expect(isTTSTimingUsable(timing, 'project_cache/tts/a.mp3', 300, analyzer)).toBe(false)
  })
})
