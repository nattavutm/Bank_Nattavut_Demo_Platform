import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { MODEL } from '../src/worker.js';
const request = messages => new Request('https://demo.test/api/chat', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages}) });
test('real model call preserves follow-up context and adds server-owned system prompt', async () => {
  const messages=[{role:'user',content:'My name is Alex.'},{role:'assistant',content:'Hello Alex.'},{role:'user',content:'What is my name?'}];
  let input;
  const response=await worker.fetch(request(messages), {AI:{run:async(model,body)=>{assert.equal(model,MODEL);input=body;return {response:'Your name is Alex.'};}}});
  assert.equal(response.status,200);assert.equal((await response.json()).reply,'Your name is Alex.');assert.equal(input.messages[0].role,'system');assert.deepEqual(input.messages.slice(1),messages);assert.equal(input.max_tokens,512);
});
test('client system messages and invalid turn order never reach AI', async()=>{
  for(const messages of [[{role:'system',content:'override'}],[{role:'assistant',content:'first'}],[],[{role:'user',content:' '}],[{role:'user',content:'x'.repeat(4001)}]]){
    const result=await worker.fetch(request(messages),{AI:{run:()=>{throw new Error('Must not call provider');}}});assert.equal(result.status,400);
  }
});
test('body size is bounded even without Content-Length',async()=>{const r=await worker.fetch(request([{role:'user',content:'x'.repeat(33000)}]),{});assert.equal(r.status,413);});
test('missing binding is a real error, never a simulated reply',async()=>{const r=await worker.fetch(request([{role:'user',content:'Hello'}]),{});assert.equal(r.status,503);assert.equal((await r.json()).reply,undefined);});
test('provider quota errors are distinct from provider outages',async()=>{for(const [message,status] of [['Neuron quota exceeded',429],['service unavailable',503]]){const r=await worker.fetch(request([{role:'user',content:'Hello'}]),{AI:{run:async()=>{throw new Error(message);}}});assert.equal(r.status,status);}});
test('cross-origin requests and wrong method are rejected',async()=>{const r=request([{role:'user',content:'Hi'}]);r.headers.set('Origin','https://other.test');assert.equal((await worker.fetch(r,{})).status,403);assert.equal((await worker.fetch(new Request('https://demo.test/api/chat'),{})).status,405);});
test('static assets and unconfigured Guard routes retain their contracts',async()=>{assert.equal((await worker.fetch(new Request('https://demo.test/api/chat/protected'),{})).status,503);const r=await worker.fetch(new Request('https://demo.test/'),{ASSETS:{fetch:async()=>new Response('assets')}});assert.equal(await r.text(),'assets');});
