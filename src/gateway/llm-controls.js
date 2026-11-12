import {Fault,json,readJson,sameOrigin,safeEqual} from './runtime/util.js';
import {promptText} from './demo-prompts.js';
import {MODEL} from '../constants.js';
import {controlCases,controlModelIDs} from '../../public/gateway/control-config.js';
const BASE='/api/gateway/controls',GATEWAY='http://trendai-gateway-gateway.trendai-gateway.svc.cluster.local:8080/v1/chat/completions',UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const initialized=new WeakMap();
async function init(db){if(!initialized.has(db))initialized.set(db,(async()=>{for(const sql of [
 'CREATE TABLE IF NOT EXISTS control_demo_runs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,step INTEGER NOT NULL DEFAULT 0,prompt TEXT,created INTEGER NOT NULL,expires INTEGER NOT NULL,notice TEXT)',
 'CREATE TABLE IF NOT EXISTS control_demo_calls(id TEXT PRIMARY KEY,run TEXT NOT NULL,phase TEXT NOT NULL,side TEXT NOT NULL,principal TEXT NOT NULL,model TEXT NOT NULL,prompt TEXT NOT NULL,proof TEXT NOT NULL,status TEXT NOT NULL,http INTEGER,reply TEXT,error TEXT,request_id TEXT,created INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS control_demo_receipts(call TEXT PRIMARY KEY,model TEXT NOT NULL,state TEXT NOT NULL,received INTEGER NOT NULL,invoked INTEGER NOT NULL DEFAULT 0,http INTEGER,reply TEXT,completed INTEGER)'
])await db.prepare(sql).run();})().catch(e=>{initialized.delete(db);throw e;}));await initialized.get(db);}
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function owner(request){const value=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-trendai_session='));if(!value)throw new Fault(401,'Sign in to run this demo.');return hash(value);}
async function upstreamAuth(request,env){const auth=request.headers.get('Authorization')??'';if(!auth.startsWith('Bearer ')||auth.length>2048||!safeEqual(await hash(auth.slice(7)),env.REDACTION_UPSTREAM_KEY_SHA256??''))throw new Fault(401,'Invalid upstream credential.');}
const completion=reply=>json({id:'chatcmpl-'+crypto.randomUUID(),object:'chat.completion',created:Math.floor(Date.now()/1000),model:MODEL,choices:[{index:0,message:{role:'assistant',content:reply},finish_reason:'stop'}]});
async function receive(env,db,args){
 if(![args.run,args.call,args.proof].every(x=>typeof x==='string'&&UUID.test(x)))throw new Fault(400,'Invalid demo context.');
 const call=await db.prepare("SELECT c.id,c.run,c.model,c.prompt,r.kind FROM control_demo_calls c JOIN control_demo_runs r ON r.id=c.run WHERE c.id=? AND c.run=? AND c.proof=? AND c.status='running' AND r.expires>?").bind(args.call,args.run,args.proof,Date.now()).first();
 if(!call)throw new Fault(409,'This delegated call is closed, changed or expired.');
 if(args.prompt!==call.prompt||args.system!==controlCases[call.kind].system||args.alias!==call.model)throw new Fault(400,'The model, prompt or instruction differs from the delegated call.');
 const claimed=await db.prepare("INSERT OR IGNORE INTO control_demo_receipts(call,model,state,received) SELECT ?,?,'received',? WHERE EXISTS(SELECT 1 FROM control_demo_calls WHERE id=? AND status='running') RETURNING call").bind(call.id,call.model,Date.now(),call.id).first();
 if(!claimed){const receipt=await db.prepare('SELECT * FROM control_demo_receipts WHERE call=?').bind(call.id).first();if(receipt?.state==='completed')return completion(receipt.reply);throw new Fault(409,'The inference is already received or did not complete.');}
 let timer;
 try{
  await db.prepare("UPDATE control_demo_receipts SET invoked=1,state='invoking' WHERE call=?").bind(call.id).run();
  const result=await Promise.race([env.AI.run(MODEL,{messages:[{role:'system',content:args.system},{role:'user',content:call.prompt}],max_tokens:300,temperature:0}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),25000);})]);
  const choice=result?.choices?.length===1?result.choices[0]:null,reply=typeof result?.response==='string'?result.response:choice?.finish_reason==='stop'?choice?.message?.content:null;
  if(typeof reply!=='string'||!reply.trim()||reply.length>8000)throw new Error('Invalid inference');
  await db.prepare("UPDATE control_demo_receipts SET state='completed',http=200,reply=?,completed=? WHERE call=?").bind(reply,Date.now(),call.id).run();return completion(reply);
 }catch{await db.prepare("UPDATE control_demo_receipts SET state='error',http=503,completed=? WHERE call=?").bind(Date.now(),call.id).run();return json({error:{code:'inference_unavailable',message:'Workers AI did not complete. No example answer was substituted.'}},503);}
 finally{clearTimeout(timer);}
}
async function modelApi(request,env,db,path){
 await upstreamAuth(request,env);
 if(path===BASE+'/upstream/v1/models'&&request.method==='GET')return json({object:'list',data:Object.keys(controlModelIDs).map(id=>({id,object:'model',owned_by:'r5r5-controlled-demo'}))});
 if(path!==BASE+'/upstream/v1/chat/completions'||request.method!=='POST')throw new Fault(405,'Use the model API method.');
 const body=await readJson(request,24000),messages=body?.messages,resource=controlModelIDs[body?.model]||Object.values(controlModelIDs).find(r=>r.alias===body?.model);
 if(!resource||body.stream===true||!Array.isArray(messages)||messages.length!==3||messages[0]?.role!=='system'||messages[1]?.role!=='system'||messages[2]?.role!=='user')throw new Fault(400,'Invalid bounded model request.');
 const context=/^Control run: ([a-f0-9-]{36})\nCall: ([a-f0-9-]{36})\nContext: ([a-f0-9-]{36})$/.exec(messages[0].content);
 if(!context)throw new Fault(401,'Invalid delegated context.');
 await init(db);return receive(env,db,{run:context[1],call:context[2],proof:context[3],alias:resource.alias,prompt:messages[2].content,system:messages[1].content});
}
// Strict product response codes only. Extend with a new signature only after live verification.
export function controlObservation(call,receipt){
 const received=Boolean(receipt),complete=call.status==='closed',error=call.error;
 const policyDeny=call.side==='gateway'&&complete&&call.http===400&&error?.code==='policy_violation'&&error?.type==='invalid_request_error'&&error?.message?.startsWith('blocked by content policy: ')&&typeof call.request_id==='string'&&UUID.test(call.request_id);
 const accessDeny=call.side==='gateway'&&complete&&call.http===403&&error?.code==='insufficient_permissions'&&error?.type==='invalid_request_error'&&error?.message?.startsWith('blocked by access policy: ')&&typeof call.request_id==='string'&&UUID.test(call.request_id);
 const allowed=complete&&call.http===200&&receipt?.state==='completed'&&receipt.http===200&&receipt.reply===call.reply;
 const denied=policyDeny||accessDeny;
 return {decision:denied?'deny':allowed?'allow':'unknown',decision_source:denied?'gateway':allowed?'model':'unknown',denial_type:policyDeny?'guardrail':accessDeny?'access':null,upstream_received:received?'yes':complete?'no':'unknown',model_invoked:receipt?.invoked?'yes':complete&&!received?'no':'unknown',evidence_status:allowed||denied&&!received?'complete':'partial',blocked_before_model:Boolean(denied&&!received),receipt:receipt??null};
}
async function snapshot(db,run){
 const rows=(await db.prepare('SELECT id AS client_call_id,phase,side,principal,model,prompt,status,http,reply,error,request_id,created FROM control_demo_calls WHERE run=? ORDER BY created,id').bind(run.id).all()).results;
 const receipts=(await db.prepare('SELECT p.* FROM control_demo_receipts p JOIN control_demo_calls c ON c.id=p.call WHERE c.run=?').bind(run.id).all()).results;
 return {id:run.id,kind:run.kind,step:run.step,notice:run.notice,prompt:run.prompt??null,gateway_mode:'live',model_mode:'live',app_identity_scope:'application/service account',system_instruction:controlCases[run.kind].system,calls:rows.map(c=>{const call={...c,error:c.error?JSON.parse(c.error):null};return {...call,...controlObservation(call,receipts.find(r=>r.call===c.client_call_id))};})};
}
async function getRun(db,id,kind,who){if(!UUID.test(id))throw new Fault(404,'Run not found.');const run=await db.prepare('SELECT * FROM control_demo_runs WHERE id=? AND kind=? AND owner=? AND expires>?').bind(id,kind,who,Date.now()).first();if(!run)throw new Fault(404,'Run expired or is unavailable.');return run;}
async function dispatch(env,db,run,phase,side,text){
 const config=controlCases[run.kind],id=crypto.randomUUID(),proof=crypto.randomUUID(),alias=config.models[phase],principal=config.principals[phase];
 const key=phase==='authorized'?env.GATEWAY_OPERATIONS_KEY:env.GATEWAY_HELPDESK_KEY;
 await db.prepare("INSERT INTO control_demo_calls(id,run,phase,side,principal,model,prompt,proof,status,created) VALUES(?,?,?,?,?,?,?,?,'running',?)").bind(id,run.id,phase,side,principal,alias,text,proof,Date.now()).run();
 let http=0,reply=null,error=null,requestId=null;
 try{
  const response=side==='direct'?await receive(env,db,{run:run.id,call:id,proof,alias,prompt:text,system:config.system}):await env.AI_GATEWAY.fetch(GATEWAY,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:alias,stream:false,messages:[{role:'system',content:`Control run: ${run.id}\nCall: ${id}\nContext: ${proof}`},{role:'system',content:config.system},{role:'user',content:text}]}),signal:AbortSignal.timeout(60000),redirect:'manual'});
  http=response.status;requestId=side==='gateway'?response.headers.get('x-request-id'):null;const body=await response.json().catch(()=>null),content=body?.choices?.[0]?.message?.content;
  if(response.ok&&typeof content==='string'&&content.length<=8000)reply=content;
  if(body?.error)error={code:typeof body.error.code==='string'?body.error.code.slice(0,100):null,type:typeof body.error.type==='string'?body.error.type.slice(0,100):null,message:String(body.error.message??'Upstream error').replaceAll(proof,'[context]').replaceAll(key||'__no_key__','[credential]').slice(0,1000)};
 }catch{error={code:'transport_error',message:'The request did not complete. No Gateway denial was assumed.'};}
 await db.prepare("UPDATE control_demo_calls SET status='closed',http=?,reply=?,error=?,request_id=? WHERE id=?").bind(http,reply,JSON.stringify(error),requestId,id).run();
}
export async function controlsApi(request,env,service=false){
 try{
  const db=env.LR_DB_PROTECTED,path=new URL(request.url).pathname;if(!db||!env.AI)throw new Fault(503,'Demo storage and Workers AI are required.');
  if(service)return await modelApi(request,env,db,path);
  const match=new RegExp('^'+BASE+'/(email|models)/(config|runs)(?:/([a-f0-9-]+)(/step)?)?$').exec(path);if(!match)throw new Fault(404,'Unknown controls demo route.');
  const kind=match[1],config=controlCases[kind],who=await owner(request);await init(db);
  if(match[2]==='config'&&!match[3]&&request.method==='GET')return json({configured:Boolean(env.AI_GATEWAY&&env.GATEWAY_HELPDESK_KEY&&(kind==='email'||env.GATEWAY_OPERATIONS_KEY)),kind,steps:config.steps,models:config.models,principals:config.principals});
  if(match[2]!=='runs')throw new Fault(405,'Use the demo API method.');
  if(!match[3]&&request.method==='POST'){
   sameOrigin(request);const body=await readJson(request,20000);if(!body||Object.keys(body).some(k=>kind==='models'?k!=='prompt':true))throw new Fault(400,'Only demo prompt text is editable.');const prompt=kind==='models'?promptText(body.prompt,config.prompts.standard):null,id=crypto.randomUUID(),now=Date.now();
   await db.batch([db.prepare('DELETE FROM control_demo_receipts WHERE call IN(SELECT c.id FROM control_demo_calls c JOIN control_demo_runs r ON r.id=c.run WHERE r.expires<=?)').bind(now),db.prepare('DELETE FROM control_demo_calls WHERE run IN(SELECT id FROM control_demo_runs WHERE expires<=?)').bind(now),db.prepare('DELETE FROM control_demo_runs WHERE expires<=?').bind(now),db.prepare('INSERT INTO control_demo_runs(id,owner,kind,prompt,created,expires) VALUES(?,?,?,?,?,?)').bind(id,who,kind,prompt,now,now+1800000)]);return json(await snapshot(db,{id,kind,prompt,step:0,notice:null}),201);
  }
  if(!match[3])throw new Fault(405,'Create a comparison with POST.');const run=await getRun(db,match[3],kind,who);
  if(request.method==='GET'&&!match[4])return json(await snapshot(db,run));
  if(request.method!=='POST'||!match[4])throw new Fault(405,'Use the run step action.');sameOrigin(request);
  const body=await readJson(request,20000),phase=config.steps[run.step];if(!phase||body?.step!==phase||Object.keys(body).some(k=>!['step','prompt'].includes(k)))throw new Fault(409,'Run the steps in order.');
  const text=kind==='models'?run.prompt:promptText(body.prompt,config.prompts[phase]);if(kind==='models'&&body.prompt!==undefined&&body.prompt!==text)throw new Fault(409,'Editing the prompt requires a new comparison.');
  if(!env.AI_GATEWAY||!env.GATEWAY_HELPDESK_KEY||phase==='authorized'&&!env.GATEWAY_OPERATIONS_KEY)throw new Fault(503,'The required live demo identity is not configured. No simulated protection was substituted.');
  const lock=await db.prepare('UPDATE control_demo_runs SET step=-1 WHERE id=? AND step=?').bind(run.id,run.step).run();if(!lock.meta.changes)throw new Fault(409,'This step is already in progress.');
  try{
   for(const side of ['direct','gateway'])await dispatch(env,db,run,phase,side,text);
   const data=await snapshot(db,run),latest=['direct','gateway'].map(side=>data.calls.filter(c=>c.phase===phase&&c.side===side).at(-1));const controlOK=latest.every(c=>c?.decision==='allow');
   await db.prepare('UPDATE control_demo_runs SET step=?,notice=? WHERE id=?').bind(run.step===0&&!controlOK?0:run.step+1,run.step===0&&!controlOK?'The normal control is incomplete. Resolve the connection before continuing.':'Step completed. Review Gateway decisions and model receipts below.',run.id).run();
  }catch(error){await db.prepare('UPDATE control_demo_runs SET step=? WHERE id=?').bind(run.step,run.id).run();throw error;}
  return json(await snapshot(db,await getRun(db,run.id,kind,who)));
 }catch(error){return error instanceof Fault?json({error:error.message},error.status):json({error:'The comparison did not complete. No Gateway protection was assumed.'},503);}
}
