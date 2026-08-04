/**
 * Ambient declarations for the parts of the Web Speech API's recognition half
 * that TypeScript does NOT ship.
 *
 * TS 5.9.3's `lib.dom.d.ts` already declares `SpeechRecognitionAlternative`,
 * `SpeechRecognitionResult` and `SpeechRecognitionResultList` — those are
 * deliberately NOT repeated here; redeclaring them in global scope would be a
 * duplicate-identifier conflict. What it's missing is the controller interface
 * itself, its two event types, and the (vendor-prefixed) window properties.
 *
 * Note there is no `export {}` in this file, on purpose: that would make it a
 * module and confine these declarations to module scope, which is exactly the
 * bug this file was first written with. `electron.d.ts` can be a module because
 * everything global there lives inside its `declare global` block.
 *
 * Availability: Chromium (prefixed) and Safari (prefixed). Firefox and Opera
 * expose neither constructor — hence the hook's `supported` flag and the
 * Composer hiding the button outright.
 */

interface SpeechRecognitionEvent extends Event {
  /** Index of the first result CHANGED by this event — not always 0. */
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

/**
 * `error` is a small closed vocabulary in practice: "no-speech" | "aborted" |
 * "audio-capture" | "network" | "not-allowed" | "service-not-allowed" |
 * "bad-grammar" | "language-not-supported". Typed as `string` because vendors
 * ship values outside that list and the hook's mapper has a default branch.
 */
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  /** Graceful: delivers any pending final result, THEN fires `onend`. */
  stop(): void;
  /** Immediate: discards pending results and releases the mic now. */
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
