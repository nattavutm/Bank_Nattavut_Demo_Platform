import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createHash,randomUUID} from 'node:crypto';
import {controlsApi,controlObservation} from '../src/gateway/llm-controls.js';import {controlCases,controlModelIDs} from '../public/gateway/control-config.js';import worker from '../src/worker.js';
function setup(){const sqlite=new DatabaseSync(':memory:');const db={prepare(sql){const stmt=sqlite.prepare(sql);let args=[];return{bind(...v){args=v;return this;},async run(){return{meta:{changes:stmt.run(...args).changes}};},async first(){return stmt.get(...args)??null;},async all(){return{results:stmt.all(...args)};}};},async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
 const traffic=[],prompts=[],upstream=[],env={LR_DB_PROTECTED:db,GATEWAY_HELPDESK_KEY:'test-helpdesk',GATEWAY_OPERATIONS_KEY:'test-operations',REDACTION_UPSTREAM_KEY_SHA256:createHash('sha256').update('test-upstream').digest('hex')};
 env.AI={async run(model,body){prompts.push(body);return{response:'The fictional equipment arrives on Friday.'};}};
 const service=(body,key='test-upstream',path='/upstream/v1/chat/completions')=>controlsApi(new Request('https://demo.test/api/gateway/controls'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body)}),env,true);
 env.AI_GATEWAY={async fetch(url,opts){assert.equal(url,'http://trendai-gateway-gateway.trendai-gateway.svc.cluster.local:8080/v1/chat/completions');assert.equal(opts.redirect,'manual');const body=JSON.parse(opts.body);traffic.push({body:structuredClone(body),key:opts.headers.Authorization});const id=randomUUID();
  if(env.enforce!==false&&body.model==='r5r5-restricted'&&opts.headers.Authorization==='Bearer test-helpdesk')return Response.json({error:{code:'insufficient_permissions',type:'invalid_request_error',message:'blocked by access policy: r5r5 demo - Helpdesk restricted model deny'}},{status:403,headers:{'x-request-id':id}});
  if(env.enforce!==false&&body.model==='r5r5-email-review'&&body.messages[2].content.includes('SYSTEM OVERRIDE'))return Response.json({error:{code:'policy_violation',type:'invalid_request_error',message:'blocked by content policy: prompt_attack.default.classifier (high)'}},{status:400,headers:{'x-request-id':id}});
  const model=Object.entries(controlModelIDs).find(([,r])=>r.alias===body.model)?.[0];const forwarded={...body,model};upstream.push(structuredClone(forwarded));const response=await service(forwarded);return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','x-request-id':id}});
 }};
 const browser=(kind,path='',body,who='one',origin='https://demo.test')=>controlsApi(new Request('https://demo.test/api/gateway/controls/'+kind+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:'__Host-trendai_session='+who},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 return{sqlite,db,env,traffic,prompts,upstream,service,browser};}
