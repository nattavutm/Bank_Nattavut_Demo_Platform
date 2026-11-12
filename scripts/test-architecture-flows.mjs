import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalog,buildFlow as compactFlow,unpackFlow,visibleEdges,topology} from '../public/gateway/architecture/flows.js';
const buildFlow=(...args)=>unpackFlow(compactFlow(...args));
const travel=steps=>steps.flatMap(s=>s.edges);
const flows=()=>catalog.flatMap(({id})=>['with','without'].flatMap(mode=>['guided','agent'].map(agent=>({id,mode,agent,steps:buildFlow(id,mode,agent)}))));
function endpoints(edge){const points=topology[edge.id];assert.ok(points,`Unknown edge: ${edge.id}`);return edge.reverse?points.toReversed():points;}
test('four top-level choices only, no hidden case submenus or stale identifiers',()=>{
 assert.deepEqual(catalog.map(c=>c.name),['Overview','Access Control','Guardrails','Routing Rules']);
 const ui=readFileSync(new URL('../public/gateway/architecture/app.js',import.meta.url),'utf8');assert.ok(!/ao-case-menu|aria-expanded|pointerenter/.test(ui));
 assert.throws(()=>buildFlow('invoice'));assert.throws(()=>buildFlow('overview','invalid'));assert.throws(()=>buildFlow('access','with','fake'));
 for(const {id,mode,agent,steps} of flows()){
  const compact=compactFlow(id,mode,agent);assert.ok(compact.length>=4&&compact.length<=6,`${id}/${mode}/${agent} exceeds presenter step budget`);
  assert.ok(compact.every(s=>s.title&&s.phase&&s.beats.length>0));assert.ok(steps.every(s=>s.title&&s.phase&&Array.isArray(s.nodes)&&Array.isArray(s.edges)));
  if(mode==='with'){assert.ok(compact[0].phase.startsWith('Configuration'));assert.ok(compact.at(-1).phase.startsWith('Telemetry'));}
 }
});
test('each animated sequence is connected; every request edge has a corresponding return',()=>{
 for(const {id,mode,agent,steps} of flows()){
  const label=`${id}/${mode}/${agent}`;
  for(const s of steps)for(let n=0;n<s.edges.length-1;n++)assert.equal(endpoints(s.edges[n])[1],endpoints(s.edges[n+1])[0],`${label}: disconnected sequence in ${s.title}`);
  const directions=new Map();
  for(const e of travel(steps).filter(e=>!['vision-config','gateway-events'].includes(e.id))){const values=directions.get(e.id)||new Set();values.add(Boolean(e.reverse));directions.set(e.id,values);}
  for(const [edge,values] of directions)assert.equal(values.size,2,`${label}: missing outbound or return on ${edge}`);
 }
});
test('overview completes Browser/Model and Agent/MCP round trips separately, using the originating branch',()=>{
 for(const mode of ['with','without']){
  const flow=buildFlow('overview',mode),routes=travel(flow);
  for(const edge of ['browser-compute','agent-compute',mode==='with'?'gateway-model':'direct-model',mode==='with'?'gateway-tools':'direct-tools'])assert.deepEqual(routes.filter(e=>e.id===edge).map(e=>Boolean(e.reverse)),[false,true]);
  const browserReply=flow.findIndex(s=>s.phase==='Response'&&s.edges.some(e=>e.id==='browser-compute'&&e.reverse));
  const agentSend=flow.findIndex(s=>s.edges.some(e=>e.id==='agent-compute'&&!e.reverse));assert.ok(agentSend>browserReply,'Do not multicast a single response to both origins');
  const lastReply=flow.findLast(s=>s.phase==='Response');assert.equal(lastReply.edges.at(-1).id,'agent-compute');assert.equal(lastReply.edges.at(-1).reverse,true);
 }
});
test('policy configuration precedes request evaluation; Events are out-of-band telemetry, never a precondition',()=>{
 for(const {id,mode,steps} of flows()){
  if(mode==='without'){assert.ok(!travel(steps).some(e=>/gateway|vision/.test(e.id)));assert.ok(!visibleEdges(id,mode).has('vision-config'));continue;}
  assert.ok(steps[0].phase.startsWith('Configuration'));assert.deepEqual(steps[0].edges,[{id:'vision-config'}]);
  const firstRequest=steps.findIndex(s=>s.phase==='Request');const eventSteps=steps.filter(s=>s.edges.some(e=>e.id==='gateway-events'));
  assert.equal(eventSteps.length,1);assert.equal(eventSteps[0].phase,'Telemetry · Out of band');assert.ok(steps.indexOf(eventSteps[0])>firstRequest);
  assert.ok(steps.filter(s=>s.phase==='Request'||s.phase==='Response').every(s=>!s.edges.some(e=>/vision|events/.test(e.id))));
 }
 const check=buildFlow('overview').find(s=>s.tag==='Evaluate');assert.equal(check.title,'Access Control → Routing Rules → Guardrails');
});
test('access permits a read-only round trip, then denies a restricted tool before upstream invocation',()=>{
 for(const agent of ['guided','agent']){
  const steps=buildFlow('access','with',agent),deny=steps.findIndex(s=>s.stopped==='tools');assert.ok(deny>0);
  assert.deepEqual(travel(steps).filter(e=>e.id==='gateway-tools').map(e=>Boolean(e.reverse)),[false,true]);
  assert.ok(!travel(steps.slice(deny)).some(e=>e.id==='gateway-tools'));
  assert.ok(steps.slice(deny).some(s=>s.edges.some(e=>e.id===(agent==='agent'?'agent-compute':'browser-compute')&&e.reverse)));
  assert.deepEqual(travel(steps).filter(e=>e.id==='agent-model').map(e=>Boolean(e.reverse)),agent==='agent'?[false,true,false,true]:[]);
  if(agent==='agent')assert.equal(steps.findLast(s=>s.phase==='Response').edges.at(-1).id,'browser-compute');
 }
 assert.ok(buildFlow('access','without').some(s=>s.tag==='Demo action'));
});
test('guardrails redact before inference, inspect response before delivery, and do not send the denied request to the model',()=>{
 const steps=buildFlow('guardrails'),redact=steps.findIndex(s=>s.tag==='Redact'),request=steps.findIndex(s=>s.edges.some(e=>e.id==='gateway-model'&&!e.reverse));assert.ok(redact<request&&redact>=0);
 const responseCheck=steps.findIndex(s=>s.controls==='Response inspection'),deliver=steps.findIndex(s=>s.tag==='Answer');assert.ok(responseCheck>request&&responseCheck<deliver);
 const deny=steps.findIndex(s=>s.stopped==='model');assert.ok(deny>deliver);assert.ok(!travel(steps.slice(deny)).some(e=>e.id==='gateway-model'));
 assert.ok(buildFlow('guardrails','without').some(s=>s.badge?.includes('may still refuse')));
});
test('routing returns primary error to Gateway before Backup and returns Backup response to Browser',()=>{
 const flow=buildFlow('routing'),failure=flow.findIndex(s=>s.tag==='503'),fallback=flow.findIndex(s=>s.tag==='Fallback'),backup=flow.findIndex(s=>s.edges.some(e=>e.id==='gateway-backup'&&!e.reverse));assert.ok(failure<fallback&&fallback<backup);
 assert.deepEqual(flow[failure].edges,[{id:'gateway-primary',reverse:true}]);assert.deepEqual(flow.find(s=>s.tag==='Answer').edges.map(e=>e.id),['gateway-backup','compute-gateway','browser-compute']);
 const direct=buildFlow('routing','without');assert.ok(!travel(direct).some(e=>e.id.includes('backup')));assert.ok(!direct.some(s=>s.tag==='Answer'));
});
