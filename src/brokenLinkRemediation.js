const clone = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const BROKEN_LINK_CLEANUP_MODES = Object.freeze({
  PRESERVE_TEXT: "unlink-preserve-text",
  DELETE_ANCHOR_TEXT: "delete-anchor-text",
});

const cleanupModes = new Map();

export function brokenExternalTarget(issue = {}) {
  const raw = issue?.targetUrl || issue?.brokenUrl || issue?.destinationUrl || issue?.href || "";
  try {
    const url = new URL(String(raw).trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeBrokenLinkCleanupMode(mode) {
  return mode === BROKEN_LINK_CLEANUP_MODES.DELETE_ANCHOR_TEXT
    ? BROKEN_LINK_CLEANUP_MODES.DELETE_ANCHOR_TEXT
    : BROKEN_LINK_CLEANUP_MODES.PRESERVE_TEXT;
}

export function setBrokenLinkCleanupMode(targetUrl, mode) {
  const target = brokenExternalTarget({ targetUrl });
  if (!target) return false;
  cleanupModes.set(target, normalizeBrokenLinkCleanupMode(mode));
  return true;
}

export function brokenLinkCleanupMode(targetUrl) {
  const target = brokenExternalTarget({ targetUrl });
  return target
    ? normalizeBrokenLinkCleanupMode(cleanupModes.get(target))
    : BROKEN_LINK_CLEANUP_MODES.PRESERVE_TEXT;
}

export function clearBrokenLinkCleanupMode(targetUrl) {
  const target = brokenExternalTarget({ targetUrl });
  if (target) cleanupModes.delete(target);
}

export function removeExactAnchor(html, targetUrl, mode = brokenLinkCleanupMode(targetUrl)) {
  const source = String(html || "");
  const target = brokenExternalTarget({ targetUrl });
  const action = normalizeBrokenLinkCleanupMode(mode);
  if (!source || !target) return { value: source, count: 0, anchors: [], action };

  const pattern = new RegExp(
    `<a\\b([^>]*?\\bhref\\s*=\\s*["']${escapeRegExp(target)}["'][^>]*)>([\\s\\S]*?)<\\/a\\s*>`,
    "gi",
  );
  const anchors = [];
  const value = source.replace(pattern, (_whole, _attrs, inner) => {
    anchors.push(String(inner || "").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim());
    return action === BROKEN_LINK_CLEANUP_MODES.DELETE_ANCHOR_TEXT ? "" : inner;
  });
  return { value, count: anchors.length, anchors, action };
}

export function prepareElementorBrokenExternalLink(rawElementorData, targetUrl, mode = brokenLinkCleanupMode(targetUrl)) {
  const action = normalizeBrokenLinkCleanupMode(mode);
  if (rawElementorData === undefined || rawElementorData === null || rawElementorData === "") {
    return { state: "absent", count: 0, serialized: "", anchors: [], action };
  }

  let data;
  try {
    data = typeof rawElementorData === "string" ? JSON.parse(rawElementorData) : clone(rawElementorData);
  } catch {
    return { state: "invalid", count: 0, serialized: "", anchors: [], action };
  }
  if (!Array.isArray(data)) return { state: "invalid", count: 0, serialized: "", anchors: [], action };

  let count = 0;
  const anchors = [];
  let nodes = 0;
  const walk = (value, depth = 0) => {
    if (depth > 80 || nodes > 5000) return false;
    if (Array.isArray(value)) {
      for (const item of value) if (!walk(item, depth + 1)) return false;
      return true;
    }
    if (!value || typeof value !== "object") return true;
    nodes += 1;
    if (nodes > 5000) return false;

    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string") {
        const result = removeExactAnchor(child, targetUrl, action);
        if (result.count) {
          value[key] = result.value;
          count += result.count;
          anchors.push(...result.anchors);
        }
      } else if (child && typeof child === "object") {
        if (!walk(child, depth + 1)) return false;
      }
    }
    return true;
  };

  if (!walk(data)) return { state: "invalid", count: 0, serialized: "", anchors: [], action };
  return {
    state: "valid",
    count,
    serialized: JSON.stringify(data),
    anchors,
    action,
  };
}
