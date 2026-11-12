const test = require("node:test");
const assert = require("node:assert/strict");
const { runCodeNode } = require("./run_code_node");

const VISUALIZED = [
  {
    trend: "Organic modern neutral rugs",
    prompt: "Editorial interior photo of a calm minimalist living room...",
    images: ["https://fal.media/files/a.jpg", "https://fal.media/files/b.jpg"],
  },
  {
    trend: "Bohemian geo artisan rugs",
    prompt: "Editorial interior photo of an eclectic bedroom...",
    images: ["https://fal.media/files/c.jpg"],
  },
];

function buildGallery(t, inputJsons) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-12T15:30:00Z") });
  const out = runCodeNode("build_gallery.js", inputJsons);
  assert.equal(out.length, 1);
  const [item] = out;
  return { ...item, html: Buffer.from(item.binary.data.data, "base64").toString("utf8") };
}

test("returns one downloadable HTML item", (t) => {
  const { json, binary } = buildGallery(t, VISUALIZED);
  assert.deepEqual(json, { fileName: "trend_visuals_2026-11-12.html", trendCount: 2 });
  assert.equal(binary.data.mimeType, "text/html");
  assert.equal(binary.data.fileName, "trend_visuals_2026-11-12.html");
});

test("page has a dated title and one card per trend", (t) => {
  const { html } = buildGallery(t, VISUALIZED);
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.includes("<title>Trend Visuals — 2026-11-12</title>"));
  assert.ok(html.includes("<h1") && html.includes("Trend Visuals — 2026-11-12</h1>"));
  assert.equal(html.match(/<section/g).length, 2);
  assert.ok(html.indexOf("Organic modern neutral rugs") < html.indexOf("Bohemian geo artisan rugs"));
  for (const url of [...VISUALIZED[0].images, ...VISUALIZED[1].images]) {
    assert.ok(html.includes(`<img src="${url}"`), `missing ${url}`);
  }
  assert.ok(html.includes("Editorial interior photo of a calm minimalist living room..."));
});

test("is self-contained: inline CSS only, no external assets or scripts", (t) => {
  const { html } = buildGallery(t, VISUALIZED);
  assert.ok(!/<link|<script|<style|@import/i.test(html));
  const srcs = [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(srcs.every((src) => src.startsWith("https://fal.media/")), srcs.join(", "));
});

test("escapes all text and URLs", (t) => {
  const { html } = buildGallery(t, [
    {
      trend: `<script>alert(1)</script> & "rugs"`,
      prompt: `<img src=x onerror=alert(1)> 'quoted'`,
      images: [`https://fal.media/a.jpg?x="><script>alert(2)</script>`],
    },
  ]);
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;rugs&quot;"));
  assert.ok(html.includes("&#39;quoted&#39;"));
  assert.ok(html.includes(`src="https://fal.media/a.jpg?x=&quot;&gt;&lt;script&gt;`));
});

test("skips trends without usable images", (t) => {
  const { json, html } = buildGallery(t, [
    { trend: "Empty list", prompt: "p", images: [] },
    { trend: "No images field", prompt: "p" },
    { trend: "Not a URL", prompt: "p", images: ["javascript:alert(1)", "", null, 42] },
    { error: "Request failed with status code 502" },
    { trend: "Sisal runners", prompt: "p", images: ["javascript:alert(1)", "https://fal.media/s.jpg"] },
  ]);
  assert.equal(json.trendCount, 1);
  assert.equal(html.match(/<section/g).length, 1);
  assert.ok(html.includes("Sisal runners"));
  assert.ok(!html.includes("Empty list") && !html.includes("No images field") && !html.includes("Not a URL"));
  assert.ok(!html.includes("javascript:"));
});

test("no usable trends still gives one item with an empty-state page", (t) => {
  const { json, html } = buildGallery(t, [{ trend: "Nothing", images: [] }]);
  assert.deepEqual(json, { fileName: "trend_visuals_2026-11-12.html", trendCount: 0 });
  assert.ok(!html.includes("<section"));
  assert.ok(html.includes("No trend visuals were generated in this run."));
});
