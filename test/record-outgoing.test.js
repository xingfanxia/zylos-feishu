import test from 'node:test';
import assert from 'node:assert/strict';
import { recordOutgoingHandler } from '../src/lib/record-outgoing.js';

function run(handler, { token, body }) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  handler({ headers: { 'x-internal-token': token }, body }, res);
  return res;
}
const setup = () => {
  const rows = [];
  const handler = recordOutgoingHandler({
    secret: 's', record: (key, entry) => rows.push([key, entry]),
    historyKey: (chat, thread) => `${chat}:${thread}`, bot: () => ({ openId: 'ou_bot', name: 'CC' }),
    now: () => new Date('2026-11-08T00:00:00Z'),
  });
  return { rows, handler };
};

test("the bot's reply is recorded in the chat or thread history", () => {
  const { rows, handler } = setup();
  assert.equal(run(handler, { token: 's', body: { chatId: 'oc_1', text: 'hi' } }).body.ok, true);
  run(handler, { token: 's', body: { chatId: 'oc_1', threadId: 't1', text: 'in thread' } });
  assert.deepEqual(rows.map(([k, e]) => [k, e.text, e.user_name]), [['oc_1', 'hi', 'CC'], ['oc_1:t1', 'in thread', 'CC']]);
});

test('a wrong token is rejected and nothing is recorded', () => {
  const { rows, handler } = setup();
  assert.equal(run(handler, { token: 'x', body: { chatId: 'oc_1', text: 'hi' } }).code, 403);
  assert.equal(rows.length, 0);
});
