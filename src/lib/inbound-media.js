/**
 * Inbound voice and video handling.
 *
 * The component downloads voice notes and videos itself (it holds the app
 * credentials; isolated agent instances do not) and hands the agent a local
 * path. Voice notes are transcribed with a small Gemini model so the agent can
 * answer them; videos are only saved, never analyzed automatically.
 */
import fs from 'fs';

export const DEFAULT_TRANSCRIBE_MODEL = 'gemini-4-argon';
const NO_SPEECH = '[NO_SPEECH]';
const PROMPT = 'Transcribe this voice message verbatim in its original language '
  + '(write Chinese in Simplified characters). '
  + `Output only the transcript text. If there is no intelligible speech, output exactly: ${NO_SPEECH}`;

function formatDuration(durationMs) {
  const seconds = Math.round(Number(durationMs) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? `, ${seconds}s` : '';
}

/**
 * Text the agent sees for an inbound voice note or video.
 * @param {{kind: 'audio'|'video', fileName?: string, durationMs?: number, transcript?: string|null}} media
 */
export function describeInboundMedia({ kind, fileName, durationMs, transcript }) {
  if (kind === 'audio') {
    const head = `[voice message${formatDuration(durationMs)}]`;
    if (transcript === undefined) return head;
    if (transcript) return `${head} transcript: ${transcript}`;
    if (transcript === '') return `${head} (no intelligible speech)`;
    return `${head} (could not be transcribed; ask the sender to type it or use Feishu's 转文字)`;
  }
  return `[video: ${fileName || 'video'}${formatDuration(durationMs)}] (saved only, not analyzed; inspect its content only if the user explicitly asks)`;
}

/**
 * Transcribe a Feishu voice note (Ogg/Opus). Never throws.
 * @returns {Promise<{ok: true, text: string} | {ok: false, reason: string}>}
 */
export async function transcribeVoice(filePath, {
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.FEISHU_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL,
  fetchImpl = fetch,
  timeoutMs = 60000,
} = {}) {
  if (!apiKey) return { ok: false, reason: 'GEMINI_API_KEY not set' };
  try {
    const audio = fs.readFileSync(filePath).toString('base64');
    const res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'audio/ogg', data: audio } }] }],
          generationConfig: { temperature: 0 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body = await res.json();
    const text = (body.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '').join('').trim();
    if (!text) return { ok: false, reason: 'empty transcript' };
    if (text.toUpperCase().startsWith(NO_SPEECH)) return { ok: true, text: '' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, reason: err.name === 'TimeoutError' ? 'timeout' : err.message };
  }
}

/** Label for a downloaded inbound voice/video; transcribes voice notes. */
export async function labelDownloadedMedia(media, localPath, transcribe = transcribeVoice) {
  if (media.kind !== 'audio') return describeInboundMedia(media);
  const result = await transcribe(localPath);
  if (!result.ok) console.warn(`[feishu] voice transcription failed: ${result.reason}`);
  return describeInboundMedia({ ...media, transcript: result.ok ? result.text : null });
}
