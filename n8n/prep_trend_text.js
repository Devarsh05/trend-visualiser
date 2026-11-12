// n8n Code node "Prep Trend Text" (mode: Run Once for All Items).
//
// Expects the same input as "Assemble HTML Report": one item whose json has
//   sections: { executive, category, visual, recommendations, ... }  LLM-written HTML strings
//   metadata: { category: "Area Rug", ... }
// Turns the trend-relevant sections into plain text for the Extract Trends LLM.
// Reads only sections and metadata; imageStore (~2 MB of base64) is never read or copied.
//
// Output: [{ json: { category, reportText } }]

const SECTION_ORDER = ["executive", "category", "visual", "recommendations"];
const MAX_CHARS = 8000;

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function htmlToText(html) {
  const text = html
    .replace(/```(?:html)?/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(text)
    .replace(/­/g, "") // soft hyphen
    .replace(/‑/g, "-") // non-breaking hyphen
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut).trim();
}

const first = $input.all()[0]?.json ?? {};
const sections = first.sections ?? {};

const parts = SECTION_ORDER
  .map((key) => sections[key])
  .filter((html) => typeof html === "string" && html.trim())
  .map(htmlToText)
  .filter(Boolean);

return [{
  json: {
    category: first.metadata?.category || "Area Rug",
    reportText: truncate(parts.join("\n\n"), MAX_CHARS),
  },
}];
