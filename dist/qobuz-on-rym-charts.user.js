// ==UserScript==
// @name         Qobuz on RYM Charts
// @namespace    https://github.com/tomerh2001/qobuz-on-rym-charts-userscript
// @version      1.0.0
// @description  Hide Rate Your Music chart results that do not include a Qobuz link.
// @author       Tomer Horowitz
// @match        https://rateyourmusic.com/charts/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/tomerh2001/qobuz-on-rym-charts-userscript
// @supportURL   https://github.com/tomerh2001/qobuz-on-rym-charts-userscript/issues
// @downloadURL  https://github.com/tomerh2001/qobuz-on-rym-charts-userscript/releases/latest/download/qobuz-on-rym-charts.user.js
// @updateURL    https://github.com/tomerh2001/qobuz-on-rym-charts-userscript/releases/latest/download/qobuz-on-rym-charts.user.js
// ==/UserScript==
(() => {
  // src/chart.js
  var CHART_ITEM_SELECTOR = ".page_charts_section_charts_item.object_release, .page_charts_section_charts_item";
  var QOBUZ_LINK_SELECTOR = 'a[href*="qobuz.com"]';
  var FILTERED_ATTR = "data-qobuz-chart-filtered";
  var STATUS_ATTR = "data-qobuz-chart-filter-status";
  var STYLE_ID = "qobuz-on-rym-charts-style";
  var TOGGLE_STORAGE_KEY = "qobuz-on-rym-charts-enabled";
  function normalizeWhitespace(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }
  function isSupportedChartPath(pathname) {
    return /^\/charts\//i.test(normalizeWhitespace(pathname));
  }
  function getChartItems(root = document) {
    const seen = /* @__PURE__ */ new Set();
    return [...root.querySelectorAll(CHART_ITEM_SELECTOR)].filter((item) => {
      if (item.parentElement?.closest(".page_charts_section_charts_item")) {
        return false;
      }
      if (seen.has(item)) {
        return false;
      }
      seen.add(item);
      return Boolean(
        item.querySelector(".page_charts_section_charts_item_title, .page_charts_section_charts_item_link, .page_charts_section_charts_item_info")
      );
    });
  }
  function itemHasQobuzLink(item) {
    return Boolean(item?.querySelector?.(QOBUZ_LINK_SELECTOR));
  }
  function formatStatusText(summary, enabled) {
    if (enabled) {
      return `Qobuz only: ON (${summary.shown} shown, ${summary.hidden} hidden)`;
    }
    return `Qobuz only: OFF (${summary.matches} match${summary.matches === 1 ? "" : "es"})`;
  }
  function summarizeItems(items) {
    const total = items.length;
    const matches = items.filter((item) => itemHasQobuzLink(item)).length;
    const shown = items.filter((item) => item.dataset.qobuzChartVisible !== "false").length;
    return {
      total,
      matches,
      shown,
      hidden: total - shown
    };
  }
  function addStyles(doc = document) {
    if (doc.getElementById(STYLE_ID)) {
      return;
    }
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    [${STATUS_ATTR}] {
      position: fixed;
      left: max(16px, env(safe-area-inset-left));
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 2147483647;
      padding: 12px 16px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
      background: rgba(14, 18, 24, 0.9);
      color: #f5f7fa;
      font: 600 14px/1.2 system-ui, sans-serif;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(14px);
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
    }

    [${STATUS_ATTR}]:hover {
      transform: translateY(-1px);
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
    }

    [${STATUS_ATTR}][data-enabled="false"] {
      background: rgba(69, 77, 90, 0.92);
      opacity: 0.92;
    }
  `;
    doc.head.append(style);
  }
  function ensureStatusElement(doc = document) {
    const existing = doc.querySelector(`[${STATUS_ATTR}]`);
    if (existing) {
      return existing;
    }
    const status = doc.createElement("button");
    status.type = "button";
    status.setAttribute(STATUS_ATTR, "");
    doc.body.append(status);
    return status;
  }
  function hideItem(item) {
    item.dataset.qobuzChartVisible = "false";
    item.toggleAttribute(FILTERED_ATTR, true);
    item.style.setProperty("display", "none", "important");
  }
  function showItem(item) {
    item.dataset.qobuzChartVisible = "true";
    item.removeAttribute(FILTERED_ATTR);
    item.style.removeProperty("display");
  }
  function readToggleState(view = window) {
    try {
      const stored = view.localStorage.getItem(TOGGLE_STORAGE_KEY);
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  }
  function writeToggleState(enabled, view = window) {
    try {
      view.localStorage.setItem(TOGGLE_STORAGE_KEY, String(enabled));
    } catch {
    }
  }
  function applyQobuzFilter(doc = document, enabled = true) {
    const items = getChartItems(doc);
    for (const item of items) {
      if (!enabled || itemHasQobuzLink(item)) {
        showItem(item);
        continue;
      }
      hideItem(item);
    }
    const summary = summarizeItems(items);
    const status = ensureStatusElement(doc);
    status.dataset.enabled = String(enabled);
    status.textContent = formatStatusText(summary, enabled);
    status.hidden = summary.total === 0;
    return summary;
  }
  function initQobuzChartFilter({
    doc = document,
    locationObject = window.location
  } = {}) {
    if (!isSupportedChartPath(locationObject?.pathname ?? "")) {
      return null;
    }
    addStyles(doc);
    const view = doc.defaultView ?? window;
    const MutationObserverImpl = view.MutationObserver ?? MutationObserver;
    let enabled = readToggleState(view);
    let frameId = 0;
    const scheduleApply = () => {
      if (frameId) {
        return;
      }
      frameId = view.requestAnimationFrame(() => {
        frameId = 0;
        applyQobuzFilter(doc, enabled);
      });
    };
    const status = ensureStatusElement(doc);
    if (!status.dataset.boundClick) {
      status.dataset.boundClick = "true";
      status.addEventListener("click", () => {
        enabled = !enabled;
        writeToggleState(enabled, view);
        applyQobuzFilter(doc, enabled);
      });
    }
    const observer = new MutationObserverImpl((mutations) => {
      const shouldRefresh = mutations.some((mutation) => mutation.type === "childList");
      if (shouldRefresh) {
        scheduleApply();
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    view.addEventListener("popstate", scheduleApply);
    scheduleApply();
    return observer;
  }

  // src/userscript.js
  function boot() {
    initQobuzChartFilter();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
