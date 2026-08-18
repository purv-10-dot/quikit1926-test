# QuikChat — Multilingual Typing & Voice Input: Options Reference

**Purpose:** full landscape of options researched for (1) Hindi/Hinglish transliteration typing and (2) voice typing, beyond what shipped in the Phase 1 session. Kept here so a future upgrade decision doesn't require re-researching from scratch.

**Phase 1 shipped (for context):** `sanscript.js` (client-side transliteration toggle) + Web Speech API (browser-native voice typing). Both are free, zero-backend, and were chosen specifically to validate demand before investing further.

---

## Feature 1 — Hindi / Hinglish transliteration typing

### Baseline that already works today, zero app code
If a user's OS has a Hindi keyboard installed, they can type Devanagari directly into any QuikChat text field right now — browsers handle Unicode natively. Nothing below is needed for that case. What this feature actually adds is the *Gboard-style convenience*: typing Hindi phonetically in Roman letters ("kaise ho") and having it auto-convert inline ("कैसे हो"), without switching OS keyboards.

### Option A — `sanscript.js` (EVALUATED, NOT SHIPPED — real accuracy problem found)
- **What it is:** Client-side, rule-based phonetic transliteration library from the `indic-transliteration` GitHub org. Pure function (`Sanscript.t(text, from, to)`), no DOM binding, no network call.
- **Cost/hosting:** Free, MIT-licensed npm package (`@indic-transliteration/sanscript`), runs entirely in the browser.
- **Empirical result (this is the important part):** Before shipping, this was tested against real casual Hinglish phrases rather than assumed to work. Result: **roughly 40% word accuracy** on ordinary typed input ("kaise ho" worked; "theek hun", "bahut accha", "shukriya", "nahi" all came out wrong in systematic, not edge-case, ways — missing long vowels, no nasalization, dental/retroflex confusion, wrong schwa handling). A control run using strict, scholarly ITRANS spelling (e.g. `huu.N` instead of `hun`) converted correctly — **the engine itself is fine; the mismatch is that ITRANS assumes a precise transliteration scheme nobody types casually.**
- **Two further, chat-specific problems found:** ITRANS is case-significant (capital letters mean retroflex/long vowels), so ordinary sentence capitalization and ALL-CAPS acronyms get mangled — and lowercasing everything to fix this would break genuine ITRANS users, so the two audiences are mutually exclusive under this scheme. Separately, English loanwords and URLs get phonetically destroyed (`time` → `तिमे`, a plain URL turns to gibberish) — a severe problem given how much English is mixed into real Hinglish chat.
- **Conclusion: do not ship this as "Hinglish support."** It would actively damage trust in the feature — users would try it once, get garbled output, and stop trusting it. The honest label for what this library actually does well is "Devanagari via the ITRANS scheme," a scholarly/Sanskrit convention, not a casual-typing aid — and the addressable audience for that in a business chat app is close to zero.
- **If this is ever revisited:** don't try to patch it with a hand-rolled casual-spelling normalizer (vowel-lengthening/nasal-inference/retroflex heuristics) sitting in front of it. That's building a worse, bespoke version of what Option B (AI4Bharat IndicXlit) already does by being trained on 26 million real word pairs instead of hand-written rules. Go straight to evaluating Option B instead of trying to rescue this one.

### Option B — AI4Bharat IndicXlit (via `@ai4bharat/indic-transliterate`)
- **What it is:** A transformer-based transliteration model (~11M params) trained on the Aksharantar dataset (26M word pairs across 20 Indic languages), from AI4Bharat (IIT Madras). State-of-the-art on the published Dakshina benchmark — the closest thing to how Gboard's engine actually behaves (statistically learned, not rule-based).
- **Packaging risk:** The npm wrapper (`@ai4bharat/indic-transliterate`) is a thin React component that calls a hosted inference API. As of this research: ~228 weekly downloads, zero active maintainers, last release over a year old. Not something to pull in as a direct production dependency as-is.
- **The real opportunity:** The underlying model is MIT-licensed and self-hostable (Python, has an HTTP server mode: `xlit_server.get_app()`). Self-hosting the model directly — bypassing the unmaintained JS wrapper — gets the quality without the wrapper's maintenance risk.
- **Cost/hosting:** Free (open weights), but requires standing up and operating a small Python inference service — a new deployable, similar in shape to the QuikverseAI runtime the team already operates.
- **When to revisit:** If Phase 1's `sanscript.js` output quality is judged not good enough on real user Hinglish (this is exactly what the Phase 1 CC session's readback was asked to empirically test on real phrases before calling it "done").

