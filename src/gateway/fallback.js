import { Fault, json, readJson, sameOrigin, safeEqual } from './runtime/util.js';
import { MODEL } from '../constants.js';

const BASE='/api/gateway/fallback';
const GATEWAY='http://trendai-gateway-gateway.trendai-gateway.svc.cluster.local:8080/v1/chat/completions';
export const FALLBACK_MODEL='r5r5-continuity';
export const FALLBACK_PROMPT='Give a short status update: R2-D2 repaired the Millennium Falcon coffee machine. The ship is ready for departure at 18:00.';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const initialized=new WeakMap();
async function init(db){
 if(!initialized.has(db))initialized.set(db,(async()=>{
  for(const sql of [
   'CREATE TABLE IF NOT EXISTS fallback_demo_runs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,step INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,expires INTEGER NOT NULL,notice TEXT)',
   'CREATE TABLE IF NOT EXISTS fallback_demo_calls(id TEXT PRIMARY KEY,run TEXT NOT NULL,side TEXT NOT NULL,phase TEXT NOT NULL,proof TEXT NOT NULL,status TEXT NOT NULL,http INTEGER,reply TEXT,request_id TEXT,created INTEGER NOT NULL)',
   'CREATE TABLE IF NOT EXISTS fallback_demo_receipts(call TEXT NOT NULL,provider TEXT NOT NULL,attempts INTEGER NOT NULL,state TEXT NOT NULL,http INTEGER,reply TEXT,received INTEGER NOT NULL,completed INTEGER,PRIMARY KEY(call,provider))'
  ])await db.prepare(sql).run();
 })().catch(e=>{initialized.delete(db);throw e;}));
 await initialized.get(db);
}
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function owner(request){const cookie=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-trendai_session='));if(!cookie)throw new Fault(401,'Sign in to run this demo.');return hash(cookie);}
async function upstreamAuth(request,env){const header=request.headers.get('Authorization')??'';if(!header.startsWith('Bearer ')||header.length>2048||!safeEqual(await hash(header.slice(7)),env.REDACTION_UPSTREAM_KEY_SHA256??''))throw new Fault(401,'Invalid upstream credential.');}
const completion=reply=>json({id:'chatcmpl-'+crypto.randomUUID(),object:'chat.completion',created:Math.floor(Date.now()/1000),model:MODEL,choices:[{index:0,message:{role:'assistant',content:reply},finish_reason:'stop'}]});
const unavailable=()=>json({error:{type:'server_error',code:'service_unavailable',message:'Controlled primary endpoint failure for this demo request.'}},503);

async function receive(env,db,provider,args){
 if(!['primary','backup'].includes(provider)||![args.run,args.call,args.proof].every(x=>typeof x==='string'&&UUID.test(x)))throw new Fault(400,'Invalid demo context.');
 const now=Date.now();
 const call=await db.prepare("SELECT c.id,c.side,c.phase FROM fallback_demo_calls c JOIN fallback_demo_runs r ON r.id=c.run WHERE c.id=? AND c.run=? AND c.proof=? AND c.status='running' AND r.expires>?").bind(args.call,args.run,args.proof,now).first();
 if(!call||call.side==='direct'&&provider!=='primary')throw new Fault(409,'This call is expired or not delegated to this endpoint.');
 // A receipt is claimed atomically only while this exact run/call is active.
 // Retries are counted but may not invoke Workers AI a second time.
 const receipt=await db.prepare(`INSERT INTO fallback_demo_receipts(call,provider,attempts,state,received)
 SELECT ?,?,1,'invoking',? WHERE EXISTS(SELECT 1 FROM fallback_demo_calls c JOIN fallback_demo_runs r ON r.id=c.run WHERE c.id=? AND c.proof=? AND c.status='running' AND r.expires>?)
 ON CONFLICT(call,provider) DO UPDATE SET attempts=attempts+1
 WHERE attempts<8 AND EXISTS(SELECT 1 FROM fallback_demo_calls c JOIN fallback_demo_runs r ON r.id=c.run WHERE c.id=? AND c.proof=? AND c.status='running' AND r.expires>?)
 RETURNING attempts,state,http,reply`).bind(call.id,provider,now,call.id,args.proof,now,call.id,args.proof,now).first();
 if(!receipt)throw new Fault(409,'This call is closed or its retry limit was reached.');
 if(provider==='primary'&&call.phase==='outage'){
  await db.prepare("UPDATE fallback_demo_receipts SET state='controlled_error',http=503,completed=? WHERE call=? AND provider=?").bind(Date.now(),call.id,provider).run();
  return unavailable();
 }
 if(receipt.attempts>1){
  if(receipt.state==='completed'&&receipt.reply)return completion(receipt.reply);
  return json({error:{code:'inference_unavailable',message:'The inference is already in progress or did not complete.'}},503);
 }
 let timer;
 try{
  const result=await Promise.race([env.AI.run(MODEL,{messages:[{role:'system',content:'Write one short English mission status sentence using the supplied fictional information. Do not add facts or claim a real-world action.'},{role:'user',content:FALLBACK_PROMPT}],max_tokens:180,temperature:0.2}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),25000);})]);
  const choice=result?.choices?.length===1?result.choices[0]:null;
  const reply=typeof result?.response==='string'?result.response:choice?.finish_reason==='stop'?choice?.message?.content:null;
  if(typeof reply!=='string'||!reply.trim()||reply.length>6000)throw new Error('Invalid model result');
  await db.prepare("UPDATE fallback_demo_receipts SET state='completed',http=200,reply=?,completed=? WHERE call=? AND provider=?").bind(reply,Date.now(),call.id,provider).run();
  return completion(reply);
 }catch{
  await db.prepare("UPDATE fallback_demo_receipts SET state='inference_error',http=503,completed=? WHERE call=? AND provider=?").bind(Date.now(),call.id,provider).run();
  return json({error:{code:'inference_unavailable',message:'Workers AI did not complete. No example answer was substituted.'}},503);
 }finally{clearTimeout(timer);}
}
async function modelApi(request,env,db,path){
 await upstreamAuth(request,env);
 const match=new RegExp('^'+BASE+'/(primary|backup)/v1/(models|chat/completions)$').exec(path);
 if(!match)throw new Fault(404,'Unknown demo endpoint.');const provider=match[1];
 if(match[2]==='models'){
  if(request.method!=='GET')throw new Fault(405,'Use GET.');
  return json({object:'list',data:[{id:'r5r5-'+provider+'-model',object:'model',owned_by:'r5r5-controlled-demo'}]});
 }
 if(request.method!=='POST')throw new Fault(405,'Use POST.');
 const body=await readJson(request,8000),messages=body?.messages;
 if(![FALLBACK_MODEL,'r5r5-'+provider,'r5r5-'+provider+'-model'].includes(body?.model)||body.stream===true||!Array.isArray(messages)||messages.length!==2||messages[0]?.role!=='system'||messages[1]?.role!=='user'||messages[1].content!==FALLBACK_PROMPT)throw new Fault(400,'Invalid bounded demo request.');
 const context=/^Fallback run: ([a-f0-9-]{36})\nCall: ([a-f0-9-]{36})\nContext: ([a-f0-9-]{36})$/.exec(messages[0].content);
 if(!context)throw new Fault(401,'Invalid delegated context.');
 await init(db);
 return receive(env,db,provider,{run:context[1],call:context[2],proof:context[3]});
}
export function fallbackObservation(call,receipts){
 const primary=receipts.find(x=>x.provider==='primary'),backup=receipts.find(x=>x.provider==='backup');
 const success=call.http===200&&typeof call.reply==='string'&&call.reply.trim();
 const served=receipts.filter(x=>x.state==='completed'&&x.http===200&&success&&x.reply===call.reply);
 const fallback=call.side==='gateway'&&call.phase==='outage'&&call.status==='closed'&&primary?.state==='controlled_error'&&primary.http===503&&backup?.state==='completed'&&backup.http===200&&backup.reply===call.reply&&success&&backup.received>=primary.received;
 const directFailure=call.side==='direct'&&call.phase==='outage'&&call.status==='closed'&&call.http===503&&primary?.state==='controlled_error'&&!backup;
 return {fallback_observed:Boolean(fallback),served_by:served.length===1?served[0].provider:null,evidence_status:fallback||directFailure||success&&served.length===1?'complete':'partial',primary_received:primary?'yes':call.status==='closed'?'no':'unknown',backup_received:backup?'yes':call.status==='closed'?'no':'unknown'};
}
async function snapshot(db,run){
 const calls=(await db.prepare('SELECT id AS client_call_id,side,phase,status,http,reply,request_id,created FROM fallback_demo_calls WHERE run=? ORDER BY created,id').bind(run.id).all()).results;
 const receipts=(await db.prepare('SELECT f.call,f.provider,f.attempts,f.state,f.http,f.reply,f.received,f.completed FROM fallback_demo_receipts f JOIN fallback_demo_calls c ON c.id=f.call WHERE c.run=? ORDER BY f.received,f.provider').bind(run.id).all()).results;
 return {id:run.id,step:run.step,notice:run.notice,requested_model:FALLBACK_MODEL,prompt:FALLBACK_PROMPT,gateway_mode:'live',model_mode:'live',outage_mode:'controlled',calls:calls.map(c=>{const observed=receipts.filter(x=>x.call===c.client_call_id);return {...c,receipts:observed,...fallbackObservation(c,observed)};})};
}
async function getRun(db,id,who){if(!UUID.test(id))throw new Fault(404,'Run not found.');const run=await db.prepare('SELECT * FROM fallback_demo_runs WHERE id=? AND owner=? AND expires>?').bind(id,who,Date.now()).first();if(!run)throw new Fault(404,'Run expired or is unavailable.');return run;}
async function dispatch(env,db,run,side,phase){
 const id=crypto.randomUUID(),proof=crypto.randomUUID();
 await db.prepare("INSERT INTO fallback_demo_calls(id,run,side,phase,proof,status,created) VALUES(?,?,?,?,?,'running',?)").bind(id,run.id,side,phase,proof,Date.now()).run();
 let http=0,reply=null,requestId=null;
 try{
  const response=side==='direct'?await receive(env,db,'primary',{run:run.id,call:id,proof}):await env.AI_GATEWAY.fetch(GATEWAY,{method:'POST',headers:{Authorization:'Bearer '+env.GATEWAY_DEMO_VIRTUAL_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:FALLBACK_MODEL,stream:false,messages:[{role:'system',content:`Fallback run: ${run.id}\nCall: ${id}\nContext: ${proof}`},{role:'user',content:FALLBACK_PROMPT}]}),redirect:'manual',signal:AbortSignal.timeout(60000)});
  http=response.status;requestId=side==='gateway'?response.headers.get('x-request-id'):null;
  const body=await response.json().catch(()=>null),content=body?.choices?.[0]?.message?.content;
  if(response.ok&&typeof content==='string'&&content.length<=6000)reply=content;
 }catch{ /* Transport failure is distinct from a controlled primary failure. */ }
 await db.prepare("UPDATE fallback_demo_calls SET status='closed',http=?,reply=?,request_id=? WHERE id=?").bind(http,reply,requestId,id).run();
}
export async function fallbackApi(request,env,service=false){
 try{
  const db=env.LR_DB_PROTECTED,path=new URL(request.url).pathname;
  if(!db||!env.AI)throw new Fault(503,'Demo storage and Workers AI are required.');
  if(service)return await modelApi(request,env,db,path);
  const who=await owner(request);await init(db);
  if(path===BASE+'/config'&&request.method==='GET')return json({configured:Boolean(env.AI_GATEWAY&&env.GATEWAY_DEMO_VIRTUAL_KEY),requested_model:FALLBACK_MODEL,prompt:FALLBACK_PROMPT});
  if(path===BASE+'/runs'&&request.method==='POST'){
   sameOrigin(request);const body=await readJson(request,256);if(!body||Object.keys(body).length)throw new Fault(400,'Run settings are server-owned.');
   const id=crypto.randomUUID(),now=Date.now();
   await db.batch([
    db.prepare('DELETE FROM fallback_demo_receipts WHERE call IN(SELECT c.id FROM fallback_demo_calls c JOIN fallback_demo_runs r ON r.id=c.run WHERE r.expires<=?)').bind(now),
    db.prepare('DELETE FROM fallback_demo_calls WHERE run IN(SELECT id FROM fallback_demo_runs WHERE expires<=?)').bind(now),
    db.prepare('DELETE FROM fallback_demo_runs WHERE expires<=?').bind(now),
    db.prepare('INSERT INTO fallback_demo_runs(id,owner,created,expires) VALUES(?,?,?,?)').bind(id,who,now,now+1800000)
   ]);return json(await snapshot(db,{id,step:0,notice:null}),201);
  }
  const match=new RegExp('^'+BASE+'/runs/([a-f0-9-]+)(/step)?$').exec(path);if(!match)throw new Fault(404,'Unknown demo route.');
  const run=await getRun(db,match[1],who);
  if(request.method==='GET'&&!match[2])return json(await snapshot(db,run));
  if(request.method!=='POST'||!match[2])throw new Fault(405,'Use the run step action.');sameOrigin(request);
  const body=await readJson(request,256),phase=['normal','outage'][run.step];
  if(!phase||body?.step!==phase||Object.keys(body).some(k=>k!=='step'))throw new Fault(409,'Run the steps in order.');
  if(!env.AI_GATEWAY||!env.GATEWAY_DEMO_VIRTUAL_KEY)throw new Fault(503,'Live Gateway is not configured. No simulated routing result was substituted.');
  const lock=await db.prepare('UPDATE fallback_demo_runs SET step=-1 WHERE id=? AND step=?').bind(run.id,run.step).run();if(!lock.meta.changes)throw new Fault(409,'This step is already in progress.');
  try{
   for(const side of ['direct','gateway'])await dispatch(env,db,run,side,phase);
   const data=await snapshot(db,run),current=['direct','gateway'].map(side=>data.calls.filter(x=>x.phase===phase&&x.side===side).at(-1));
   const normalOK=current.every(x=>x?.served_by==='primary'&&x.evidence_status==='complete');
   const notice=phase==='normal'?(normalOK?'Both routes received an answer from Primary.':'The normal control is incomplete. Resolve the connection before testing fallback.'):'Primary failure was limited to this comparison. Review which endpoint actually received each request.';
   await db.prepare('UPDATE fallback_demo_runs SET step=?,notice=? WHERE id=?').bind(phase==='normal'&&!normalOK?0:run.step+1,notice,run.id).run();
  }catch(error){await db.prepare('UPDATE fallback_demo_runs SET step=? WHERE id=?').bind(run.step,run.id).run();throw error;}
  return json(await snapshot(db,await getRun(db,run.id,who)));
 }catch(error){return error instanceof Fault?json({error:error.message},error.status):json({error:'This demo did not complete. No fallback was assumed.'},503);}
}
