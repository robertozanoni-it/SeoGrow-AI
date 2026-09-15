export const confirmAction = (message) => {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return false;
  return window.confirm(String(message || ""));
};

export const notifyUser = (message) => {
  if (typeof window === "undefined" || typeof window.alert !== "function") return false;
  window.alert(String(message || ""));
  return true;
};
