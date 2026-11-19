export { initRippleSystem, attachRippleEffect, openGlassModal, closeGlassModal } from "./effects.js";

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function setInlineStatus(element, message = "", kind = "info") {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("inline-error", kind === "error");
  element.setAttribute("role", kind === "error" ? "alert" : "status");
}

export function renderRouter(page) {
  const pageIds = {
    dashboard: "dashboard-section",
    "match-setup": "match-setup-section",
    "live-scoring": "scoreboard-section",
    analysis: "analysis-section",
    settings: "settings-section"
  };
  const targetId = pageIds[page] ?? page;
  const sections = [...document.querySelectorAll(".page-section")];
  const target = sections.find((section) => section.id === targetId);
  if (!target) throw new TypeError(`Unknown app page: ${page}`);
  for (const section of sections) section.classList.toggle("hidden", section !== target);
  for (const tab of document.querySelectorAll("#main-nav [data-page]")) {
    const active = tab.dataset.page === target.id;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-current", active ? "page" : "false");
  }
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}
