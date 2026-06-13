import { fileExists, readFileAsText, writeFileAsText } from '@/utils/fileSystem'

export interface AudioSegment {
  startMs: number
  endMs: number
  durationMs: number
}

export interface TTSTimingAnalyzerConfig {
  method: 'rms_silence_detect'
  frameMs: number
  thresholdDb: number
  minPauseMs: number
  mergeGapMs: number
  minSpeechMs: number
  animationStopPauseMs: number
}

export interface TTSTimingFile {
  schemaVersion: 1
  audioPath: string
  audioDurationMs: number
  createdAt: string
  analyzer: TTSTimingAnalyzerConfig
  pauseSegments: AudioSegment[]
  speechSegments: AudioSegment[]
  animationSpeechSegments: AudioSegment[]
}

export const DEFAULT_TTS_TIMING_ANALYZER: TTSTimingAnalyzerConfig = {
  method: 'rms_silence_detect',
  frameMs: 10,
  thresholdDb: -35,
  minPauseMs: 100,
  mergeGapMs: 80,
  minSpeechMs: 60,
  animationStopPauseMs: 150,
}

let decodeAudioContext: AudioContext | null = null

export function getTTSTimingPath(audioPath: string): string {
  return audioPath.replace(/\.[^.\\/]+$/i, '.timing.json')
}

export async function decodeBase64AudioToAudioBuffer(base64Audio: string): Promise<AudioBuffer | null> {
  if (!base64Audio || typeof window === 'undefined') return null

  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return null

  decodeAudioContext ??= new AudioContextClass()
  const audioBytes = base64ToUint8Array(base64Audio)
  const arrayBuffer = new ArrayBuffer(audioBytes.byteLength)
  new Uint8Array(arrayBuffer).set(audioBytes)

  try {
    return await decodeAudioContext.decodeAudioData(arrayBuffer.slice(0))
  } catch (error) {
    console.warn('[TTSTiming] 音频解码失败，跳过 timing 分析:', error)
    return null
  }
}

export function createTTSTimingFile(
  audioPath: string,
  audioBuffer: AudioBuffer,
  analyzer: TTSTimingAnalyzerConfig = DEFAULT_TTS_TIMING_ANALYZER
): TTSTimingFile {
  const audioDurationMs = Math.round(audioBuffer.duration * 1000)
  const pauseSegments = analyzePauseSegments(audioBuffer, analyzer)
  const speechSegments = buildSpeechSegments(audioDurationMs, pauseSegments, analyzer.minSpeechMs)
  const animationPauses = pauseSegments.filter(segment => segment.durationMs >= analyzer.animationStopPauseMs)
  const animationSpeechSegments = buildSpeechSegments(audioDurationMs, animationPauses, analyzer.minSpeechMs)

  return {
    schemaVersion: 1,
    audioPath,
    audioDurationMs,
    createdAt: new Date().toISOString(),
    analyzer,
    pauseSegments,
    speechSegments,
    animationSpeechSegments,
  }
}

export function analyzePauseSegments(
  audioBuffer: AudioBuffer,
  analyzer: TTSTimingAnalyzerConfig = DEFAULT_TTS_TIMING_ANALYZER
): AudioSegment[] {
  const samples = audioBuffer.getChannelData(0)
  const frameSize = Math.max(1, Math.floor(audioBuffer.sampleRate * analyzer.frameMs / 1000))
  const frameCount = Math.ceil(samples.length / frameSize)
  const silentFrames: boolean[] = []

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const startSample = frameIndex * frameSize
    const endSample = Math.min(samples.length, startSample + frameSize)
    let sumSquares = 0

    for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex++) {
      const sample = samples[sampleIndex] ?? 0
      sumSquares += sample * sample
    }

    const sampleCount = Math.max(1, endSample - startSample)
    const rms = Math.sqrt(sumSquares / sampleCount)
    const db = 20 * Math.log10(rms + 1e-8)
    silentFrames.push(db < analyzer.thresholdDb)
  }

  const rawPauses = collectSilentRuns(silentFrames, analyzer.frameMs, Math.round(audioBuffer.duration * 1000), analyzer.minPauseMs)
  return mergeCloseSegments(rawPauses, analyzer.mergeGapMs)
}

export function buildSpeechSegments(audioDurationMs: number, pauseSegments: AudioSegment[], minSpeechMs: number): AudioSegment[] {
  const speechSegments: AudioSegment[] = []
  let cursorMs = 0

  for (const pause of pauseSegments) {
    if (pause.startMs > cursorMs) {
      pushSegmentIfLongEnough(speechSegments, cursorMs, pause.startMs, minSpeechMs)
    }
    cursorMs = Math.max(cursorMs, pause.endMs)
  }

  if (cursorMs < audioDurationMs) {
    pushSegmentIfLongEnough(speechSegments, cursorMs, audioDurationMs, minSpeechMs)
  }

  return speechSegments
}

