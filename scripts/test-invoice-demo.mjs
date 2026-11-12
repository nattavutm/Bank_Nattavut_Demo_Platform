import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createHash,randomUUID} from 'node:crypto';
import {invoiceApi,invoiceDecision,INVOICE} from '../src/gateway/invoice.js';import worker from '../src/worker.js';
function setup(){
 const sqlite=new DatabaseSync(':memory:');const db={prepare(sql){const stmt=sqlite.prepare(sql);let values=[];return{bind(...v){values=v;return this;},async run(){return{meta:{changes:stmt.run(...values).changes}};},async first(){return stmt.get(...values)??null;},async all(){return{results:stmt.all(...values)};}};},async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
 const traffic=[],prompts=[];const env={LR_DB_PROTECTED:db,GATEWAY_DEMO_VIRTUAL_KEY:'test-key',REDACTION_UPSTREAM_KEY_SHA256:createHash('sha256').update('test-upstream').digest('hex')};
 env.AI={async run(model,body){prompts.push(body);return{choices:[{finish_reason:'stop',message:{role:'assistant',content:body.messages[0].content.startsWith('Choose')?JSON.stringify({tool:env.proposed??'pay_invoice'}):'Cloud Nine Office Supplies has an unpaid invoice of THB 480,000.'}}]};}};
 const service=body=>invoiceApi(new Request('https://demo.test/api/gateway/invoice/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-upstream'},body:JSON.stringify(body)}),env,true);
 env.AI_GATEWAY_MCP={async fetch(url,opts){assert.equal(url,'http://trendai-gateway-gateway.trendai-gateway.svc.cluster.local:8081/');assert.equal(opts.headers.Authorization,'Bearer test-key');assert.equal(opts.redirect,'manual');const body=JSON.parse(opts.body);traffic.push(structuredClone(body));
  if(body.method==='tools/list')return Response.json({jsonrpc:'2.0',id:body.id,result:{tools:[{name:'r5r5-invoice-demo__read_invoice'}]}});
  if(body.method==='tools/call'){body.params.name=body.params.name.replace('r5r5-invoice-demo__','');if(body.params.name==='pay_invoice')return Response.json({jsonrpc:'2.0',id:body.id,error:{code:0,message:'mcpproxy tools/call: blocked by access policy: r5r5-invoice-demo/pay_invoice (r5r5 demo - Deny invoice payment)'}});}
  return service(body);
 }};
 const browser=(path='',body,who='one',origin='https://demo.test')=>invoiceApi(new Request('https://demo.test/api/gateway/invoice'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:'__Host-trendai_session='+who},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 return{sqlite,db,env,service,browser,traffic,prompts};
}
test('invoice review works, payment changes only the direct ledger and a real policy-response shape is distinguished',async()=>{const t=setup();try{
 const {id}=await (await t.browser('/runs',{mode:'guided'})).json();const review=await (await t.browser('/runs/'+id+'/step',{step:'review'})).json();assert.equal(review.step,1);assert.match(review.summary,/THB 480,000/);assert.equal(review.summary_source,'Workers AI');
 const result=await (await t.browser('/runs/'+id+'/step',{step:'payment'})).json();assert.equal(result.step,2);assert.equal(result.payments.length,1);assert.equal(result.payments[0].side,'direct');assert.equal(result.payments[0].amount,480000);
 assert.deepEqual(result.states,[{side:'direct',balance:520000,status:'Paid'},{side:'gateway',balance:1000000,status:'Unpaid'}]);
 const denied=result.calls.find(c=>c.side==='gateway'&&c.tool==='pay_invoice');assert.equal(denied.decision,'deny');assert.equal(denied.received,0);assert.equal(denied.committed,0);
 assert.equal(JSON.stringify(result).includes('proof'),false);assert.equal(JSON.stringify(result).includes('test-key'),false);assert.equal(JSON.stringify(t.prompts).includes('proof'),false);assert.equal(JSON.stringify(t.prompts).includes('test-key'),false);
 assert.equal((await t.browser('/runs/'+id+'/step',{step:'payment'})).status,409);
}finally{t.sqlite.close();}});
test('a one-use context and invoice uniqueness prevent replay or a second charge',async()=>{const t=setup();try{
 const {id}=await (await t.browser('/runs',{mode:'guided'})).json();await t.browser('/runs/'+id+'/step',{step:'review'});await t.browser('/runs/'+id+'/step',{step:'payment'});
 const original=t.traffic.find(c=>c.method==='tools/call');const replay=await (await t.service({...original,params:{...original.params,name:'read_invoice'}})).json();assert.equal(replay.result.isError,true);
 const call=randomUUID(),proof=randomUUID();await t.db.prepare("INSERT INTO invoice_demo_calls(id,run,side,step,tool,proof,status,created) VALUES(?,?,'direct','payment','pay_invoice',?,'open',?)").bind(call,id,proof,Date.now()).run();
 const duplicate=await (await t.service({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'pay_invoice',arguments:{run_id:id,call_id:call,proof}}})).json();assert.equal(duplicate.result.structuredContent.payment_created,false);
 const result=await (await t.browser('/runs/'+id)).json();assert.equal(result.payments.length,1);assert.equal(result.states.find(s=>s.side==='direct').balance,520000);
}finally{t.sqlite.close();}});
test('session ownership, origins, fixed amounts and step order cannot be changed by browser input',async()=>{const t=setup();try{
 const {id}=await (await t.browser('/runs',{mode:'guided'})).json();
 assert.equal((await t.browser('/runs/'+id,undefined,'other')).status,404);assert.equal((await t.browser('/runs/'+id+'/step',{step:'review'},'other')).status,404);
 assert.equal((await t.browser('/runs',{mode:'guided',owner:'other',amount:1})).status,400);assert.equal((await t.browser('/runs/'+id+'/step',{step:'payment'})).status,409);
 assert.equal((await t.browser('/runs/'+id+'/step',{step:'review',invoice:'other'})).status,409);assert.equal((await t.browser('/runs/'+id+'/step',{step:'review'},'one','https://other.test')).status,403);
 const bad=await (await t.service({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'pay_invoice',arguments:{run_id:id,call_id:randomUUID(),proof:randomUUID(),amount:1}}})).json();assert.equal(bad.result.isError,true);
 assert.equal((await (await t.browser('/runs/'+id)).json()).payments.length,0);
}finally{t.sqlite.close();}});
test('missing connectivity and failed review cannot advance to an unrelated payment denial test',async()=>{const t=setup();try{
 delete t.env.AI_GATEWAY_MCP;const {id}=await (await t.browser('/runs',{mode:'guided'})).json();assert.equal((await t.browser('/runs/'+id+'/step',{step:'review'})).status,503);assert.equal((await (await t.browser('/runs/'+id)).json()).calls.length,0);
 t.env.AI_GATEWAY_MCP={fetch:async()=>Response.json({jsonrpc:'2.0',id:1,error:{code:401,message:'Unauthorized'}},{status:401})};
 const result=await (await t.browser('/runs/'+id+'/step',{step:'review'})).json();assert.equal(result.step,0);assert.equal(result.summary,null);assert.equal(result.payments.length,0);assert.equal(t.prompts.length,0);
}finally{t.sqlite.close();}});
test('live model proposals are used honestly and cannot select trusted arguments or identity',async()=>{const t=setup();try{
 const {id}=await (await t.browser('/runs',{mode:'agent'})).json();await t.browser('/runs/'+id+'/step',{step:'review'});
 t.env.proposed='read_invoice';let result=await (await t.browser('/runs/'+id+'/step',{step:'payment'})).json();assert.equal(result.step,1);assert.equal(result.payments.length,0);assert.equal(result.calls.length,2);assert.match(result.notice,/No payment tool was invoked/);
 t.env.proposed='pay_invoice';result=await (await t.browser('/runs/'+id+'/step',{step:'payment'})).json();assert.equal(result.payments.length,1);assert.equal(result.calls.find(c=>c.side==='gateway'&&c.tool==='pay_invoice').decision,'deny');
 assert.equal(JSON.stringify(t.prompts).includes('Context:'),false);assert.equal(JSON.stringify(t.prompts).includes('test-key'),false);
}finally{t.sqlite.close();}});
test('an unavailable model never becomes a canned invoice summary',async()=>{const t=setup();try{
 t.env.AI.run=async()=>{throw new Error('quota');};const {id}=await (await t.browser('/runs',{mode:'guided'})).json();const result=await (await t.browser('/runs/'+id+'/step',{step:'review'})).json();assert.equal(result.summary,null);assert.equal(result.step,1);assert.match(result.notice,/no example summary was substituted/);
}finally{t.sqlite.close();}});
test('only the exact policy rejection with no delivery can be classified as Gateway denial',()=>{
 const call={side:'gateway',tool:'pay_invoice',status:'closed',http:200,received:0,committed:0,rpc:{error:{code:0,message:'mcpproxy tools/call: blocked by access policy: r5r5-invoice-demo/pay_invoice (r5r5 demo - Deny invoice payment)'}}};
 assert.equal(invoiceDecision(call).decision,'deny');for(const change of [{side:'direct'},{received:1},{committed:1},{http:403},{status:'open'},{rpc:{error:{code:0,message:'Permission denied'}}},{rpc:{result:{content:[{type:'text',text:call.rpc.error.message}]}}}])assert.equal(invoiceDecision({...call,...change}).decision,'unknown');
});
test('the page and browser APIs require login, while discovery has separate upstream authentication',async()=>{const t=setup();try{
 for(const path of ['/gateway/invoice/','/gateway/invoice/frame.js','/api/gateway/invoice/config','/api/gateway/invoice/runs'])assert.equal((await worker.fetch(new Request('https://demo.test'+path),{})).status,path.startsWith('/api/')?401:303);
 assert.equal((await worker.fetch(new Request('https://demo.test/api/gateway/invoice/mcp',{method:'POST'}),t.env)).status,401);
 const list=await (await t.service({jsonrpc:'2.0',id:1,method:'tools/list'})).json();assert.deepEqual(list.result.tools.map(x=>x.name),['read_invoice','pay_invoice']);assert.equal(INVOICE.amount,480000);
}finally{t.sqlite.close();}});

test('if Gateway permits payment, both real demo ledgers change instead of the app faking protection',async()=>{const t=setup();try{
 t.env.AI_GATEWAY_MCP.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);if(body.method==='tools/list')return Response.json({jsonrpc:'2.0',id:body.id,result:{tools:[{name:'r5r5-invoice-demo__read_invoice'}]}});if(body.method==='tools/call')body.params.name=body.params.name.replace('r5r5-invoice-demo__','');return t.service(body);};
 const {id}=await (await t.browser('/runs',{mode:'guided'})).json();await t.browser('/runs/'+id+'/step',{step:'review'});const result=await (await t.browser('/runs/'+id+'/step',{step:'payment'})).json();
 assert.equal(result.payments.length,2);assert.ok(result.states.every(s=>s.balance===520000));assert.equal(result.calls.find(c=>c.side==='gateway'&&c.tool==='pay_invoice').decision,'allow');
}finally{t.sqlite.close();}});
