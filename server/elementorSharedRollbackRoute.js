import { rollbackSharedElementorLink } from "./elementorSharedLinkHook.js";

const HOOKED = Symbol.for("seogrow.elementorSharedRollbackRoute");
const ADAPTER = "Elementor shared template link cleanup";

export function registerRoutes(app) {
  if (app[HOOKED]) return;
  app[HOOKED] = true;

  app.post("/api/wordpress/live-rollback", async (req, res, next) => {
    const body = req.body || {};
    if (body.resource !== "elementor_library") return next();
    try {
      if (String(body.adapter || "") !== ADAPTER) {
        throw new Error("Adapter shared Elementor non riconosciuto per il rollback.");
      }
      const restoreValue = body?.changes?.meta?._elementor_data;
      const expectedCurrent = body?.expectedCurrent?.["meta._elementor_data"] ?? body?.expectedCurrent?.meta?._elementor_data;
      const result = await rollbackSharedElementorLink({
        siteUrl: body.siteUrl || body.targetUrl,
        username: body.username,
        applicationPassword: body.applicationPassword,
        id: body.id,
        targetUrl: body.brokenTargetUrl,
        mode: body.cleanupMode,
        expectedCurrent,
        restoreValue,
      });
      return res.json({
        ok: true,
        resource: "elementor_library",
        id: Number(body.id),
        adapter: ADAPTER,
        changed: ["meta._elementor_data"],
        staleChecked: result?.staleChecked === true,
        atomicGuaranteed: result?.atomicGuaranteed === true,
        message: "Template Elementor condiviso ripristinato dopo controllo stale-state.",
      });
    } catch (error) {
      return res.status(error?.code === "STALE_CONFLICT" ? 409 : 400).json({
        error: error?.message || "Rollback shared Elementor non riuscito.",
        code: error?.code || "SHARED_LINK_ROLLBACK_FAILED",
      });
    }
  });
}
