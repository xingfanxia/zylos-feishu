import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { uploadMultipart, uploadTimeoutMs, resetTenantToken } from '../src/lib/upload.js';
import { uploadImage } from '../src/lib/message.js';

const file = (bytes = 2 * 1024 * 1024) => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'up-')), 'a.jpg');
  fs.writeFileSync(p, Buffer.alloc(bytes));
  return p;
};
const timeoutErr = () => Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });
const httpErr = (status, data) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });

/** Fake axios: token requests succeed; upload calls replay `uploads` in order. */
function fakeHttp(uploads) {
  const calls = [];
  const http = async (req) => {
    calls.push(req);
    if (req.url.endsWith('/tenant_access_token/internal')) return { data: { tenant_access_token: 't', expire: 7200 } };
    const next = uploads.shift();
    if (next instanceof Error) throw next;
    return { data: next };
  };
  return { http, calls, uploads: () => calls.filter(c => !c.url.endsWith('/internal')) };
}
const noSleep = async () => {};

test.beforeEach(() => resetTenantToken());

test('per-attempt timeout grows with size: 2 MB gets 40 s, not the old fixed 30 s', () => {
  assert.equal(uploadTimeoutMs(2 * 1024 * 1024), 40000);
  assert.equal(uploadTimeoutMs(10), 20000);
  assert.equal(uploadTimeoutMs(50 * 1024 * 1024), 90000);
});

test('a timed-out image upload is retried and then succeeds (2026-11-04 failure mode)', async () => {
  const f = fakeHttp([timeoutErr(), { code: 0, data: { image_key: 'img_1' } }]);
  const result = await uploadImage(file(), 'message', { http: f.http, sleep: noSleep });
  assert.deepEqual(result, { success: true, imageKey: 'img_1', message: 'Image uploaded successfully' });
  assert.equal(f.uploads().length, 2);
  assert.equal(f.uploads()[0].timeout, 40000);
});

test('a 400 is not retried and its Feishu code, msg and log_id are reported', async () => {
  const f = fakeHttp([httpErr(400, { code: 234001, msg: 'Invalid request param.', error: { log_id: 'L1' } })]);
  const result = await uploadImage(file(), 'message', { http: f.http, sleep: noSleep });
  assert.equal(result.success, false);
  assert.equal(result.message, 'HTTP 400 (code 234001, Invalid request param., log_id L1)');
  assert.equal(f.uploads().length, 1);
});

test('a rejected token is refreshed once; the token is otherwise reused', async () => {
  const f = fakeHttp([httpErr(400, { code: 99991668, msg: 'Invalid access token' }), { code: 0, data: { image_key: 'k' } }, { code: 0, data: { image_key: 'k2' } }]);
  await uploadMultipart('https://x/images', {}, 'image', file(), { http: f.http, sleep: noSleep });
  await uploadMultipart('https://x/images', {}, 'image', file(), { http: f.http, sleep: noSleep });
  assert.equal(f.calls.filter(c => c.url.endsWith('/internal')).length, 2);
});

test('retries stop at the overall deadline so the broker never has to kill the send', async () => {
  let clock = 0;
  const f = fakeHttp([timeoutErr(), timeoutErr(), timeoutErr()]);
  const http = async (req) => { clock += req.timeout || 0; return f.http(req); };
  await assert.rejects(
    uploadMultipart('https://x/files', {}, 'file', file(8 * 1024 * 1024), { http, sleep: noSleep, now: () => clock, deadlineMs: 110000 }),
    /timeout/,
  );
  assert.ok(clock <= 110000, `spent ${clock} ms`);
});