### Option C — Azure Translator's Transliterate endpoint
- **What it is:** Microsoft's Cognitive Services / Foundry Tools REST API, confirmed to support Hindi Latin↔Devanagari conversion (`language=hi&fromScript=Latn&toScript=Deva`).
- **Cost:** Enterprise SLA, pay-per-character, with a meaningful free tier (verify current numbers at implementation time — pricing pages age fast).
- **Quality profile:** Systematic script conversion, similar in spirit to sanscript rather than a learned/ambiguity-resolving dictionary. Not validated against casual Hinglish phrasing in this research — would need direct testing before trusting it to feel natural.
- **When to consider:** If the org wants an enterprise-SLA'd, no-infra-to-run option and is comfortable sending text through Microsoft's API. Worth a head-to-head quality test against Option B before choosing between them.

### Option D — Google's Transliterate API
- **Status: deprecated.** Confirmed via Google's own developer documentation. Do not build on this regardless of how many older tutorials reference it.

### Option E — GoVarnam
- **What it is:** A cross-platform transliteration library (Go-based, with bindings), explicitly marketed for "Hinglish → Hindi" among ~10 other Indic language pairs. A near-Go port of the older `libvarnam` project.
- **Status:** Noted but not evaluated in depth this round — flagged here so it isn't lost, worth a closer look if `sanscript.js` proves insufficient and a rule-based (not ML) option is still preferred over self-hosting IndicXlit.

---

## Feature 2 — Voice typing (dictation into the composer)

**Important distinction confirmed during implementation:** this is functionally separate from QuikChat's existing voice *notes* feature. Voice notes record audio and send it as a message attachment (`use-voice-recorder.ts` + `MediaRecorder`). Voice typing transcribes speech into the text composer and sends no audio at all. They share no code, and got separate UI affordances specifically to avoid confusing the two.

### Option A — Web Speech API (SHIPPED in Phase 1)
- **What it is:** Browser-native `SpeechRecognition` interface. The browser handles mic capture and recognition together as one step — no `MediaRecorder`/`getUserMedia` blob involved.
- **Cost:** Free, no backend.
- **Browser support:** Full support in Chrome, Edge, Samsung Internet. Safari supported since 14.1 (macOS) / 14.5 (iOS) via the `webkitSpeechRecognition` prefix. **Firefox keeps it behind a disabled-by-default flag — effectively unsupported for real users.** Opera never shipped it (needs a Google API key Opera doesn't provide, despite being Chromium-based).
- **Real limitation:** Locks to one recognition locale per session (`en-IN` *or* `hi-IN`) — there is no genuine mixed-language recognition in a single utterance. Phase 1 ships a manual language toggle rather than claiming to understand code-switching.
- **Privacy note (flag this to whoever owns data-handling policy):** Audio is sent to the browser vendor's speech servers (Google's, for Chromium) with **no data processing agreement and no uptime guarantee.** Given the team runs its own on-prem k8s cluster and appears to weigh data control heavily elsewhere in this project, this is worth a conscious sign-off rather than a silent default, even for an MVP.

