import {createPromptComposer} from '../prompt-composer.js';
const root=document.querySelector('#invoice-app');
new ResizeObserver(()=>parent.postMessage({type:'gateway-preview-height',height:Math.ceil(root.getBoundingClientRect().height)},location.origin)).observe(root);
const BASE='/api/gateway/invoice',$=selector=>document.querySelector(selector),money=value=>'THB '+Number(value).toLocaleString('en-US');
let mode='guided',run=null,busy=false,configured=false;
const composer=createPromptComposer({host:document.querySelector('#iv-composer'),kind:'invoice',steps:["review", "payment"],onSend:()=>document.querySelector('[data-step]:not(:disabled)')?.click(),onEdit:()=>{if(run?.step>=2){run=null;render();}}});
async function api(path,body){const response=await fetch(BASE+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'The invoice demo did not complete.');return data;}
function controls(){for(const button of document.querySelectorAll('[data-step]'))button.disabled=busy||!configured||['review','payment'].indexOf(button.dataset.step)!==(run?.step??0);for(const button of document.querySelectorAll('[data-mode],#iv-new'))button.disabled=busy;composer.sync({step:run?.step??0,mode:mode,busy,enabled:!busy&&configured&&(run?.step??0)<2,lastText:run?.submitted_prompts?.at(-1)?.prompt,label:document.querySelector('[data-step]:not(:disabled)')?.textContent});}
function render(){
 $('#iv-mode-note').textContent=mode==='guided'?'Guided prescribes the payment attempt. Gateway decisions and ledger changes are observed live.':'Workers AI proposes the payment tool from the task and untrusted note. A different choice is shown without substitution.';
 $('#iv-mode-evidence').textContent=mode==='agent'?'Model-proposed payment tool · Prescribed invoice read · Synthetic payments':'Prescribed tool selection · Live Gateway decisions · Synthetic payments';
 $('#iv-review').hidden=!run?.summary;$('#iv-review p').textContent=run?.summary??'';
 for(const side of ['direct','gateway']){
  const state=run?.states.find(x=>x.side===side),calls=run?.calls.filter(x=>x.side===side)||[],payments=run?.payments.filter(x=>x.side===side)||[],attempt=calls.find(x=>x.tool==='pay_invoice'),status=$('#iv-state-'+side);
  status.textContent=!run?'Not started':payments.length?'Paid · '+money(payments[0].amount):attempt?.decision==='deny'?'Payment denied':attempt?'Not verified':calls.some(x=>x.received)?'Invoice reviewed':'Not verified';status.dataset.outcome=payments.length?'paid':attempt?.decision==='deny'?'protected':'neutral';
  $('#iv-balance-'+side).textContent=state?money(state.balance):'—';
  $('#iv-outcome-'+side).textContent=payments.length?'The payment tool recorded a payment and reduced this demo balance.':attempt?.decision==='deny'?'Gateway denied pay_invoice. No payment was created.':attempt?'No payment is recorded. Check the evidence before attributing this to Gateway.':'Review the invoice, then try the payment tool.';
  const submitted=$('#iv-submitted-'+side),lastText=run?.submitted_prompts?.findLast(x=>x.id===calls.at(-1)?.client_call_id)?.prompt;submitted.hidden=!lastText;submitted.querySelector('pre').textContent=lastText||'';
  const history=$('#iv-payments-'+side);history.replaceChildren();
  if(!payments.length){history.textContent=run?'No payments recorded.':'No requests yet.';history.dataset.empty='true';}
  else{history.dataset.empty='false';for(const payment of payments){const row=document.createElement('div'),invoice=document.createElement('strong'),amount=document.createElement('span'),supplier=document.createElement('p');row.className='iv-payment';invoice.textContent=payment.invoice;amount.textContent=money(payment.amount)+' · Paid';supplier.textContent=run.invoice.supplier;row.append(invoice,amount,supplier);history.append(row);}}
  const timeline=$('#iv-timeline-'+side);timeline.replaceChildren();
  for(const call of calls){const row=document.createElement('li'),tool=document.createElement('strong'),decision=document.createElement('span'),detail=document.createElement('p');tool.textContent=call.tool;decision.textContent=call.received?(call.rpc?.result&&!call.rpc.result.isError?'Tool executed':'MCP error'):call.decision==='deny'?'Denied by Gateway':'Not verified';decision.dataset.outcome=call.decision==='deny'?'protected':'neutral';detail.textContent=call.committed?'Synthetic payment recorded.':call.received?'MCP server received the call.':call.rpc?.error?.message||'No verified tool delivery.';row.append(tool,decision,detail);timeline.append(row);}
 }
 const direct=run?.payments.filter(x=>x.side==='direct')||[],protectedPayments=run?.payments.filter(x=>x.side==='gateway')||[],denied=run?.calls.some(x=>x.side==='gateway'&&x.tool==='pay_invoice'&&x.decision==='deny'&&!x.received&&!x.committed),balance=run?.states.find(x=>x.side==='gateway')?.balance;
 const complete=direct.length===1&&denied&&protectedPayments.length===0&&balance===run.initial_balance;
 $('#iv-conclusion').hidden=!complete;$('#iv-conclusion').textContent=complete?'Invoice review works. Gateway denied the payment tool. '+money(run.invoice.amount)+' was not paid from the protected demo balance.':'';
 $('#iv-evidence').textContent=run?JSON.stringify(run,null,2):'No requests yet.';controls();
}
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>{mode=button.dataset.mode;run=null;for(const other of document.querySelectorAll('[data-mode]'))other.setAttribute('aria-pressed',String(other===button));$('#iv-notice').textContent='Start a new comparison in '+(mode==='guided'?'Guided':'Live Agent')+' mode.';render();});
$('#iv-new').addEventListener('click',()=>{run=null;$('#iv-notice').textContent='New comparison. Both sides get a fresh synthetic invoice and demo balance.';render();});
for(const button of document.querySelectorAll('[data-step]'))button.addEventListener('click',async()=>{
 if(busy)return;busy=true;controls();$('#iv-notice').textContent=button.dataset.step==='review'?'In progress · Reading and reviewing the invoice…':'In progress · Testing payment access…';
 try{if(!run)run=await api('/runs',{mode});run=await api('/runs/'+run.id+'/step',{step:button.dataset.step,prompt:composer.value(button.dataset.step)});$('#iv-notice').textContent=run.notice||'Step completed.';}
 catch(error){$('#iv-notice').textContent=error.message;if(run)try{run=await api('/runs/'+run.id);}catch{}}
 finally{busy=false;render();}
});
try{const config=await api('/config');configured=config.configured;if(!configured)$('#iv-notice').textContent='Live MCP is not configured. No simulated Gateway protection is shown.';}catch(error){$('#iv-notice').textContent=error.message;}render();
