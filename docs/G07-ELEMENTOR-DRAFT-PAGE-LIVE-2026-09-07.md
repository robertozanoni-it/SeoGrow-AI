# G07 — Elementor draft-page live proof (isolated)

Date: 2026-09-07
Site: https://yogabuenaonda.it/
Scope: isolated non-public draft page only. No shared Elementor Theme Builder template was modified.

## Purpose

Validate the Elementor save pipeline on a real WordPress/Elementor installation without touching public content. This narrows G07 but does not close the full staging-only shared-template matrix.

## Fixture

Temporary draft page:
- ID: 8192
- Title: `SeoGrow G07 Elementor QA — 2026-09-07`
- Status: `draft`
- Page template: `elementor_canvas`
- One native Elementor Container + Heading widget

## Test sequence

1. Created the draft through `/wpvibe/v1/elementor/save-page` with marker `SEOGROW_G07_BEFORE_20260907`.
2. Save response returned no warnings.
3. Read `_elementor_data` and verified the expected native Elementor structure and marker.
4. Updated the same draft through the Elementor save endpoint to marker `SEOGROW_G07_AFTER_20260907`.
5. Save response again returned no warnings.
6. Read `/wp/v2/pages/8192` while authenticated and verified server-rendered Elementor HTML contained `SEOGROW_G07_AFTER_20260907`.
7. Read `_elementor_css`; Elementor reported generated CSS metadata with `status: file`.
8. Rolled the draft back through the same Elementor save endpoint to `SEOGROW_G07_BEFORE_20260907`.
9. Save response returned no warnings.
10. Read rendered HTML again and verified the rollback marker `SEOGROW_G07_BEFORE_20260907`.
11. Moved the temporary page to Trash.

## Result

PASS for the tested isolated draft-page scope:
- Elementor document save pipeline
- native Elementor data persistence
- server-rendered HTML refresh after save
- Elementor CSS metadata regeneration path
- rollback through Elementor save pipeline
- cleanup of the temporary fixture

## Remaining G07 scope

G07 remains PARTIAL, not fully closed. Still requires a staging/clone for destructive/shared-scope coverage:
- Theme Builder header/footer/single/archive save and rollback
- shared/global widget or reusable-template ownership impact
- custom CSS / HTML-script edge cases
- representative CPT
- frontend asset/cache regeneration across shared templates
- visual before/after verification in an actual browser
- rollback after shared-template changes

No public page or shared Elementor template was changed by this test.