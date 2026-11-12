import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureBody, fixtureFields } from '../public/gateway/redaction/fixture.js';
import { describeRedaction, comparisonTakeaway } from '../public/gateway/redaction/presentation.js';
const masked = fixtureFields.reduce((body, f) => body.replace(f.value, '[REDACTED]'), fixtureBody);
const result = receivedText => ({receivedText, responseStatus:200, modelMode:'live', modelStatus:'completed', reply:'THB 1,250 for the Millennium Falcon parking fee.', summaryPreserved:true});
const run = receivedText => ({status:'Completed', result:result(receivedText)});
test('the presentation uses the observed input, never expected field claims',()=>{
 const direct=describeRedaction('direct',{...result(fixtureBody),fields:['masked','masked','masked','masked']});
 assert.equal(direct.visible,4); assert.equal(direct.tone,'exposed');
 const protectedResult=describeRedaction('gateway',result(masked));
 assert.equal(protectedResult.masked,4); assert.equal(protectedResult.taskPreserved,true); assert.equal(protectedResult.tone,'protected');
});
test('partial, missing, blocked and failed inference never become a complete masking success',()=>{
 assert.equal(describeRedaction('gateway',result(fixtureBody.replace(fixtureFields[0].value,'[REDACTED]'))).tone,'warning');
 assert.equal(describeRedaction('gateway',result(null)).tone,'warning');
 assert.equal(describeRedaction('gateway',{...result(masked),modelMode:'fixture'}).tone,'neutral');
 const denied=describeRedaction('gateway',{responseStatus:403,gatewayErrorCode:'policy_violation'});
 assert.equal(denied.blocked,true); assert.equal(denied.masked,0); assert.equal(denied.taskPreserved,false);
 assert.equal(describeRedaction('gateway',{responseStatus:403}).blocked,false);
});
test('comparison requires both completed live runs and distinguishes masking from task success',()=>{
 assert.equal(comparisonTakeaway(run(fixtureBody),null),null);
 assert.equal(comparisonTakeaway(run(fixtureBody),{...run(masked),status:'Submitting'}),null);
 assert.equal(comparisonTakeaway(run(fixtureBody),run(fixtureBody)),null);
 assert.match(comparisonTakeaway(run(fixtureBody),run(masked)).title,/refund task still works/);
 const changed=run(masked);changed.result.summaryPreserved=false;
 assert.equal(describeRedaction('gateway',changed.result).taskPreserved,false);
 assert.doesNotMatch(comparisonTakeaway(run(fixtureBody),changed).title,/task still works/);
});
