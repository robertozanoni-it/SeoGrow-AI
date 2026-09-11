import { useEffect, useState } from "react";
import ProblemsWorkspace from "./ProblemsWorkspace";

const currentPage = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica";
  } catch {
    return "Panoramica";
  }
};

export default function ProblemsWorkspaceMount() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const remountOnEntry = () => {
      if (currentPage() === "Problemi") setVersion((value) => value + 1);
    };

    window.addEventListener("hashchange", remountOnEntry);
    window.addEventListener("popstate", remountOnEntry);
    window.addEventListener("seogrow-locationchange", remountOnEntry);
    return () => {
      window.removeEventListener("hashchange", remountOnEntry);
      window.removeEventListener("popstate", remountOnEntry);
      window.removeEventListener("seogrow-locationchange", remountOnEntry);
    };
  }, []);

  return <ProblemsWorkspace key={`problems-workspace-${version}`} />;
}
