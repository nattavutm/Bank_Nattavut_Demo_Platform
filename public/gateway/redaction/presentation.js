import { fixtureBody, fixtureFields } from './fixture.js';
import { inspectRedaction } from './observation.js';

// Describe observed model input, independently of any expected policy result.
export function describeRedaction(mode, result) {
  const observation = inspectRedaction(fixtureBody, result?.receivedText, fixtureFields);
  const masked = observation.fields.filter(state => state === 'masked').length;
  const visible = observation.fields.filter(state => state === 'unmasked').length;
  const confirmed = masked + visible;
  const live = result?.modelMode === 'live' && result?.modelStatus === 'completed' &&
    result?.responseStatus >= 200 && result?.responseStatus < 300 && Boolean(result?.reply?.trim());
  const blocked = mode === 'gateway' && result?.gatewayErrorCode === 'policy_violation' && result?.responseStatus >= 400;
  let title = 'Model delivery not confirmed', detail = 'Review the request evidence before drawing a conclusion.', tone = 'neutral';
  if (blocked) {
    title = 'Gateway denied this request';
    detail = 'This run did not demonstrate masking and successful delivery.'; tone = 'warning';
  } else if (live && confirmed === fixtureFields.length) {
    if (masked === fixtureFields.length) {
      title = 'Sensitive data masked before AI'; detail = `${masked} of ${fixtureFields.length} sensitive values replaced by redaction markers.`; tone = 'protected';
    } else if (visible === fixtureFields.length) {
      title = 'Sensitive data reached AI'; detail = `All ${visible} original values were submitted to the model.`; tone = 'exposed';
    } else {
      title = 'Some sensitive data still reached AI'; detail = `${masked} masked · ${visible} unchanged. Review the values below.`; tone = 'warning';
    }
  } else if (live) {
    title = 'AI responded; masking is not confirmed';
    detail = 'The received input does not establish the state of every sensitive value.'; tone = 'warning';
  }
  return { ...observation, masked, visible, confirmed, live, blocked, title, detail, tone,
    taskPreserved: live && result.summaryPreserved === true };
}

export function comparisonTakeaway(direct, gateway) {
  if (direct?.status !== 'Completed' || gateway?.status !== 'Completed') return null;
  const before = describeRedaction('direct', direct.result), after = describeRedaction('gateway', gateway.result);
  if (!before.live || !after.live || before.visible !== fixtureFields.length || after.masked !== fixtureFields.length) return null;
  return after.taskPreserved && before.taskPreserved
    ? { title: 'Less sensitive data. The refund task still works.', text: 'Without Gateway, AI received all 4 original values. With Gateway, all 4 were masked. Both summaries retained THB 1,250 and the Millennium Falcon parking fee.' }
    : { title: 'All 4 sensitive values were masked.', text: 'Masking is confirmed at the model input. Review the generated summaries: the refund amount and purpose were not confirmed in both answers.' };
}
