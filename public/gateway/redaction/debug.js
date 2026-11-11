// Only explicitly permitted result fields enter the UI or copied diagnostics.
// A missing receipt or non-2xx status is never promoted to a Gateway deny.
const fieldStates = new Set(["masked", "unmasked", "not confirmed", "no upstream receipt"]);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
import { fixtureBody, fixtureFields } from "./fixture.js";
import { inspectRedaction } from "./observation.js";
export { requestTemplate } from "./fixture.js";

export function diagnosticResult(value) {
  if (!value || typeof value !== "object") return null;
  const denied = Number.isInteger(value.gatewayStatus) && value.gatewayStatus >= 400 && value.gatewayStatus <= 599 &&
    value.gatewayErrorCode === "policy_violation";
  return {
    gatewayStatus: Number.isInteger(value.gatewayStatus) && value.gatewayStatus >= 200 && value.gatewayStatus <= 599
      ? value.gatewayStatus : null,
    gatewayRequestId: typeof value.gatewayRequestId === "string" && uuid.test(value.gatewayRequestId)
      ? value.gatewayRequestId : null,
    upstreamReceived: typeof value.upstreamReceived === "boolean" ? value.upstreamReceived : null,
    fields: Array.from({ length: 4 }, (_, i) => fieldStates.has(value.fields?.[i]) ? value.fields[i] : "not confirmed"),
    summaryPreserved: typeof value.summaryPreserved === "boolean" ? value.summaryPreserved : null,
    gatewayErrorCode: denied ? "policy_violation" : null,
    gatewayRuleIds: denied && Array.isArray(value.gatewayRuleIds) ? value.gatewayRuleIds.filter((rule) =>
      typeof rule === "string" && rule.length <= 96 &&
      /^(?:sensitive_information|harmful_content|prompt_attack)\.default\.[a-z0-9_]+$/.test(rule)).slice(0, 12) : [],
    policyDecision: denied ? "Block · policy_violation" : "Not reported by runner",
    matchedPolicy: "Not reported by runner",
    receivedText: inspectRedaction(fixtureBody, value.receivedText, fixtureFields).receivedText,
  };
}

export function diagnosticObservation(value) {
  if (!value) return "Run the test to inspect the observed result.";
  if (value.gatewayErrorCode === "policy_violation") {
    return value.upstreamReceived === false
      ? "Gateway returned a policy violation. No upstream receipt was observed for this request."
      : value.upstreamReceived === true
        ? "Gateway returned a policy violation, but an upstream receipt also exists. Inspect this conflicting evidence."
        : "Gateway returned a policy violation. Upstream delivery is not confirmed.";
  }
  if (value.upstreamReceived === true) {
    const unchanged = value.fields.filter((field) => field === "unmasked").length;
    const masked = value.fields.filter((field) => field === "masked").length;
    if (unchanged) return `${unchanged} of 4 original values reached the synthetic model. Protection is not confirmed for this run.`;
    if (masked === 4) return "All four fields were observed as masked at the synthetic model. Verify the policy decision in Vision One Events.";
    return "The synthetic model received a request. Masking is not confirmed for every field.";
  }
  return "No upstream receipt is available. This alone does not confirm a Gateway block.";
}
