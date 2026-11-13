import '/flow-animation.js';
import {cases,flowPlan} from './case-flow-plan.js';
import {VIEWBOX,productDiagramMarkup,paintProductDiagram,escapeText as esc} from './product-diagram.js';
const motion=window.FlowAnimation;
const pauseIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const playIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
const routeIds={'source-gateway':'application-gateway','source-model':'direct-model','source-primary':'direct-primary','source-tool':'direct-tools','gateway-tool':'gateway-tools'};
const endpoints={
 'application-gateway':['application','gateway'],'gateway-model':['gateway','model'],'gateway-tools':['gateway','tools'],
 'gateway-primary':['gateway','primary'],'gateway-backup':['gateway','backup'],'direct-model':['application','model'],
 'direct-tools':['application','tools'],'direct-primary':['application','primary'],'gateway-events':['gateway','vision'],
};
let serial=0;
export function mountCaseExplainer(host,kind=host?.dataset.gatewayDiagram){
 const config=cases[kind];if(!host||!config)return()=>{};
 const fallback=kind==='fallback',llm=config.type==='llm',mask=config.type==='mask',prefix='case-'+kind+'-'+(++serial);
 host.innerHTML=`<section class="guard-explainer gateway-case" aria-label="${esc(config.title)} illustration"><div class="ge-toggle" role="tablist" aria-label="Illustrated Gateway protection"><button type="button" role="tab" id="${prefix}-without" data-flow-mode="without" aria-controls="${prefix}-panel">WITHOUT GATEWAY</button><button type="button" role="tab" id="${prefix}-with" data-flow-mode="with" aria-controls="${prefix}-panel">WITH TRENDAI AI GATEWAY</button></div><div class="ge-panel" id="${prefix}-panel" role="tabpanel"><div class="gc-scroll"><svg class="gp-graph" viewBox="${VIEWBOX}" role="img" aria-labelledby="${prefix}-diagram-title ${prefix}-diagram-desc" data-prefix="${prefix}">${productDiagramMarkup(prefix)}</svg></div><p class="gc-mobile-hint">Scroll to explore the flow ↔</p><p class="gc-status" data-flow-status></p><div class="ge-controls"><div class="ge-scenarios" role="group" aria-label="Illustration examples"><span class="gc-illustration">Illustration · No live requests</span><button type="button" data-flow-case="normal">${esc(config.normalLabel)}</button><button type="button" data-flow-case="attack">${esc(config.attackLabel)}</button>${config.authorizedLabel?`<button type="button" data-flow-case="authorized">${esc(config.authorizedLabel)}</button>`:''}</div><button type="button" class="ge-pause" data-flow-pause aria-label="Pause explanatory animation">${pauseIcon}</button></div></div></section>`;
 const section=host.firstElementChild,svg=section.querySelector('.gp-graph'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let mode='with',scenario='attack',index=0,paused=false,visible=false,destroyed=false,timeline,active=null,reverse=false,duration=1,scale=1;
 const plan=()=>flowPlan(kind,mode,scenario);
 const all=(selector,fn)=>section.querySelectorAll(selector).forEach(fn);
 function paint(){
  if(destroyed)return;
  const steps=plan(),current=reduced.matches?steps.at(-1):steps[index],seen=new Set((reduced.matches?steps:steps.slice(0,index+1)).map(x=>x.effect));
  const withGateway=mode==='with',attack=scenario==='attack',authorized=scenario==='authorized';
  section.dataset.mode=mode;section.dataset.scenario=scenario;section.dataset.phase=current.effect||current.route;
  all('[data-flow-mode]',b=>{const chosen=b.dataset.flowMode===mode;b.setAttribute('aria-selected',String(chosen));b.tabIndex=chosen?0:-1;});
  section.querySelector('[role="tabpanel"]').setAttribute('aria-labelledby',prefix+'-'+mode);
  all('[data-flow-case]',b=>b.setAttribute('aria-pressed',String(b.dataset.flowCase===scenario)));
  const present=new Set(['application',...(withGateway?['gateway','vision']:[]),...(fallback?['primary','backup']:['model','tools'])]);
  const visibleEdges=new Set(fallback?[withGateway?'application-gateway':'direct-primary',...(withGateway?['gateway-primary','gateway-backup']:[])]:[withGateway?'application-gateway':llm||mask?'direct-model':'direct-tools',...(withGateway?[llm||mask?'gateway-model':'gateway-tools']:[])]);
  if(withGateway){visibleEdges.add('vision-config');visibleEdges.add('gateway-events');}
  const route=current.route?(routeIds[current.route]||current.route):null;
  const activeNodes=route?[...endpoints[route]]:current.effect==='primary-error'||current.effect==='primary-answer'?['primary']:current.effect==='backup-answer'?['backup']:current.effect==='commit'||current.effect==='read'?['tools']:current.effect==='answer'?['model']:current.effect==='done'?['application']:['gateway'];
  const tag=!withGateway?'':seen.has('deny')?'Deny':fallback?seen.has('fallback')?'Fallback':seen.has('primary-answer')?'Allow':'':mask?seen.has('redact')?'Redact':seen.has('allow')?'Allow':'':seen.has('allow')?'Allow':'';
  const details={application:authorized?config.authorizedSource:config.source};
  if(fallback){details.primary=seen.has('primary-error')?'HTTP 503':seen.has('primary-answer')?'Answer returned':'Primary provider';details.backup=seen.has('backup-answer')?'Answer returned':'Backup provider';}
  else if(llm)details.model=authorized||attack?config.attackTarget:config.normalTarget;
  else if(!mask)details.tools=attack?config.attack:config.normal;
  let payload='';
  if(mask)payload=scenario==='attack'?(withGateway&&seen.has('redact')?'Payment card: [REDACTED]':'Payment card: 4111 1111 1111 1111'):'Summarize the Millennium Falcon parking fee.';
  const resource=!fallback&&!llm&&!mask?(seen.has('commit')?config.changed:config.initial):'';
  paintProductDiagram(svg,{visible:visibleEdges,present,activeNodes,activeEdges:route?[{id:route,reverse:Boolean(current.reverse)}]:[],stopped:withGateway&&seen.has('deny')?(llm?'model':'tools'):undefined,tag,controls:withGateway?(mask&&seen.has('response-allow')?'Response inspection · Allow':config.policy||(fallback?'Routing rules':'Tool access control')):'',payload,details,resource});
  const packet=svg.querySelector('[data-role="packet"]');packet.setAttribute('hidden','');
  active=route&&!reduced.matches?svg.querySelector(`[data-edge="${route}"]`):null;reverse=Boolean(current.reverse);
  scale=svg.getBoundingClientRect().width/1600||1;duration=active?motion.travelMs(active.getTotalLength()*scale)+120:current.effect==='done'?1600:850;
  let status=authorized?config.authorizedAllowed:attack?(withGateway?config.blocked:config.unprotected):config.allowed;
  section.querySelector('[data-flow-status]').textContent=status;
  svg.querySelector('desc').textContent=`Product-level illustration. ${config.title}. ${withGateway?'With':'Without'} Gateway. ${status} Policy/configuration and Events are separate from request traffic.`;
  const pause=section.querySelector('[data-flow-pause]');pause.hidden=reduced.matches;pause.setAttribute('aria-label',paused?'Resume explanatory animation':'Pause explanatory animation');pause.innerHTML=paused?playIcon:pauseIcon;
 }
 function travel(elapsed){
  if(!active||reduced.matches)return;
  const length=active.getTotalLength(),distance=motion.position(length,elapsed/scale,reverse),point=active.getPointAtLength(distance),packet=svg.querySelector('[data-role="packet"]');packet.removeAttribute('hidden');packet.setAttribute('cx',point.x);packet.setAttribute('cy',point.y);
 }
 timeline=motion.createTimeline({duration:()=>duration,advance(){index=(index+1)%plan().length;paint();},paint:travel});
 function schedule(){travel(timeline.elapsed);if(paused||reduced.matches||!visible||document.hidden)timeline.pause();else timeline.resume();}
 function reset(){timeline.pause();index=0;paint();timeline.reset();schedule();}
 function click(event){const b=event.target.closest('button');if(!b)return;if(b.dataset.flowMode){mode=b.dataset.flowMode;reset();}else if(b.dataset.flowCase){scenario=b.dataset.flowCase;reset();}else if(b.hasAttribute('data-flow-pause')){paused=!paused;paint();schedule();}}
 function key(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();mode=event.key==='Home'?'without':event.key==='End'?'with':mode==='with'?'without':'with';reset();section.querySelector(`[data-flow-mode="${mode}"]`).focus();}
 const refresh=()=>{paint();schedule();},observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();},{threshold:.05}),resize=new ResizeObserver(()=>{const before=duration;paint();timeline.resize(before,duration);schedule();});
 section.addEventListener('click',click);section.querySelector('[role="tablist"]').addEventListener('keydown',key);reduced.addEventListener('change',refresh);document.addEventListener('visibilitychange',refresh);observer.observe(section);resize.observe(svg);paint();schedule();
 const destroy=()=>{if(destroyed)return;destroyed=true;timeline.destroy();observer.disconnect();resize.disconnect();reduced.removeEventListener('change',refresh);document.removeEventListener('visibilitychange',refresh);section.removeEventListener('click',click);section.querySelector('[role="tablist"]').removeEventListener('keydown',key);};window.addEventListener('pagehide',destroy,{once:true});return destroy;
}
document.querySelectorAll('[data-gateway-diagram]').forEach(host=>mountCaseExplainer(host));
