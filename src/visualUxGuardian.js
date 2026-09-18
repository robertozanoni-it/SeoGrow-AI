export const VISUAL_UX_SEVERITY = Object.freeze({ INFO: "info", WARNING: "warning", ERROR: "error" });

const visible = (element) => {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
};

export function inspectVisualUx(root = document) {
  const viewportWidth = document.documentElement.clientWidth;
  const issues = [];
  if (document.documentElement.scrollWidth > viewportWidth + 2) issues.push({
    code: "PAGE_HORIZONTAL_OVERFLOW", severity: VISUAL_UX_SEVERITY.ERROR,
    detail: `scrollWidth ${document.documentElement.scrollWidth}px > viewport ${viewportWidth}px`,
    autoFixable: false,
  });

  for (const element of root.querySelectorAll("button,a,input,select,textarea,[role=button]")) {
    if (!visible(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.left < -2 || rect.right > viewportWidth + 2) issues.push({
      code: "CONTROL_OUTSIDE_VIEWPORT", severity: VISUAL_UX_SEVERITY.ERROR,
      detail: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.tagName,
      autoFixable: false,
    });
    if (viewportWidth <= 430 && (rect.width < 40 || rect.height < 40)) issues.push({
      code: "SMALL_TOUCH_TARGET", severity: VISUAL_UX_SEVERITY.WARNING,
      detail: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.tagName,
      autoFixable: false,
    });
  }

  for (const dialog of root.querySelectorAll('[role="dialog"]')) {
    if (!visible(dialog)) continue;
    const rect = dialog.getBoundingClientRect();
    if (rect.left < -2 || rect.right > viewportWidth + 2) issues.push({
      code: "DIALOG_CLIPPED", severity: VISUAL_UX_SEVERITY.ERROR, detail: dialog.getAttribute("aria-label") || "Dialog", autoFixable: false,
    });
  }

  return {
    viewportWidth,
    checkedAt: new Date().toISOString(),
    issues,
    pass: !issues.some((issue) => issue.severity === VISUAL_UX_SEVERITY.ERROR),
  };
}
