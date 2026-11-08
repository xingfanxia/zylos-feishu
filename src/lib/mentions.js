/**
 * Resolve @_user_N placeholders in message text to real names.
 * Feishu replaces @mentions with @_user_1, @_user_2, etc. in the raw text.
 * The mentions array contains the mapping: { key: "@_user_1", name: "Name", id: { ... } }
 *
 * Every key is matched in one pass, longest first and only where the key ends
 * (no letter, digit or underscore follows). Replacing keys one at a time with
 * a plain string let `@_user_1` match the start of `@_user_10`, so a message
 * with ten or more mentions named the wrong people. A replacement function is
 * used so a `$` in a display name is not read as a replacement pattern.
 *
 * @param {string} text
 * @param {Array<{key?: string, name?: string, id?: object}>} mentions
 * @param {{ stripBot?: boolean, botOpenId?: string }} [opts] stripBot removes
 *   the bot's own mention (and the whitespace after it) instead of naming it.
 * @returns {string}
 */
export function resolveMentions(text, mentions, { stripBot = false, botOpenId: botId } = {}) {
  if (!text || !mentions || !Array.isArray(mentions) || mentions.length === 0) return text;

  const byKey = new Map();
  for (const m of mentions) {
    if (m?.key && !byKey.has(m.key)) byKey.set(m.key, m);
  }
  if (byKey.size === 0) return text.trim();

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keys = [...byKey.keys()].sort((a, b) => b.length - a.length).map(escape);
  const pattern = new RegExp(`(${keys.join('|')})(?![A-Za-z0-9_])(\\s*)`, 'g');

  const resolved = text.replace(pattern, (whole, key, space) => {
    const m = byKey.get(key);
    const isBotMention = botId && (m.id?.open_id === botId || m.id?.app_id === botId);
    if (stripBot && isBotMention) return '';
    if (m.name) return `@${m.name}${space}`;
    return whole;
  });
  return resolved.trim();
}
