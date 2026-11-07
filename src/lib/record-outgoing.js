/**
 * Handler for POST /internal/record-outgoing: scripts/send.js reports each
 * message the bot sent so it enters the chat's in-memory history (the context
 * later messages are answered with). The endpoint must run in every connection
 * mode; until 2026-11-08 it ran only in webhook mode, so in websocket mode the
 * bot's own replies never entered that history.
 */
export function recordOutgoingHandler({ secret, record, historyKey, bot, now = () => new Date() }) {
  return (req, res) => {
    const token = req.headers['x-internal-token'];
    if (!token || token !== secret) return res.status(403).json({ error: 'unauthorized' });
    const { chatId, threadId, text, messageId } = req.body || {};
    if (!text) return res.status(400).json({ error: 'missing text' });
    const entry = {
      timestamp: now().toISOString(),
      message_id: messageId || `bot_${now().getTime()}`,
      user_id: bot().openId || 'bot',
      user_name: bot().name || 'bot',
      text,
    };
    // Thread messages go to the thread only (context isolation).
    if (threadId) record(historyKey(chatId, threadId), entry);
    else if (chatId) record(chatId, entry);
    return res.json({ ok: true });
  };
}
