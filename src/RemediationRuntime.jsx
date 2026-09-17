import { useEffect, useState } from "react";
import RemediationHost from "./RemediationHost";
import WordPressConnectionControl from "./WordPressConnectionControl";
import WordPressLiveRemediationControlV2 from "./WordPressLiveRemediationControlV2";
import WordPressTaxonomyRemediationControl from "./WordPressTaxonomyRemediationControl";
import WordPressConnectorControl from "./WordPressConnectorControl";
import {
  PROPOSAL_ROUTE_PAGE,
  readAutomaticProposalFocus,
} from "./AutomaticProposalNavigation.js";

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)); } catch { return ""; }
};

export default function RemediationRuntime() {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const refresh = () => setGeneration((current) => current + 1);
    window.addEventListener("hashchange", refresh);
    window.addEventListener("seogrow-locationchange", refresh);
    window.addEventListener("seogrow-automatic-proposal-open", refresh);
    window.addEventListener("seogrow-automatic-proposal-close", refresh);
    return () => {
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener("seogrow-locationchange", refresh);
      window.removeEventListener("seogrow-automatic-proposal-open", refresh);
      window.removeEventListener("seogrow-automatic-proposal-close", refresh);
    };
  }, []);

  // Route and session focus are external browser state. Read them at render
  // time instead of caching the page inside React state: a late location event
  // must never leave this runtime believing it is on the page rendered before
  // the dedicated Corrections proposal opened.
  const page = currentPage();
  const proposalMode = page === PROPOSAL_ROUTE_PAGE && Boolean(readAutomaticProposalFocus());
  if (page !== "Audit SEO" && !proposalMode) return null;

  const key = `remediation-runtime-${generation}`;
  return (
    <>
      <RemediationHost key={`${key}-host`} slotSelector={proposalMode ? ".proposal-remediation-slot" : ""} />
      <WordPressConnectionControl key={`${key}-connection`} />
      <WordPressLiveRemediationControlV2 key={`${key}-live`} />
      <WordPressTaxonomyRemediationControl key={`${key}-taxonomy`} />
      <WordPressConnectorControl key={`${key}-connector`} />
    </>
  );
}
