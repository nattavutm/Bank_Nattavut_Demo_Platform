const root=document.querySelector('#fallback-app');
new ResizeObserver(()=>parent.postMessage({type:'gateway-preview-height',height:Math.ceil(root.getBoundingClientRect().height)},location.origin)).observe(root);
const $=selector=>document.querySelector(selector),BASE='/api/gateway/fallback';
let run=null,busy=false,configured=false;
async function api(path,body){const response=await fetch(BASE+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||'The demo did not complete.');return result;}
function controls(){for(const button of document.querySelectorAll('[data-step]'))button.disabled=busy||!configured||['normal','outage'].indexOf(button.dataset.step)!==(run?.step??0);$('#fb-new').disabled=busy;}
function render(){
 for(const side of ['direct','gateway']){
  const calls=run?.calls.filter(x=>x.side===side)||[],current=calls.at(-1),state=$('#fb-state-'+side),outcome=$('#fb-outcome-'+side);
  state.dataset.outcome='unknown';state.textContent='Not started';outcome.textContent='Run the normal request first.';
  if(current){
   if(current.fallback_observed){state.textContent='Backup answered';state.dataset.outcome='success';outcome.textContent='Primary returned HTTP 503. Gateway routed the request to Backup.';}
   else if(current.served_by==='primary'){state.textContent='Primary answered';state.dataset.outcome='success';outcome.textContent='The primary endpoint received the request and returned an AI response.';}
   else if(side==='direct'&&current.phase==='outage'&&current.evidence_status==='complete'){state.textContent='Request failed · HTTP 503';state.dataset.outcome='failure';outcome.textContent='Primary failed. This route has no fallback, so the app received no answer.';}
   else{state.textContent='Not verified';outcome.textContent='The observed response does not prove a successful route. Check the endpoint evidence below.';}
  }
  const list=$('#fb-timeline-'+side);list.replaceChildren();
  for(const call of calls){
   const li=document.createElement('li'),heading=document.createElement('h3');heading.textContent=call.phase==='normal'?'Normal request':'Primary failure';li.append(heading);
   for(const receipt of call.receipts){const line=document.createElement('p'),label=document.createElement('strong'),status=document.createElement('span');label.textContent=receipt.provider==='primary'?'Primary':'Backup';status.textContent=`HTTP ${receipt.http??'unknown'}${receipt.attempts>1?' · '+receipt.attempts+' attempts':''}`;status.dataset.result=receipt.state==='completed'?'success':'failure';line.append(label,status);li.append(line);}
   if(!call.receipts.length){const note=document.createElement('p');note.textContent='No verified endpoint receipt.';li.append(note);}list.append(li);
  }
  const answer=$('#fb-answer-'+side);answer.hidden=!current?.reply;answer.querySelector('p').textContent=current?.reply??'';
 }
 const direct=run?.calls.find(x=>x.side==='direct'&&x.phase==='outage'),gateway=run?.calls.find(x=>x.side==='gateway'&&x.phase==='outage');
 const complete=direct?.evidence_status==='complete'&&gateway?.fallback_observed;
 $('#fb-conclusion').hidden=!complete;$('#fb-conclusion').textContent=complete?'Primary failed. Gateway reached Backup. The app still received an answer using r5r5-continuity.':'';
 $('#fb-evidence').textContent=run?JSON.stringify(run,null,2):'No requests yet.';controls();
}
$('#fb-new').addEventListener('click',()=>{run=null;$('#fb-notice').textContent='New comparison. Start with a normal request.';render();});
for(const button of document.querySelectorAll('[data-step]'))button.addEventListener('click',async()=>{
 if(busy)return;busy=true;controls();$('#fb-notice').textContent='In progress · '+(button.dataset.step==='normal'?'Sending the normal request…':'Testing a controlled primary failure…');
 try{if(!run)run=await api('/runs',{});run=await api('/runs/'+run.id+'/step',{step:button.dataset.step});$('#fb-notice').textContent=run.notice||'Step completed.';}
 catch(error){$('#fb-notice').textContent=error.message;if(run)try{run=await api('/runs/'+run.id);}catch{}}
 finally{busy=false;render();}
});
try{const config=await api('/config');configured=config.configured;$('#fb-prompt').textContent=config.prompt;if(!configured)$('#fb-notice').textContent='Live Gateway is not configured. No simulated fallback is shown.';}catch(error){$('#fb-notice').textContent=error.message;}render();
