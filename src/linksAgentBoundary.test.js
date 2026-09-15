import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const agentRuntime = await readFile(new URL("./agentRuntime.js", import.meta.url), "utf8");

test("Agent consuma l'evidenza internal-link attraverso il boundary Links", () => {
  assert.match(
    agentRuntime,
    /import\s*\{\s*internalLinkSuggestions\s*\}\s*from\s*["']\.\/modules\/links\/index\.js["']/,
  );
  assert.match(
    agentRuntime,
    /seo\.internalLinks[\s\S]*?internalLinkSuggestions\(observed\(context,\s*["']data\.analysis["']\)\)/,
  );
  assert.doesNotMatch(
    agentRuntime,
    /observed\(context,\s*["']data\.analysis["']\)\?\.internalLinkSuggestions/,
  );
});
