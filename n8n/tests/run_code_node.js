// Runs an n8n Code node file ("Run Once for All Items") outside n8n, so tests exercise
// exactly the code that gets pasted into the node.
const fs = require("node:fs");
const path = require("node:path");

function runCodeNode(fileName, inputJsons) {
  const code = fs.readFileSync(path.join(__dirname, "..", fileName), "utf8");
  const items = inputJsons.map((json) => ({ json }));
  const $input = { all: () => items, first: () => items[0] };
  return new Function("$input", code)($input);
}

module.exports = { runCodeNode };