test('email normal control reaches inference; the mock Gateway deny is separate from receiver observations',async()=>{const t=setup();try{
 const {id}=await(await t.browser('email','/runs',{})).json();await t.browser('email','/runs/'+id+'/step',{step:'normal'});const data=await(await t.browser('email','/runs/'+id+'/step',{step:'attack'})).json();
 assert.equal(data.step,2);const direct=data.calls.find(c=>c.phase==='attack'&&c.side==='direct'),protectedCall=data.calls.find(c=>c.phase==='attack'&&c.side==='gateway');assert.equal(direct.decision,'allow');assert.equal(protectedCall.denial_type,'guardrail');assert.equal(protectedCall.blocked_before_model,true);assert.equal(protectedCall.upstream_received,'no');assert.equal(t.prompts.length,3);
 assert.ok(t.prompts.every(p=>!JSON.stringify(p).includes('Context:')));assert.equal(JSON.stringify(data).includes('test-upstream'),false);assert.equal(JSON.stringify(data).includes('proof'),false);
}finally{t.sqlite.close();}});
test('model phases bind actual server-selected credentials and resources, with the same saved edited text',async()=>{const t=setup();try{
 const prompt='Summarize 3 fictional docking requests.',{id}=await(await t.browser('models','/runs',{prompt})).json();let data;for(const step of ['standard','restricted','authorized'])data=await(await t.browser('models','/runs/'+id+'/step',{step,prompt})).json();
 assert.equal(data.step,3);assert.deepEqual(t.traffic.map(x=>[x.body.model,x.key]),[['r5r5-standard','Bearer test-helpdesk'],['r5r5-restricted','Bearer test-helpdesk'],['r5r5-restricted','Bearer test-operations']]);assert.ok(t.prompts.every(p=>p.messages[1].content===prompt));
 assert.equal(data.calls.find(c=>c.side==='gateway'&&c.phase==='restricted').denial_type,'access');assert.equal(data.calls.find(c=>c.side==='gateway'&&c.phase==='authorized').decision,'allow');
 assert.ok(t.prompts.every(p=>!JSON.stringify(p).includes('test-operations')));
}finally{t.sqlite.close();}});
test('a Gateway that allows everything cannot be reported as protection',async()=>{const t=setup();try{
 t.env.enforce=false;for(const kind of ['email','models']){const {id}=await(await t.browser(kind,'/runs',{})).json();let data;for(const step of controlCases[kind].steps)data=await(await t.browser(kind,'/runs/'+id+'/step',{step})).json();assert.ok(data.calls.every(c=>c.decision==='allow'));assert.ok(data.calls.every(c=>!c.blocked_before_model));}
}finally{t.sqlite.close();}});
test('foreign ownership, altered configuration, unsafe methods, empty text and step order are rejected',async()=>{const t=setup();try{
 const {id}=await(await t.browser('models','/runs',{})).json();assert.equal((await t.browser('models','/runs/'+id,undefined,'other')).status,404);assert.equal((await t.browser('email','/runs/'+id)).status,404);
 assert.equal((await t.browser('models','/runs',{prompt:'a',identity:'other'})).status,400);assert.equal((await t.browser('models','/runs/'+id+'/step',{step:'restricted'})).status,409);assert.equal((await t.browser('models','/runs/'+id+'/step',{step:'standard',model:'r5r5-restricted'})).status,409);assert.equal((await t.browser('models','/runs/'+id+'/step',{step:'standard',prompt:'changed'})).status,409);
 assert.equal((await t.browser('models','/runs',{},'one','https://other.test')).status,403);assert.equal((await t.browser('models','/runs',{prompt:''})).status,400);assert.equal((await t.browser('models','/runs',{prompt:'a'.repeat(4001)})).status,400);assert.equal(t.traffic.length,0);
}finally{t.sqlite.close();}});
test('late/replayed or edited upstream context cannot invoke inference twice',async()=>{const t=setup();try{
 const {id}=await(await t.browser('models','/runs',{})).json();await t.browser('models','/runs/'+id+'/step',{step:'standard'});const sent=t.upstream[0];assert.equal((await t.service(sent)).status,409);assert.equal((await t.service(sent,'bad-key')).status,401);assert.equal(t.prompts.length,2);
 const proxy=t.env.AI_GATEWAY.fetch;t.env.AI_GATEWAY.fetch=async(url,opts)=>{const body=JSON.parse(opts.body),wrong={...body,model:'r5r5-standard-model',messages:[...body.messages.slice(0,2),{role:'user',content:'changed'}]};assert.equal((await t.service(wrong)).status,400);return proxy(url,opts);};
 const fresh=await(await t.browser('models','/runs',{})).json();await t.browser('models','/runs/'+fresh.id+'/step',{step:'standard'});assert.equal(t.prompts.length,4);
}finally{t.sqlite.close();}});
test('generic 403, missing correlation, model refusal, and a late receipt cannot become a verified pre-model Gateway block',()=>{
 const call={side:'gateway',status:'closed',http:400,request_id:randomUUID(),error:{code:'policy_violation',type:'invalid_request_error',message:'blocked by content policy: prompt_attack.default.classifier (high)'}};assert.equal(controlObservation(call,null).blocked_before_model,true);
 for(const change of [{side:'direct'},{status:'running'},{http:401},{http:403},{request_id:null},{error:{code:'forbidden'}}])assert.equal(controlObservation({...call,...change},null).blocked_before_model,false);
 assert.equal(controlObservation(call,{received:1,invoked:1,state:'invoking'}).blocked_before_model,false);assert.equal(controlObservation(call,{received:1,invoked:1,state:'invoking'}).evidence_status,'partial');
});
test('unavailable identities, failed normal controls or inference cannot substitute protection',async()=>{const t=setup();try{
 delete t.env.GATEWAY_HELPDESK_KEY;const {id}=await(await t.browser('email','/runs',{})).json();assert.equal((await t.browser('email','/runs/'+id+'/step',{step:'normal'})).status,503);assert.equal(t.prompts.length,0);
 t.env.GATEWAY_HELPDESK_KEY='test-helpdesk';t.env.AI.run=async()=>{throw new Error('offline');};const data=await(await t.browser('email','/runs/'+id+'/step',{step:'normal'})).json();assert.equal(data.step,0);assert.ok(data.calls.every(c=>c.decision==='unknown'));assert.equal((await t.browser('email','/runs/'+id+'/step',{step:'attack'})).status,409);
}finally{t.sqlite.close();}});
test('browser pages and APIs require login; provider discovery requires a separate upstream credential',async()=>{const t=setup();try{
 for(const path of ['/gateway/email/','/gateway/models/','/gateway/controls/frame.js','/api/gateway/controls/email/config'])assert.equal((await worker.fetch(new Request('https://demo.test'+path),{})).status,path.startsWith('/api/')?401:303);
 assert.equal((await worker.fetch(new Request('https://demo.test/api/gateway/controls/upstream/v1/models'),t.env)).status,401);const r=await controlsApi(new Request('https://demo.test/api/gateway/controls/upstream/v1/models',{headers:{Authorization:'Bearer test-upstream'}}),t.env,true);assert.equal((await r.json()).data.length,3);assert.equal(t.prompts.length,0);
}finally{t.sqlite.close();}});
