import test from 'node:test';
import assert from 'node:assert/strict';
import {nodes,paths,labels} from '../public/gateway/product-diagram.js';
import {readFileSync} from 'node:fs';
import {catalog,buildFlow,unpackFlow,visibleEdges,topology} from '../public/gateway/architecture/flows.js';
const detailed=(...args)=>unpackFlow(buildFlow(...args));
const travel=steps=>steps.flatMap(s=>s.edges);
const variants=()=>catalog.flatMap(({id})=>['with','without'].map(mode=>({id,mode,steps:detailed(id,mode)})));
const endpoints=e=>{assert.ok(topology[e.id],`Unknown edge ${e.id}`);return e.reverse?topology[e.id].toReversed():topology[e.id];};
test('four direct categories, each with six or four steps and no deployment-specific labels',()=>{
 assert.deepEqual(catalog.map(c=>c.name),['Overview','Access Control','Guardrails','Routing Rules']);
 assert.throws(()=>buildFlow('missing'));assert.throws(()=>buildFlow('overview','invalid'));
 const app=readFileSync(new URL('../public/gateway/architecture/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/gateway/architecture/index.html',import.meta.url),'utf8');
 const flows=readFileSync(new URL('../public/gateway/architecture/flows.js',import.meta.url),'utf8');
 assert.ok(!/Workers AI|Cloudflare|AWS|EKS|MCP \+ D1|App \/ Compute|Worker runtime|Runs in the Worker|Guided|Live Agent/.test(app+html+flows));
 assert.ok(!/ao-case-menu|aria-expanded|pointerenter/.test(app));
 for(const {id,mode} of variants()){
  const steps=buildFlow(id,mode);assert.equal(steps.length,mode==='with'?6:4);
  assert.ok(steps.every(s=>s.title&&s.phase&&s.beats.length>0));
 }
});
test('all animated connections are continuous and every data request has a return',()=>{
 for(const {id,mode,steps} of variants()){
  for(const s of steps){assert.ok(s.nodes.every(n=>['application','gateway','model','tools','primary','backup','vision'].includes(n)));
   for(let i=1;i<s.edges.length;i++)assert.equal(endpoints(s.edges[i-1])[1],endpoints(s.edges[i])[0],`${id}/${mode}: disconnected sequence`);
  }
  const balance=new Map();
  for(const e of travel(steps).filter(e=>!['vision-config','gateway-events'].includes(e.id)))balance.set(e.id,(balance.get(e.id)??0)+(e.reverse?-1:1));
  for(const [id,total]of balance)assert.equal(total,0,`Missing return leg on ${id}`);
 }
});
test('overview keeps model and MCP transactions separate, returning both to the same application or agent',()=>{
 for(const mode of ['with','without']){
  const flow=detailed('overview',mode),moves=travel(flow),model=mode==='with'?'gateway-model':'direct-model',tools=mode==='with'?'gateway-tools':'direct-tools';
  for(const edge of [model,tools])assert.deepEqual(moves.filter(e=>e.id===edge).map(e=>Boolean(e.reverse)),[false,true]);
  const modelReturn=flow.findIndex(s=>s.phase==='Response'&&s.edges.some(e=>e.id===model));
  const toolRequest=flow.findIndex(s=>s.edges.some(e=>e.id===tools&&!e.reverse));assert.ok(toolRequest>modelReturn);
  for(const s of flow.filter(s=>s.phase==='Response'))assert.equal(endpoints(s.edges.at(-1))[1],'application');
 }
});
test('management and telemetry never become prompt-processing hops; direct paths exclude Gateway',()=>{
 for(const {id,mode,steps}of variants()){
  if(mode==='without'){assert.ok(!travel(steps).some(e=>/gateway|vision/.test(e.id)));assert.ok(!visibleEdges(id,mode).has('vision-config'));continue;}
  assert.deepEqual(steps[0].edges,[{id:'vision-config'}]);assert.ok(steps[0].phase.startsWith('Configuration'));
  assert.deepEqual(steps.at(-1).edges,[{id:'gateway-events'}]);assert.ok(steps.at(-1).phase.startsWith('Telemetry'));
  assert.ok(steps.filter(s=>s.phase==='Request'||s.phase==='Response').every(s=>!s.edges.some(e=>/vision|events/.test(e.id))));
 }
});
test('access allows one tool round trip and stops a denied call before MCP; direct does not guarantee successful execution',()=>{
 const flow=detailed('access'),deny=flow.findIndex(s=>s.stopped==='tools');assert.ok(deny>0);
 assert.deepEqual(travel(flow).filter(e=>e.id==='gateway-tools').map(e=>Boolean(e.reverse)),[false,true]);
 assert.ok(!travel(flow.slice(deny)).some(e=>e.id==='gateway-tools'));assert.ok(flow.slice(deny).some(s=>s.edges.some(e=>e.id==='application-gateway'&&e.reverse)));
 const direct=detailed('access','without');assert.ok(direct.some(s=>s.badge?.includes('server’s own authorization')));assert.ok(!direct.some(s=>s.tag==='Demo action'));
});
test('guardrails redact before inference, check the response before delivery and block a separate prompt before the model',()=>{
 const flow=detailed('guardrails'),redact=flow.findIndex(s=>s.tag==='Redact'),infer=flow.findIndex(s=>s.edges.some(e=>e.id==='gateway-model'&&!e.reverse));assert.ok(redact>=0&&redact<infer);
 const check=flow.findIndex(s=>s.controls==='Response inspection · Assigned policy'),deliver=flow.findIndex(s=>s.tag==='Answer');assert.ok(check>infer&&check<deliver);
 const denied=flow.findIndex(s=>s.stopped==='model');assert.ok(denied>deliver);assert.ok(!travel(flow.slice(denied)).some(e=>e.id==='gateway-model'));
 assert.ok(detailed('guardrails','without').some(s=>s.badge?.includes('may still refuse')));
});
test('fallback waits for a primary error, routes to Backup and returns its response; no Gateway fallback on direct paths',()=>{
 const flow=detailed('routing'),error=flow.findIndex(s=>s.tag==='503'),fallback=flow.findIndex(s=>s.tag==='Fallback'),backup=flow.findIndex(s=>s.edges.some(e=>e.id==='gateway-backup'&&!e.reverse));assert.ok(error<fallback&&fallback<backup);
 assert.deepEqual(flow[error].edges,[{id:'gateway-primary',reverse:true}]);assert.deepEqual(flow.find(s=>s.tag==='Answer').edges.map(e=>e.id),['gateway-backup','application-gateway']);
 const direct=detailed('routing','without');assert.ok(!travel(direct).some(e=>e.id.includes('backup')));assert.ok(!direct.some(s=>s.tag==='Answer'));
});

