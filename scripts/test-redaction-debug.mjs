import test from "node:test";
import assert from "node:assert/strict";
import { diagnosticResult, diagnosticObservation } from "../public/gateway/redaction/debug.js";

test("diagnostics exclude credentials and untrusted decision claims", () => {
  const result = diagnosticResult({
    gatewayStatus: 200, gatewayRequestId: "01a1c847-b6a3-7392-9855-28cee7ff5093",
    upstreamReceived: true, summaryPreserved: true, fields: Array(4).fill("unmasked"),
    authorization: "Bearer SHOULD-NOT-APPEAR", policyDecision: "Blocked by Gateway",
    matchedPolicy: "invented-policy", headers: { key: "SHOULD-NOT-APPEAR" },
  });
  assert.ok(!JSON.stringify(result).includes("SHOULD-NOT-APPEAR"));
  assert.equal(result.policyDecision, "Not reported by runner");
  assert.equal(result.matchedPolicy, "Not reported by runner");
  assert.match(diagnosticObservation(result), /4 of 4 original values reached/);
});

test("no receipt and HTTP 403 do not establish a Gateway block", () => {
  const result = diagnosticResult({ gatewayStatus: 403, upstreamReceived: false, fields: [] });
  assert.match(diagnosticObservation(result), /does not confirm a Gateway block/);
  assert.equal(result.gatewayRequestId, null);
  assert.equal(result.summaryPreserved, null);
});

test("only complete masking observations say all four fields were masked", () => {
  const result = diagnosticResult({ gatewayStatus: 200, upstreamReceived: true,
    fields: ["masked", "masked", "not confirmed", "masked"] });
  assert.match(diagnosticObservation(result), /not confirmed for every field/);
  result.fields[2] = "masked";
  assert.match(diagnosticObservation(result), /Verify the policy decision/);
});
