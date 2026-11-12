import {mcpRpc} from '../src/gateway/mcp-client.js';
import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createHash,randomUUID} from 'node:crypto';import {databaseApi,databaseDecision} from '../src/gateway/database.js';import worker from '../src/worker.js';
function setup(){const sqlite=new DatabaseSync(':memory:');const db={prepare(sql){const stmt=sqlite.prepare(sql);let args=[];return{bind(...v){args=v;return this;},async run(){return{meta:{changes:stmt.run(...args).changes}};},async first(){return stmt.get(...args)??null;},async all(){return{results:stmt.all(...args)};}};},async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
 const env={LR_DB_PROTECTED:db,GATEWAY_DEMO_VIRTUAL_KEY:'test-key',REDACTION_UPSTREAM_KEY_SHA256:createHash('sha256').update('test-upstream').digest('hex')};
 const service=body=>databaseApi(new Request('https://demo.test/api/gateway/database/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-upstream'},body:JSON.stringify(body)}),env,true);
 const traffic=[];env.AI_GATEWAY_MCP={async fetch(url,opts){assert.equal(url,'http://trendai-gateway-gateway.trendai-gateway.svc.cluster.local:8081/');assert.equal(opts.headers.Authorization,'Bearer test-key');assert.equal(opts.redirect,'manual');const body=JSON.parse(opts.body);traffic.push(body);
  if(body.method==='tools/list')return Response.json({jsonrpc:'2.0',id:body.id,result:{tools:[{name:'r5r5-database-demo__get_status'}]}});
  if(body.method==='tools/call'){body.params.name=body.params.name.replace('r5r5-database-demo__','');if(body.params.name==='delete_volume')return Response.json({jsonrpc:'2.0',id:body.id,error:{code:0,message:'mcpproxy tools/call: blocked by access policy: r5r5-database-demo/delete_volume (r5r5 demo - Deny database deletion)'}},{status:200,headers:{'x-request-id':randomUUID()}});}
  const response=await service(body);const headers=new Headers(response.headers);headers.set('x-request-id',randomUUID());return new Response(response.body,{status:response.status,headers});
 }};
 const browser=(path='',body,who='one')=>databaseApi(new Request('https://demo.test/api/gateway/database'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'https://demo.test',Cookie:'__Host-trendai_session='+who},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 return{env,db,sqlite,service,browser,traffic};}
