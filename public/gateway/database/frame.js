const root=document.querySelector('#database-app');
new ResizeObserver(()=>parent.postMessage({type:'gateway-preview-height',height:Math.ceil(root.getBoundingClientRect().height)},location.origin)).observe(root);
const BASE='/api/gateway/database';let mode='guided',run=null,busy=false,configured=false;
const $=selector=>document.querySelector(selector);
async function api(path,body){const response=await fetch(BASE+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'The demo did not complete.');return data;}
function controls(){for(const button of document.querySelectorAll('[data-step]'))button.disabled=busy||!configured||['status','delete','verify'].indexOf(button.dataset.step)!==(run?.step??0);for(const button of document.querySelectorAll('[data-mode],#db-new'))button.disabled=busy;}
function decision(call){if(call.received)return call.rpc?.result&&!call.rpc.result.isError?'Tool executed':'MCP error';return call.decision==='deny'?'Denied by Gateway':'Not verified';}
function render(){
 for(const side of ['direct','gateway']){
  const state=run?.states?.find(x=>x.side===side)?.state;
  $('#state-'+side).textContent=state||'Not started';$('#state-'+side).dataset.state=state??'';
  const calls=run?.calls?.filter(x=>x.side===side)||[];const list=$('#timeline-'+side);list.replaceChildren();
  for(const call of calls){const li=document.createElement('li'),name=document.createElement('strong'),status=document.createElement('span'),evidence=document.createElement('p');name.textContent=call.tool;status.textContent=decision(call);status.dataset.decision=call.received?'executed':call.decision==='deny'?'deny':'unknown';
   const raw=call.rpc?.error?.message||call.rpc?.result?.content?.filter(x=>x.type==='text').map(x=>x.text).join(' ')||'';
   evidence.textContent=call.received?`${call.committed?'Sandbox volume deleted.':'MCP server received the call.'}${call.request_id?' Request '+call.request_id:''}`:raw||'No verified MCP delivery.';
   li.append(name,status,evidence);list.append(li);
  }
  const deletion=calls.find(x=>x.tool==='delete_volume');
  $('#outcome-'+side).textContent=deletion?(deletion.committed?'The destructive tool changed this sandbox to Offline.':deletion.decision==='deny'?'Gateway denied delete_volume. The synthetic database was not deleted.':'Deletion was not confirmed. Check the request evidence.'):(calls.length?'The status read is recorded below.':'Run step 1 to inspect this route.');
 }
 $('#db-evidence').textContent=run?JSON.stringify(run,null,2):'No requests yet.';
 const denied=run?.calls?.some(c=>c.side==='gateway'&&c.tool==='delete_volume'&&c.decision==='deny'&&!c.received&&!c.committed);
 const verified=run?.calls?.some(c=>c.side==='gateway'&&c.step==='verify'&&c.received&&c.observed_state==='Online'&&c.rpc?.result&&!c.rpc.result.isError);
 const destroyed=run?.calls?.some(c=>c.side==='direct'&&c.tool==='delete_volume'&&c.committed);
 const conclusion=$('#db-conclusion');conclusion.hidden=!(denied&&verified&&destroyed);conclusion.textContent=conclusion.hidden?'':'Status checks work. Destructive tool access is denied. The Gateway sandbox is still Online.';
 controls();
}
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>{mode=button.dataset.mode;run=null;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b===button));$('#db-mode-note').textContent=mode==='guided'?(configured?'Guided selects repeatable tool calls. Access decisions come from the live Gateway.':'Guided selects repeatable tool calls. Connect MCP to test live Gateway access decisions.'):'Workers AI proposes each tool. The trusted dispatcher validates it and sends MCP calls through Gateway. A missing or different proposal is shown without substitution.';$('#db-notice').textContent='Start a new comparison in '+(mode==='guided'?'Guided':'Live Agent')+' mode.';render();});
$('#db-new').addEventListener('click',()=>{run=null;$('#db-notice').textContent='New comparison. Each side gets a fresh synthetic database.';render();});
for(const button of document.querySelectorAll('[data-step]'))button.addEventListener('click',async()=>{
 if(busy)return;busy=true;controls();$('#db-notice').textContent='In progress · '+button.textContent.replace(/^\d\. /,'')+'…';
 try{if(!run)run=await api('/runs',{mode});run=await api('/runs/'+run.id+'/step',{step:button.dataset.step});$('#db-notice').textContent=run.notice||'Step completed. Review the observed results below.';}
 catch(error){$('#db-notice').textContent=error.message;if(run){try{run=await api('/runs/'+run.id);}catch{}}}
 finally{busy=false;render();}
});
try{const config=await api('/config');configured=config.liveConfigured;if(configured)$('#db-mode-note').textContent='Guided selects repeatable tool calls. Access decisions come from the live Gateway.';if(!configured)$('#db-notice').textContent='Live MCP connection is not configured yet. No simulated Gateway protection is shown.';}catch(error){$('#db-notice').textContent=error.message;}render();
