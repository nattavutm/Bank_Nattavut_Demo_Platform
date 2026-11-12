import '/flow-animation.js';
import {cases,flowPlan} from './case-flow-plan.js';
const motion=window.FlowAnimation,ns='http://www.w3.org/2000/svg';
const symbols={agent:'<rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 3v4M8 12v2m8-2v2M9 17h6"/>',app:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18M8 3v6M8 14h3m-3 3h7"/>',tools:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 9 3 3-3 3m6 0h4"/>',invoice:'<path d="M6 3h9l4 4v14H6Zm9 0v5h4M9 12h7m-7 4h7"/>',database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',model:'<path d="m12 3 9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5m-9 5v8"/>'};
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+symbols[name]+'</svg>';
const pauseIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const playIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
function mount(host){
 const kind=host.dataset.gatewayDiagram,config=cases[kind];if(!config)return;
 const fallback=kind==='fallback',llm=config.type==='llm',prefix='case-'+kind;
 const node=(id,title,image,detail='')=>'<div class="gc-node" data-node="'+id+'">'+icon(image)+'<h3>'+title+'</h3>'+detail+'</div>';
 host.innerHTML='<section class="guard-explainer gateway-case" aria-label="'+config.title+' illustration"><div class="ge-toggle" role="tablist" aria-label="Illustrated Gateway protection"><button type="button" role="tab" id="'+prefix+'-without" data-flow-mode="without" aria-controls="'+prefix+'-panel">WITHOUT GATEWAY</button><button type="button" role="tab" id="'+prefix+'-with" data-flow-mode="with" aria-controls="'+prefix+'-panel">WITH TRENDAI AI GATEWAY</button></div><div class="ge-panel" id="'+prefix+'-panel" role="tabpanel"><div class="gc-graph '+(fallback?'gc-fallback':llm?'gc-llm':'gc-mcp')+'" role="img">'+node('source',config.source,config.sourceIcon,'<span class="gc-detail" data-source-note>'+config.sourceNote+'</span>')+'<div class="gc-node gc-gateway" data-node="gateway"><span class="ge-guard-symbol"><img src="/brand/guard-flow-symbol.png" width="58" height="51" alt="TrendAI"></span><h3>AI Gateway</h3><span class="gc-detail">'+(config.policy||(fallback?'Model routing':'Tool access control'))+'</span><span class="ge-decision" data-policy></span></div>'+(fallback?'<div class="gc-endpoints">'+node('primary','Primary','model','<span class="gc-detail" data-primary></span>')+node('backup','Backup','model','<span class="gc-detail" data-backup></span>')+'</div>':llm?node('model',config.normalTarget,'model','<span class="gc-detail" data-model-label></span>'):node('tool',config.target,config.targetIcon,'<code data-tool></code>')+node('ledger',config.ledger,config.ledgerIcon,'<span class="gc-ledger-state" data-ledger></span>'))+'</div><p class="gc-status" data-flow-status></p><div class="ge-controls"><div class="ge-scenarios" role="group" aria-label="Illustration examples"><span class="gc-illustration">Illustration</span><button type="button" data-flow-case="normal">'+config.normalLabel+'</button><button type="button" data-flow-case="attack">'+config.attackLabel+'</button>'+(config.authorizedLabel?'<button type="button" data-flow-case="authorized">'+config.authorizedLabel+'</button>':'')+'</div><button type="button" class="ge-pause" data-flow-pause aria-label="Pause explanatory animation">'+pauseIcon+'</button></div></div></section>';
 const section=host.firstElementChild,graph=section.querySelector('.gc-graph'),reduced=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width: 760px)');
 let mode='with',scenario='attack',index=0,paused=false,visible=false,destroyed=false,raf,timeline,active=null,duration=1;
 const all=(selector,fn)=>section.querySelectorAll(selector).forEach(fn),plan=()=>flowPlan(kind,mode,scenario);
 function draw(){
  raf=undefined;if(destroyed)return;const previous=duration;
  graph.querySelector('.ge-pipes')?.remove();const rect=graph.getBoundingClientRect(),vertical=mobile.matches;
  const svg=document.createElementNS(ns,'svg');svg.classList.add('ge-pipes');svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);svg.setAttribute('aria-hidden','true');
  const at=(id,end)=>{const r=graph.querySelector(`[data-node="${id}"]`).getBoundingClientRect();return {x:r.left-rect.left+(vertical?r.width/2:end?r.width:0),y:r.top-rect.top+(vertical?end?r.height:0:r.height/2)};};
  const add=(id,a,b)=>{
   let path=motion.route(at(a,true),at(b,false),vertical);
   if(vertical&&id==='gateway-backup'){
    const ar=graph.querySelector('[data-node="gateway"]').getBoundingClientRect(),br=graph.querySelector('[data-node="backup"]').getBoundingClientRect();
    const start={x:ar.left-rect.left,y:ar.top-rect.top+ar.height/2},end={x:br.left-rect.left,y:br.top-rect.top+br.height/2};
    path=motion.rounded([start,{x:-1,y:start.y},{x:-1,y:end.y},end]);
   }
   const route=motion.addRoute(svg,path);route.dataset.route=id;
  };
  if(mode==='with')add('source-gateway','source','gateway');
  if(fallback){add(mode==='with'?'gateway-primary':'source-primary',mode==='with'?'gateway':'source','primary');if(mode==='with')add('gateway-backup','gateway','backup');}
  else if(llm){add(mode==='with'?'gateway-model':'source-model',mode==='with'?'gateway':'source','model');}
  else{add(mode==='with'?'gateway-tool':'source-tool',mode==='with'?'gateway':'source','tool');add('tool-ledger','tool','ledger');}
  graph.prepend(svg);paint();timeline?.resize(previous,duration);
 }
 function paint(){
  const steps=plan(),current=steps[index],seen=new Set((reduced.matches?steps:steps.slice(0,index+1)).map(x=>x.effect)),isWith=mode==='with',attack=scenario==='attack',stateScenario=scenario;
  section.dataset.mode=mode;section.dataset.scenario=scenario;section.dataset.phase=current.effect||current.route;
  section.querySelector('[data-source-note]').textContent=fallback&&!isWith?'Direct to Primary':config.sourceNote;
  all('[data-flow-mode]',button=>{const selected=button.dataset.flowMode===mode;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
  section.querySelector('[role="tabpanel"]').setAttribute('aria-labelledby',prefix+'-'+mode);
  all('[data-flow-case]',button=>button.setAttribute('aria-pressed',String(button.dataset.flowCase===scenario)));
  const decision=section.querySelector('[data-policy]');decision.textContent=!isWith?'':seen.has('deny')?'Deny':fallback?seen.has('fallback')?'Fallback':seen.has('primary-answer')?'Primary':'':seen.has('allow')?'Allow':'';decision.dataset.decision=seen.has('deny')?'block':decision.textContent?'allow':'';
  if(fallback){section.querySelector('[data-primary]').textContent=seen.has('primary-error')?'HTTP 503':seen.has('primary-answer')?'Answer returned':'Ready';section.querySelector('[data-backup]').textContent=seen.has('backup-answer')?'Answer returned':isWith?'Standby':'Not used';}
  else if(llm){section.querySelector('[data-node="model"] h3').textContent=attack||stateScenario==='authorized'?config.attackTarget:config.normalTarget;section.querySelector('[data-model-label]').textContent=attack||stateScenario==='authorized'?config.attackModel:config.normalModel;section.querySelector('[data-node="source"] h3').textContent=stateScenario==='authorized'?config.authorizedSource:config.source;}
  else{section.querySelector('[data-tool]').textContent=attack?config.attack:config.normal;const changed=seen.has('commit');section.querySelector('[data-ledger]').textContent=changed?config.changed:config.initial;section.querySelector('[data-ledger]').dataset.changed=String(changed);}
  const status=scenario==='authorized'?config.authorizedAllowed:attack?(isWith?config.blocked:config.unprotected):config.allowed;section.querySelector('[data-flow-status]').textContent=status;
  graph.setAttribute('aria-label','Illustration, not live results. '+config.source+(isWith?' through AI Gateway. ':', without Gateway. ')+status);
  active=null;all('.ge-route',group=>{const match=group.dataset.route===current.route&&!reduced.matches;group.classList.toggle('is-traveling',match);group.classList.toggle('ge-route-return',Boolean(current.reverse));if(match)active=group;});
  duration=active?motion.travelMs(active.querySelector('.ge-pipe-track').getTotalLength())+120:current.effect==='done'?1600:850;
  const button=section.querySelector('[data-flow-pause]');button.hidden=reduced.matches;button.setAttribute('aria-label',paused?'Resume explanatory animation':'Pause explanatory animation');button.innerHTML=paused?playIcon:pauseIcon;
 }
 function travel(elapsed){if(active)motion.moveRoute(active,elapsed,Boolean(plan()[index].reverse));}
 timeline=motion.createTimeline({duration:()=>duration,advance(){index=(index+1)%plan().length;paint();},paint:travel});
 const schedule=()=>{travel(timeline.elapsed);if(paused||reduced.matches||!visible||document.hidden)timeline.pause();else timeline.resume();};
 function reset(){index=0;draw();timeline.reset();schedule();}
 function click(event){const button=event.target.closest('button');if(!button)return;if(button.dataset.flowMode){mode=button.dataset.flowMode;reset();}else if(button.dataset.flowCase){scenario=button.dataset.flowCase;reset();}else if(button.hasAttribute('data-flow-pause')){paused=!paused;paint();schedule();}}
 function key(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();mode=event.key==='Home'?'without':event.key==='End'?'with':mode==='with'?'without':'with';reset();section.querySelector(`[data-flow-mode="${mode}"]`).focus();}
 const refresh=()=>{paint();schedule();},observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();},{threshold:.05}),resize=new ResizeObserver(()=>{if(!raf)raf=requestAnimationFrame(draw);});
 section.addEventListener('click',click);section.querySelector('[role="tablist"]').addEventListener('keydown',key);reduced.addEventListener('change',refresh);document.addEventListener('visibilitychange',refresh);resize.observe(graph);observer.observe(section);draw();schedule();
 const destroy=()=>{destroyed=true;timeline.destroy();cancelAnimationFrame(raf);observer.disconnect();resize.disconnect();reduced.removeEventListener('change',refresh);document.removeEventListener('visibilitychange',refresh);section.removeEventListener('click',click);section.querySelector('[role="tablist"]').removeEventListener('keydown',key);};window.addEventListener('pagehide',destroy,{once:true});
}
document.querySelectorAll('[data-gateway-diagram]').forEach(mount);
