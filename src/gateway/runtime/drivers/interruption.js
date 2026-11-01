// A transport error or block-like response is an interruption, not proof of enforcement.
export function interrupted(message) {
  return Object.assign(new Error(message), { interrupted: true });
}
export function matchesBlock(
  text,
  pattern = "blocked|forbidden|denied|policy|guardrail",
) {
  const source = pattern.replace(/^\(\?i\)/, "");
  return new RegExp(source, "i").test(text);
}
