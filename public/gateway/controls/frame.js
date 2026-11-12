import {controlCases,emailContext} from '../control-config.js';
import {createPromptComposer} from '../prompt-composer.js';
const root=document.querySelector('#controls-app'),kind=root.dataset.kind,config=controlCases[kind],$=s=>document.querySelector(s),BASE='/api/gateway/controls/'+kind;
new ResizeObserver(()=>parent.postMessage({type:'gateway-preview-height',height:Math.ceil(root.getBoundingClientRect().height)},location.origin)).observe(root);
$('#lc-category').textContent='AI Gateway / '+config.category;$('#lc-intro').textContent=config.description;$('#lc-scope').textContent=kind==='email'?'Synthetic email and payroll context · No email is sent.':'Application identity access · Both demo model endpoints use the same Workers AI model.';
if(kind==='email'){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');details.className='lc-context';summary.textContent='Synthetic app context';pre.textContent=emailContext;details.append(summary,pre);$('#lc-context').append(details);}
else $('#lc-context').textContent='Standard and Restricted are demo resources. No paid premium model is used. App identities are service accounts, not individual employees.';
for(const [i,step]of config.steps.entries()){const button=document.createElement('button');button.type='button';button.dataset.step=step;button.textContent=config.labels[i];$('#lc-steps').append(button);}
let run=null,busy=false,configured=false;
const composer=createPromptComposer({host:$('#lc-composer'),kind,steps:config.steps,onSend:()=>document.querySelector('[data-step]:not(:disabled)')?.click(),onEdit:()=>{if(kind==='models'&&run){run=null;$('#lc-notice').textContent='Prompt changed. Start a new comparison.';render();}}});
async function api(path,body){const response=await fetch(BASE+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.error||'The demo did not complete.');return data;}
function controls(){for(const button of document.querySelectorAll('[data-step]'))button.disabled=busy||!configured||config.steps.indexOf(button.dataset.step)!==(run?.step??0);$('#lc-new').disabled=busy;composer.sync({step:run?.step??0,busy,enabled:!busy&&configured&&(run?.step??0)<config.steps.length,lastText:run?.calls.at(-1)?.prompt,label:document.querySelector('[data-step]:not(:disabled)')?.textContent});}
function render(){
 for(const side of ['direct','gateway']){
  const calls=run?.calls.filter(c=>c.side===side)||[],last=calls.at(-1),state=$('#lc-state-'+side),outcome=$('#lc-outcome-'+side);state.dataset.outcome='unknown';state.textContent='Not started';outcome.textContent='Run the normal control first.';
  $('#lc-principal-'+side).textContent=last?'App identity: '+last.principal+' · Model: '+last.model:'';
  if(last){
   if(last.decision==='deny'){state.textContent=last.blocked_before_model?'Blocked before model invocation':'Gateway returned Deny';state.dataset.outcome='protected';outcome.textContent=last.denial_type==='guardrail'?'Gateway guardrail rejected this request.':'Gateway access policy rejected this app/model request.';}
   else if(last.decision==='allow'){state.textContent='Model answered';state.dataset.outcome='success';outcome.textContent='The endpoint received the submitted prompt and returned the actual model answer.';}
   else{state.textContent='Not verified';outcome.textContent=last.error?.message||'The observed result does not prove a Gateway policy decision. Check the evidence.';}
  }
  const timeline=$('#lc-timeline-'+side);timeline.replaceChildren();for(const call of calls){const li=document.createElement('li'),name=document.createElement('strong'),detail=document.createElement('p'),status=document.createElement('span');name.textContent=config.labels[config.steps.indexOf(call.phase)].replace(/^\d\. /,'');status.textContent=call.decision==='deny'?'Deny':call.decision==='allow'?'Allowed / completed':'Unknown';status.dataset.outcome=call.decision==='deny'?'protected':call.decision==='allow'?'success':'unknown';detail.textContent=`HTTP ${call.http||'unknown'} · Upstream received: ${call.upstream_received} · Model invoked: ${call.model_invoked}`;li.append(name,status,detail);if(call.request_id){const id=document.createElement('p');id.textContent='Gateway request: '+call.request_id;li.append(id);}timeline.append(li);}
  const submitted=$('#lc-submitted-'+side);submitted.hidden=!last;submitted.querySelector('pre').textContent=last?.prompt||'';
  const answer=$('#lc-answer-'+side);answer.hidden=!last?.reply;answer.querySelector('p').textContent=last?.reply||'';
 }
 const latest=(phase,side)=>run?.calls.filter(c=>c.phase===phase&&c.side===side).at(-1),control=config.steps[0],normal=['direct','gateway'].every(side=>latest(control,side)?.decision==='allow');
 const denied=latest(kind==='email'?'attack':'restricted','gateway'),baseline=latest(kind==='email'?'attack':'restricted','direct');
 const pass=normal&&denied?.blocked_before_model&&denied.denial_type===(kind==='email'?'guardrail':'access')&&baseline?.decision==='allow'&&(kind==='email'||latest('authorized','gateway')?.decision==='allow');
 $('#lc-conclusion').hidden=!pass;$('#lc-conclusion').textContent=pass?(kind==='email'?'Normal email summaries work. Gateway blocked the hidden-instruction request before the model was invoked.':'Helpdesk can use Standard. Restricted access was denied. Operations can use the same Restricted model.') :'';
 $('#lc-evidence').textContent=run?JSON.stringify(run,null,2):'No requests yet.';controls();
}
$('#lc-new').addEventListener('click',()=>{run=null;$('#lc-notice').textContent='New comparison. Start with the normal control.';render();});
for(const button of document.querySelectorAll('[data-step]'))button.addEventListener('click',async()=>{if(busy)return;busy=true;controls();$('#lc-notice').textContent='In progress · '+button.textContent.replace(/^\d\. /,'')+'…';try{if(!run)run=await api('/runs',kind==='models'?{prompt:composer.value('standard')}:{});run=await api('/runs/'+run.id+'/step',{step:button.dataset.step,prompt:composer.value(button.dataset.step)});$('#lc-notice').textContent=run.notice;}catch(error){$('#lc-notice').textContent=error.message;if(run)try{run=await api('/runs/'+run.id);}catch{}}finally{busy=false;render();}});
try{configured=(await api('/config')).configured;if(!configured)$('#lc-notice').textContent='Live demo identities are not configured. No simulated protection is shown.';}catch(error){$('#lc-notice').textContent=error.message;}render();
