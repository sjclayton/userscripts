// ==UserScript==
// @name         Reddit Inline Post Flairs
// @namespace    SJC
// @version      1.5.0
// @description  Display Reddit 'Post Flairs' widget inline (above posts, not in sidebar)
// @author       sjclayton
// @match        https://www.reddit.com/*
// @updateURL    https://github.com/sjclayton/userscripts/blob/main/reddit_inline_post_flairs.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==
(function () {
  "use strict";

  // Debug mode - set to true to show logs (default: false)
  const DEBUG_MODE = false;

  const log = (msg) => {
    if (DEBUG_MODE) console.log(`[RIF] ${msg}`);
  };

  const WIDGET_TITLES = [
    "filter by flair",
    "filter posts by drug",
    "filter posts",
    "flair filtering",
    "flair filters",
    "flair",
    "flairs",
    "post flair",
    "post flairs",
    "posts by flair",
    "search by flair",
    "search by post flair",
    "search for kde content",
    "search subreddit by flairs",
    "sort by flair",
  ];

  let styleInjected = false;
  function injectStyle() {
    if (styleInjected || !document.head) return;
    const style = document.createElement("style");
    style.textContent = `
.inline-flair-bar {
  display: flex !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  gap: 8px !important;
  margin: 4px 0 !important;
  padding: 8px 0 !important;
  border-bottom: none !important;
  list-style: none !important;
  scrollbar-width: thin !important;
  scroll-behavior: smooth !important;
}
.inline-flair-bar::-webkit-scrollbar {
  height: 6px;
}
.inline-flair-bar::-webkit-scrollbar-thumb {
  background-color: rgba(0,0,0,0.2);
  border-radius: 3px;
}
.inline-flair-bar li {
  flex: 0 0 auto !important;
  white-space: nowrap !important;
  margin: 0 !important;
  padding: 2px 0 0 0 !important;
}
`;
    document.head.appendChild(style);
    styleInjected = true;
  }

  function relocateFlairs() {
    const heading = Array.from(document.querySelectorAll("h2")).find((h) =>
      WIDGET_TITLES.includes(h.textContent.trim().toLowerCase()),
    );
    if (!heading) return false;

    let widgetDiv = heading;
    while (widgetDiv && widgetDiv.querySelectorAll("ul").length === 0) {
      widgetDiv = widgetDiv.parentElement;
    }
    if (!widgetDiv) return false;

    const allULs = Array.from(widgetDiv.querySelectorAll("ul"));
    let flairUL = null;
    let maxLIs = 0;

    allULs.forEach((ul) => {
      const nonEmptyLIs = Array.from(ul.querySelectorAll("li")).filter(
        (li) => li.textContent.trim().length > 0,
      );
      if (nonEmptyLIs.length > maxLIs) {
        flairUL = ul;
        maxLIs = nonEmptyLIs.length;
      }
    });
    if (!flairUL) return false;

    const nextHR = widgetDiv?.nextElementSibling;
    if (
      nextHR?.tagName === "HR" &&
      nextHR.classList.contains("border-neutral-border-weak")
    ) {
      nextHR.remove();
    }

    const targetDiv = document.querySelector("div.my-xs.mx-2xs");
    if (targetDiv?.parentNode) {
      // Remove any previously inserted inline bars
      document.querySelectorAll(".inline-flair-bar").forEach((el) => {
        el.remove();
      });

      // Move flairUL directly without cloning to preserve event listeners
      flairUL.classList.add("inline-flair-bar");
      targetDiv.parentNode.insertBefore(flairUL, targetDiv);
      log("Inserted inline widget before targetDiv");

      // Remove the original sidebar container
      widgetDiv.remove();
      log("Removed original sidebar flair widget");

      return true;
    } else if (heading?.parentNode) {
      log("Failed to insert inline widget - retrying...");
      return false; // Still processing or target wrapper hasn't rendered yet
    }

    return false;
  }

  function isValidSubredditPage() {
    const path = location.pathname.replace(/\/+$/, "");
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 2 && segments[0] === "r") return true;
    if (segments.length === 3 && segments[0] === "r") {
      return ["best", "hot", "new", "top", "rising"].includes(segments[2]);
    }
    return false;
  }

  let currentPoll = null;

  function waitForFlairWidget(maxAttempts = 20, interval = 500) {
    if (currentPoll) clearInterval(currentPoll);

    let attempts = 0;
    currentPoll = setInterval(() => {
      if (!isValidSubredditPage()) {
        clearInterval(currentPoll);
        return;
      }

      const success = relocateFlairs();

      if (success) {
        log("Successfully relocated flair widget");
        clearInterval(currentPoll);
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          log("Max attempts reached, giving up");
          clearInterval(currentPoll);
        }
      }
    }, interval);
  }

  function runIfValidSubredditPage() {
    if (isValidSubredditPage()) waitForFlairWidget();
  }

  function setupEventHooks() {
    ["pushState", "replaceState"].forEach((type) => {
      const orig = history[type];
      history[type] = function () {
        const res = orig.apply(this, arguments);
        window.dispatchEvent(new Event("locationchange"));
        return res;
      };
    });

    window.addEventListener("popstate", () => {
      window.dispatchEvent(new Event("locationchange"));
    });

    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        log("Location changed (via setInterval)");
        lastUrl = location.href;
        window.dispatchEvent(new Event("locationchange"));
      }
    }, 500);

    // Inject stylesheet as early as possible after DOM is ready
    document.addEventListener("DOMContentLoaded", () => {
      injectStyle();
      runIfValidSubredditPage();
    });

    window.addEventListener("load", runIfValidSubredditPage);
    window.addEventListener("locationchange", runIfValidSubredditPage);
  }

  setupEventHooks();
  log("Script initialized and monitoring...");
  runIfValidSubredditPage(); // Initial run
})();
