import {VIEWBOX,productDiagramMarkup,paintProductDiagram} from '../product-diagram.js';
import {catalog,buildFlow,visibleEdges} from './flows.js';
const $=s=>document.querySelector(s),svg=$('#ao-diagram'),root=$('#architecture-app');
let kind='overview',mode='with',index=0,raf=0,beatTimer=0,animationEpoch=0,destroyed=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function draw(){svg.classList.add('gp-graph');svg.dataset.prefix='ao';svg.setAttribute('viewBox',VIEWBOX);svg.innerHTML=productDiagramMarkup('ao');}

function animate(edges,complete){
 cancelAnimationFrame(raf);const packet=$('#ao-packet');packet.setAttribute('hidden','');if(reduced.matches||document.hidden)return;if(!edges.length){beatTimer=setTimeout(complete,650);return;}
 const segments=edges.map(e=>{const path=svg.querySelector(`[data-edge="${e.id}"]`);return {path,reverse:e.reverse,length:path.getTotalLength()};});
 let segment=0,start=null;
 function tick(now){if(destroyed||document.hidden){packet.setAttribute('hidden','');return;}if(start===null)start=now;const current=segments[segment],distance=Math.min(current.length,(now-start)*.37),point=current.path.getPointAtLength(current.reverse?current.length-distance:distance);packet.removeAttribute('hidden');packet.setAttribute('cx',point.x);packet.setAttribute('cy',point.y);
  if(distance>=current.length){segment++;start=now;if(segment===segments.length){packet.setAttribute('hidden','');beatTimer=setTimeout(complete,220);return;}}
  raf=requestAnimationFrame(tick);
 }
 raf=requestAnimationFrame(tick);
}
function paint(current,steps){
 const present=new Set(['application',...(mode==='with'?['gateway','vision']:[]),...(kind==='routing'?['primary','backup']:['model','tools'])]);
 for(const b of document.querySelectorAll('[data-route]'))b.setAttribute('aria-pressed',String(b.dataset.route===mode));
 paintProductDiagram(svg,{visible:visibleEdges(kind,mode),activeEdges:current.edges,activeNodes:current.nodes,present,stopped:current.stopped,tag:current.tag,controls:current.controls,payload:current.badge});
 $('#ao-diagram-desc').textContent=`${catalog.find(c=>c.id===kind).name}. ${mode==='with'?'With':'Without'} Gateway. ${steps[index].title}. ${current.title}. Product-level logical flow; illustration only.`;
 const notes={overview:'Model and MCP traffic return to the originating application or agent.',access:'Access depends on identity, action and resource.',guardrails:'Inspection follows the assigned request and response policies.',routing:'Fallback applies when configured conditions are met.'};$('#ao-note').textContent=current.phase.startsWith('Configuration')?'Policy configuration is separate from request traffic.':current.phase.startsWith('Telemetry')?'Events are telemetry, not a request approval step.':notes[kind];
}
function render(){
 stop();const epoch=animationEpoch,steps=buildFlow(kind,mode),current=steps[index],beats=current.beats;
 for(const b of picker.querySelectorAll('[data-case]'))b.setAttribute('aria-pressed',String(b.dataset.case===kind));
 $('#ao-phase').textContent=current.phase;$('#ao-step-count').textContent=`Step ${index+1} of ${steps.length}`;$('#ao-step-title').textContent=current.title;
 $('#ao-back').disabled=index===0;$('#ao-next').disabled=index===steps.length-1;$('#ao-next').textContent=index===steps.length-1?'Complete':'Next →';
 $('#ao-dots').innerHTML=steps.map((s,i)=>`<li ${i===index?'aria-current="step"':''} class="${i<index?'is-complete':''}" aria-label="${esc(s.title)}"></li>`).join('');
 if(reduced.matches||document.hidden){paint(beats.at(-1),steps);return;}
 function play(i){if(epoch!==animationEpoch||destroyed||document.hidden)return;paint(beats[i],steps);animate(beats[i].edges,()=>{if(i+1<beats.length)play(i+1);});}
 play(0);
}

const picker=$('#ao-categories');
picker.innerHTML=catalog.map(c=>`<button type="button" class="ao-category" data-case="${c.id}" aria-pressed="${c.id==='overview'}">${esc(c.name)}</button>`).join('');
picker.addEventListener('click',e=>{const button=e.target.closest('[data-case]');if(!button)return;kind=button.dataset.case;index=0;render();});
for(const button of document.querySelectorAll('[data-route]'))button.addEventListener('click',()=>{mode=button.dataset.route;index=0;render();});
$('#ao-next').addEventListener('click',()=>{if(index<buildFlow(kind,mode).length-1){index++;render();}});$('#ao-back').addEventListener('click',()=>{if(index>0){index--;render();}});$('#ao-restart').addEventListener('click',()=>{index=0;render();});
const resize=new ResizeObserver(()=>{if(parent!==window)parent.postMessage({type:'gateway-preview-height',height:Math.ceil(root.getBoundingClientRect().height)},location.origin);});resize.observe(root);
function stop(){animationEpoch++;cancelAnimationFrame(raf);clearTimeout(beatTimer);$('#ao-packet')?.setAttribute('hidden','');}document.addEventListener('visibilitychange',()=>{stop();if(!document.hidden)render();});reduced.addEventListener('change',render);window.addEventListener('pagehide',()=>{destroyed=true;stop();resize.disconnect();},{once:true});draw();render();
