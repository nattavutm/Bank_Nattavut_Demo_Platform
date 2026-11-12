import { fixtureBody, fixtureFields } from './fixture.js';

export const MAX_PROMPT_LENGTH = 4000;
export function validatePrompt(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_PROMPT_LENGTH)
    throw new Error(`Enter a prompt between 1 and ${MAX_PROMPT_LENGTH} characters.`);
  return value;
}

// Track only explicitly labelled demo fields; this is not a local DLP detector.
export function promptContext(prompt = fixtureBody) {
  const fields = [];
  for (const field of fixtureFields) {
    const line = prompt.split(/\r?\n/).find(line => line.toLowerCase().startsWith(field.label.toLowerCase() + ':'));
    const value = line?.slice(line.indexOf(':') + 1).trim();
    if (value && !/^(?:\[REDACTED\]|\*{3,})$/.test(value)) fields.push({label:field.label,value});
  }
  // Task checks apply to the editable refund template, not arbitrary prose.
  const match = /^Demo refund\s*·\s*THB\s*([\d,]+(?:\.\d{1,2})?)\s*·\s*([^\r\n]+)/im.exec(prompt);
  const task = match ? {amount:match[1],currency:'THB',purpose:match[2].trim()} : null;
  return {fields,task};
}
export function checkTask(reply, task) {
  if (!task) return null;
  if (typeof reply !== 'string') return false;
  const amount = task.amount.replaceAll(',','');
  const escaped = amount.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const amountFound = new RegExp('(?:^|[^\\d.])'+escaped+'(?![\\d.])').test(reply.replaceAll(',',''));
  return amountFound && /\bTHB\b|Thai baht/i.test(reply) && reply.toLowerCase().includes(task.purpose.toLowerCase());
}
