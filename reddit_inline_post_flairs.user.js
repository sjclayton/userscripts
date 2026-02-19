// ==UserScript==
// @name         Reddit Inline Post Flairs
// @namespace    SJC
// @version      1.4.3
// @description  Display Reddit 'Post Flairs' widget inline (above posts, not in sidebar)
// @author       sjclayton
// @match        https://*.reddit.com/*
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

  const style = document.createElement("style");
  style.textContent = `
.inline-flair-bar {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 8px;
  margin: -6px 0 4px 0;
  padding: 8px 0;
  border-bottom: none !important;
  list-style: none;
  scrollbar-width: thin;
  scroll-behavior: smooth;
}
.inline-flair-bar::-webkit-scrollbar {
  height: 6px;
}
.inline-flair-bar::-webkit-scrollbar-thumb {
  background-color: rgba(0,0,0,0.2);
  border-radius: 3px;
}
.inline-flair-bar li {
  flex: 0 0 auto;
  white-space: nowrap;
  margin: 0;
  padding: 0;
  padding-top: 2px;
}
`;
  document.head.appendChild(style);

  function relocateFlairs() {
    const heading = Array.from(document.querySelectorAll("h2")).find((h) =>
      WIDGET_TITLES.includes(h.textContent.trim().toLowerCase()),
    );
    if (!heading) return;

    let widgetDiv = heading;
    while (widgetDiv && widgetDiv.querySelectorAll("ul").length === 0) {
      widgetDiv = widgetDiv.parentElement;
    }
    if (!widgetDiv) return;

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
    if (!flairUL) return;

    const nextHR = widgetDiv?.nextElementSibling;
    if (
      nextHR?.tagName === "HR" &&
      nextHR.classList.contains("border-neutral-border-weak")
    ) {
      nextHR.remove();
    }

    const bar = flairUL.cloneNode(true);
    bar.classList.add("inline-flair-bar");

    document.querySelectorAll(".inline-flair-bar").forEach((el) => {
      if (el !== bar) el.remove();
    });

    const spacerDiv = document.querySelector("article.w-full.m-0");
    if (spacerDiv?.parentNode) {
      spacerDiv.parentNode.insertBefore(bar, spacerDiv);
      log("Inserted inline widget before targetDiv");
      widgetDiv.remove();
      flairUL.remove();
      log("Removed original sidebar flair widget");
    } else if (heading?.parentNode) {
      log("Failed to insert inline widget - retrying...");
    }
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

  function waitForFlairWidget(maxAttempts = 20, interval = 500) {
    let attempts = 0;
    const poll = setInterval(() => {
      if (!isValidSubredditPage()) return;

      const heading = Array.from(document.querySelectorAll("h2")).find((h) =>
        WIDGET_TITLES.includes(h.textContent.trim().toLowerCase()),
      );

      if (heading) {
        log("Found valid flair widget heading");
        clearInterval(poll);
        relocateFlairs();
      }

      attempts++;
      if (attempts >= maxAttempts) clearInterval(poll);
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
        log("Location changed");
        lastUrl = location.href;
        window.dispatchEvent(new Event("locationchange"));
      }
    }, 500);

    document.addEventListener("DOMContentLoaded", runIfValidSubredditPage);
    window.addEventListener("load", runIfValidSubredditPage);
    window.addEventListener("locationchange", runIfValidSubredditPage);
  }

  setupEventHooks();
  log("Script initialized and monitoring...");
  runIfValidSubredditPage(); // Initial run
})();
