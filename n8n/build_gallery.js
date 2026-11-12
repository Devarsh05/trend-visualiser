// n8n Code node "Build Trend Gallery" (mode: Run Once for All Items).
//
// Expects one item per trend from "Visualize Trend": { trend, prompt, images: [url, ...] }.
//
// Output: ONE item, downloadable like "Download Final Report":
//   json:   { fileName: "trend_visuals_YYYY-MM-DD.html" (UTC date), trendCount }
//   binary: data = a self-contained HTML page (base64, text/html), one card per trend
// Trends without any http(s) image URL are skipped and not counted.

const dateStr = new Date().toISOString().split("T")[0];
const fileName = `trend_visuals_${dateStr}.html`;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function imageUrls(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url.trim())).map((url) => url.trim());
}

const trends = $input
  .all()
  .map((item) => item.json ?? {})
  .map((json) => ({ name: json.trend, prompt: json.prompt, images: imageUrls(json.images) }))
  .filter((trend) => trend.images.length > 0);

const cards = trends.map((trend) => {
  const name = escapeHtml(trend.name) || "Untitled trend";
  const images = trend.images
    .map((url) => `<img src="${escapeHtml(url)}" alt="${name}" style="flex:1 1 280px;min-width:0;max-width:100%;border-radius:8px;object-fit:cover;aspect-ratio:4/3;background:#eee">`)
    .join("\n        ");
  return `
    <section style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:20px;margin:0 0 24px">
      <h2 style="margin:0 0 14px;font-size:20px;font-weight:600">${name}</h2>
      <div style="display:flex;flex-wrap:wrap;gap:12px">
        ${images}
      </div>
      <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#888">${escapeHtml(trend.prompt)}</p>
    </section>`;
});

const body = cards.length
  ? cards.join("\n")
  : `\n    <p style="color:#888">No trend visuals were generated in this run.</p>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Trend Visuals — ${dateStr}</title>
</head>
<body style="margin:0;background:#f5f5f3;color:#222;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <main style="max-width:1100px;margin:0 auto;padding:32px 16px">
    <h1 style="margin:0 0 24px;font-size:28px;font-weight:600">Trend Visuals — ${dateStr}</h1>${body}
  </main>
</body>
</html>
`;

return [
  {
    json: { fileName, trendCount: trends.length },
    binary: {
      data: {
        data: Buffer.from(html, "utf8").toString("base64"),
        mimeType: "text/html",
        fileName,
      },
    },
  },
];
