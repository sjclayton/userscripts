// ==UserScript==
// @name         Reddit Subscriber Stats
// @namespace    SJC
// @version      1.1
// @description  Adds tooltips for both Weekly Visitors (percentage of total members) and Weekly Contributions (percentage of weekly visitors)
// @author       sjclayton
// @match        https://*.reddit.com/r/*
// @updateURL    https://github.com/sjclayton/userscripts/blob/main/reddit_subscriber_stats.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // Debug mode - set to true to show logs (default: false)
  const DEBUG_MODE = false;

  const log = (msg) => {
    if (DEBUG_MODE) console.log(`[Reddit Sub Stats] ${msg}`);
  };

  const parseValue = (s) => {
    const n = parseFloat(s.toUpperCase().replace(/[^0-9.]/g, ""));
    if (isNaN(n)) return 0;
    return s.toUpperCase().includes("K")
      ? n * 1000
      : s.toUpperCase().includes("M")
        ? n * 1000000
        : n;
  };

  function findAllInShadow(root, text, results = []) {
    const elements = root.querySelectorAll("span, faceplate-number");
    for (const el of elements) {
      if (el.innerText.trim() === text && el.children.length === 0) {
        results.push(el);
      }
      if (el.shadowRoot) {
        findAllInShadow(el.shadowRoot, text, results);
      }
    }
    return results;
  }

  function findSlotInShadow(root, slotId) {
    let found = root.querySelector(`[slot="${slotId}"]`);
    if (found) return found;
    const children = root.querySelectorAll("*");
    for (const child of children) {
      if (child.shadowRoot) {
        const result = findSlotInShadow(child.shadowRoot, slotId);
        if (result) return result;
      }
    }
    return null;
  }

  const statsCache = {};

  async function apply() {
    const subMatch = window.location.pathname.match(/\/r\/([^/]+)/);
    if (!subMatch) return;
    const subName = subMatch[1];

    const visitorSlot = findSlotInShadow(document, "weekly-active-users-count");
    const contribSlot = findSlotInShadow(
      document,
      "weekly-contributions-count",
    );

    if (!visitorSlot) return;

    // Skip if already processed
    const visitorProcessed = visitorSlot.dataset.percentAdded === "true";
    const contribProcessed =
      !contribSlot || contribSlot.dataset.percentAdded === "true";

    if (visitorProcessed && contribProcessed) {
      return;
    }

    try {
      let data = statsCache[subName];

      // Only fetch if not in cache
      if (!data) {
        // If we haven't processed the UI but have no data, we fetch.
        // BUT if we have processed the UI locally (unlikely if we reached here), we may double fetch?
        // Existing conditions handle UI, we just need data.
        if (DEBUG_MODE)
          log(`Data not cached, fetching stats for r/${subName}...`);
        const res = await fetch(
          `https://www.reddit.com/r/${subName}/about.json`,
        );
        const json = await res.json();
        data = json.data;
        statsCache[subName] = data;
      }

      const totalMembers = data.subscribers;

      const visitorText = visitorSlot.innerText.trim();
      const visitorNum = parseValue(visitorText);

      // PROCESS WEEKLY VISITORS
      if (
        visitorNum > 0 &&
        totalMembers > 0 &&
        !visitorSlot.dataset.percentAdded
      ) {
        const vPerc = ((visitorNum / totalMembers) * 100).toFixed(1);
        const vInfo = `${vPerc}% of ${totalMembers.toLocaleString()} total members`;

        const vTargets = findAllInShadow(document, visitorText);
        vTargets.forEach((t) => {
          t.setAttribute("title", vInfo);
          t.style.cursor = "help";
        });
        visitorSlot.dataset.percentAdded = "true";
        log(
          `Success: Weekly Visitors (${visitorText}) identified as ${vPerc}% of total members.`,
        );
      }

      // PROCESS WEEKLY CONTRIBUTIONS
      if (contribSlot && !contribSlot.dataset.percentAdded) {
        const contribText = contribSlot.innerText.trim();
        const contribNum = parseValue(contribText);

        if (contribNum > 0 && visitorNum > 0) {
          const cPerc = ((contribNum / visitorNum) * 100).toFixed(1);
          const cInfo = `${cPerc}% of weekly visitors`;

          const cTargets = findAllInShadow(document, contribText);
          cTargets.forEach((t) => {
            t.setAttribute("title", cInfo);
            t.style.cursor = "help";
          });
          contribSlot.dataset.percentAdded = "true";
          log(
            `Success: Weekly Contributions (${contribText}) identified as ${cPerc}% of weekly visitors.`,
          );
        }
      }
    } catch (e) {
      if (DEBUG_MODE) console.error("[Reddit Sub Stats] Error:", e);
    }
  }

  log("Script initialized and monitoring...");
  setInterval(apply, 2000);
})();
