// Only explicitly permitted result fields enter the UI or copied diagnostics.
// A missing receipt or non-2xx status is never promoted to a Gateway deny.
const fieldStates = new Set(["masked", "unmasked", "not confirmed", "no upstream receipt"]);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// This is the configured fixture template, not an observed network capture.
export const requestTemplate = {
  model: "r5r5-summary",
  messages: [
    { role: "system", content: "Demo run: <created by EKS runner>" },
    { role: "user", content: [
      "Demo refund · THB 1,250 · Millennium Falcon parking fee",
      "Payment card: 4111 1111 1111 1111",
      "Leia's contact email: leia.organa@example.com",
      "Rebel dispatch phone: +1 202-555-0142",
      "Hangar API Authorization: Basic cjJkMjpERU1PLU5PVC1BLVJFQUwtU0VDUkVU",
    ].join("\n") },
  ],
};

export function diagnosticResult(value) {
  if (!value || typeof value !== "object") return null;
  return {
    gatewayStatus: Number.isInteger(value.gatewayStatus) && value.gatewayStatus >= 200 && value.gatewayStatus <= 599
      ? value.gatewayStatus : null,
    gatewayRequestId: typeof value.gatewayRequestId === "string" && uuid.test(value.gatewayRequestId)
      ? value.gatewayRequestId : null,
    upstreamReceived: typeof value.upstreamReceived === "boolean" ? value.upstreamReceived : null,
    fields: Array.from({ length: 4 }, (_, i) => fieldStates.has(value.fields?.[i]) ? value.fields[i] : "not confirmed"),
    summaryPreserved: typeof value.summaryPreserved === "boolean" ? value.summaryPreserved : null,
    policyDecision: "Not reported by runner",
    matchedPolicy: "Not reported by runner",
  };
}

export function diagnosticObservation(value) {
  if (!value) return "Run the test to inspect the observed result.";
  if (value.upstreamReceived === true) {
    const unchanged = value.fields.filter((field) => field === "unmasked").length;
    const masked = value.fields.filter((field) => field === "masked").length;
    if (unchanged) return `${unchanged} of 4 original values reached the synthetic model. Protection is not confirmed for this run.`;
    if (masked === 4) return "All four fields were observed as masked at the synthetic model. Verify the policy decision in Vision One Events.";
    return "The synthetic model received a request. Masking is not confirmed for every field.";
  }
  return "No upstream receipt is available. This alone does not confirm a Gateway block.";
}
