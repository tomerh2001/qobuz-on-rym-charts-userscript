// ==UserScript==
// @name         Qobuz on RYM Charts
// @namespace    https://github.com/tomerh2001/qobuz-on-rym-charts-userscript
// @version      0.1.0
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
  var CHART_ITEM_SELECTOR = ".page_charts_section_charts_item.object_release";
  var QOBUZ_LINK_SELECTOR = 'a[href*="qobuz.com"]';
  var FILTERED_ATTR = "data-qobuz-chart-filtered";
  var STATUS_ATTR = "data-qobuz-chart-filter-status";
  var STYLE_ID = "qobuz-on-rym-charts-style";
  function normalizeWhitespace(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }
  function isSupportedChartPath(pathname) {
    return /^\/charts\//i.test(normalizeWhitespace(pathname));
  }
  function getChartItems(root = document) {
    return [...root.querySelectorAll(CHART_ITEM_SELECTOR)];
  }
  function itemHasQobuzLink(item) {
    return Boolean(item?.querySelector?.(QOBUZ_LINK_SELECTOR));
  }
  function formatStatusText(summary) {
    return `Qobuz only: ${summary.shown} shown, ${summary.hidden} hidden`;
  }
  function summarizeItems(items) {
    const total = items.length;
    const shown = items.filter((item) => !item.hidden).length;
    return {
      total,
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
    }
  `;
    doc.head.append(style);
  }
  function ensureStatusElement(doc = document) {
    const existing = doc.querySelector(`[${STATUS_ATTR}]`);
    if (existing) {
      return existing;
    }
    const status = doc.createElement("div");
    status.setAttribute(STATUS_ATTR, "");
    doc.body.append(status);
    return status;
  }
  function applyQobuzFilter(doc = document) {
    const items = getChartItems(doc);
    for (const item of items) {
      const hasQobuzLink = itemHasQobuzLink(item);
      item.hidden = !hasQobuzLink;
      item.toggleAttribute(FILTERED_ATTR, !hasQobuzLink);
    }
    const summary = summarizeItems(items);
    const status = ensureStatusElement(doc);
    status.textContent = formatStatusText(summary);
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
    let frameId = 0;
    const scheduleApply = () => {
      if (frameId) {
        return;
      }
      frameId = view.requestAnimationFrame(() => {
        frameId = 0;
        applyQobuzFilter(doc);
      });
    };
    scheduleApply();
    const observer = new MutationObserverImpl((mutations) => {
      const shouldRefresh = mutations.some((mutation) => mutation.type === "childList");
      if (shouldRefresh) {
        scheduleApply();
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    view.addEventListener("popstate", scheduleApply);
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
