export const MODEL = '@cf/meta/llama-3.2-3b-instruct';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const GUARD_URL = 'https://api.xdr.trendmicro.com/v3.0/aiSecurity/applyGuardrails';
export async function inspectGuard(env, type, payload, fetcher = fetch) {
  if (!env.AI_GUARD_API_KEY) throw new Error('AI Guard is not configured.');
  let response;
  try { response = await fetcher(GUARD_URL, { method:'POST', headers:{ 'Authorization':'Bearer '+env.AI_GUARD_API_KEY, 'Content-Type':'application/json', 'TMV1-Application-Name':'r5r5-demo-platform', 'TMV1-Request-Type':type, 'Prefer':'return=minimal' }, body:JSON.stringify(payload), signal:AbortSignal.timeout(7000), redirect:'manual' }); }
  catch { throw new Error('AI Guard is unavailable. The request was stopped without bypassing protection.'); }
  if (!response.ok) throw new Error(response.status===401||response.status===403?'AI Guard authentication or permissions failed. Check the server configuration.':response.status===429?'AI Guard rate limit reached. Please try later.':'AI Guard could not inspect this request. Please try again.');
  let result;
  try { result = await response.json(); } catch { throw new Error('AI Guard returned an invalid decision. The request was stopped.'); }
  if (!['Allow','Block'].includes(result?.action)) throw new Error('AI Guard returned an invalid decision. The request was stopped.');
  return {action:result.action,id:typeof result.id==='string'?result.id:undefined,reasons:Array.isArray(result.reasons)?result.reasons.filter(reason=>typeof reason==='string').slice(0,10).map(reason=>reason.slice(0,500)):[]};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ app: 'r5r5 TrendAI Demo Platform', integrations: { model: env.AI ? 'configured' : 'not-configured', guard: env.AI_GUARD_API_KEY ? 'configured' : 'not-configured', scanner: 'not-configured' }, model: MODEL });
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
      if (body.guard !== undefined && typeof body.guard !== 'boolean') return json({ error: 'Guard must be true or false.' }, 400);
      if (body.guard === true && !env.AI_GUARD_API_KEY) return json({ error: 'AI Guard is not connected yet. Turn it off to continue chatting.' }, 503);
      if (!env.AI) return json({ error: 'Workers AI is not connected. Deploy with the AI binding enabled.' }, 503);
      let inputDecision;
      if (body.guard) {
        try { inputDecision = await inspectGuard(env, 'OpenAIChatCompletionRequestV1', {model:MODEL,messages:messages.map(({role,content})=>({role,content}))}); }
        catch (error) { return json({error:error.message},503); }
        if (inputDecision.action === 'Block') return json({reply:'This request was blocked by AI Guard.',source:'AI Guard',guard:{...inputDecision,stage:'input'}});
      }
      let timer;
      try {
        const result = await Promise.race([
          env.AI.run(MODEL, { messages: [{ role: 'system', content: 'You are a helpful AI assistant on the r5r5 TrendAI Demo Platform. Answer clearly and concisely. Use the language of the user. Do not claim to access bank accounts or execute actions. You have no tools or access to private customer records.' }, ...messages.map(({ role, content }) => ({ role, content }))], max_tokens: 512, temperature: 0.6 }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('chat_timeout')), 25000); }),
        ]);
        if (typeof result?.response !== 'string' || !result.response.trim()) return json({ error: 'The model returned an empty response. Please try again.' }, 502);
        let outputDecision;
        if (body.guard) {
          try { outputDecision = await inspectGuard(env, 'OpenAIChatCompletionResponseV1', {id:crypto.randomUUID(),object:'chat.completion',created:Math.floor(Date.now()/1000),model:MODEL,choices:[{index:0,message:{role:'assistant',content:result.response},finish_reason:'stop'}]}); }
          catch (error) { return json({error:error.message},503); }
          if (outputDecision.action === 'Block') return json({reply:'This response was blocked by AI Guard.',source:'AI Guard',guard:{...outputDecision,stage:'output'}});
        }
        return json({ reply: result.response, model: MODEL, source: 'Workers AI', ...(body.guard?{guard:{action:'Allow',stage:'input-and-output',inputId:inputDecision.id,outputId:outputDecision.id,inputReasons:inputDecision.reasons,outputReasons:outputDecision.reasons}}:{}) });
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
