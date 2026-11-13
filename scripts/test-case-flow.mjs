import test from 'node:test';
import assert from 'node:assert/strict';
import {flowPlan} from '../public/gateway/case-flow-plan.js';

test('MCP deny illustrations stop before the MCP service, then return on the same source connector',()=>{
 for(const kind of ['invoice','database']){
  const steps=flowPlan(kind,'with','attack');
  assert.deepEqual(steps,[{route:'source-gateway',reverse:false},{effect:'deny'},{route:'source-gateway',reverse:true},{route:'gateway-events',reverse:false},{effect:'done'}]);
 }
});
test('allowed reads and unprotected mutations traverse the MCP service with an exact reverse return',()=>{
 for(const kind of ['invoice','database'])for(const mode of ['with','without'])for(const scenario of ['normal','attack']){
  if(mode==='with'&&scenario==='attack')continue;
  const steps=flowPlan(kind,mode,scenario),moves=steps.filter(x=>x.route&&x.route!=='gateway-events'),forward=moves.filter(x=>!x.reverse).map(x=>x.route),reverse=moves.filter(x=>x.reverse).map(x=>x.route);
  assert.deepEqual(reverse,forward.toReversed());
  assert.equal(steps.some(x=>x.effect==='commit'),scenario==='attack');
  assert.equal(steps.some(x=>x.effect==='deny'),false);
 }
});
test('fallback illustration tries Primary before Backup; direct and normal routes never call Backup',()=>{
 for(const mode of ['with','without'])for(const scenario of ['normal','attack']){
  const steps=flowPlan('fallback',mode,scenario),backup=steps.findIndex(x=>x.route==='gateway-backup');
  assert.equal(backup>=0,mode==='with'&&scenario==='attack');
  if(backup>=0)assert.ok(steps.findIndex(x=>x.effect==='primary-error')<backup);
  const moves=steps.filter(x=>x.route&&x.route!=='gateway-events');for(const route of new Set(moves.map(x=>x.route)))assert.deepEqual(moves.filter(x=>x.route===route).map(x=>x.reverse),[false,true]);
 }
 assert.throws(()=>flowPlan('missing','with','attack'));
});
test('email and model access illustrations stop denied requests before inference and reverse allowed routes',()=>{
 for(const kind of ['email','models']){
  assert.deepEqual(flowPlan(kind,'with','attack'),[{route:'source-gateway',reverse:false},{effect:'deny'},{route:'source-gateway',reverse:true},{route:'gateway-events',reverse:false},{effect:'done'}]);
  for(const mode of ['with','without'])for(const scenario of ['normal',...(kind==='models'?['authorized']:[])]){
   const steps=flowPlan(kind,mode,scenario),moves=steps.filter(x=>x.route&&x.route!=='gateway-events');
   assert.deepEqual(moves.filter(x=>x.reverse).map(x=>x.route),moves.filter(x=>!x.reverse).map(x=>x.route).toReversed());
   assert.ok(steps.some(x=>x.effect==='answer'));assert.equal(steps.some(x=>x.effect==='deny'),false);
  }
 }
 assert.throws(()=>flowPlan('email','with','authorized'));
});

test('masking occurs before inference and response inspection precedes delivery; Events follow the data round trip',()=>{
 for(const kind of ['mask','email','models','invoice','database','fallback'])for(const mode of ['with','without'])for(const scenario of ['normal','attack']){
  const flow=flowPlan(kind,mode,scenario),events=flow.findIndex(s=>s.route==='gateway-events');
  if(mode==='with'){assert.ok(events>flow.findLastIndex(s=>s.route==='source-gateway'&&s.reverse));assert.ok(!flow.slice(0,events).some(s=>s.route==='vision-config'));}
  else assert.equal(events,-1);
 }
 const flow=flowPlan('mask','with','attack');
 assert.ok(flow.findIndex(s=>s.effect==='redact')<flow.findIndex(s=>s.route==='gateway-model'));
 assert.ok(flow.findIndex(s=>s.effect==='response-allow')>flow.findIndex(s=>s.route==='gateway-model'&&s.reverse));
 assert.ok(flow.findIndex(s=>s.effect==='response-allow')<flow.findIndex(s=>s.route==='source-gateway'&&s.reverse));
 assert.ok(!flowPlan('mask','without','attack').some(s=>s.effect==='redact'));
});
