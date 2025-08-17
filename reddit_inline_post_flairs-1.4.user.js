// ==UserScript==
// @name         Reddit Inline Post Flairs
// @namespace    SJC
// @version      1.4
// @description  Display Reddit 'Post Flairs' widget inline (above posts, not in sidebar)
// @author       sjclayton
// @match        https://*.reddit.com/r/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(function() {
    'use strict';

    const WIDGET_TITLES = [
        'post flair',
        'post flairs',
        'flair',
        'flairs',
        'filter by flair',
        'filter posts',
        'filter posts by drug',
        'flair filtering',
        'posts by flair',
        'search by flair',
        'search by post flair',
        'sort by flair',
        'search subreddit by flairs'
    ];

    const style = document.createElement('style');
    style.textContent = `
.inline-flair-bar {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 8px;
  margin: 4px 0;
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
        const heading = Array.from(document.querySelectorAll('h2'))
            .find(h => WIDGET_TITLES.includes(h.textContent.trim().toLowerCase()));
        if (!heading) return;

        let widgetDiv = heading;
        while (widgetDiv && widgetDiv.querySelectorAll('ul').length === 0) {
            widgetDiv = widgetDiv.parentElement;
        }
        if (!widgetDiv) return;

        const allULs = Array.from(widgetDiv.querySelectorAll('ul'));
        let flairUL = null;
        let maxLIs = 0;

        allULs.forEach(ul => {
            const nonEmptyLIs = Array.from(ul.querySelectorAll('li'))
                .filter(li => li.textContent.trim().length > 0);
            if (nonEmptyLIs.length > maxLIs) {
                flairUL = ul;
                maxLIs = nonEmptyLIs.length;
            }
        });
        if (!flairUL) return;

        const nextHR = widgetDiv?.nextElementSibling;
        if (nextHR?.tagName === 'HR' && nextHR.classList.contains('border-neutral-border-weak')) {
            nextHR.remove();
        }

        const bar = flairUL.cloneNode(true);
        bar.classList.add('inline-flair-bar');

        document.querySelectorAll('.inline-flair-bar')
            .forEach(el => { if (el !== bar) el.remove(); });

        const spacerDiv = document.querySelector('div.my-xs.mx-2xs');
        if (spacerDiv?.parentNode) {
            spacerDiv.parentNode.insertBefore(bar, spacerDiv);
        } else if (heading?.parentNode) {
            heading.parentNode.insertBefore(bar, heading.nextElementSibling);
        }

        widgetDiv.remove();
        flairUL.remove();
    }

    function isValidSubredditPage() {
        const path = location.pathname.replace(/\/+$/, '');
        const segments = path.split('/').filter(Boolean);
        if (segments.length === 2 && segments[0] === 'r') return true;
        if (segments.length === 3 && segments[0] === 'r') {
            return ['best', 'hot', 'new', 'top', 'rising'].includes(segments[2]);
        }
        return false;
    }

    function waitForFlairWidget(maxAttempts = 20, interval = 500) {
        let attempts = 0;
        const poll = setInterval(() => {
            if (!isValidSubredditPage()) return;

            const heading = Array.from(document.querySelectorAll('h2'))
                .find(h => WIDGET_TITLES.includes(h.textContent.trim().toLowerCase()));

            if (heading) {
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
        ['pushState', 'replaceState'].forEach(type => {
            const orig = history[type];
            history[type] = function() {
                const res = orig.apply(this, arguments);
                window.dispatchEvent(new Event('locationchange'));
                return res;
            };
        });

        window.addEventListener('popstate', () => {
            window.dispatchEvent(new Event('locationchange'));
        });

        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                window.dispatchEvent(new Event('locationchange'));
            }
        }, 500);

        document.addEventListener('DOMContentLoaded', runIfValidSubredditPage);
        window.addEventListener('load', runIfValidSubredditPage);
        window.addEventListener('locationchange', runIfValidSubredditPage);
    }

    setupEventHooks();
    runIfValidSubredditPage(); // Initial run

})();
