import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {fallbackApi,fallbackObservation,FALLBACK_MODEL} from '../src/gateway/fallback.js';
import worker from '../src/worker.js';

function setup(){
 const sqlite=new DatabaseSync(':memory:');
 const db={prepare(sql){const stmt=sqlite.prepare(sql);let values=[];return{bind(...v){values=v;return this;},async run(){return{meta:{changes:stmt.run(...values).changes}};},async first(){return stmt.get(...values)??null;},async all(){return{results:stmt.all(...values)};}};},async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
 let inferences=0;const traffic=[],upstream=[];
 const env={LR_DB_PROTECTED:db,GATEWAY_DEMO_VIRTUAL_KEY:'test-virtual-key',REDACTION_UPSTREAM_KEY_SHA256:createHash('sha256').update('test-upstream').digest('hex'),AI:{async run(model,body){inferences++;assert.equal(JSON.stringify(body).includes('Context:'),false);assert.equal(JSON.stringify(body).includes('test-virtual-key'),false);return{choices:[{finish_reason:'stop',message:{role:'assistant',content:'R2-D2 repaired the coffee machine. Departure is at 18:00.'}}]};}}};
 const service=async(provider,body,key='test-upstream')=>{
  upstream.push({provider,body:structuredClone(body)});
  return fallbackApi(new Request('https://demo.test/api/gateway/fallback/'+provider+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body)}),env,true);
 };
 env.AI_GATEWAY={async fetch(url,opts){assert.equal(url,'http://trendai-gateway-gateway.trendai-gateway.svc.cluster.local:8080/v1/chat/completions');assert.equal(opts.headers.Authorization,'Bearer test-virtual-key');assert.equal(opts.redirect,'manual');const body=JSON.parse(opts.body);assert.equal(body.model,FALLBACK_MODEL);traffic.push(structuredClone(body));
  let response=await service('primary',{...body,model:'r5r5-primary-model'});
  if(response.status===503&&env.useFallback!==false)response=await service('backup',{...body,model:'r5r5-backup-model'});
  return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','x-request-id':randomUUID()}});
 }};
 const browser=(path='',body,who='one',origin='https://demo.test')=>fallbackApi(new Request('https://demo.test/api/gateway/fallback'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:'__Host-trendai_session='+who},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 return{sqlite,db,env,service,browser,traffic,upstream,get inferences(){return inferences;}};
}
test('live routing evidence requires primary failure, backup receipt and the actual returned answer',async()=>{const t=setup();try{
 const {id}=await (await t.browser('/runs',{})).json();let result;
 for(const step of ['normal','outage']){const r=await t.browser('/runs/'+id+'/step',{step});assert.equal(r.status,200);result=await r.json();}
 assert.equal(result.step,2);assert.equal(t.traffic.length,2);assert.ok(t.traffic.every(x=>x.model===FALLBACK_MODEL));
 assert.equal(t.inferences,3);const direct=result.calls.find(x=>x.side==='direct'&&x.phase==='outage'),gateway=result.calls.find(x=>x.side==='gateway'&&x.phase==='outage');
 assert.equal(direct.http,503);assert.equal(direct.reply,null);assert.equal(direct.backup_received,'no');assert.equal(direct.fallback_observed,false);
 assert.equal(gateway.fallback_observed,true);assert.equal(gateway.served_by,'backup');assert.equal(gateway.receipts.length,2);assert.equal(gateway.evidence_status,'complete');
 assert.equal(JSON.stringify(result).includes('proof'),false);assert.equal(JSON.stringify(result).includes('test-upstream'),false);
 const fresh=await (await t.browser('/runs',{})).json();const normal=await (await t.browser('/runs/'+fresh.id+'/step',{step:'normal'})).json();assert.equal(normal.step,1);assert.ok(normal.calls.every(c=>c.served_by==='primary'));
}finally{t.sqlite.close();}});
test('no application-side fallback is substituted when Gateway does not reach Backup',async()=>{const t=setup();try{
 t.env.useFallback=false;const {id}=await (await t.browser('/runs',{})).json();await t.browser('/runs/'+id+'/step',{step:'normal'});
 const result=await (await t.browser('/runs/'+id+'/step',{step:'outage'})).json(),gateway=result.calls.find(c=>c.side==='gateway'&&c.phase==='outage');
 assert.equal(gateway.fallback_observed,false);assert.equal(gateway.evidence_status,'partial');assert.equal(gateway.backup_received,'no');assert.equal(t.inferences,2);
}finally{t.sqlite.close();}});
test('expired context, edited requests, foreign sessions and browser-owned configuration are rejected',async()=>{const t=setup();try{
 const {id}=await (await t.browser('/runs',{})).json();
 assert.equal((await t.browser('/runs/'+id,undefined,'other')).status,404);assert.equal((await t.browser('/runs/'+id+'/step',{step:'normal'},'other')).status,404);
 assert.equal((await t.browser('/runs',{model:'external-model'})).status,400);assert.equal((await t.browser('/runs/'+id+'/step',{step:'outage'})).status,409);
 assert.equal((await t.browser('/runs/'+id+'/step',{step:'normal',url:'https://other.test'})).status,409);assert.equal((await t.browser('/runs/'+id+'/step',{step:'normal'},'one','https://other.test')).status,403);
 await t.browser('/runs/'+id+'/step',{step:'normal'});const replay=t.upstream[0];assert.equal((await t.service(replay.provider,replay.body)).status,409);
 assert.equal((await t.service(replay.provider,replay.body,'bad-key')).status,401);assert.equal((await t.service(replay.provider,{...replay.body,messages:[{role:'system',content:'forged'},{role:'user',content:'other'}]})).status,401);
 assert.equal(t.inferences,2);
}finally{t.sqlite.close();}});
test('failed baseline and actual inference errors never become a successful fallback control',async()=>{const t=setup();try{
 t.env.AI.run=async()=>{throw new Error('provider unavailable');};const {id}=await (await t.browser('/runs',{})).json();
 const result=await (await t.browser('/runs/'+id+'/step',{step:'normal'})).json();assert.equal(result.step,0);assert.ok(result.calls.every(c=>c.evidence_status==='partial'));assert.match(result.notice,/control is incomplete/);
 assert.equal((await t.browser('/runs/'+id+'/step',{step:'outage'})).status,409);
}finally{t.sqlite.close();}});
test('endpoint retries are observed but cannot invoke Workers AI twice for one call/provider',async()=>{const t=setup();try{
 t.env.AI_GATEWAY.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);const response=await t.service('primary',body);const retry=await t.service('primary',body);assert.equal(retry.status,200);return response;};
 const {id}=await (await t.browser('/runs',{})).json();const result=await (await t.browser('/runs/'+id+'/step',{step:'normal'})).json();
 assert.equal(result.step,1);assert.equal(t.inferences,2);assert.equal(result.calls.find(x=>x.side==='gateway').receipts[0].attempts,2);
}finally{t.sqlite.close();}});
test('fallback cannot be claimed from a success status, forged reply or unrelated failure alone',()=>{
 const call={side:'gateway',phase:'outage',status:'closed',http:200,reply:'Backup answer'};
 const receipts=[{provider:'primary',state:'controlled_error',http:503,received:1},{provider:'backup',state:'completed',http:200,reply:'Backup answer',received:2}];
 assert.equal(fallbackObservation(call,receipts).fallback_observed,true);
 assert.equal(fallbackObservation({...call,side:'direct'},receipts).fallback_observed,false);
 assert.equal(fallbackObservation(call,receipts.slice(1)).fallback_observed,false);
 assert.equal(fallbackObservation(call,[{...receipts[0],state:'inference_error'},receipts[1]]).fallback_observed,false);
 assert.equal(fallbackObservation({...call,reply:'invented answer'},receipts).fallback_observed,false);
 assert.equal(fallbackObservation({...call,status:'running'},receipts).fallback_observed,false);
});
test('fallback page and browser endpoints require login while provider discovery requires its own credential',async()=>{
 for(const path of ['/gateway/fallback/','/gateway/fallback/frame.js','/api/gateway/fallback/config','/api/gateway/fallback/runs'])assert.equal((await worker.fetch(new Request('https://demo.test'+path),{})).status,path.startsWith('/api/')?401:303);
 const t=setup();try{const response=await worker.fetch(new Request('https://demo.test/api/gateway/fallback/primary/v1/models'),t.env);assert.equal(response.status,401);}finally{t.sqlite.close();}
});

