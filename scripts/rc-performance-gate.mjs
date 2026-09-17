import { spawn } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { performance } from "node:perf_hooks";

const root = process.cwd();
const outputDir = path.join(root, ".qa-runtime", "rc");
await mkdir(outputDir, { recursive: true });

const thresholds = {
  jsBytes: 5 * 1024 * 1024,
  cssBytes: 1 * 1024 * 1024,
  rootMedianMs: 1500,
  rootP95Ms: 3000,
  healthMedianMs: 750,
  healthP95Ms: 1500,
};

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
};

async function sample(url, count = 7) {
  const values = [];
  for (let i = 0; i < count; i += 1) {
    const started = performance.now();
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) throw new Error(`Performance probe failed for ${url}: HTTP ${response.status}`);
    await response.arrayBuffer();
    values.push(performance.now() - started);
  }
  return {
    samplesMs: values.map((value) => Math.round(value * 100) / 100),
    medianMs: Math.round(percentile(values, 0.5) * 100) / 100,
    p95Ms: Math.round(percentile(values, 0.95) * 100) / 100,
  };
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      resolve();
    }, 2500);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

const dist = path.join(root, "dist");
const files = await walk(dist);
let jsBytes = 0;
let cssBytes = 0;
for (const file of files) {
  const size = (await stat(file)).size;
  if (file.endsWith(".js")) jsBytes += size;
  if (file.endsWith(".css")) cssBytes += size;
}

const apiPort = await freePort();
const uiPort = await freePort();
const env = {
  ...process.env,
  PORT: String(apiPort),
  APP_ORIGIN: `http://127.0.0.1:${uiPort}`,
  APP_API_TOKEN: "rc-performance-token-".repeat(4),
  CREDENTIAL_ENCRYPTION_KEY: "rc-performance-key-".repeat(4),
  NODE_ENV: "production",
};

const api = spawn(process.execPath, ["--import=./server/remediationBootstrap.js", "server/index.js"], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(uiPort), "--strictPort"], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

let runtimeLog = "";
for (const child of [api, vite]) {
  child.stdout.on("data", (chunk) => { runtimeLog += String(chunk); });
  child.stderr.on("data", (chunk) => { runtimeLog += String(chunk); });
}

const rootUrl = `http://127.0.0.1:${uiPort}/`;
const healthUrl = `${rootUrl}api/health`;
let ready = false;
const deadline = Date.now() + 20000;
try {
  while (Date.now() < deadline) {
    if (api.exitCode !== null || vite.exitCode !== null) break;
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(700) });
      if (response.ok && (await response.json()).ok === true) {
        ready = true;
        break;
      }
    } catch {
      // bounded readiness poll
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`RC performance runtime did not become healthy. ${runtimeLog.slice(-1200)}`);

  await fetch(rootUrl, { signal: AbortSignal.timeout(5000), cache: "no-store" });
  await fetch(healthUrl, { signal: AbortSignal.timeout(5000), cache: "no-store" });

  const rootLatency = await sample(rootUrl);
  const healthLatency = await sample(healthUrl);
  const checks = {
    jsBundle: jsBytes <= thresholds.jsBytes,
    cssBundle: cssBytes <= thresholds.cssBytes,
    rootMedian: rootLatency.medianMs <= thresholds.rootMedianMs,
    rootP95: rootLatency.p95Ms <= thresholds.rootP95Ms,
    healthMedian: healthLatency.medianMs <= thresholds.healthMedianMs,
    healthP95: healthLatency.p95Ms <= thresholds.healthP95Ms,
  };
  const report = {
    measuredAt: new Date().toISOString(),
    thresholds,
    bundle: { jsBytes, cssBytes },
    latency: { root: rootLatency, health: healthLatency },
    checks,
    ok: Object.values(checks).every(Boolean),
  };
  await writeFile(path.join(outputDir, "performance-report.json"), JSON.stringify(report, null, 2));
  if (!report.ok) throw new Error(`RC performance gate failed: ${JSON.stringify(report)}`);
  console.log(`RC performance gate PASS: JS=${jsBytes} CSS=${cssBytes} root median=${rootLatency.medianMs}ms health median=${healthLatency.medianMs}ms`);
} finally {
  await Promise.all([stop(vite), stop(api)]);
}