test('guided demo executes scoped MCP calls, deletes only the direct sandbox and fences denied deliveries',async()=>{const t=setup();try{
 const created=await t.browser('/runs',{mode:'guided'});assert.equal(created.status,201);const {id}=await created.json();
 let snapshot;
 for(const step of ['status','delete','verify']){const response=await t.browser('/runs/'+id+'/step',{step});assert.equal(response.status,200);snapshot=await response.json();}
 assert.equal(snapshot.step,3);assert.deepEqual(snapshot.states,[{side:'direct',state:'Offline'},{side:'gateway',state:'Online'}]);
 const protectedDelete=snapshot.calls.find(x=>x.side==='gateway'&&x.tool==='delete_volume');assert.equal(protectedDelete.received,0);assert.equal(protectedDelete.committed,0);assert.equal(protectedDelete.http,200);assert.equal(protectedDelete.decision,'deny');assert.equal(protectedDelete.decision_source,'gateway');
 assert.equal(snapshot.calls.filter(x=>x.committed).length,1);assert.equal(JSON.stringify(snapshot).includes('proof'),false);assert.equal(JSON.stringify(snapshot).includes('test-key'),false);
 const original=t.traffic.find(x=>x.method==='tools/call'&&x.params.name==='get_status');
 const replay=await (await t.service(original)).json();assert.equal(replay.result.isError,true);
 const after=await (await t.browser('/runs/'+id)).json();assert.equal(after.calls.filter(x=>x.committed).length,1);
}finally{t.sqlite.close();}});
test('ownership, ordered steps, fixed inputs and upstream credentials cannot be bypassed',async()=>{const t=setup();try{
 const {id}=await (await t.browser('/runs',{mode:'guided'})).json();
 assert.equal((await t.browser('/runs/'+id,undefined,'other')).status,404);assert.equal((await t.browser('/runs/'+id+'/step',{step:'status'},'other')).status,404);
 assert.equal((await t.browser('/runs/'+id+'/step',{step:'delete'})).status,409);
 assert.equal((await t.browser('/runs',{mode:'guided',owner:'other'})).status,400);
 assert.equal((await t.browser('/runs/'+id+'/step',{step:'status',tool:'delete_volume'})).status,409);
 assert.equal((await databaseApi(new Request('https://demo.test/api/gateway/database/mcp',{method:'POST'}),t.env,true)).status,401);
 const bad=await (await t.service({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'delete_volume',arguments:{run_id:id,call_id:randomUUID(),proof:randomUUID()}}})).json();assert.equal(bad.result.isError,true);
 assert.deepEqual((await (await t.browser('/runs/'+id)).json()).states.map(x=>x.state),['Online','Online']);
}finally{t.sqlite.close();}});
test('missing private MCP connectivity never substitutes a simulated Gateway result',async()=>{const t=setup();try{
 delete t.env.AI_GATEWAY_MCP;const {id}=await (await t.browser('/runs',{mode:'guided'})).json();
 assert.equal((await t.browser('/runs/'+id+'/step',{step:'status'})).status,503);const data=await (await t.browser('/runs/'+id)).json();assert.equal(data.calls.length,0);assert.equal(data.step,0);
}finally{t.sqlite.close();}});
test('Live Agent uses only actual bounded proposals and never receives dispatcher credentials',async()=>{const t=setup();try{
 const proposals=[];t.env.AI={async run(model,params){proposals.push(params);return{response:'Not a tool proposal'};}};
 const {id}=await (await t.browser('/runs',{mode:'agent'})).json();let result=await (await t.browser('/runs/'+id+'/step',{step:'status'})).json();assert.equal(result.calls.length,0);assert.equal(result.step,0);assert.match(result.notice,/No tool was substituted/);
 t.env.AI.run=async(model,params)=>{proposals.push(params);return{response:'{"tool":"get_status"}'};};
 result=await (await t.browser('/runs/'+id+'/step',{step:'status'})).json();assert.equal(result.step,1);assert.equal(result.calls.length,2);assert.equal(JSON.stringify(proposals).includes('test-key'),false);assert.equal(JSON.stringify(proposals).includes('proof'),false);
}finally{t.sqlite.close();}});
test('failed status control does not advance to an unrelated deletion-denial demonstration',async()=>{const t=setup();try{
 t.env.AI_GATEWAY_MCP.fetch=async()=>Response.json({error:{message:'Unauthorized'}},{status:401});const {id}=await (await t.browser('/runs',{mode:'guided'})).json();
 const result=await (await t.browser('/runs/'+id+'/step',{step:'status'})).json();assert.equal(result.step,0);assert.match(result.notice,/control did not reach MCP/);assert.equal(result.calls.filter(c=>c.tool==='delete_volume').length,0);
}finally{t.sqlite.close();}});
test('new case assets and all browser-run endpoints remain behind login',async()=>{
 for(const path of ['/gateway/database/','/gateway/database/frame.js','/api/gateway/database/config','/api/gateway/database/runs'])assert.equal((await worker.fetch(new Request('https://demo.test'+path),{})).status,path.startsWith('/api/')?401:303);
});

test('only the verified live denial signature is classified as a Gateway policy deny',()=>{
 const call={side:'gateway',tool:'delete_volume',status:'closed',http:200,received:0,committed:0,rpc:{error:{code:0,message:'mcpproxy tools/call: blocked by access policy: r5r5-database-demo/delete_volume (r5r5 demo - Deny database deletion)'}}};
 assert.equal(databaseDecision(call).decision,'deny');
 for(const change of [{side:'direct'},{tool:'get_status'},{http:403},{status:'open'},{received:1},{committed:1},{rpc:{error:{code:0,message:'Access denied'}}},{rpc:{error:{code:401,message:'Unauthorized'}}}])assert.equal(databaseDecision({...call,...change}).decision,'unknown');
 assert.equal(databaseDecision({...call,status:'open'}).tool_received,'unknown');
});

test('MCP replies must match the dispatched JSON-RPC request ID',async()=>{
 const binding={fetch:async()=>Response.json({jsonrpc:'2.0',id:'other-request',error:{code:0,message:'unrelated response'}})};
 assert.equal((await mcpRpc(binding,'https://fixed.test','test-key','tools/call',{},'our-request')).message,null);
 binding.fetch=async()=>new Response('data: '+JSON.stringify({jsonrpc:'2.0',id:'our-request',result:{content:[{type:'text',text:'Online'}]}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 assert.equal((await mcpRpc(binding,'https://fixed.test','test-key','tools/call',{},'our-request')).message.result.content[0].text,'Online');
});

test('Live Agent accepts the observed Workers AI chat-completion envelope without substituting a tool',async()=>{const t=setup();try{
 t.env.AI={async run(){return{choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"tool":"get_status"}'}}]};}};
 const {id}=await (await t.browser('/runs',{mode:'agent'})).json();
 let result=await (await t.browser('/runs/'+id+'/step',{step:'status'})).json();assert.equal(result.step,1);assert.equal(result.calls.length,2);
 result=await (await t.browser('/runs/'+id+'/step',{step:'delete'})).json();assert.equal(result.step,1);assert.equal(result.calls.length,2);assert.match(result.notice,/proposed get_status instead/);
}finally{t.sqlite.close();}});
