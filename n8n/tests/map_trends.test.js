const test = require("node:test");
const assert = require("node:assert/strict");
const { runCodeNode } = require("./run_code_node");

const PARSER_OUTPUT = {
  output: {
    trends: [
      {
        name: "  Organic modern neutral rugs ",
        materials: ["wool", " polyester ", ""],
        colors: "warm beige, cream,  , soft sand",
        style: " calm minimalist living room ",
        look: " a round, irregular shape with subtle high-low carving ",
      },
      {
        name: "Bohemian geo artisan rugs",
        materials: "polyester, cotton-jute blend",
        colors: ["terracotta", "mustard", "navy"],
        style: "eclectic bedroom",
        look: "a bold kilim-style geometric pattern",
      },
    ],
  },
};

function mapTrends(inputJsons) {
  return runCodeNode("map_trends.js", inputJsons).map((item) => item.json);
}

test("maps parser output to /visualize bodies", () => {
  const [first, second] = mapTrends([PARSER_OUTPUT]);
  assert.deepEqual(first, {
    name: "Organic modern neutral rugs",
    materials: ["wool", "polyester"],
    colors: ["warm beige", "cream", "soft sand"],
    style: "calm minimalist living room",
    look: "a round, irregular shape with subtle high-low carving",
    num_images: 2,
  });
  assert.deepEqual(second.materials, ["polyester", "cotton-jute blend"]);
  assert.deepEqual(second.colors, ["terracotta", "mustard", "navy"]);
});

test("accepts trends at the top level", () => {
  const out = mapTrends([{ trends: PARSER_OUTPUT.output.trends }]);
  assert.deepEqual(out, mapTrends([PARSER_OUTPUT]));
});

test("missing or odd fields fall back to empty values", () => {
  const [out] = mapTrends([{ trends: [{ name: "Jute rugs", materials: null, colors: 42, look: undefined }] }]);
  assert.deepEqual(out, { name: "Jute rugs", materials: [], colors: [], style: "", look: "", num_images: 2 });
});

test("skips trends without a name", () => {
  const out = mapTrends([{ trends: [{ name: "  " }, { colors: ["red"] }, null, { name: "Sisal runners" }] }]);
  assert.deepEqual(out.map((t) => t.name), ["Sisal runners"]);
});

test("returns at most 5 trends", () => {
  const trends = Array.from({ length: 8 }, (_, i) => ({ name: `Trend ${i + 1}` }));
  const out = mapTrends([{ trends }]);
  assert.deepEqual(out.map((t) => t.name), ["Trend 1", "Trend 2", "Trend 3", "Trend 4", "Trend 5"]);
});

test("caps look at 300 characters without splitting an emoji", () => {
  const [plain] = mapTrends([{ trends: [{ name: "A", look: "x".repeat(400) }] }]);
  assert.equal(plain.look.length, 300);
  const [emoji] = mapTrends([{ trends: [{ name: "B", look: "🧶".repeat(400) }] }]);
  assert.equal(Array.from(emoji.look).length, 300);
  assert.ok(!/[\ud800-\udbff]$/.test(emoji.look), "no dangling surrogate");
});

test("no trends in input gives no items", () => {
  assert.deepEqual(mapTrends([{ output: {} }, { trends: "nope" }, {}]), []);
});
