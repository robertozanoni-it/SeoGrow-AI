import './gdprSeoMigration';
import './remediationVerificationMigration';
import './remediationIntegrity';
import './writeRecovery';
import './locationEvents';
import './GuidedNavigationBridge';
import './PageRouteReconciler';
import './seoResponseIntegrity';
import './taskClientIdIntegrity';
import './uiIntegrityFixes';
import './WizardStepNavigation';
import './AutomaticProposalNavigation';
import './RemediationFocusReplay';
import './PageStartHierarchy';
import './CardWorkspaceRecovery';
import './ExternalLinkDestinationUx';
import './ResolvedExternalLinkStateUx';
import './BrokenLinkCleanupChoiceUx';
import './SharedElementorBrokenLinkUx';
import './ProviderBudgetUx';
import './ProposalBeforeAfterLinks';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import GuidedUxLayer from './GuidedUxLayer';
import WizardCongruenceLayer from './WizardCongruenceLayer';
import CardWorkspaceLayer from './CardWorkspaceLayer';
import RankingsWorkspaceLayer from './RankingsWorkspaceLayer';
import InternalLinksWorkspaceLayer from './InternalLinksWorkspaceLayer';
import OpportunitiesWorkspaceLayer from './OpportunitiesWorkspaceLayer';
import ProjectSelectionGuard from './ProjectSelectionGuard';
import ProjectContinuityLayer from './ProjectContinuityLayer';
import {
  ProblemsNavBridge,
  ProblemsWorkspaceMount,
  ProblemResolutionPage,
  AuditWorkspace,
} from './modules/audit/index.js';
import {
  AutomaticProposalPage,
  RemediationRuntime,
  CorrectionsWorkspace,
} from './modules/publish/ui.js';
import './styles.css';
import './responsiveIntegrity.css';
import './reflowNavigationFix.css';
import './SidebarReadabilityFix.css';
import './CardWorkspaceVisibilityFix.css';
import './ProjectCenterCardFlow.css';
import './ReadableTypographyAndSidebar.css';
import './GuidedWizardSurface.css';
import './ExternalLinkDestinationUx.css';
import './ReferenceLayout.css';
import './ProjectCenterReference.css';
import './ProblemsReference.css';
import './AuditReference.css';
import './CorrectionsReference.css';
import './TaskReference.css';
import './EditorialReference.css';
import './AgentReference.css';
import './GeoReference.css';
import './SeoGrowAiReference.css';
import './IntegrationsReference.css';
import './SettingsReference.css';
import './HistoryReference.css';
import './DetailReference.css';
import './RankingsReference.css';
import './LinksReference.css';
import './OpportunitiesReference.css';
import './ReferenceFidelityFinal.css';
import './SemanticVisualSystem.css';
import './SidebarContrastFinal.css';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <h1>seoGrow AI non riesce a mostrare questa schermata</h1>
        <p>I dati locali non sono stati eliminati. Ricarica l’app; se il problema continua, esporta o ripristina un backup.</p>
        <details><summary>Dettaglio tecnico</summary><pre>{String(this.state.error.message || this.state.error)}</pre></details>
        <button onClick={() => window.location.reload()}>Ricarica l’app</button>
      </main>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
      <GuidedUxLayer />
      <WizardCongruenceLayer />
      <CardWorkspaceLayer />
      <RankingsWorkspaceLayer />
      <InternalLinksWorkspaceLayer />
      <OpportunitiesWorkspaceLayer />
      <ProjectSelectionGuard />
      <ProjectContinuityLayer />
      <ProblemsNavBridge />
      <ProblemsWorkspaceMount />
      <ProblemResolutionPage />
      <AutomaticProposalPage />
      <AuditWorkspace />
      <RemediationRuntime />
      <CorrectionsWorkspace />
    </AppErrorBoundary>
  </React.StrictMode>,
);