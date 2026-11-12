import {initPrompts,promptText,savePrompt,getPrompt,listPrompts,clearExpiredPrompts} from './demo-prompts.js';
import {promptDefaults,modelInstructions} from '../../public/gateway/prompt-defaults.js';
import {Fault,json,readJson,sameOrigin,safeEqual} from './runtime/util.js';
import {mcpRpc} from './mcp-client.js';
import {MODEL} from '../constants.js';
const BASE='/api/gateway/database', MCP_URL='http://trendai-gateway-gateway.trendai-gateway.svc.cluster.local:8081/';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const VOLUME='rebel-ledger-prod-sim';
const tools=['get_status','delete_volume'];
// Observed on the live MCP proxy and checked against the matching Vision One
// Access event on 2026-11-12. Generic 403s or missing receipts are not policy denials.
const VERIFIED_DENIAL='mcpproxy tools/call: blocked by access policy: r5r5-database-demo/delete_volume (r5r5 demo - Deny database deletion)';
export function databaseDecision(call){
 const denied=call.side==='gateway'&&call.tool==='delete_volume'&&call.status==='closed'&&call.http===200&&call.rpc?.error?.code===0&&call.rpc.error.message===VERIFIED_DENIAL&&!call.received&&!call.committed;
 const executed=call.status==='closed'&&call.received&&call.rpc?.result&&!call.rpc.result.isError;
 return {decision:denied?'deny':executed?'allow':'unknown',decision_source:denied?'gateway':executed?'business_service':'unknown',tool_received:call.received?'yes':call.status==='closed'?'no':'unknown',action_committed:call.committed?'yes':call.status==='closed'?'no':'unknown',evidence_status:denied||executed?'complete':'partial'};
}
const schema={type:'object',properties:{run_id:{type:'string'},call_id:{type:'string'},proof:{type:'string'},scenario_text:{type:'string',maxLength:4000}},required:['run_id','call_id','proof'],additionalProperties:false};
const initialized=new WeakMap();
async function init(db){if(!initialized.has(db))initialized.set(db,(async()=>{
 for(const sql of [
  'CREATE TABLE IF NOT EXISTS database_demo_runs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,mode TEXT NOT NULL,step INTEGER NOT NULL DEFAULT 0,notice TEXT,created INTEGER NOT NULL,expires INTEGER NOT NULL)',
  "CREATE TABLE IF NOT EXISTS database_demo_state(run TEXT NOT NULL,side TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'Online',PRIMARY KEY(run,side))",
  "CREATE TABLE IF NOT EXISTS database_demo_calls(id TEXT PRIMARY KEY,run TEXT NOT NULL,side TEXT NOT NULL,step TEXT NOT NULL,tool TEXT NOT NULL,proof TEXT NOT NULL,status TEXT NOT NULL,received INTEGER NOT NULL DEFAULT 0,committed INTEGER NOT NULL DEFAULT 0,observed_state TEXT,http INTEGER,rpc TEXT,request_id TEXT,created INTEGER NOT NULL)"])
 await db.prepare(sql).run();
})().catch(e=>{initialized.delete(db);throw e;}));await initialized.get(db);await initPrompts(db);}
async function owner(request){const cookie=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-trendai_session='));if(!cookie)throw new Fault(401,'Sign in to run this demo.');return hash(cookie);}
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function upstreamAuth(request,env){const header=request.headers.get('Authorization')??'';const key=header.startsWith('Bearer ')?header.slice(7):null;if(!key||key.length>2048||!safeEqual(await hash(key),env.REDACTION_UPSTREAM_KEY_SHA256??''))throw new Fault(401,'Invalid upstream credential.');}
const rpc=(id,result,error)=>json({jsonrpc:'2.0',id:id??null,...(error?{error}:{result})});
async function invoke(db,name,args){
 if(!tools.includes(name)||!args||Object.keys(args).some(k=>!['run_id','call_id','proof','scenario_text'].includes(k))||![args.run_id,args.call_id,args.proof].every(x=>typeof x==='string'&&UUID.test(x)))throw new Fault(400,'Invalid delegated call.');
 const expectedText=await getPrompt(db,'database',args.call_id);if(expectedText!==null&&args.scenario_text!==expectedText)throw new Fault(400,'The scenario text differs from the delegated call.');
 const call=await db.prepare("UPDATE database_demo_calls SET received=1 WHERE id=? AND run=? AND proof=? AND tool=? AND status='open' AND received=0 AND run IN (SELECT id FROM database_demo_runs WHERE expires>?) RETURNING id,run,side,tool")
 .bind(args.call_id,args.run_id,args.proof,name,Date.now()).first();
 if(!call)throw new Fault(409,'The delegated call expired, changed, or was already received.');
 if(name==='delete_volume')await db.batch([
  db.prepare("UPDATE database_demo_state SET state='Offline' WHERE run=? AND side=? AND EXISTS(SELECT 1 FROM database_demo_calls WHERE id=? AND status='open')").bind(call.run,call.side,call.id),
  db.prepare("UPDATE database_demo_calls SET committed=1 WHERE id=? AND status='open'").bind(call.id)
 ]);
 const state=await db.prepare('SELECT state FROM database_demo_state WHERE run=? AND side=?').bind(call.run,call.side).first();
 await db.prepare("UPDATE database_demo_calls SET observed_state=? WHERE id=?").bind(state.state,call.id).run();
 return {volume_id:VOLUME,state:state.state,environment:'synthetic sandbox',operation:name};
}
async function mcp(request,env,db){await upstreamAuth(request,env);await init(db);
 if(request.method==='GET')return new Response(null,{status:405,headers:{Allow:'POST'}});
 if(request.method!=='POST')throw new Fault(405,'Use POST.');
 const body=await readJson(request,20000);
 if(!body||body.jsonrpc!=='2.0')throw new Fault(400,'Invalid JSON-RPC request.');
 if(body.method==='initialize')return rpc(body.id,{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'r5r5-database-demo',version:'1.0.0'}});
 if(body.method==='notifications/initialized')return new Response(null,{status:202});
 if(body.method==='tools/list')return rpc(body.id,{tools:tools.map(name=>({name,description:name==='get_status'?'Read the synthetic Rebel ledger database status.':'Delete only this run’s synthetic database volume. Never accesses real infrastructure.',inputSchema:schema}))});
 if(body.method!=='tools/call')return rpc(body.id,null,{code:-32601,message:'Method not found'});
 try{const value=await invoke(db,body.params?.name,body.params?.arguments);return rpc(body.id,{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false});}
 catch(error){if(!(error instanceof Fault))throw error;return rpc(body.id,{content:[{type:'text',text:error.message}],isError:true});}
}
async function getRun(db,id,who){if(!UUID.test(id))throw new Fault(404,'Run not found.');const run=await db.prepare('SELECT * FROM database_demo_runs WHERE id=? AND owner=? AND expires>?').bind(id,who,Date.now()).first();if(!run)throw new Fault(404,'Run expired or is unavailable.');return run;}
async function snapshot(db,run){const states=await db.prepare('SELECT side,state FROM database_demo_state WHERE run=?').bind(run.id).all();
 const calls=await db.prepare('SELECT id AS client_call_id,side,step,tool,status,received,committed,observed_state,http,rpc,request_id,created FROM database_demo_calls WHERE run=? ORDER BY created,id').bind(run.id).all();
 return {submitted_prompts:await listPrompts(db,'database',run.id),id:run.id,mode:run.mode,gateway_mode:'live',agent_mode:run.mode==='agent'?'live':'replay',step:run.step,notice:run.notice,volume:VOLUME,states:states.results,calls:calls.results.map(c=>{const call={...c,rpc:c.rpc?JSON.parse(c.rpc):null};return {...call,...databaseDecision(call)};})};}
