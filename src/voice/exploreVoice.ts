export const EXPLORE_VOICE_COMMAND = '探索'
export const EXPLORE_VOICE_COOLDOWN_MS = 1000

export type ExploreVoiceState =
  | 'idle'
  | 'listening'
  | 'unsupported'
  | 'denied'
  | 'error'

export type ExploreSpeechRecognitionAlternative = {
  transcript: string
}

export type ExploreSpeechRecognitionResult = {
  isFinal: boolean
  length: number
  [index: number]: ExploreSpeechRecognitionAlternative
}

export type ExploreSpeechRecognitionEvent = {
  resultIndex: number
  results: {
    length: number
    [index: number]: ExploreSpeechRecognitionResult
  }
}

export type ExploreSpeechRecognitionErrorEvent = {
  error: string
}

export type ExploreSpeechRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: ExploreSpeechRecognitionEvent) => void) | null
  onerror: ((event: ExploreSpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}

export type ExploreSpeechRecognitionConstructor = new () => ExploreSpeechRecognition

export type ExploreSpeechRecognitionHost = {
  SpeechRecognition?: ExploreSpeechRecognitionConstructor
  webkitSpeechRecognition?: ExploreSpeechRecognitionConstructor
}

export function resolveSpeechRecognitionConstructor(
  host: ExploreSpeechRecognitionHost,
) {
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null
}

export function normalizeExploreTranscript(transcript: string) {
  return transcript
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

export function containsExploreCommand(transcript: string) {
  return normalizeExploreTranscript(transcript).includes(EXPLORE_VOICE_COMMAND)
}

export function canAcceptExploreCommand(
  now: number,
  lastAcceptedAt: number,
  cooldownMs = EXPLORE_VOICE_COOLDOWN_MS,
) {
  return !Number.isFinite(lastAcceptedAt) || now - lastAcceptedAt >= cooldownMs
}
