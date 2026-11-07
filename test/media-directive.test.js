import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMediaMessage } from '../src/lib/media-directive.js';

test('a bare directive is media with no caption', () => {
  assert.deepEqual(parseMediaMessage('[MEDIA:image]/w/a.jpg'), { type: 'image', path: '/w/a.jpg', before: '', after: '' });
});

test('captions before and after the directive are kept in order, never as a raw path', () => {
  assert.deepEqual(parseMediaMessage('封面来啦👇\n[MEDIA:image]/w/a.jpg\n封面👆'),
    { type: 'image', path: '/w/a.jpg', before: '封面来啦👇', after: '封面👆' });
});

test('plain text and an empty directive are not media', () => {
  assert.equal(parseMediaMessage('hello'), null);
  assert.equal(parseMediaMessage('[MEDIA:image]   '), null);
});
