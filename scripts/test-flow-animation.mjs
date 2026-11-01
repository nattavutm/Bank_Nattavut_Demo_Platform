import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context={window:{}};vm.runInNewContext(readFileSync(new URL('../public/flow-animation.js',import.meta.url),'utf8'),context);
const {position,travelMs,createTimeline,speed}=context.window.FlowAnimation;
test('physical velocity is constant for unequal connector lengths and reverse travel',()=>{
  for(const length of [80,230,600]) {
    assert.equal(position(length,200),speed*.2);
    assert.equal(position(length,200,true),length-speed*.2);
    assert.equal(position(length,travelMs(length)),length);
    assert.equal(position(length,travelMs(length),true),0);
  }
  assert.equal(position(80,10000),80);
});
function fixture() {
  let callback,steps=0,value=0,duration=1000;
  const timeline=createTimeline({duration:()=>duration,advance:()=>steps++,paint:n=>value=n,raf:fn=>{callback=fn;return 1;},caf:()=>{callback=null;}});
  return {timeline,tick:time=>callback(time),get steps(){return steps;},get value(){return value;},set duration(n){duration=n;}};
}
test('pause and resume retain progress without counting paused wall time',()=>{
  const f=fixture();f.timeline.resume();f.tick(100);f.tick(400);assert.equal(f.value,300);
  f.timeline.pause();f.timeline.resume();f.tick(20000);assert.equal(f.value,300);
  f.tick(20200);assert.equal(f.value,500);assert.equal(f.steps,0);f.timeline.destroy();
});
test('resize preserves normalized position and completes only at the new endpoint',()=>{
  const f=fixture();f.timeline.resume();f.tick(0);f.tick(400);
  f.duration=2000;f.timeline.resize(1000,2000);assert.equal(f.value,800);
  f.tick(500);assert.equal(f.value,800);f.tick(1600);assert.equal(f.steps,0);
  f.tick(1700);assert.equal(f.steps,1);assert.equal(f.value,0);f.timeline.destroy();
});
test('reset restarts from the origin with no stale elapsed time',()=>{
  const f=fixture();f.timeline.resume();f.tick(0);f.tick(700);f.timeline.reset();assert.equal(f.value,0);
  f.tick(1200);assert.equal(f.value,0);f.tick(1400);assert.equal(f.value,200);f.timeline.destroy();
});
test('traveler and pulse use the same measured position, including the reversed return',()=>{
  const attributes={};
  const path={getTotalLength:()=>300,getPointAtLength:x=>({x,y:20})};
  const circle={setAttribute:(k,v)=>{attributes[k]=v;}};
  const pulse={setAttribute:(k,v)=>{attributes[k]=v;}};
  const group={dataset:{},querySelector:s=>s==='.ge-pipe-track'?path:s==='.ge-traveler'?circle:pulse};
  context.window.FlowAnimation.moveRoute(group,400);
  assert.equal(attributes.cx,60);assert.equal(attributes['stroke-dashoffset'],-38);
  context.window.FlowAnimation.moveRoute(group,400,true);
  assert.equal(attributes.cx,240);assert.equal(attributes['stroke-dashoffset'],-240);
});