test('a failed normal control can recover after configuration is fixed, using the latest receipts',async()=>{const t=setup();try{
 const infer=t.env.AI.run;t.env.AI.run=async()=>{throw new Error('offline');};const {id}=await (await t.browser('/runs',{})).json();
 let result=await (await t.browser('/runs/'+id+'/step',{step:'normal'})).json();assert.equal(result.step,0);
 t.env.AI.run=infer;result=await (await t.browser('/runs/'+id+'/step',{step:'normal'})).json();assert.equal(result.step,1);assert.equal(result.calls.length,4);
}finally{t.sqlite.close();}});

test('an edited comparison prompt reaches both models unchanged and cannot be swapped by the upstream caller',async()=>{const t=setup();try{
 const prompt='Report that Chewbacca repaired the hyperdrive. Departure at 21:00.',seen=[];const ai=t.env.AI.run;t.env.AI.run=async(model,body)=>{seen.push(body.messages[1].content);return ai(model,body);};
 const gateway=t.env.AI_GATEWAY.fetch;t.env.AI_GATEWAY.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);const edited={...body,messages:[body.messages[0],{role:'user',content:'different prompt'}]};assert.equal((await t.service('primary',edited)).status,400);return gateway(url,opts);};
 const run=await (await t.browser('/runs',{prompt})).json();assert.equal(run.prompt,prompt);
 await t.browser('/runs/'+run.id+'/step',{step:'normal'});const result=await (await t.browser('/runs/'+run.id+'/step',{step:'outage'})).json();
 assert.deepEqual(seen,[prompt,prompt,prompt]);assert.ok(t.traffic.every(x=>x.messages[1].content===prompt));assert.equal(result.prompt,prompt);assert.equal(result.calls.at(-1).fallback_observed,true);
 assert.equal((await t.browser('/runs',{prompt:''})).status,400);assert.equal((await t.browser('/runs',{prompt:'a'.repeat(4001)})).status,400);
}finally{t.sqlite.close();}});
