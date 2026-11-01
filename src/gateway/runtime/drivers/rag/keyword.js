import docs from "../../../data/chunks.json" with { type: "json" };
export function searchDocs(query, limit = 4) {
  const tokens = String(query)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return docs
    .map((d) => ({
      d,
      score: tokens.reduce(
        (n, t) =>
          n +
          (d.title.toLowerCase().includes(t) ? 4 : 0) +
          (d.body.toLowerCase().includes(t) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score > 0)
    .slice(0, Math.min(6, limit))
    .map((x) => ({ ...x.d, score: x.score }));
}
export function getDoc(id) {
  return docs.find((d) => d.id === id) || null;
}
