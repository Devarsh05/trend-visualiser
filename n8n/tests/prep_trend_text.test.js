const test = require("node:test");
const assert = require("node:assert/strict");
const sample = require("../sample_trend_output.json");
const { runCodeNode } = require("./run_code_node");

function prep(inputJsons) {
  const out = runCodeNode("prep_trend_text.js", inputJsons);
  assert.equal(out.length, 1);
  return out[0].json;
}

test("sample report becomes clean plain text", () => {
  const { category, reportText } = prep(sample);
  assert.equal(category, "Area Rug");
  assert.ok(reportText.length > 1000 && reportText.length <= 8000, `length ${reportText.length}`);
  assert.ok(!reportText.includes("<"), "no tags");
  assert.ok(!reportText.includes("```"), "no code fences");
  assert.ok(!/\{\{\w+_IMAGE_\d+\}\}/.test(reportText), "no image placeholders");
  assert.ok(!/&(#\w+|[a-z]+);/i.test(reportText), "no entities");
  assert.ok(!reportText.includes("­") && !reportText.includes("‑"));
  assert.ok(!/ {2}/.test(reportText), "no double spaces");
});

test("includes the trend sections in order and skips the rest", () => {
  const { reportText } = prep(sample);
  const order = ["Executive Summary", "Category Deep Dive", "Visual Trend Analysis", "Demand Signals"];
  const positions = order.map((heading) => reportText.indexOf(heading));
  assert.ok(positions.every((p) => p >= 0), `missing heading: ${positions}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.ok(reportText.includes("Organic Modern Neutral"));
  assert.ok(reportText.includes("Beige, Light Sand, Cream, Warm White"));
  assert.ok(!reportText.includes("Trend Risks Assessment"));
  assert.ok(!reportText.includes("Market Research"));
});

test("never copies imageStore", () => {
  const withImages = [{ ...sample[0], imageStore: { GENERATED_IMAGE_0: "data:image/png;base64,AAAA" } }];
  const json = prep(withImages);
  assert.deepEqual(Object.keys(json).sort(), ["category", "reportText"]);
  assert.ok(!JSON.stringify(json).includes("base64"));
});

test("handles missing sections and metadata", () => {
  const json = prep([{ sections: { visual: "<p>Round jute rugs</p>", executive: null } }]);
  assert.deepEqual(json, { category: "Area Rug", reportText: "Round jute rugs" });
  assert.deepEqual(prep([{}]), { category: "Area Rug", reportText: "" });
});

test("strips fences and decodes entities", () => {
  const html = "```html\n<p>Colors &amp; Patterns: &quot;sand&quot;&nbsp;&#8211; it&#39;s &#x2014; &lt;new&gt;</p>\n```";
  const { reportText } = prep([{ sections: { executive: html } }]);
  assert.equal(reportText, 'Colors & Patterns: "sand" – it\'s — <new>');
});

test("truncates long text at a word boundary", () => {
  const long = `<p>${"woven ".repeat(3000)}</p>`;
  const { reportText } = prep([{ sections: { executive: long } }]);
  assert.ok(reportText.length <= 8000);
  assert.ok(reportText.endsWith("woven"));
});
