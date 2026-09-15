import test from "node:test";
import assert from "node:assert/strict";
import {
  agentModuleTools,
  agentToolForCapability,
  isAgentCapabilityAvailable,
} from "./intelligence/agent/moduleToolCatalog.js";

test("l'Agent vede solo capability dei moduli operativi e non le proprie infrastrutture", () => {
  const tools = agentModuleTools();
  const modules = new Set(tools.map((tool) => tool.moduleId));
  assert.ok(modules.has("audit"));
  assert.ok(modules.has("rank"));
  assert.ok(modules.has("content"));
  assert.ok(modules.has("links"));
  assert.ok(modules.has("geo"));
  assert.equal(modules.has("hub"), false);
  assert.equal(modules.has("tasks"), false);
  assert.equal(modules.has("agent"), false);
  assert.equal(modules.has("system"), false);
  assert.equal(modules.has("publish"), false);
});

test("ogni tool Agent usa l'identificatore namespaced della capability", () => {
  const verify = agentToolForCapability("audit:verify");
  assert.deepEqual(verify, {
    id: "audit:verify",
    moduleId: "audit",
    moduleLabel: "Audit & Fix",
    capability: "verify",
    available: true,
  });
  assert.equal(isAgentCapabilityAvailable("audit:verify"), true);
  assert.equal(agentToolForCapability("missing:tool"), null);
});

test("Publish è visibile alla pianificazione ma non invocabile finché resta planned", () => {
  assert.equal(agentToolForCapability("publish:wordpress"), null);
  assert.equal(isAgentCapabilityAvailable("publish:wordpress"), false);

  const planned = agentToolForCapability("publish:wordpress", { includeUnavailable: true });
  assert.equal(planned.moduleId, "publish");
  assert.equal(planned.available, false);

  const all = agentModuleTools({ includeUnavailable: true });
  assert.ok(all.some((tool) => tool.id === "publish:wordpress" && tool.available === false));
});