### Option B — Cloud STT APIs (Whisper API vs. Google Cloud Speech-to-Text)
- **General community consensus** across several independent comparisons favors OpenAI Whisper specifically for *code-switching* (mixing languages within one utterance) — described in multiple sources as one of Whisper's genuine strengths, attributed to the scale and diversity of its training data (680,000+ hours).
- **A significant, more skeptical counterpoint found during this research:** one hands-on source specifically reports 15–20% word-error-rate for Whisper on Hindi telephony audio, versus roughly 10% for Google — and explicitly warns not to extrapolate Whisper's general code-switching reputation (mostly validated on European language pairs) to Hindi without testing on real audio. **This is not resolved and needs an actual bake-off on real QuikChat-style Hindi-English audio before committing to either.**
- **Pricing (verify at implementation time, these move):** Whisper API around $0.006/minute; Google Cloud STT (standard models, Chirp included) around $0.016/minute.
- **Architecture:** Both need a backend proxy (API keys must stay server-side) — this is where `use-voice-recorder.ts`'s existing `MediaRecorder`/mic-permission infrastructure *would* actually get reused, unlike the Web Speech API option: record a blob client-side, POST it to a new backend route, call the provider, return the transcript.
- **Other named entrants worth a look if evaluating this tier:** Deepgram (Nova model, ~36 languages, sub-300ms latency, strong developer experience — narrower language coverage than Whisper/Google, Hindi-specific quality unconfirmed in this research), Gladia (markets native code-switching support for its own Solaria models — vendor's own claim, treat as marketing rather than neutral benchmark until independently verified).

### Option C — Self-hosted AI4Bharat IndicConformer
- **What it is:** A suite of open ASR models (MIT-licensed) covering all 22 official Indian languages, from AI4Bharat/IIT Madras. Trained on a genuinely large India-specific dataset (300,000+ hours of raw speech, 6,000+ hours transcribed). Available as open weights on Hugging Face (`ai4bharat/indic-conformer-600m-multilingual`), built on the Conformer architecture (the same model family Google uses for on-device recognition).
- **Strongest concrete validation found:** A commercial vendor (Augmen AI Labs) has already productized this exact model specifically for Hindi-English code-switched *banking* speech — their public marketing cites real phrases like "mera loan amount kitna hai" and "EMI schedule bhejo" as their fine-tuning domain. This is about as close to a real-world proof point for QuikChat's exact use case as exists in the public record.
- **Cost:** Free (open weights), but requires a Python NeMo-based inference service — new infrastructure, though structurally similar to the QuikverseAI Python runtime the team already operates, not an unprecedented skill-set.
- **Why this is the recommended long-term direction, not just "another option":** Given the on-prem k8s posture already established for this deployment, self-hosting keeps voice data in-house entirely — no third-party DPA question, no per-minute API cost at scale, and it's the option with the most direct evidence of working well on exactly this kind of speech.
- **When to build this:** If Phase 1 (Web Speech API) shows real usage/demand, this is the recommended Phase 2 target — skipping the cloud-API bake-off (Option B) entirely unless self-hosting turns out to be a harder lift than expected.

### Option D — Client-side/in-browser Whisper (WASM)
- **What it is:** Running a small Whisper model variant (tiny/base tier) entirely client-side via WebAssembly — no audio ever leaves the device, no backend, no API cost, no vendor DPA question at all.
- **Tradeoffs:** Meaningfully lower accuracy than the large cloud/self-hosted models, a real download size for model weights (tens to a couple hundred MB, cached after first load), and CPU/battery cost on lower-end devices during inference.
- **When to consider:** A privacy-maximalist fallback tier, or for the desktop Electron app specifically where device specs are more predictable than mobile web. Noted for completeness; not evaluated in depth against Option C's stronger accuracy story for this specific language pair.

---

## Suggested decision path if/when Phase 1 usage justifies Phase 2

1. Check real usage data from Phase 1 (Web Speech API voice typing — Hinglish transliteration did not ship; see Option A above) — did people actually turn voice typing on and keep using it.
2. Hinglish transliteration typing does not currently exist in the product. If/when it's prioritized, go directly to evaluating self-hosting AI4Bharat IndicXlit (Option B) rather than Azure Translator (Option C) or a patched version of Option A — the model quality story is stronger, it avoids a new external vendor dependency, and Option A has already been empirically ruled out for casual typing.
3. If voice typing quality/reliability is the complaint → go straight to evaluating self-hosted AI4Bharat IndicConformer against real QuikChat audio samples, rather than spending time on the Whisper-vs-Google cloud bake-off first — the on-prem/data-control fit is stronger and the Augmen AI Labs precedent is the most directly relevant evidence found.
4. Either upgrade would reuse the *same UI toggle points* shipped in Phase 1 — swapping the backend behind the existing "Hinglish mode" toggle and "voice typing" button, not rebuilding the composer integration from scratch.

---

## Sources consulted

- IndicXlit / AI4Bharat: https://github.com/AI4Bharat/IndicXlit
- `@ai4bharat/indic-transliterate` (npm): https://www.npmjs.com/package/@ai4bharat/indic-transliterate
- `@ai4bharat/indic-transliterate` health check: https://socket.dev/npm/package/@ai4bharat/indic-transliterate
- `sanscript.js`: https://github.com/sanskrit/sanscript.js/ and https://www.npmjs.com/package/@indic-transliteration/sanscript
- Google Transliterate API (deprecated): https://developers.google.com/transliterate/v1/reference
- Azure Translator transliterate endpoint: https://learn.microsoft.com/en-us/rest/api/translator/translator/transliterate
- Azure Translator language support: https://learn.microsoft.com/en-us/azure/ai-services/translator/language-support
- Web Speech API browser support: https://www.testmuai.com/learning-hub/speech-recognition-api-browser-support/ and https://www.assemblyai.com/blog/speech-recognition-javascript-web-speech-api
- Whisper vs Google STT comparisons: https://clickup.com/blog/whisper-vs-google-speech-to-text/ and https://www.gladia.io/blog/openai-whisper-vs-google-speech-to-text-vs-amazon-transcribe
- Hindi-specific Whisper vs Google accuracy caveat: https://privocio.com/blog/multilingual-speech-to-text-apis-language-coverage-accuracy
- Whisper vs Google vs Deepgram: https://whisperweb.dev/blog/whisper-vs-google-speech-to-text-vs-deepgram-comparison
- AI4Bharat IndicConformer: https://github.com/AI4Bharat/IndicConformerASR and https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual
- Commercial IndicConformer deployment (Hindi-English banking code-switching): https://augmen.io/labs-stt.html
- Best Whisper alternatives 2026: https://www.gladia.io/blog/best-whisper-alternatives-2026
