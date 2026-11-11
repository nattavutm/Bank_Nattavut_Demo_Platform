// Validate an actual fixture receipt as a series of unchanged literals and
// explicit redaction markers. A missing original value alone proves no masking.
export function inspectRedaction(original, received, fields) {
  const missing = received === undefined || received === null;
  const unknown = () => ({
    fields: fields.map(({ value }) => missing ? "no upstream receipt"
      : typeof received === "string" && received.includes(value) ? "unmasked" : "not confirmed"),
    fieldValues: fields.map(() => null), receivedText: null,
  });
  if (missing || typeof received !== "string" || received.length > original.length + 256) return unknown();
  if (received === original) return {
    fields: fields.map(() => "unmasked"), fieldValues: fields.map(({ value }) => value), receivedText: received,
  };
  const markers = [...received.matchAll(/\[REDACTED\]|\*{3,}/g)];
  if (!markers.length) return unknown();
  const ranges = [];
  let inputCursor = 0, outputCursor = 0;
  for (let i = 0; i < markers.length; i++) {
    const match = markers[i];
    const literal = received.slice(outputCursor, match.index);
    if (!original.startsWith(literal, inputCursor)) return unknown();
    inputCursor += literal.length;
    const after = match.index + match[0].length;
    const nextLiteral = received.slice(after, markers[i + 1]?.index ?? received.length);
    if (!nextLiteral && i < markers.length - 1) return unknown(); // ambiguous adjacent substitutions
    const end = nextLiteral ? original.indexOf(nextLiteral, inputCursor) : original.length;
    if (end <= inputCursor || (nextLiteral && original.indexOf(nextLiteral, end + 1) !== -1)) return unknown();
    ranges.push({ start: inputCursor, end, marker: match[0] });
    inputCursor = end;
    outputCursor = after;
  }
  if (original.slice(inputCursor) !== received.slice(outputCursor)) return unknown();
  const values = fields.map(({ value }) => {
    const start = original.indexOf(value);
    if (received.includes(value)) return { state: "unmasked", value };
    if (start < 0 || original.indexOf(value, start + 1) !== -1) return { state: "not confirmed", value: null };
    const range = ranges.find((item) => item.start <= start && item.end >= start + value.length);
    return range ? { state: "masked", value: range.marker } : { state: "not confirmed", value: null };
  });
  return { fields: values.map((item) => item.state), fieldValues: values.map((item) => item.value), receivedText: received };
}
