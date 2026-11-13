// Shared product-level geometry. No deployment details, network calls or decisions.
export const VIEWBOX='0 0 1600 520';
export const nodes={
 application:[50,55,350,110,'Application / AI Agent'],
 vision:[50,250,350,110,'Vision One'],
 gateway:[760,205,350,175,'TrendAI AI Gateway'],
 model:[1330,55,230,110,'LLM Provider'],
 tools:[1330,305,230,110,'MCP Server'],
 primary:[1330,55,230,110,'Primary','LLM Provider'],
 backup:[1330,305,230,110,'Backup','LLM Provider'],
};
export const paths={
 'application-gateway':'M400 110 H690 Q710 110 710 130 V220 Q710 240 730 240 H760',
 'gateway-model':'M1110 240 H1150 Q1170 240 1170 220 V130 Q1170 110 1190 110 H1330',
 'gateway-tools':'M1110 330 H1150 Q1170 330 1170 345 Q1170 360 1190 360 H1330',
 'gateway-primary':'M1110 240 H1150 Q1170 240 1170 220 V130 Q1170 110 1190 110 H1330',
 'gateway-backup':'M1110 330 H1150 Q1170 330 1170 345 Q1170 360 1190 360 H1330',
 'direct-model':'M400 110 H1330',
 'direct-primary':'M400 110 H1330',
 'direct-tools':'M400 110 H690 Q710 110 710 130 V340 Q710 360 730 360 H1330',
 'vision-config':'M400 275 H760',
 'gateway-events':'M760 335 H400',
};
export const labels=[
 ['application-gateway direct-model direct-primary direct-tools','Requests / Responses',570,110,270],
 ['vision-config','Policy / Configuration',580,275,270],
 ['gateway-events','Events',580,335,270],
 ['gateway-model gateway-primary','Model requests',1220,110,190],
 ['gateway-tools','Tool calls / Results',1220,360,190],
 ['gateway-backup','Fallback requests',1220,360,190],
];
export const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function productDiagramMarkup(prefix='ao'){
 const esc=escapeText,marker=prefix+'-arrow';
 const boxes=Object.entries(nodes).map(([id,[x,y,w,h,title,sub]])=>{
  const cx=x+w/2,gateway=id==='gateway';
  return `<g class="gp-node ${gateway?'gp-gateway':''}" data-node="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24"/>${gateway?`<image href="/brand/guard-flow-symbol.png" x="${cx-24}" y="${y+19}" width="48" height="42"/>`:''}<text data-node-title x="${cx}" y="${y+(gateway?107:sub?45:65)}" text-anchor="middle">${esc(title)}</text><text class="gp-sub" data-node-detail x="${cx}" y="${y+81}" text-anchor="middle">${esc(sub)}</text></g>`;
 }).join('');
 return `<title id="${prefix}-diagram-title">TrendAI AI Gateway logical flow</title><desc id="${prefix}-diagram-desc"></desc><defs><marker id="${marker}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0 0 L7 3.5 L0 7Z" fill="context-stroke"/></marker></defs>
 <g>${Object.entries(paths).map(([id,d])=>`<path class="gp-edge ${['vision-config','gateway-events'].includes(id)?'gp-control':''}" data-edge="${id}" d="${d}"/>`).join('')}</g>
 ${boxes}
 ${labels.map(([ids,title,x,y,w])=>`<g class="gp-link-label" data-label-for="${ids}"><rect x="${x-w/2}" y="${y-21}" width="${w}" height="42" rx="21"/><text x="${x}" y="${y+7}" text-anchor="middle">${esc(title)}</text></g>`).join('')}
 <text id="${prefix}-controls" data-role="controls" class="gp-control-detail" text-anchor="middle" x="935" y="355"></text>
 <g class="gp-outcome" id="${prefix}-outcome" data-role="outcome" hidden><rect x="825" y="424" width="220" height="36" rx="15"/><text text-anchor="middle" x="935" y="448"></text></g>
 <g class="gp-outcome" data-role="resource" hidden><text text-anchor="middle" x="1445" y="448"></text></g>
 <g class="gp-outcome" id="${prefix}-payload" data-role="payload" hidden><rect x="700" y="478" width="860" height="34" rx="12"/><text text-anchor="middle" x="1130" y="501"></text></g>
 <circle id="${prefix}-packet" data-role="packet" class="gp-packet" r="6" hidden/>`;
}
export function setNodeDetail(svg,id,detail=''){
 const node=svg.querySelector(`[data-node="${id}"]`);if(!node)return;
 const gateway=id==='gateway',[,y]=nodes[id];
 node.querySelector('[data-node-detail]').textContent=detail;
 node.querySelector('[data-node-title]').setAttribute('y',y+(gateway?107:detail?45:65));
}
export function paintProductDiagram(svg,{visible,activeEdges=[],activeNodes=[],present,stopped,tag='',controls='',payload='',details={},resource=''}){
 const active=new Set(activeNodes),marker='url(#'+svg.dataset.prefix+'-arrow)';
 for(const el of svg.querySelectorAll('[data-node]')){
  const id=el.dataset.node;el.style.display=present.has(id)?'':'none';el.classList.toggle('is-active',active.has(id));el.classList.toggle('is-stopped',id===stopped);
  setNodeDetail(svg,id,details[id]??nodes[id][5]??'');
 }
 for(const el of svg.querySelectorAll('[data-edge]')){
  const id=el.dataset.edge,matches=activeEdges.filter(e=>e.id===id),control=['vision-config','gateway-events'].includes(id);
  el.style.display=visible.has(id)?'':'none';el.classList.toggle('is-active',matches.length>0);el.removeAttribute('marker-start');el.removeAttribute('marker-end');
  const directions=matches.length?matches:control?[{id}]:[{id},{id,reverse:true}];
  if(directions.some(e=>e.reverse))el.setAttribute('marker-start',marker);if(directions.some(e=>!e.reverse))el.setAttribute('marker-end',marker);
 }
 for(const el of svg.querySelectorAll('[data-label-for]'))el.style.display=el.dataset.labelFor.split(' ').some(id=>visible.has(id))?'':'none';
 svg.querySelector('[data-role="controls"]').textContent=controls;
 const outcome=svg.querySelector('[data-role="outcome"]');outcome.toggleAttribute('hidden',!tag);outcome.dataset.state=tag;outcome.querySelector('text').textContent=tag;
 const anchor=tag==='503'&&active.has('primary')?[1445,215]:!present.has('gateway')?[225,215]:[935,442];outcome.setAttribute('transform',`translate(${anchor[0]-935} ${anchor[1]-442})`);
 const box=svg.querySelector('[data-role="payload"]');box.toggleAttribute('hidden',!payload);box.querySelector('text').textContent=payload;
 const res=svg.querySelector('[data-role="resource"]');res.toggleAttribute('hidden',!resource);res.querySelector('text').textContent=resource;
}
