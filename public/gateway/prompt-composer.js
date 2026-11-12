import {promptDefaults,modelInstructions} from './prompt-defaults.js';
const sendIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 3-7 18-4-7-7-4L21 3ZM10 14 21 3"/></svg>';
export function createPromptComposer({host,kind,steps,onSend,onEdit}){
 const key='prompt-'+kind,drafts={...promptDefaults[kind]};let current=steps[0],mode='guided',busy=false,enabled=false;
 host.innerHTML='<form class="gateway-prompt"><div class="gp-heading"><label for="'+key+'">Prompt to send</label><span data-prompt-step></span></div><div class="gp-editor"><textarea id="'+key+'" aria-describedby="'+key+'-hint" maxlength="4000" spellcheck="false" required></textarea><button type="submit" aria-label="Send current step">'+sendIcon+'</button></div><div class="gp-help" id="'+key+'-hint"><span data-prompt-hint></span><span>Ctrl / ⌘ + Enter to send</span></div><details class="gp-last" hidden><summary>Last submitted text</summary><pre></pre></details><details class="gp-system"><summary>System instruction</summary><p></p></details></form>';
 const form=host.querySelector('form'),field=host.querySelector('textarea'),send=host.querySelector('button'),hint=host.querySelector('[data-prompt-hint]'),system=host.querySelector('.gp-system');
 field.value=drafts[current];
 function sync(options){current=steps[Math.min(options.step,steps.length-1)]??steps[0];mode=options.mode||'guided';busy=options.busy;enabled=options.enabled;if(field.value!==drafts[current])field.value=drafts[current];field.style.height='auto';field.style.height=Math.max(190,field.scrollHeight)+'px';field.disabled=busy;field.readOnly=kind!=='fallback'&&options.step>=steps.length;send.disabled=busy||!enabled;host.querySelector('[data-prompt-step]').textContent=options.label||(options.step>=steps.length?'Comparison complete':({review:'1. Review invoice',payment:'2. Attempt payment',status:'1. Check status',delete:'2. Attempt deletion',verify:'3. Verify status',normal:'1. Run normal request',outage:'2. Simulate primary failure'})[current]);
  const model=kind==='fallback'?modelInstructions.fallback:kind==='invoice'&&current==='review'?modelInstructions.invoiceReview:mode==='agent'&&current!=='verify'?modelInstructions[kind]:null;
  host.querySelector('label').textContent=model?'Prompt to send':'Scenario text to send';
  hint.textContent=kind==='fallback'?'Synthetic test data · Editing starts a new comparison with the same prompt on both routes.':model?'Synthetic test data · Edited text is used by Workers AI and included in both MCP requests.':'Guided sends prescribed MCP tools with this scenario text; it does not ask a model to choose a tool.';
  if(field.readOnly)hint.textContent='Comparison complete · Start a new comparison to edit and send again.';
  system.hidden=!model;system.querySelector('p').textContent=model||'';const last=host.querySelector('.gp-last');last.hidden=!options.lastText;last.querySelector('pre').textContent=options.lastText||'';
 }
 field.addEventListener('input',()=>{drafts[current]=field.value;field.style.height='auto';field.style.height=Math.max(190,field.scrollHeight)+'px';if(kind==='fallback'){drafts.normal=field.value;drafts.outage=field.value;}onEdit?.();});
 form.addEventListener('submit',event=>{event.preventDefault();if(!busy&&enabled&&field.value.trim())onSend();});
 field.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();if(!busy&&enabled&&field.value.trim())onSend();}});
 return {sync,value:step=>drafts[step],reset(){Object.assign(drafts,promptDefaults[kind]);}};
}
