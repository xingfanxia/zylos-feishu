/**
 * Feishu media upload (images and files) with size-aware timeouts and retry.
 *
 * Uploads cross a long, variable path (an Azure US host to open.feishu.cn): a
 * 2 MB photo took 2-14 s on 2026-11-08 and over 30 s on 2026-11-04, when a
 * fixed 30 s timeout failed 8 of 16 photos. An upload only returns a key and
 * sends nothing, so retrying it cannot duplicate a message.
 */
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { getCredentials, getProxyConfig } from './config.js';

const MB = 1024 * 1024;
/** Feishu codes for an invalid or expired tenant token. */
const TOKEN_INVALID_CODES = new Set([99991663, 99991668]);
const RETRYABLE_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'EAI_AGAIN', 'ECONNREFUSED']);
/** Total time for all attempts; the C4 broker stops a send after 135 s. */
export const UPLOAD_DEADLINE_MS = 110000;

/** Per-attempt timeout: 20 s plus 10 s per MB, at most 90 s. */
export function uploadTimeoutMs(bytes) {
  return Math.min(90000, Math.max(20000, Math.round(20000 + (bytes / MB) * 10000)));
}

/** Timeouts, dropped connections, 429 and 5xx are worth another attempt. */
export function isRetryableUploadError(err) {
  const status = err?.response?.status;
  if (status) return status === 429 || status >= 500;
  return RETRYABLE_CODES.has(err?.code) || /timeout/i.test(err?.message || '');
}

/** Human-readable failure including Feishu's code, msg and log_id when present. */
export function describeUploadError(err) {
  const status = err?.response?.status;
  const body = err?.response?.data;
  const detail = body && typeof body === 'object'
    ? [body.code != null && `code ${body.code}`, body.msg, body.error?.log_id && `log_id ${body.error.log_id}`]
      .filter(Boolean).join(', ')
    : '';
  if (status) return `HTTP ${status}${detail ? ` (${detail})` : ''}`;
  return err?.message || String(err);
}

let cachedToken = null;

/** Tenant token, reused until a minute before it expires. */
export async function getTenantToken({ http = axios, now = Date.now, timeoutMs = 30000 } = {}) {
  if (cachedToken && cachedToken.expiresAt > now()) return cachedToken.token;
  const creds = getCredentials();
  const res = await http({
    method: 'POST',
    url: 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    headers: { 'Content-Type': 'application/json' },
    data: { app_id: creds.app_id, app_secret: creds.app_secret },
    timeout: timeoutMs,
    proxy: getProxyConfig(),
  });
  const { tenant_access_token: token, expire } = res.data || {};
  if (!token) throw new Error(`tenant token request failed: ${res.data?.msg || 'no token'}`);
  cachedToken = { token, expiresAt: now() + Math.max(0, (Number(expire) || 0) - 60) * 1000 };
  return token;
}

export function resetTenantToken() { cachedToken = null; }

/**
 * POST a multipart upload to a Feishu endpoint and return the response data.
 * `fields` are appended first; the file goes in `fileField`. Throws the last
 * error (message from describeUploadError) when every attempt fails.
 */
export async function uploadMultipart(url, fields, fileField, filePath, {
  http = axios,
  sleep = ms => new Promise(r => setTimeout(r, ms)),
  now = Date.now,
  maxAttempts = 3,
  deadlineMs = UPLOAD_DEADLINE_MS,
} = {}) {
  // Check readability up front: a stream's open error surfaces asynchronously
  // and has crashed the per-send child before (Elaine, 2026-07-11).
  fs.accessSync(filePath, fs.constants.R_OK);
  const size = fs.statSync(filePath).size;
  const started = now();
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const left = () => deadlineMs - (now() - started);
    if (left() <= 5000) break;
    try {
      const token = await getTenantToken({ http, now, timeoutMs: Math.min(30000, left()) });
      const remaining = left();
      if (remaining <= 5000) break;
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
      form.append(fileField, fs.createReadStream(filePath));
      const res = await http({
        method: 'POST',
        url,
        headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
        data: form,
        timeout: Math.min(uploadTimeoutMs(size), remaining),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        proxy: getProxyConfig(),
      });
      return res.data;
    } catch (err) {
      lastErr = err;
      const tokenRejected = err?.response?.status === 401 || TOKEN_INVALID_CODES.has(err?.response?.data?.code);
      if (tokenRejected) resetTenantToken();
      if (!(tokenRejected || isRetryableUploadError(err)) || attempt === maxAttempts) break;
      console.warn(`[feishu] upload attempt ${attempt} failed (${describeUploadError(err)}); retrying`);
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  const error = new Error(describeUploadError(lastErr || new Error('upload deadline exceeded')));
  error.cause = lastErr;
  throw error;
}
