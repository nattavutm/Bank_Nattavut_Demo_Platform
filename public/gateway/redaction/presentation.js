import { fixtureBody } from './fixture.js';
import { promptContext } from './prompt.js';
import { inspectRedaction } from './observation.js';

// Describe observed model input, independently of any expected policy result.
export function describeRedaction(mode, result) {
  const original = result?.originalText ?? fixtureBody;
  const context = promptContext(original);
  const total = context.fields.length;
  const observation = inspectRedaction(original, result?.receivedText, context.fields);
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
  } else if (live && total > 0 && confirmed === total) {
    if (masked === total) {
      title = 'Sensitive data masked before AI'; detail = `${masked} of ${total} tracked sensitive values replaced by redaction markers.`; tone = 'protected';
    } else if (visible === total) {
      title = 'Sensitive data reached AI'; detail = `All ${visible} tracked original values were submitted to the model.`; tone = 'exposed';
    } else {
      title = 'Some sensitive data still reached AI'; detail = `${masked} masked · ${visible} unchanged. Review the values below.`; tone = 'warning';
    }
  } else if (live) {
    title = total ? 'AI responded; masking is not confirmed' : 'AI response received';
    detail = total ? 'The received input does not establish the state of every tracked value.' : 'No labelled demo fields were found. Compare the raw inputs to inspect any changes.'; tone = total ? 'warning' : 'neutral';
  }
  return { ...observation, total, task: context.task, originalText: original, masked, visible, confirmed, live, blocked, title, detail, tone,
    taskPreserved: context.task ? live && result.summaryPreserved === true : null };
}

export function comparisonTakeaway(direct, gateway) {
  if (direct?.status !== 'Completed' || gateway?.status !== 'Completed') return null;
  const before = describeRedaction('direct', direct.result), after = describeRedaction('gateway', gateway.result);
  if (!before.live || !after.live || !before.total || before.originalText !== after.originalText || before.visible !== before.total || after.masked !== after.total) return null;
  return after.taskPreserved && before.taskPreserved
    ? { title: 'Less sensitive data. The refund task still works.', text: `Without Gateway, AI received all ${before.total} tracked original values. With Gateway, all ${after.total} were masked. Both summaries retained ${before.task.currency} ${before.task.amount} and ${before.task.purpose}.` }
    : { title: `All ${after.total} tracked sensitive values were masked.`, text: 'Masking is confirmed at the model input. Review the generated summaries; the task check was not confirmed in both answers.' };
}
