// n8n Code node "Map Trends" (mode: Run Once for All Items).
//
// Expects the Structured Output Parser result from "Extract Trends", either
//   { output: { trends: [...] } }  (Basic LLM Chain default)  or  { trends: [...] }
// where each trend has: name, materials, colors, style, look.
// materials and colors may be arrays or comma-separated strings; any field may be missing.
//
// Output: one item per trend, ready to POST to /visualize:
//   { name, materials: string[], colors: string[], style, look, num_images: 2 }
// Trends without a name are skipped, and at most MAX_TRENDS are sent to cap Fal cost.

const MAX_TRENDS = 5;
const MAX_LOOK_CHARS = 300; // matches the service's Trend.look max_length

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return raw.map(text).filter(Boolean);
}

function capChars(value, max) {
  // Array.from counts code points, so an emoji is never split in half
  return Array.from(value).slice(0, max).join("").trim();
}

const trends = $input.all().flatMap((item) => {
  const json = item.json ?? {};
  const found = json.output?.trends ?? json.trends;
  return Array.isArray(found) ? found : [];
});

return trends
  .filter((trend) => trend && text(trend.name))
  .slice(0, MAX_TRENDS)
  .map((trend) => ({
    json: {
      name: text(trend.name),
      materials: list(trend.materials),
      colors: list(trend.colors),
      style: text(trend.style),
      look: capChars(text(trend.look), MAX_LOOK_CHARS),
      num_images: 2,
    },
  }));
