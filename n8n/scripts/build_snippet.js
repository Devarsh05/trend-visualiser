// Builds n8n/trend_visuals_branch.json: an n8n clipboard snippet ({nodes, connections}) to paste
// onto the trend workflow canvas with Ctrl+V.
//
// Inlines n8n/prep_trend_text.js and n8n/map_trends.js, and takes the Extract Trends prompt and
// JSON example from the fenced blocks in n8n/SETUP.md, so rerun it after editing any of those.
//
// Usage (from the repo root): node n8n/scripts/build_snippet.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "n8n", "trend_visuals_branch.json");
const SERVICE_URL = "https://trend-visualiser.onrender.com";
const BELOW = 900; // the existing workflow spans y -448..560

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const setup = read("n8n/SETUP.md");
function fencedAfter(marker, lang) {
  const start = setup.indexOf(marker);
  if (start < 0) throw new Error(`SETUP.md marker not found: ${marker}`);
  const open = setup.indexOf("```" + lang + "\n", start);
  const body = open + 3 + lang.length + 1;
  return setup.slice(body, setup.indexOf("\n```", body));
}
const prompt = fencedAfter("**Prompt (Text field, expression mode):**", "");
const jsonExample = fencedAfter("**Structured Output Parser JSON example:**", "json");
JSON.parse(jsonExample); // fail early if the example in SETUP.md is broken

const id = () => crypto.randomUUID();

const nodes = [
  {
    parameters: { url: `${SERVICE_URL}/health`, options: { timeout: 120000 } },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.5,
    position: [0, BELOW],
    id: id(),
    name: "Wake Visualiser",
    onError: "continueRegularOutput",
  },
  {
    parameters: { jsCode: read("n8n/prep_trend_text.js") },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [9536, BELOW],
    id: id(),
    name: "Prep Trend Text",
  },
  {
    parameters: { promptType: "define", text: "=" + prompt, hasOutputParser: true },
    type: "@n8n/n8n-nodes-langchain.chainLlm",
    typeVersion: 1.5,
    position: [9760, BELOW],
    id: id(),
    name: "Extract Trends",
  },
  {
    parameters: { modelName: "models/gemini-2.5-flash", options: {} },
    type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
    typeVersion: 1,
    position: [9744, BELOW + 220],
    id: id(),
    name: "Google Gemini Chat Model",
  },
  {
    parameters: { schemaType: "fromJson", jsonSchemaExample: jsonExample },
    type: "@n8n/n8n-nodes-langchain.outputParserStructured",
    typeVersion: 1.2,
    position: [9904, BELOW + 220],
    id: id(),
    name: "Structured Output Parser",
  },
  {
    parameters: { jsCode: read("n8n/map_trends.js") },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [10112, BELOW],
    id: id(),
    name: "Map Trends",
  },
  {
    parameters: {
      method: "POST",
      url: `${SERVICE_URL}/visualize`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ $json }}",
      options: { timeout: 120000 },
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.5,
    position: [10336, BELOW],
    id: id(),
    name: "Visualize Trend",
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
  },
  {
    parameters: {
      operation: "append",
      documentId: { __rl: true, value: "", mode: "list" },
      sheetName: { __rl: true, value: "Trend Visuals", mode: "name" },
      columns: {
        mappingMode: "defineBelow",
        value: {
          date: "={{ $now.toFormat('yyyy-MM-dd') }}",
          trend: "={{ $json.trend }}",
          prompt: "={{ $json.prompt }}",
          image_1: '==IMAGE("{{ $json.images[0] }}")',
          image_2: '==IMAGE("{{ $json.images[1] }}")',
        },
        matchingColumns: [],
        schema: ["date", "trend", "prompt", "image_1", "image_2"].map((col) => ({
          id: col,
          displayName: col,
          required: false,
          defaultMatch: false,
          display: true,
          type: "string",
          canBeUsedToMatch: true,
        })),
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: { cellFormat: "USER_ENTERED" },
    },
    type: "n8n-nodes-base.googleSheets",
    typeVersion: 4.5,
    position: [10560, BELOW],
    id: id(),
    name: "Write Trend Visuals",
  },
];

const main = (to) => ({ main: [[{ node: to, type: "main", index: 0 }]] });
const connections = {
  "Prep Trend Text": main("Extract Trends"),
  "Extract Trends": main("Map Trends"),
  "Map Trends": main("Visualize Trend"),
  "Visualize Trend": main("Write Trend Visuals"),
  "Google Gemini Chat Model": {
    ai_languageModel: [[{ node: "Extract Trends", type: "ai_languageModel", index: 0 }]],
  },
  "Structured Output Parser": {
    ai_outputParser: [[{ node: "Extract Trends", type: "ai_outputParser", index: 0 }]],
  },
};

const json = JSON.stringify({ nodes, connections }, null, 2) + "\n";

// Sanity checks before writing: parses, names unique, connections closed, no secrets or placeholders.
const parsed = JSON.parse(json);
const names = parsed.nodes.map((n) => n.name);
const problems = [];
if (new Set(names).size !== names.length) problems.push("duplicate node names");
for (const [src, outs] of Object.entries(parsed.connections)) {
  const targets = Object.values(outs).flat(2).map((c) => c.node);
  for (const name of [src, ...targets]) if (!names.includes(name)) problems.push(`unknown node in connections: ${name}`);
}
if (/"credentials"\s*:/.test(json)) problems.push("credentials present");
if (/<[A-Z-]+>/.test(json)) problems.push("placeholder like <MY-APP> left in");
if (/(AIza[0-9A-Za-z_-]{35}|\bsk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|x-api-key)/i.test(json)) {
  problems.push("secret-like string present");
}
if (problems.length) {
  console.error("Not written:\n- " + problems.join("\n- "));
  process.exit(1);
}

fs.writeFileSync(OUT, json);
console.log(`Wrote ${path.relative(ROOT, OUT)} (${names.length} nodes)`);
