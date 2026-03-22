// ==UserScript==
// @name         Qobuz + Tidal on RYM Charts
// @namespace    https://github.com/tomerh2001/qobuz-on-rym-charts-userscript
// @version      1.2.2
// @description  Hide Rate Your Music chart results that do not include a Qobuz or Tidal link.
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
  var CHART_CONTAINER_SELECTOR = "#page_charts_section_charts, .page_charts_section_charts";
  var FILTERED_ATTR = "data-qobuz-chart-filtered";
  var CONTROLS_ATTR = "data-qobuz-chart-filter-controls";
  var STATUS_ATTR = "data-qobuz-chart-filter-status";
  var BUTTON_ATTR = "data-qobuz-chart-filter-button";
  var STYLE_ID = "qobuz-on-rym-charts-style";
  var FILTER_MODE_STORAGE_KEY = "qobuz-on-rym-charts-mode";
  var SCAN_STEP_RATIO = 0.85;
  var SCAN_MIN_STEP_PX = 480;
  var SCAN_SETTLE_MS = 150;
  var SCAN_MAX_STEPS = 30;
  var SCAN_STABLE_STEPS = 2;
  var CONTROL_EVENT_TYPES = ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "touchstart", "touchend"];
  var FILTER_MODES = {
    off: "off",
    qobuz: "qobuz",
    tidal: "tidal"
  };
  var PROVIDER_LINK_SELECTORS = {
    qobuz: 'a[href*="qobuz.com"]',
    tidal: 'a[href*="tidal.com"]'
  };
  function normalizeWhitespace(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }
  function getProviderLabel(provider) {
    return provider === FILTER_MODES.tidal ? "Tidal" : "Qobuz";
  }
  function normalizeFilterMode(value) {
    return Object.values(FILTER_MODES).includes(value) ? value : FILTER_MODES.qobuz;
  }
  function getControls(doc = document) {
    const controls = doc.querySelector(`[${CONTROLS_ATTR}]`);
    if (!controls) {
      return null;
    }
    return {
      controls,
      status: controls.querySelector(`[${STATUS_ATTR}]`),
      buttons: [...controls.querySelectorAll(`[${BUTTON_ATTR}]`)]
    };
  }
  function itemMatchesMode(item, mode) {
    return mode === FILTER_MODES.off || itemHasProviderLink(item, mode);
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
  function itemHasProviderLink(item, provider) {
    const selector = PROVIDER_LINK_SELECTORS[provider];
    if (!selector) {
      return false;
    }
    return Boolean(item?.querySelector?.(selector));
  }
  function formatStatusText(summary, mode) {
    if (summary.scanning) {
      return `Scanning chart... (${summary.qobuzMatches} Qobuz, ${summary.tidalMatches} Tidal, ${summary.total} total)`;
    }
    if (mode === FILTER_MODES.off) {
      return `Filter off (${summary.qobuzMatches} Qobuz, ${summary.tidalMatches} Tidal)`;
    }
    return `${getProviderLabel(mode)} only: ON (${summary.shown} shown, ${summary.hidden} hidden)`;
  }
  function summarizeItems(items) {
    const total = items.length;
    const qobuzMatches = items.filter((item) => itemHasProviderLink(item, FILTER_MODES.qobuz)).length;
    const tidalMatches = items.filter((item) => itemHasProviderLink(item, FILTER_MODES.tidal)).length;
    const shown = items.filter((item) => item.dataset.qobuzChartVisible !== "false").length;
    return {
      total,
      qobuzMatches,
      tidalMatches,
      shown,
      hidden: total - shown
    };
  }
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function safeScrollTo(view, x, y) {
    if (typeof view?.scrollTo !== "function") {
      return;
    }
    if (/\bnotImplemented\b/.test(String(view.scrollTo))) {
      return;
    }
    try {
      view.scrollTo(x, y);
    } catch {
    }
  }
  function addStyles(doc = document) {
    const style = doc.getElementById(STYLE_ID) ?? doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    [${CONTROLS_ATTR}] {
      position: fixed;
      left: max(16px, env(safe-area-inset-left));
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 2147483647;
      display: grid;
      gap: 10px;
      min-width: 240px;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 18px;
      background: rgba(14, 18, 24, 0.9);
      color: #f5f7fa;
      font: 600 14px/1.2 system-ui, sans-serif;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(14px);
    }

    [${CONTROLS_ATTR}] [data-qobuz-chart-filter-button-row] {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    [${BUTTON_ATTR}] {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      background: rgba(69, 77, 90, 0.92);
      color: inherit;
      padding: 10px 12px;
      font: inherit;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease, opacity 120ms ease;
    }

    [${BUTTON_ATTR}]:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
    }

    [${BUTTON_ATTR}][aria-pressed="true"] {
      background: linear-gradient(135deg, rgba(80, 178, 255, 0.95), rgba(24, 119, 242, 0.95));
      border-color: rgba(255, 255, 255, 0.28);
    }

    [${STATUS_ATTR}] {
      color: rgba(245, 247, 250, 0.88);
      font-size: 13px;
      line-height: 1.35;
    }
  `;
    if (!style.isConnected) {
      doc.head.append(style);
    }
  }
  function removeLegacyStatusElements(doc = document) {
    for (const element of doc.querySelectorAll(`[${STATUS_ATTR}]`)) {
      if (element.closest(`[${CONTROLS_ATTR}]`)) {
        continue;
      }
      element.remove();
    }
  }
  function ensureControls(doc = document) {
    const existing = getControls(doc);
    if (existing) {
      return existing;
    }
    const controls = doc.createElement("section");
    controls.setAttribute(CONTROLS_ATTR, "");
    const buttonRow = doc.createElement("div");
    buttonRow.dataset.qobuzChartFilterButtonRow = "true";
    for (const provider of [FILTER_MODES.qobuz, FILTER_MODES.tidal]) {
      const button = doc.createElement("button");
      button.type = "button";
      button.setAttribute(BUTTON_ATTR, provider);
      button.dataset.mode = provider;
      button.setAttribute("aria-pressed", "false");
      button.textContent = getProviderLabel(provider);
      buttonRow.append(button);
    }
    const status = doc.createElement("div");
    status.setAttribute(STATUS_ATTR, "");
    controls.append(buttonRow, status);
    doc.body.append(controls);
    return {
      controls,
      status,
      buttons: [...buttonRow.querySelectorAll(`[${BUTTON_ATTR}]`)]
    };
  }
  function isolateControlEvents(controls) {
    if (controls.dataset.eventIsolationBound === "true") {
      return;
    }
    controls.dataset.eventIsolationBound = "true";
    for (const eventType of CONTROL_EVENT_TYPES) {
      controls.addEventListener(eventType, (event) => {
        if (eventType !== "click") {
          event.preventDefault();
        }
        event.stopPropagation();
      });
    }
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
  function readFilterMode(view = window) {
    try {
      const stored = view.localStorage.getItem(FILTER_MODE_STORAGE_KEY);
      return stored === null ? FILTER_MODES.qobuz : normalizeFilterMode(stored);
    } catch {
      return FILTER_MODES.qobuz;
    }
  }
  function writeFilterMode(mode, view = window) {
    try {
      view.localStorage.setItem(FILTER_MODE_STORAGE_KEY, normalizeFilterMode(mode));
    } catch {
    }
  }
  function updateControls(doc, summary, mode) {
    const { controls, status, buttons } = ensureControls(doc);
    status.textContent = formatStatusText(summary, mode);
    controls.hidden = summary.total === 0;
    for (const button of buttons) {
      const isActive = button.dataset.mode === mode;
      button.setAttribute("aria-pressed", String(isActive));
    }
    return controls;
  }
  function applyProviderFilter(doc = document, mode = FILTER_MODES.qobuz) {
    const normalizedMode = normalizeFilterMode(mode);
    const items = getChartItems(doc);
    for (const item of items) {
      if (itemMatchesMode(item, normalizedMode)) {
        showItem(item);
        continue;
      }
      hideItem(item);
    }
    const summary = summarizeItems(items);
    updateControls(doc, summary, normalizedMode);
    return summary;
  }
  function showAllItems(doc = document) {
    for (const item of getChartItems(doc)) {
      showItem(item);
    }
  }
  function mutationTouchesChart(mutation) {
    const ElementImpl = mutation.target?.ownerDocument?.defaultView?.Element;
    const target = mutation.target;
    if (ElementImpl && target instanceof ElementImpl && target.closest(CHART_CONTAINER_SELECTOR)) {
      return true;
    }
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.some((node) => {
      if (!ElementImpl || !(node instanceof ElementImpl)) {
        return false;
      }
      return Boolean(
        node.closest(CHART_CONTAINER_SELECTOR) || node.matches(CHART_CONTAINER_SELECTOR) || node.matches(CHART_ITEM_SELECTOR) || node.querySelector(CHART_CONTAINER_SELECTOR) || node.querySelector(CHART_ITEM_SELECTOR)
      );
    });
  }
  async function scanChartItemsForProviders({
    doc = document,
    view = window,
    shouldCancel = () => false,
    settleMs = SCAN_SETTLE_MS,
    maxSteps = SCAN_MAX_STEPS,
    mode = FILTER_MODES.qobuz
  } = {}) {
    const scrollingElement = doc.scrollingElement ?? doc.documentElement ?? doc.body;
    const startX = view.scrollX ?? 0;
    const startY = view.scrollY ?? 0;
    const stepSize = Math.max(SCAN_MIN_STEP_PX, Math.round((view.innerHeight || 0) * SCAN_STEP_RATIO));
    let targetY = 0;
    let stableSteps = 0;
    let lastTotal = -1;
    let lastQobuzMatches = -1;
    let lastTidalMatches = -1;
    let lastMaxScrollTop = -1;
    showAllItems(doc);
    try {
      for (let step = 0; step < maxSteps; step += 1) {
        if (shouldCancel()) {
          break;
        }
        const items = getChartItems(doc);
        const summary = {
          ...summarizeItems(items),
          scanning: true
        };
        updateControls(doc, summary, mode);
        const maxScrollTop = Math.max(0, (scrollingElement.scrollHeight || 0) - (view.innerHeight || 0));
        if (summary.total === lastTotal && summary.qobuzMatches === lastQobuzMatches && summary.tidalMatches === lastTidalMatches && maxScrollTop === lastMaxScrollTop && targetY >= maxScrollTop) {
          stableSteps += 1;
        } else {
          stableSteps = 0;
        }
        if (stableSteps >= SCAN_STABLE_STEPS) {
          return {
            ...summary,
            scanning: false
          };
        }
        lastTotal = summary.total;
        lastQobuzMatches = summary.qobuzMatches;
        lastTidalMatches = summary.tidalMatches;
        lastMaxScrollTop = maxScrollTop;
        targetY = Math.min(maxScrollTop, targetY + stepSize);
        safeScrollTo(view, startX, targetY);
        await wait(settleMs);
        showAllItems(doc);
      }
    } finally {
      safeScrollTo(view, startX, startY);
    }
    return {
      ...summarizeItems(getChartItems(doc)),
      scanning: false
    };
  }
  function initChartProviderFilter({
    doc = document,
    locationObject = window.location
  } = {}) {
    if (!isSupportedChartPath(locationObject?.pathname ?? "")) {
      return null;
    }
    addStyles(doc);
    removeLegacyStatusElements(doc);
    const view = doc.defaultView ?? window;
    const MutationObserverImpl = view.MutationObserver ?? MutationObserver;
    let pagePath = locationObject?.pathname ?? view.location?.pathname ?? "";
    let mode = readFilterMode(view);
    let runId = 0;
    let scanPromise = null;
    let pendingRefresh = false;
    let hasScannedPage = false;
    let chartDirty = true;
    const refresh = (reason = "manual") => {
      const currentPath = locationObject?.pathname ?? view.location?.pathname ?? "";
      if (currentPath !== pagePath) {
        pagePath = currentPath;
        hasScannedPage = false;
        chartDirty = true;
      }
      if (scanPromise) {
        if (reason !== "observer") {
          pendingRefresh = true;
        }
        return;
      }
      const activeRun = ++runId;
      const currentPromise = (async () => {
        if (mode === FILTER_MODES.off) {
          applyProviderFilter(doc, FILTER_MODES.off);
          return;
        }
        if (hasScannedPage && !chartDirty) {
          applyProviderFilter(doc, mode);
          return;
        }
        updateControls(
          doc,
          {
            ...summarizeItems(getChartItems(doc)),
            scanning: true
          },
          mode
        );
        await scanChartItemsForProviders({
          doc,
          view,
          mode,
          shouldCancel: () => activeRun !== runId || mode === FILTER_MODES.off
        });
        if (activeRun !== runId) {
          return;
        }
        hasScannedPage = true;
        chartDirty = false;
        applyProviderFilter(doc, mode);
      })().finally(() => {
        if (scanPromise === currentPromise) {
          scanPromise = null;
        }
        if (pendingRefresh) {
          pendingRefresh = false;
          refresh("pending");
        }
      });
      scanPromise = currentPromise;
    };
    const { controls, buttons } = ensureControls(doc);
    isolateControlEvents(controls);
    for (const button of buttons) {
      if (button.dataset.boundClick) {
        continue;
      }
      button.dataset.boundClick = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const nextMode = button.dataset.mode ?? FILTER_MODES.qobuz;
        mode = mode === nextMode ? FILTER_MODES.off : normalizeFilterMode(nextMode);
        writeFilterMode(mode, view);
        runId += 1;
        showAllItems(doc);
        if (mode === FILTER_MODES.off) {
          applyProviderFilter(doc, FILTER_MODES.off);
          return;
        }
        if (hasScannedPage && !chartDirty) {
          applyProviderFilter(doc, mode);
          return;
        }
        refresh("toggle");
      });
    }
    const observer = new MutationObserverImpl((mutations) => {
      const shouldRefresh = mutations.some((mutation) => mutation.type === "childList" && mutationTouchesChart(mutation));
      if (shouldRefresh) {
        chartDirty = true;
        refresh("observer");
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    view.addEventListener("popstate", () => {
      chartDirty = true;
      hasScannedPage = false;
      refresh("popstate");
    });
    refresh("initial");
    return observer;
  }

  // src/userscript.js
  function boot() {
    initChartProviderFilter();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