test('Vision One and application share proportions; management labels share width and alignment with safe node clearance',()=>{
 assert.equal(nodes.application[0],nodes.vision[0]);assert.equal(nodes.application[2],nodes.vision[2]);assert.equal(nodes.application[3],nodes.vision[3]);
 const config=labels.find(l=>l[0]==='vision-config'),events=labels.find(l=>l[0]==='gateway-events');assert.equal(config[2],events[2]);assert.equal(config[2],(nodes.vision[0]+nodes.vision[2]+nodes.gateway[0])/2);assert.equal(config[4],events[4]);assert.ok(events[3]-config[3]>=60);
 for(const [,label,x,y,w]of labels)for(const [id,[nx,ny,nw,nh]]of Object.entries(nodes)){
  const overlap=x-w/2<nx+nw&&x+w/2>nx&&y-21<ny+nh&&y+21>ny;assert.equal(overlap,false,`${label} overlaps ${id}`);
 }
 assert.ok(Object.keys(topology).every(id=>paths[id]),'Every architecture connection uses the common geometry');
});
test('all case diagrams and the overview use the same product renderer, including Mask Data',()=>{
 const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 assert.ok(file('../public/gateway/architecture/app.js').includes('productDiagramMarkup'));
 assert.ok(file('../public/gateway/case-explainer.js').includes('productDiagramMarkup'));
 assert.ok(file('../public/gateway/redaction/mask-explainer.js').includes("mountCaseExplainer(host,'mask')"));
});
