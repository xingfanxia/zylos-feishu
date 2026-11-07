import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { describeInboundMedia, labelDownloadedMedia, transcribeVoice } from '../src/lib/inbound-media.js';

const voiceFile = () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'voice-')), 'v.opus');
  fs.writeFileSync(file, Buffer.from('OggS fake'));
  return file;
};
const geminiReply = (text, status = 200) => async () => ({
  ok: status === 200, status, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

test('voice label carries the transcript and duration', async () => {
  const label = await labelDownloadedMedia({ kind: 'audio', durationMs: 10906 }, '/x.opus',
    async () => ({ ok: true, text: '介绍一下你自己' }));
  assert.equal(label, '[voice message, 11s] transcript: 介绍一下你自己');
});

test('failed transcription tells the agent to ask the sender to type', async () => {
  const label = await labelDownloadedMedia({ kind: 'audio' }, '/x.opus', async () => ({ ok: false, reason: 'HTTP 500' }));
  assert.match(label, /^\[voice message\] \(could not be transcribed;/);
});

test('video is saved but never transcribed or analyzed', async () => {
  let called = false;
  const label = await labelDownloadedMedia({ kind: 'video', fileName: 'clip.mov' }, '/x.mov', async () => { called = true; });
  assert.equal(called, false);
  assert.match(label, /^\[video: clip\.mov\] \(saved only, not analyzed;/);
});

test('transcribeVoice sends Ogg audio to Gemini and returns trimmed text', async () => {
  let request;
  const result = await transcribeVoice(voiceFile(), {
    apiKey: 'k', model: 'm',
    fetchImpl: async (url, init) => { request = { url, init }; return geminiReply(' 你好 \n')(); },
  });
  assert.deepEqual(result, { ok: true, text: '你好' });
  assert.match(request.url, /models\/m:generateContent$/);
  assert.equal(request.init.headers['x-goog-api-key'], 'k');
  assert.equal(JSON.parse(request.init.body).contents[0].parts[1].inline_data.mime_type, 'audio/ogg');
});

test('transcribeVoice maps the no-speech sentinel to an empty transcript', async () => {
  const result = await transcribeVoice(voiceFile(), { apiKey: 'k', fetchImpl: geminiReply('[no_speech]') });
  assert.deepEqual(result, { ok: true, text: '' });
  assert.equal(describeInboundMedia({ kind: 'audio', transcript: '' }), '[voice message] (no intelligible speech)');
});

test('transcribeVoice never throws: missing key, HTTP error, network error', async () => {
  assert.deepEqual(await transcribeVoice(voiceFile(), { apiKey: '' }), { ok: false, reason: 'GEMINI_API_KEY not set' });
  assert.deepEqual(await transcribeVoice(voiceFile(), { apiKey: 'k', fetchImpl: geminiReply('', 429) }), { ok: false, reason: 'HTTP 429' });
  const down = await transcribeVoice(voiceFile(), { apiKey: 'k', fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  assert.deepEqual(down, { ok: false, reason: 'ECONNRESET' });
});
