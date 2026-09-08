# Elementor text writer — Connector 1.3.5 candidate

Status: experimental, disabled unless explicitly enabled for an individual page. Not a certification of the SeoGrow → WordPress → frontend → rollback cycle.

## Supported scope

Only pages with Elementor Canvas, document type `wp-page`, builder mode, and exactly one `_seogrow_elementor_text_enabled` metadata row equal to `1`. Only static containers, headings and text-editor widgets. Only title/editor text may change. Dynamic content, shortcodes, shared/global widgets, templates, structure, fonts and styling are refused. Existing SeoGrow ownership checks remain required; Canvas alone does not prove the absence of incoming embeds.

The flag is deliberately not enabled or exposed as a global setting by installation. Initial activation requires a reviewed, isolated page and an administrator's per-page metadata change. Production UI enablement is pending live validation.

## Write contract

The existing authenticated atomic-write endpoint routes Elementor-only requests to this adapter. Mixed core/metadata and other metadata writes remain unavailable. It locks the page and the complete post_id metadata range under InnoDB REPEATABLE READ, then compares expectedCurrent byte for byte. Native Elementor Document::save regenerates HTML and document caches. The result must match the approved document semantically; only then is the approved exact JSON representation retained for snapshot comparisons. Core fields other than generated content/modification times, and the scope metadata, must remain unchanged.

A lost transaction savepoint, failure after native save begins, or failed post-commit read returns ATOMIC_RESULT_UNVERIFIED. The caller must reread and reconcile its journal; it must not retry or restore blindly. Database protection is not a transaction over plugin hooks, external services or cache systems.

Rollback restores the approved `_elementor_data` byte for byte through the same native pipeline. Generated post_content and timestamps are not promised to match their original bytes. Rendering must be checked separately. The response explicitly reports renderingVerified=false and requiresFrontendVerification=true.

## Validation and remaining release gate

`scripts/test-elementor-text-write.php` requires a disposable real MySQL database. It tests metadata update/insert locks using a second connection, stale apply/rollback, exact JSON rollback, unsupported pages, native-save failures, changed scope and lost transactions. Its Elementor Document is a fixture: passing it does not certify the installed Elementor version.

Before enabling a live page: run the full release gate, install the reviewed Connector package, take the actual SeoGrow snapshot, preview and approve one text change through SeoGrow, verify the REST reread plus desktop/mobile rendering and fonts, restore through SeoGrow, verify again, and return the test page to its initial publication state. Record separate evidence for native Elementor and SeoGrow transport. No staging is required for this isolated test, but authenticated SeoGrow access is required.

Official implementation references:
- https://github.com/elementor/elementor/blob/main/core/base/document.php
- https://dev.mysql.com/doc/refman/8.2/en/innodb-locking.html
- https://dev.mysql.com/doc/refman/8.1/en/innodb-transaction-isolation-levels.html

The earlier live-page report is in `docs/qa/G07-LIVE-ISOLATED-8196.md`; it covers Connector 1.3.3 core writes and a separate native Elementor visual cycle, not this candidate adapter.
