import {catalog,buildFlow,visibleEdges,unpackFlow} from './flows.js';
const $=s=>document.querySelector(s),svg=$('#ao-diagram'),root=$('#architecture-app');
let kind='overview',mode='with',agent='guided',index=0,raf=0,beatTimer=0,animationEpoch=0,destroyed=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={browser:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18m-14-3h1m3 0h1"/>',app:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18M8 3v6M8 14h3m-3 3h7"/>',agent:'<rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 3v4M8 12v2m8-2v2M9 17h6"/>',tool:'<path d="m7 7-4 5 4 5m10-10 4 5-4 5m-3-13-4 16"/>',cloud:'<path d="M6 18h12a4 4 0 0 0 1-8 7 7 0 0 0-13-2 5 5 0 0 0 0 10Z"/>',key:'<circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-3-3 3-3m-6 0 3-3"/>',model:'<path d="m12 3 9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5m-9 5v8"/>',database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',vision:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'};
function icon(type,x,y,size=26){return `<svg class="ao-icon" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[type]||icons.app}</svg>`;}
const nodes={
 browser:[35,170,230,100,'Browser','Web interface','browser'],
 agent:[35,350,230,100,'AI Agent','Runs in the Worker','agent'],
 compute:[390,205,250,245,'App / Compute','Worker runtime','app'],
 gateway:[765,205,250,245,'AI Gateway','AWS · EKS',''],
 model:[1165,145,240,125,'Workers AI','LLM runtime','model'],
 tools:[1165,350,240,125,'Tools / Data','MCP + D1','tool'],
 primary:[1165,145,240,125,'Primary','Workers AI','model'],
 backup:[1165,350,240,125,'Backup','Workers AI','model'],
 vision:[765,25,250,85,'Vision One','Management / Events','vision'],
};
const paths={
 'browser-compute':'M265 220 H310 Q330 220 330 240 V305 Q330 325 350 325 H390',
 'agent-compute':'M265 400 H310 Q330 400 330 380 V345 Q330 325 350 325 H390',
 'compute-gateway':'M640 325 H765',
 'gateway-model':'M1015 325 H1070 Q1090 325 1090 305 V228 Q1090 208 1110 208 H1165',
 'gateway-tools':'M1015 325 H1070 Q1090 325 1090 345 V392 Q1090 412 1110 412 H1165',
 'gateway-primary':'M1015 325 H1070 Q1090 325 1090 305 V228 Q1090 208 1110 208 H1165',
 'gateway-backup':'M1015 325 H1070 Q1090 325 1090 345 V392 Q1090 412 1110 412 H1165',
 'direct-model':'M515 205 V163 Q515 143 535 143 H1100 Q1120 143 1120 163 V188 Q1120 208 1140 208 H1165',
 'direct-primary':'M515 205 V163 Q515 143 535 143 H1100 Q1120 143 1120 163 V188 Q1120 208 1140 208 H1165',
 'direct-tools':'M515 450 V502 Q515 522 535 522 H1100 Q1120 522 1120 502 V432 Q1120 412 1140 412 H1165',
 'agent-model':'M150 450 V552 Q150 572 170 572 H1405 Q1425 572 1425 552 V228 Q1425 208 1405 208',
 'vision-config':'M855 110 V205',
 'gateway-events':'M925 205 V110',
};
function node(id){const [x,y,w,h,title,sub,type]=nodes[id],large=['compute','gateway'].includes(id),vision=id==='vision',cx=x+w/2;
 const symbol=id==='gateway'?`<image href="/brand/guard-flow-symbol.png" x="${cx-28}" y="${y+47}" width="56" height="49"/>`:icon(type,large?cx-19:x+20,large?y+55:y+20,large?38:28);
 return `<g class="ao-node ${id==='gateway'?'ao-gateway':''}" data-node="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${large?26:22}"/>${symbol}<text data-node-title x="${large?cx:x+62}" y="${y+(large?143:42)}" text-anchor="${large?'middle':'start'}" style="font-size:${large?30:25}px">${esc(title)}</text><text class="ao-sub" x="${large?cx:x+20}" y="${y+(large?181:vision?68:80)}" text-anchor="${large?'middle':'start'}">${esc(sub)}</text></g>`;
}
function draw(){
 svg.innerHTML=`<title id="ao-diagram-title">High-level AI Gateway architecture</title><desc id="ao-diagram-desc"></desc><defs><marker id="ao-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0 0 L7 3.5 L0 7Z" fill="context-stroke"/></marker></defs>
 <text class="ao-column" x="35" y="125">Request source</text><text class="ao-column" x="390" y="175">Application</text><text class="ao-column" x="1165" y="110">Destinations</text>
 <g id="ao-edges">${Object.entries(paths).map(([id,d])=>`<path class="ao-edge ${id==='vision-config'||id==='gateway-events'?'ao-control':''}" data-edge="${id}" d="${d}" marker-end="url(#ao-arrow)"/>`).join('')}</g>
 <g class="ao-management-labels"><text x="840" y="154" text-anchor="end">Policies</text><text x="945" y="177">Events</text></g>
 ${Object.keys(nodes).map(node).join('')}
 <text id="ao-controls" class="ao-control-detail" text-anchor="middle" x="890" y="420"></text>
 <g class="ao-outcome" id="ao-outcome" hidden><rect x="777" y="468" width="226" height="40" rx="15"/><text text-anchor="middle" x="890" y="494"></text></g>
 <g class="ao-outcome" id="ao-payload" hidden><rect x="747" y="532" width="658" height="40" rx="12"/><text text-anchor="middle" x="1076" y="558"></text></g>
 <circle id="ao-packet" class="ao-packet" r="6" hidden/>`;
}

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
 const visible=visibleEdges(kind,mode,agent),active=new Set(current.nodes),present=new Set(unpackFlow(steps).flatMap(s=>s.nodes));
 $('#ao-agent-options').hidden=kind!=='access';
 for(const b of document.querySelectorAll('[data-route]'))b.setAttribute('aria-pressed',String(b.dataset.route===mode));
 for(const b of document.querySelectorAll('[data-agent]'))b.setAttribute('aria-pressed',String(b.dataset.agent===agent));
 for(const el of svg.querySelectorAll('[data-node]')){el.classList.toggle('is-active',active.has(el.dataset.node));el.classList.toggle('is-stopped',el.dataset.node===current.stopped);}
 svg.querySelector('[data-node="compute"] [data-node-title]').textContent='App / Compute';
 $('#ao-controls').textContent=current.controls??'';$('#ao-controls').style.display=mode==='with'?'':'none';
 svg.querySelector('.ao-management-labels').style.display=mode==='with'?'':'none';
 for(const el of svg.querySelectorAll('[data-node]')){
  const id=el.dataset.node;el.style.display=present.has(id)?'':'none';
 }
 for(const el of svg.querySelectorAll('[data-edge]')){
  const id=el.dataset.edge,matches=current.edges.filter(e=>e.id===id),directions=matches.length?matches:unpackFlow(steps).flatMap(s=>s.edges).filter(e=>e.id===id);
  el.style.display=visible.has(id)?'':'none';el.classList.toggle('is-active',matches.length>0);
  el.removeAttribute('marker-start');el.removeAttribute('marker-end');
  if(directions.some(e=>e.reverse))el.setAttribute('marker-start','url(#ao-arrow)');
  if(directions.some(e=>!e.reverse))el.setAttribute('marker-end','url(#ao-arrow)');
 }
 const outcome=$('#ao-outcome');outcome.toggleAttribute('hidden',!current.tag);outcome.dataset.state=current.tag??'';outcome.querySelector('text').textContent=current.tag??'';const anchor=current.tag==='Propose'?[150,490]:current.tag==='503'?[1285,300]:['Demo action','No action'].includes(current.tag)?[1285,510]:mode==='without'?[515,490]:[890,490];outcome.setAttribute('transform',`translate(${anchor[0]-890} ${anchor[1]-488})`);
 const payload=$('#ao-payload');payload.toggleAttribute('hidden',!current.badge);payload.querySelector('text').textContent=current.badge??'';
 $('#ao-diagram-desc').textContent=`${catalog.find(c=>c.id===kind).name}. ${mode==='with'?'With':'Without'} Gateway. ${steps[index].title}. ${current.title}. Logical roles; illustration only.`;
 const notes={overview:'Logical roles · App, AI Agent and MCP share the Worker runtime.',access:mode==='with'?'Gateway checks tool access before MCP execution.':'Direct MCP calls · Gateway does not block the restricted demo tools.',guardrails:'Assigned policy controls request and response inspection.',routing:'Controlled failure · Primary and Backup use the same Workers AI model.'};$('#ao-note').textContent=current.phase.startsWith('Configuration')?'Policy configuration is separate from request traffic.':current.phase.startsWith('Telemetry')?'Events are telemetry, not a request approval step. Delivery timing is not illustrated.':notes[kind];
}
function render(){
 stop();const epoch=animationEpoch,steps=buildFlow(kind,mode,agent),current=steps[index],beats=current.beats;
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
for(const button of document.querySelectorAll('[data-agent]'))button.addEventListener('click',()=>{agent=button.dataset.agent;index=0;render();});
$('#ao-next').addEventListener('click',()=>{if(index<buildFlow(kind,mode,agent).length-1){index++;render();}});$('#ao-back').addEventListener('click',()=>{if(index>0){index--;render();}});$('#ao-restart').addEventListener('click',()=>{index=0;render();});
const resize=new ResizeObserver(()=>{if(parent!==window)parent.postMessage({type:'gateway-preview-height',height:Math.ceil(root.getBoundingClientRect().height)},location.origin);});resize.observe(root);
function stop(){animationEpoch++;cancelAnimationFrame(raf);clearTimeout(beatTimer);$('#ao-packet')?.setAttribute('hidden','');}document.addEventListener('visibilitychange',()=>{stop();if(!document.hidden)render();});reduced.addEventListener('change',render);window.addEventListener('pagehide',()=>{destroyed=true;stop();resize.disconnect();},{once:true});draw();render();