async function gatewayCall(env,tool,args){
 const session={};const binding=env.AI_GATEWAY_MCP,key=env.GATEWAY_DEMO_VIRTUAL_KEY;
 const init=await mcpRpc(binding,MCP_URL,key,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'r5r5-database-demo',version:'1.0.0'}},1,session);
 if(!init.message?.result?.protocolVersion)return {...init,message:init.message?.error?init.message:{error:{message:`Gateway MCP initialization failed (HTTP ${init.status}).`}}};session.version=init.message.result.protocolVersion;
 await mcpRpc(binding,MCP_URL,key,'notifications/initialized',undefined,undefined,session);
 const listed=await mcpRpc(binding,MCP_URL,key,'tools/list',{},2,session);
 const read=listed.message?.result?.tools?.filter(x=>x.name.includes('r5r5-database-demo')&&x.name.endsWith('get_status'));
 if(read?.length!==1)return {...listed,message:listed.message?.error?listed.message:{error:{message:`The demo MCP tools are not available through Gateway (HTTP ${listed.status}). Available names: ${(listed.message?.result?.tools??[]).map(x=>String(x.name).slice(0,150)).slice(0,10).join(', ')||'none'}`}}};
 const name=read[0].name.slice(0,-'get_status'.length)+tool;
 return mcpRpc(binding,MCP_URL,key,'tools/call',{name,arguments:args},args.call_id,session);
}
async function dispatch(env,db,run,side,step,tool,text){const id=crypto.randomUUID(),proof=crypto.randomUUID(),now=Date.now();
 await db.prepare("INSERT INTO database_demo_calls(id,run,side,step,tool,proof,status,created) VALUES(?,?,?,?,?,?,'open',?)").bind(id,run.id,side,step,tool,proof,now).run();
 await savePrompt(db,'database',run.id,step,id,text,'mcp');
 let response;
 try{
  const args={run_id:run.id,call_id:id,proof,scenario_text:text};
  if(side==='direct'){const value=await invoke(db,tool,args);response={status:200,requestId:null,message:{result:{structuredContent:value,isError:false}}};}
  else response=await gatewayCall(env,tool,args);
 }catch{response={status:0,requestId:null,message:{error:{message:'The MCP request did not complete. Check connectivity and Gateway configuration.'}}};}
 // Closing the single-use context fences late deliveries and retries before observing state.
 const safeMessage=response.message?.error?{error:{code:response.message.error.code,message:String(response.message.error.message??'MCP error').slice(0,700)}}:response.message?.result?{result:response.message.result}:null;
 await db.prepare("UPDATE database_demo_calls SET status='closed',http=?,rpc=?,request_id=? WHERE id=?").bind(response.status,JSON.stringify(safeMessage).replaceAll(proof,'[context]').replaceAll(env.GATEWAY_DEMO_VIRTUAL_KEY||'__no_key__','[credential]'),response.requestId,id).run();
}
async function proposedTool(env,goal){if(!env.AI)throw new Fault(503,'Workers AI is not configured.');

 let timer;let answer;try{answer=await Promise.race([env.AI.run(MODEL,{messages:[{role:'system',content:modelInstructions.database},{role:'user',content:goal}],max_tokens:80,temperature:0}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Fault(504,'The live model timed out. No tool call was substituted.')),25000);})]);}finally{clearTimeout(timer);}
 let parsed;const choice=answer?.choices?.length===1?answer.choices[0]:null;const output=typeof answer?.response==='string'?answer.response:choice?.finish_reason==='stop'&&choice?.message?.role==='assistant'?choice.message.content:null;const text=typeof output==='string'?output.trim():'';const preview=text||'The model did not return a supported text response.';try{parsed=JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{return {tool:null,preview:preview.slice(0,400)};}
 return {tool:tools.includes(parsed?.tool)?parsed.tool:null,preview:preview.slice(0,400)};
}
export async function databaseApi(request,env,service=false){const db=env.LR_DB_PROTECTED,path=new URL(request.url).pathname;
 try{
  if(!db)throw new Fault(503,'Demo storage is not configured.');
  if(service)return await mcp(request,env,db);
  const who=await owner(request);await init(db);
  if(path===BASE+'/config'&&request.method==='GET')return json({liveConfigured:Boolean(env.AI_GATEWAY_MCP&&env.GATEWAY_DEMO_VIRTUAL_KEY),modelConfigured:Boolean(env.AI)});
  if(path===BASE+'/runs'&&request.method==='POST'){
   sameOrigin(request);await clearExpiredPrompts(db,'database');const body=await readJson(request,256);if(!['guided','agent'].includes(body?.mode)||Object.keys(body).some(x=>x!=='mode'))throw new Fault(400,'Choose Guided or Live Agent.');
   const id=crypto.randomUUID(),now=Date.now();await db.batch([
    db.prepare('DELETE FROM database_demo_calls WHERE run IN (SELECT id FROM database_demo_runs WHERE expires<=?)').bind(now),
    db.prepare('DELETE FROM database_demo_state WHERE run IN (SELECT id FROM database_demo_runs WHERE expires<=?)').bind(now),
    db.prepare('DELETE FROM database_demo_runs WHERE expires<=?').bind(now),
    db.prepare('INSERT INTO database_demo_runs(id,owner,mode,created,expires) VALUES(?,?,?,?,?)').bind(id,who,body.mode,now,now+1800000),
    ...['direct','gateway'].map(side=>db.prepare("INSERT INTO database_demo_state(run,side,state) VALUES(?,?,'Online')").bind(id,side))
   ]);return json(await snapshot(db,{id,mode:body.mode,step:0,notice:null}),201);
  }
  const match=new RegExp('^'+BASE+'/runs/([a-f0-9-]+)(/step)?$').exec(path);if(!match)throw new Fault(404,'Unknown demo route.');
  const run=await getRun(db,match[1],who);
  if(request.method==='GET'&&!match[2])return json(await snapshot(db,run));
  if(request.method!=='POST'||!match[2])throw new Fault(405,'Use the run step action.');sameOrigin(request);
  const body=await readJson(request,20000),step=['status','delete','verify'][run.step];
  if(!step||body?.step!==step||Object.keys(body).some(x=>!['step','prompt'].includes(x)))throw new Fault(409,'Run the steps in order.');
  const text=promptText(body.prompt,promptDefaults.database[step]);
  if(!env.AI_GATEWAY_MCP||!env.GATEWAY_DEMO_VIRTUAL_KEY)throw new Fault(503,'Private MCP connectivity is not configured. No simulated Gateway decision was substituted.');
  const locked=await db.prepare('UPDATE database_demo_runs SET step=-1 WHERE id=? AND step=?').bind(run.id,run.step).run();if(!locked.meta.changes)throw new Fault(409,'This step is already in progress.');
  try{
   if(run.mode==='agent'&&step!=='verify')await savePrompt(db,'database',run.id,step,crypto.randomUUID(),text,'model');
   const proposal=run.mode==='agent'&&step!=='verify'?await proposedTool(env,text):null;
   const tool=proposal?proposal.tool:(step==='delete'?'delete_volume':'get_status');
   if(!tool || (run.mode==='agent' && tool !== (step==='delete'?'delete_volume':'get_status'))){await db.prepare('UPDATE database_demo_runs SET step=?,notice=? WHERE id=?').bind(run.step,tool ? `Workers AI proposed ${tool} instead of the expected tool. No tool call was substituted.` : 'The live model did not propose an executable tool. No tool was substituted.'+(proposal?.preview?' Model output: '+proposal.preview:''),run.id).run();return json(await snapshot(db,await getRun(db,run.id,who)));}
   for(const side of ['direct','gateway'])await dispatch(env,db,run,side,step,tool,text);
   const control=step==='status'?await db.prepare("SELECT received,rpc FROM database_demo_calls WHERE run=? AND side='gateway' AND step='status' ORDER BY created DESC LIMIT 1").bind(run.id).first():null;
   const controlFailed=step==='status' && (!control?.received || !JSON.parse(control.rpc)?.result || JSON.parse(control.rpc)?.result?.isError);
   await db.prepare('UPDATE database_demo_runs SET step=?,notice=? WHERE id=?').bind(controlFailed?0:run.step+1,controlFailed?'Gateway control did not reach MCP successfully. Resolve connectivity before attempting deletion.':run.mode==='agent'&&step!=='verify'?`Workers AI proposed ${tool}.`:step==='verify'?'Verification · prescribed status read.':'Guided demo · prescribed tool calls.',run.id).run();
  }catch(error){await db.prepare('UPDATE database_demo_runs SET step=? WHERE id=?').bind(run.step,run.id).run();throw error;}
  return json(await snapshot(db,await getRun(db,run.id,who)));
 }catch(error){return error instanceof Fault?json({error:error.message},error.status):json({error:'This demo could not complete. No Gateway result was assumed.'},503);}
}
