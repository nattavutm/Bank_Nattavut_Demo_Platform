export const MODEL = '@cf/meta/llama-3.2-3b-instruct';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ app: 'r5r5 TrendAI Demo Platform', integrations: { model: env.AI ? 'configured' : 'not-configured', guard: 'not-configured', scanner: 'not-configured' }, model: MODEL });
    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') return json({ error: 'Use POST for chat requests.' }, 405);
      if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
      if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: 'Send a JSON request.' }, 415);
      // Bound the body before parsing, including chunked requests.
      const reader = request.body?.getReader();
      let bytes = 0, chunks = [];
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 32768) { await reader.cancel(); return json({ error: 'Conversation is too long. Start a new chat.' }, 413); }
          chunks.push(value);
        }
      }
      let body;
      try { const buffer = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; } body = JSON.parse(new TextDecoder().decode(buffer)); }
      catch { return json({ error: 'Invalid JSON request.' }, 400); }
      const messages = body?.messages;
      if (!Array.isArray(messages) || !messages.length || messages.length > 12 || messages.some((m, i) => !m || m.role !== (i % 2 ? 'assistant' : 'user') || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 4000) || messages.at(-1).role !== 'user') return json({ error: 'Send up to 12 alternating user and assistant messages, ending with a user message (4,000 characters each).' }, 400);
      if (!env.AI) return json({ error: 'Workers AI is not connected. Deploy with the AI binding enabled.' }, 503);
      let timer;
      try {
        const result = await Promise.race([
          env.AI.run(MODEL, { messages: [{ role: 'system', content: 'You are a helpful AI assistant on the r5r5 TrendAI Demo Platform. Answer clearly and concisely. Use the language of the user. Do not claim to access bank accounts or execute actions. You have no tools or access to private customer records.' }, ...messages.map(({ role, content }) => ({ role, content }))], max_tokens: 512, temperature: 0.6 }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('chat_timeout')), 25000); }),
        ]);
        if (typeof result?.response !== 'string' || !result.response.trim()) return json({ error: 'The model returned an empty response. Please try again.' }, 502);
        return json({ reply: result.response, model: MODEL, source: 'Workers AI' });
      } catch (error) {
        if (error.message === 'chat_timeout') return json({ error: 'The model took too long to respond. Please try again.' }, 504);
        if (/quota|rate.?limit|neuron|429/i.test(String(error.message))) return json({ error: 'Workers AI usage or rate limit reached. Please try later or check your Cloudflare AI quota.' }, 429);
        return json({ error: 'Workers AI is temporarily unavailable. Check the AI binding and model access, then try again.' }, 503);
      } finally { clearTimeout(timer); }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'This live integration is not configured yet.' }, 503);
    return env.ASSETS.fetch(request);
  },
};
