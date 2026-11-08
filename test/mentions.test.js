import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMentions } from '../src/lib/mentions.js';

const mention = (n, name, openId = `ou_${n}`) => ({ key: `@_user_${n}`, name, id: { open_id: openId } });

test('@_user_1 does not corrupt @_user_10 and later keys', () => {
  const mentions = Array.from({ length: 11 }, (_, i) => mention(i + 1, `P${i + 1}`));
  const text = '@_user_10 @_user_1 @_user_11 hi';
  assert.equal(resolveMentions(text, mentions), '@P10 @P1 @P11 hi');
});

test('the order of the mentions array does not matter', () => {
  const mentions = [mention(1, 'One'), mention(12, 'Twelve')];
  assert.equal(resolveMentions('@_user_12 and @_user_1', mentions), '@Twelve and @One');
  assert.equal(resolveMentions('@_user_12 and @_user_1', mentions.reverse()), '@Twelve and @One');
});

test('a $ in a display name is inserted literally', () => {
  assert.equal(resolveMentions('hi @_user_1', [mention(1, 'A$&B')]), 'hi @A$&B');
});

test('stripBot removes only the bot mention and its trailing space', () => {
  const mentions = [mention(1, 'Bot', 'ou_bot'), mention(2, 'Ann')];
  assert.equal(resolveMentions('@_user_1 ask @_user_2', mentions, { stripBot: true, botOpenId: 'ou_bot' }), 'ask @Ann');
  assert.equal(resolveMentions('@_user_1 ask', mentions), '@Bot ask');
});

test('text without mentions is returned unchanged', () => {
  assert.equal(resolveMentions('plain', []), 'plain');
  assert.equal(resolveMentions('', [mention(1, 'A')]), '');
});
