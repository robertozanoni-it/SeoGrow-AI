window.__seogrowCorrectionsMode = false;

const currentPage = (href = window.location.href) => {
  try { return decodeURIComponent(new URL(href, window.location.href).hash.slice(1)); }
  catch { return ""; }
};

const patchHistoryMethod = (methodName) => {
  const original = window.history[methodName];
  if (typeof original !== "function" || original.__seogrowPatched) return;
  const patched = function patchedHistoryMethod(...args) {
    const destination = args[2] == null ? "" : String(args[2]);
    const destinationPage = currentPage(destination || window.location.href);
    if (
      window.__seogrowCorrectionsMode &&
      currentPage() === "Correzioni" &&
      destinationPage &&
      destinationPage !== "Correzioni"
    ) {
      // The App shell can still have an effect queued with the page rendered
      // immediately before the Corrections overlay opened. Never let that
      // stale history write replace an explicit #Correzioni route. Intentional
      // exits disable corrections mode before changing route.
      return undefined;
    }

    const oldURL = window.location.href;
    const result = original.apply(this, args);
    const newURL = window.location.href;
    if (newURL !== oldURL) {
      window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL }));
      window.dispatchEvent(new Event("seogrow-locationchange"));
    }
    return result;
  };
  patched.__seogrowPatched = true;
  window.history[methodName] = patched;
};

patchHistoryMethod("pushState");
patchHistoryMethod("replaceState");
