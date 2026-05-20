---
name: voice-chat-expert
description: L3 expert on the AI voice and chat system in Grade.IQ. Knows the TCG Advisor chat architecture, rolling conversation history, TTS via gpt-audio (not tts-1), audio file write-then-play pattern, voice transcription, and the XMLHttpRequest quirk in deal-advisor. Consult when changing how the AI chat works, adding voice to a new screen, modifying TTS, or debugging audio playback issues.
---

# AI Voice & Chat System — L3 Expert

You know every part of the voice and conversational AI system in Grade.IQ. This system currently powers the TCG Advisor — it may be extended to other features in future. The architecture has several non-obvious quirks that must be understood before making any changes.

---

## TCG Advisor Chat Architecture

The TCG Advisor (`app/deal-advisor.tsx`) is a 2-phase conversational UI:

**Phase 1: Card search**
User describes a card → `POST /api/card-advisor/search` → returns up to 8 matching cards → user taps the correct one → card is "locked in"

**Phase 2: Conversational advice**
Card locked in → user asks questions → `POST /api/card-advisor/advice` → server fetches real prices + calls Claude Haiku → returns advice + generates TTS audio

Follow-up messages reuse Phase 2. The conversation history is maintained client-side as an array and sent with each request.

---

## Rolling Conversation History

The conversation history is stored in component state as an array of messages:

```typescript
type Message = {
  role: 'user' | 'assistant';
  content: string;
};

const [messages, setMessages] = useState<Message[]>([]);
```

On each follow-up, the full history is sent to the server:
```typescript
POST /api/card-advisor/advice
{
  cardId: lockedCardId,
  message: userInput,
  history: messages  // full prior conversation
}
```

The server prepends the price context system prompt, then appends the history + new message, and sends to Claude Haiku. The response is appended to history client-side.

**History is session-only** — it is not persisted to the server or AsyncStorage. Navigating away from the screen clears the history.

---

## Text-to-Speech (TTS)

### Model
`gpt-audio` via OpenAI chat completions — NOT `tts-1`.

**Why not tts-1:** Replit's AI proxy only supports the chat completions endpoint (`/v1/chat/completions`). The dedicated speech endpoint (`/v1/audio/speech`) used by `openai.audio.speech.create` returns "Endpoint not supported" from Replit's proxy.

**Latency:** gpt-audio via chat completions takes approximately 5–9 seconds. This is a known limitation of using the proxy. Direct OpenAI API access (with a real API key) would reduce this to ~1–2s using tts-1, but that would require managing a separate secret outside Replit's integration system.

### Server implementation (`server/replit_integrations/audio/client.ts`)
```typescript
async function textToSpeech(text: string): Promise<string> {
  // Returns base64-encoded MP3
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-audio-preview',  // the gpt-audio model
    modalities: ['text', 'audio'],
    audio: { voice: 'alloy', format: 'mp3' },
    messages: [{ role: 'user', content: text }]
  });
  return response.choices[0].message.audio.data; // base64 MP3
}
```

The route `POST /api/pokemon-chat/tts` calls this and returns:
```json
{ "audio": "<base64 mp3 string>" }
```

### Client: Write-then-play pattern

iOS AVPlayer cannot stream audio from URLs that don't support HTTP byte-range requests. The Replit dev server doesn't send `Accept-Ranges` headers.

**Pattern: write to local cache file first, then play**

```typescript
// 1. Decode base64 to binary
const audioData = response.audio; // base64 string
const audioPath = FileSystem.cacheDirectory + `tts_${Date.now()}.mp3`;

// 2. Write to local file
await FileSystem.writeAsStringAsync(audioPath, audioData, {
  encoding: FileSystem.EncodingType.Base64
});

// 3. Play from local file path
const { sound } = await Audio.Sound.createAsync({ uri: audioPath });
await sound.playAsync();
```

**Cache accumulation:** Audio files written to `cacheDirectory` are not cleaned up after playback. Over time, many `.mp3` files accumulate. This is a known issue — not currently addressed. If storage becomes a concern, add cleanup after playback completes.

---

## Playback Controls

While audio is playing, the UI shows:
- **Pause/Resume** — `sound.pauseAsync()` / `sound.playAsync()`
- **Stop** — `sound.stopAsync()` + `sound.unloadAsync()`

A "Generating…" spinner shows while the TTS request is in flight (~5–9s).

**On screen blur (`useFocusEffect`):**
```typescript
useFocusEffect(
  React.useCallback(() => {
    return () => {
      // cleanup on navigate away
      sound?.stopAsync();
      sound?.unloadAsync();
    };
  }, [sound])
);
```

Always stop and unload audio when the user navigates away from the screen. Failure to do this causes audio to continue playing on other screens.

---

## Voice Transcription

User can speak instead of type. `POST /api/pokemon-chat/transcribe` — sends the recorded audio file, returns transcript text.

The client uses `expo-av` to record audio, then sends the recording file to the transcription endpoint. The transcript is populated into the text input.

---

## Critical Networking Quirk: XMLHttpRequest in deal-advisor

**`expo/fetch` returns 404 for plain JSON POST requests in `deal-advisor.tsx` on physical devices.**

This is a known, consistent issue with the `expo/fetch` import in this specific screen. The root cause is unclear but has been reproduced reliably on physical iOS and Android devices.

**Rule:** In `deal-advisor.tsx`, use `XMLHttpRequest` for all non-streaming POST requests:

```typescript
const xhr = new XMLHttpRequest();
xhr.open('POST', url);
xhr.setRequestHeader('Content-Type', 'application/json');
xhr.onload = () => {
  if (xhr.status === 200) {
    const data = JSON.parse(xhr.responseText);
    // handle response
  }
};
xhr.send(JSON.stringify(body));
```

The global query client elsewhere in the app safely uses `expo/fetch` for GET requests — don't change that. This quirk is specific to POST requests in `deal-advisor.tsx`.

---

## AI Cost Logging

TCG Advisor calls are logged to `ai_cost_log` as:
- `mode`: `'deal_advisor'`
- `model`: `'claude-haiku-4-5'`

Both the advice call and any follow-up messages are logged individually.

---

## Key Files

- `app/deal-advisor.tsx` — TCG Advisor screen (chat UI, voice, XMLHttpRequest calls)
- `server/routes.ts` — `/api/card-advisor/search`, `/api/card-advisor/advice`, `/api/pokemon-chat/tts`, `/api/pokemon-chat/transcribe`
- `server/replit_integrations/audio/client.ts` — `textToSpeech()` function

---

## Common Mistakes to Avoid

- **Never use `tts-1`** — Replit's AI proxy doesn't support the audio/speech endpoint; use `gpt-audio` via chat completions
- **Never play audio directly from a URL** — iOS requires byte-range support; always write to `FileSystem.cacheDirectory` first
- **Never use `expo/fetch` for POSTs in `deal-advisor.tsx`** — use `XMLHttpRequest`; this is a known platform-specific bug
- **Always stop and unload audio on screen blur** — audio continues playing on other screens if not explicitly stopped
- **Rolling history is client-side only** — don't try to persist conversation history server-side; it's intentionally session-scoped
