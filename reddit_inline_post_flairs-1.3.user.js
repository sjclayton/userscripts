// ==UserScript==
// @name         Reddit Inline Post Flairs
// @namespace    SJC
// @version      1.3
// @description  Display Reddit 'Post Flairs' widget inline (above posts, not in sidebar)
// @author       sjclayton
// @match        https://*.reddit.com/r/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(function() {
    'use strict';

    // Post flair widget titles that should be inlined
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
  padding: 8px 0;
  margin: 4px 0;
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

    function hookNavigationEvents() {
        ['pushState','replaceState'].forEach(name => {
            const orig = history[name];
            history[name] = function() {
                const res = orig.apply(this, arguments);
                window.dispatchEvent(new Event('locationchange'));
                return res;
            };
        });
        window.addEventListener('popstate', () =>
            window.dispatchEvent(new Event('locationchange')));
    }

    let relocateTimer;
    function scheduleRelocate() {
        clearTimeout(relocateTimer);
        relocateTimer = setTimeout(relocateFlairs, 300);
    }

    function isValidSubredditPage() {
        const path = location.pathname.replace(/\/+$/, '');
        const segments = path.split('/').filter(Boolean);
        if (segments.length === 2 && segments[0] === 'r') return true;
        if (segments.length === 3 && segments[0] === 'r') {
            return ['hot', 'best', 'new', 'top', 'rising'].includes(segments[2]);
        }
        return false;
    }

    function runIfValidSubredditPage() {
        if (isValidSubredditPage()) scheduleRelocate();
    }

    hookNavigationEvents();
    window.addEventListener('load', runIfValidSubredditPage);
    window.addEventListener('locationchange', runIfValidSubredditPage);

    new MutationObserver(records => {
        if (!isValidSubredditPage()) return;
        for (const rec of records) {
            for (const node of rec.addedNodes) {
                if (
                    node instanceof Element &&
                    node.matches('h2') &&
                    WIDGET_TITLES.includes(node.textContent.trim().toLowerCase())
                ) {
                    scheduleRelocate();
                    return;
                }
            }
        }
    }).observe(document.body, { childList: true, subtree: true });

})();