export function isTTSTimingUsable(
  timing: TTSTimingFile | null,
  audioPath: string,
  audioDurationMs: number,
  analyzer: TTSTimingAnalyzerConfig = DEFAULT_TTS_TIMING_ANALYZER
): timing is TTSTimingFile {
  if (!timing) return false
  if (timing.schemaVersion !== 1) return false
  if (timing.audioPath !== audioPath) return false
  if (Math.abs(timing.audioDurationMs - audioDurationMs) > 50) return false
  return isSameAnalyzer(timing.analyzer, analyzer)
}

export async function loadTTSTimingFile(
  projectHandle: FileSystemDirectoryHandle,
  audioPath: string
): Promise<TTSTimingFile | null> {
  const timingPath = getTTSTimingPath(audioPath)
  if (!(await fileExists(projectHandle, timingPath))) return null

  try {
    return JSON.parse(await readFileAsText(projectHandle, timingPath)) as TTSTimingFile
  } catch (error) {
    console.warn('[TTSTiming] timing 文件读取失败，将重新分析:', timingPath, error)
    return null
  }
}

export async function saveTTSTimingFile(
  projectHandle: FileSystemDirectoryHandle,
  audioPath: string,
  timing: TTSTimingFile
): Promise<string> {
  const timingPath = getTTSTimingPath(audioPath)
  await writeFileAsText(projectHandle, timingPath, JSON.stringify(timing, null, 2))
  return timingPath
}

export async function ensureTTSTimingFile(
  projectHandle: FileSystemDirectoryHandle,
  audioPath: string,
  audioBuffer: AudioBuffer,
  analyzer: TTSTimingAnalyzerConfig = DEFAULT_TTS_TIMING_ANALYZER
): Promise<string> {
  const audioDurationMs = Math.round(audioBuffer.duration * 1000)
  const existingTiming = await loadTTSTimingFile(projectHandle, audioPath)
  if (isTTSTimingUsable(existingTiming, audioPath, audioDurationMs, analyzer)) {
    return getTTSTimingPath(audioPath)
  }

  const timing = createTTSTimingFile(audioPath, audioBuffer, analyzer)
  return saveTTSTimingFile(projectHandle, audioPath, timing)
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function collectSilentRuns(silentFrames: boolean[], frameMs: number, audioDurationMs: number, minPauseMs: number): AudioSegment[] {
  const segments: AudioSegment[] = []
  let runStartFrame: number | null = null

  for (let frameIndex = 0; frameIndex <= silentFrames.length; frameIndex++) {
    const isSilent = silentFrames[frameIndex] ?? false

    if (isSilent && runStartFrame === null) {
      runStartFrame = frameIndex
      continue
    }

    if (!isSilent && runStartFrame !== null) {
      const startMs = runStartFrame * frameMs
      const endMs = Math.min(audioDurationMs, frameIndex * frameMs)
      pushSegmentIfLongEnough(segments, startMs, endMs, minPauseMs)
      runStartFrame = null
    }
  }

  return segments
}

function mergeCloseSegments(segments: AudioSegment[], mergeGapMs: number): AudioSegment[] {
  const merged: AudioSegment[] = []

  for (const segment of segments) {
    const previous = merged[merged.length - 1]
    if (previous && segment.startMs - previous.endMs <= mergeGapMs) {
      previous.endMs = segment.endMs
      previous.durationMs = previous.endMs - previous.startMs
    } else {
      merged.push({ ...segment })
    }
  }

  return merged
}

function pushSegmentIfLongEnough(segments: AudioSegment[], startMs: number, endMs: number, minDurationMs: number): void {
  const roundedStartMs = Math.max(0, Math.round(startMs))
  const roundedEndMs = Math.max(roundedStartMs, Math.round(endMs))
  const durationMs = roundedEndMs - roundedStartMs

  if (durationMs >= minDurationMs) {
    segments.push({
      startMs: roundedStartMs,
      endMs: roundedEndMs,
      durationMs,
    })
  }
}

function isSameAnalyzer(left: TTSTimingAnalyzerConfig, right: TTSTimingAnalyzerConfig): boolean {
  return (
    left.method === right.method &&
    left.frameMs === right.frameMs &&
    left.thresholdDb === right.thresholdDb &&
    left.minPauseMs === right.minPauseMs &&
    left.mergeGapMs === right.mergeGapMs &&
    left.minSpeechMs === right.minSpeechMs &&
    left.animationStopPauseMs === right.animationStopPauseMs
  )
}
