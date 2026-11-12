import test from 'node:test';
import assert from 'node:assert/strict';
import {flowPlan} from '../public/gateway/case-flow-plan.js';

test('MCP deny illustrations stop before tool and ledger, then return on the same source connector',()=>{
 for(const kind of ['invoice','database']){
  const steps=flowPlan(kind,'with','attack');
  assert.deepEqual(steps,[{route:'source-gateway',reverse:false},{effect:'deny'},{route:'source-gateway',reverse:true},{effect:'done'}]);
 }
});
test('allowed reads and unprotected mutations traverse tools and ledger with an exact reverse return',()=>{
 for(const kind of ['invoice','database'])for(const mode of ['with','without'])for(const scenario of ['normal','attack']){
  if(mode==='with'&&scenario==='attack')continue;
  const steps=flowPlan(kind,mode,scenario),moves=steps.filter(x=>x.route),forward=moves.filter(x=>!x.reverse).map(x=>x.route),reverse=moves.filter(x=>x.reverse).map(x=>x.route);
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
  const moves=steps.filter(x=>x.route);for(const route of new Set(moves.map(x=>x.route)))assert.deepEqual(moves.filter(x=>x.route===route).map(x=>x.reverse),[false,true]);
 }
 assert.throws(()=>flowPlan('missing','with','attack'));
});
