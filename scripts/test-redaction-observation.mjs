import test from "node:test";
import assert from "node:assert/strict";
import { fixtureBody, fixtureFields } from "../public/gateway/redaction/fixture.js";
import { inspectRedaction } from "../public/gateway/redaction/observation.js";

export const observedMaskedFixture = "Demo refund · THB 1,250 · Millennium Falcon parking fee\nPayment card:[REDACTED]Leia's contact email:[REDACTED]Rebel dispatch phone: [REDACTED]\nHangar API [REDACTED]";

test("the observed Gateway substitutions cover all four values even when labels and newlines are removed", () => {
  const result = inspectRedaction(fixtureBody, observedMaskedFixture, fixtureFields);
  assert.deepEqual(result.fields, Array(4).fill("masked"));
  assert.deepEqual(result.fieldValues, Array(4).fill("[REDACTED]"));
  assert.equal(result.receivedText, observedMaskedFixture);
});

test("an omitted value or arbitrary upstream text is not proof of redaction and is not exported", () => {
  for (const text of [fixtureBody.replace(fixtureFields[0].value, ""), "Authorization: Bearer secret", "[REDACTED] extra-secret"]) {
    const result = inspectRedaction(fixtureBody, text, fixtureFields);
    assert.equal(result.receivedText, null);
    assert.ok(!result.fields.includes("masked"));
  }
});

test("partial masking retains the unmasked original field observations", () => {
  const text = fixtureBody.replace(fixtureFields[0].value, "****");
  const result = inspectRedaction(fixtureBody, text, fixtureFields);
  assert.deepEqual(result.fields, ["masked", "unmasked", "unmasked", "unmasked"]);
  assert.equal(result.fieldValues[0], "****");
});

test("blocked delivery has no received text and unchanged delivery remains unmasked", () => {
  assert.deepEqual(inspectRedaction(fixtureBody, undefined, fixtureFields).fields, Array(4).fill("no upstream receipt"));
  assert.deepEqual(inspectRedaction(fixtureBody, fixtureBody, fixtureFields).fields, Array(4).fill("unmasked"));
});
