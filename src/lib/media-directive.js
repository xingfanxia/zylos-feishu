/**
 * Parse an outbound `[MEDIA:type]<path>` directive. The directive occupies its
 * own line anywhere in the message; text before and after it is a caption and
 * is sent in the order written ("封面来啦👇" before, "封面👆" after). The C4
 * broker documents and preserves this "[MEDIA:type]path\n<caption>" form, so a
 * whole-message match would send a captioned image as text with its raw path.
 */
export function parseMediaMessage(message) {
  const lines = String(message).split('\n');
  const idx = lines.findIndex(line => /^\[MEDIA:\w+\]/.test(line));
  if (idx < 0) return null;
  const [, type, rest] = lines[idx].match(/^\[MEDIA:(\w+)\](.*)$/);
  const filePath = rest.trim();
  if (!filePath) return null;
  return {
    type,
    path: filePath,
    before: lines.slice(0, idx).join('\n').trim(),
    after: lines.slice(idx + 1).join('\n').trim(),
  };
}
