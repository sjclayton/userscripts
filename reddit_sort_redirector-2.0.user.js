// ==UserScript==
// @name         Reddit Sort Redirector
// @namespace    SJC
// @version      2.0
// @description  Reddit sort redirector with link handling for homepage and subreddits
// @author       sjclayton
// @match        https://*.reddit.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==
(function() {
    'use strict';

    // ===== CONFIGURATION =====
    // Default sort options for homepage, subreddits, and the special subreddits (r/popular and r/all)
    const DEFAULT_SORTS = {
        home: 'best',      // Options: best, hot, new, top, rising (Reddit default: best)
        subreddit: 'hot',  // Options: best, hot, new, top, rising (Reddit default: best)
        popular: 'hot',    // Options: hot, new, top, rising (Reddit default: hot)
        all: 'top'         // Options: hot, new, top, rising (Reddit default: hot)
    };

    // Set the time period that is applied when the default sort is set to 'top'
    const DEFAULT_TOP_TIME = {
        home: 'day',       // Options: hour, day, week, month, year, all
        subreddit: 'week', // Options: hour, day, week, month, year, all
        popular: 'hour',    // Options: hour, day, week, month, year, all
        all: 'day'         // Options: hour, day, week, month, year, all
    };

    // Debug mode - set to true to show alerts, false to hide them (default: false)
    const DEBUG_MODE = false;

    // ========================
    // Constants
    const BASE_URL = 'https://www.reddit.com';
    const SORT_TYPES = ['best', 'hot', 'new', 'top', 'rising'];
    const SORT_TYPES_REGEX = new RegExp(`\\/(${SORT_TYPES.join('|')})(\\/?|\\?|$)`);
    const NON_LISTING_PATHS = ['/application/', '/comments/', '/search', '/settings', '/submit', '/user/', '/wiki/'];
    const SUBREDDIT_REGEX = /^\/r\/([^\/]+)/;
    const SUBREDDIT_PAGE_REGEX = /^\/r\/[^\/]+\/?$/;
    const SPECIAL_SUBREDDITS = ['popular', 'all'];
    const POST_PAGE_REGEX = /^\/r\/[^\/]+\/comments\/[^\/]+\/?$/;
    const FLAIR_PARAM_REGEX = /[?&]f=flair_name%3A%22([^&"]+)%22/;

    // State
    let homePageSortChanged = false;
    let subredditSortChanged = false;
    let specialSubredditSortChanged = {
        popular: false,
        all: false
    };
    let lastKnownLocation = window.location.pathname;
    let linkObserver = null;

    // Utility function to clean duplicate parameters
    function cleanQueryString(search) {
        if (!search) return '';
        const params = new URLSearchParams(search);
        const uniqueParams = new URLSearchParams();
        const seen = new Set();

        for (const [key, value] of params) {
            const paramKey = `${key}=${value}`;
            if (!seen.has(paramKey)) {
                uniqueParams.append(key, value);
                seen.add(paramKey);
            }
        }

        return uniqueParams.toString();
    }

    // Show debug alert if enabled
    function showAlert(message, isError = false) {
        if (!DEBUG_MODE) return;
        const alertDiv = document.createElement('div');
        Object.assign(alertDiv.style, {
            position: 'fixed',
            top: '50px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: isError ? 'red' : 'green',
            color: 'white',
            padding: '20px',
            borderRadius: '5px',
            zIndex: '9999',
            fontWeight: 'bold',
            fontSize: '16px'
        });
        alertDiv.textContent = message;
        document.body.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 3000);
    }

    // Process stored debug message
    function processStoredDebugMessage() {
        const storedMessage = localStorage.getItem('debugAlertMessage');
        if (storedMessage) {
            showAlert(storedMessage);
            localStorage.removeItem('debugAlertMessage');
        }
    }

    // Get current page information
    function getPageInfo() {
        const path = window.location.pathname;
        const search = window.location.search;

        if (DEBUG_MODE) {
            console.log('getPageInfo called with:', {
                path,
                search,
                fullUrl: window.location.href,
                homePageSortChanged,
                subredditSortChanged,
                specialSubredditSortChanged,
                timestamp: new Date().toISOString()
            });
        }

        const result = {
            path,
            pageType: null,
            currentSort: null,
            currentTime: null,
            targetSort: null,
            targetTime: null,
            shouldRedirect: false,
            redirectUrl: null,
            flairParam: null
        };

        // Extract time period if present
        const timeMatch = search.match(/[?&]t=([^&]+)/);
        if (timeMatch) {
            result.currentTime = timeMatch[1];
        }

        // Extract flair parameter if present
        const flairMatch = search.match(FLAIR_PARAM_REGEX);
        if (flairMatch) {
            result.flairParam = flairMatch[0];
        }

        // Skip non-listing pages
        if (NON_LISTING_PATHS.some(nonListingPath => path.includes(nonListingPath)) ||
            POST_PAGE_REGEX.test(path)) {
            result.pageType = 'not_listing';
            return result;
        }

        // Handle homepage with feed parameter or direct sort URLs
        const sortMatch = path.match(/^\/([^\/]+)?\/*/);
        if (!path.includes('/r/')) {
            result.pageType = 'home';

            // Handle root path
            if (path === '/' || path === '') {
                result.currentSort = 'best';
            }
            // Handle sort paths
            else if (sortMatch) {
                const pathSort = sortMatch[1]?.toLowerCase();
                result.currentSort = SORT_TYPES.includes(pathSort) ? pathSort : 'best';

                // Handle time parameter for 'top' sort
                if (result.currentSort === 'top' && timeMatch) {
                    result.currentTime = timeMatch[1];
                }
            }

            result.targetSort = DEFAULT_SORTS.home;

            // Set target time if the target sort is 'top'
            if (result.targetSort === 'top') {
                result.targetTime = DEFAULT_TOP_TIME.home;
            }

            // Determine if redirect is needed
            result.shouldRedirect = !homePageSortChanged &&
                ((result.currentSort !== result.targetSort) ||
                 (result.targetSort === 'top' && result.currentTime !== result.targetTime));

            if (result.shouldRedirect) {
                result.redirectUrl = `${BASE_URL}/${result.targetSort}`;
                if (result.targetSort === 'top') {
                    result.redirectUrl += `?t=${result.targetTime}`;
                    // Preserve feed parameter if it exists
                    if (search.includes('feed=home')) {
                        result.redirectUrl += '&feed=home';
                    }
                } else if (search.includes('feed=home')) {
                    result.redirectUrl += '?feed=home';
                }
            }

            return result;
        }

        // Determine page type and current sort for subreddits
        const subredditMatch = path.match(SUBREDDIT_REGEX);
        if (subredditMatch) {
            const subreddit = subredditMatch[1].toLowerCase();

            // Check if this is a special subreddit
            if (SPECIAL_SUBREDDITS.includes(subreddit)) {
                result.pageType = 'special';
                result.targetSort = DEFAULT_SORTS[subreddit];
                if (result.targetSort === 'top') {
                    result.targetTime = DEFAULT_TOP_TIME[subreddit];
                }

                // Check if we're on the base subreddit page or a sort page
                if (SUBREDDIT_PAGE_REGEX.test(path)) {
                    result.currentSort = 'best';
                } else {
                    // Check for subreddit with sort
                    for (const sort of SORT_TYPES) {
                        if (path.match(new RegExp(`^/r/[^/]+/${sort}/?$`))) {
                            result.currentSort = sort;
                            if (sort === 'top' && timeMatch) {
                                result.currentTime = timeMatch[1];
                            }
                            break;
                        }
                    }
                }

                // Only redirect if sort hasn't been manually changed
                result.shouldRedirect = !specialSubredditSortChanged[subreddit] &&
                    ((result.currentSort !== result.targetSort) ||
                     (result.targetSort === 'top' && result.currentTime !== result.targetTime));

            } else {
                result.pageType = 'subreddit';
                result.targetSort = DEFAULT_SORTS.subreddit;
                if (result.targetSort === 'top') {
                    result.targetTime = DEFAULT_TOP_TIME.subreddit;
                }

                // Check if we're on the base subreddit page or a sort page
                if (SUBREDDIT_PAGE_REGEX.test(path)) {
                    result.currentSort = 'best';
                } else {
                    // Check for subreddit with sort
                    for (const sort of SORT_TYPES) {
                        if (path.match(new RegExp(`^/r/[^/]+/${sort}/?$`))) {
                            result.currentSort = sort;
                            if (sort === 'top' && timeMatch) {
                                result.currentTime = timeMatch[1];
                            }
                            break;
                        }
                    }
                }

                // Determine if redirect is needed for regular subreddits
                result.shouldRedirect = !subredditSortChanged &&
                    ((result.currentSort !== result.targetSort) ||
                     (result.targetSort === 'top' && result.currentTime !== result.targetTime));
            }

            if (result.shouldRedirect) {
                result.redirectUrl = `${BASE_URL}/r/${subredditMatch[1]}/${result.targetSort}`;
                let queryParams = [];
                if (result.targetSort === 'top') {
                    queryParams.push(`t=${result.targetTime}`);
                }
                if (result.flairParam) {
                    queryParams.push(result.flairParam);
                }
                if (queryParams.length > 0) {
                    result.redirectUrl += `?${queryParams.join('&')}`;
                }
            }
        }

        if (DEBUG_MODE) {
            console.log('Page Info Result:', {
                pageType: result.pageType,
                currentSort: result.currentSort,
                targetSort: result.targetSort,
                shouldRedirect: result.shouldRedirect,
                flairParam: result.flairParam,
                homePageSortChanged,
                subredditSortChanged,
                specialSubredditSortChanged,
                timestamp: new Date().toISOString()
            });
        }

        return result;
    }

    // Handle link clicks
    function handleLinkClick(e) {
        // Find the closest link element
        const target = e.target.closest('a');
        if (!target) return;
        const href = target.href;
        if (!href || !href.includes('reddit.com')) return;

        if (DEBUG_MODE) {
            console.log('handleLinkClick called for:', {
                href,
                timestamp: new Date().toISOString()
            });
        }

        try {
            const url = new URL(href);

            // Extract flair parameter if present
            const flairMatch = url.search.match(FLAIR_PARAM_REGEX);
            const flairParam = flairMatch ? flairMatch[0] : null;

            // Special handling for /?feed=home to ensure it redirects to correct sort
            if (url.pathname === '/' && url.searchParams.get('feed') === 'home') {
                e.preventDefault();
                e.stopPropagation();

                const targetSort = DEFAULT_SORTS.home;
                let redirectUrl = `${BASE_URL}/${targetSort}`;
                let queryParams = [];

                if (targetSort === 'top') {
                    queryParams.push(`t=${DEFAULT_TOP_TIME.home}`);
                }
                if (url.searchParams.get('feed') === 'home') {
                    queryParams.push('feed=home');
                }

                if (queryParams.length > 0) {
                    redirectUrl += `?${queryParams.join('&')}`;
                }

                if (DEBUG_MODE) {
                    console.log('Intercepting /?feed=home link:', {
                        from: window.location.href,
                        to: redirectUrl
                    });
                }

                window.location.replace(redirectUrl);
                return;
            }

            // Check if it's a sort link to 'top', if it is set the appropriate time period
            // Otherwise ensure the 't' parameter is removed
            const sortMatch = url.pathname.match(SORT_TYPES_REGEX);
            if (sortMatch) {
                if (url.pathname.includes('/top')) {
                    if (!url.searchParams.has('t')) {
                        const subredditMatch = url.pathname.match(SUBREDDIT_REGEX);
                        let topTime;

                        if (subredditMatch) {
                            const subreddit = subredditMatch[1].toLowerCase();
                            if (SPECIAL_SUBREDDITS.includes(subreddit)) {
                                topTime = DEFAULT_TOP_TIME[subreddit];
                            } else {
                                topTime = DEFAULT_TOP_TIME.subreddit;
                            }
                        } else {
                            topTime = DEFAULT_TOP_TIME.home;
                        }

                        url.searchParams.set('t', topTime);
                    }
                } else {
                    url.searchParams.delete('t');
                }
                // Clean query string to avoid duplicates
                url.search = cleanQueryString(url.search);
                target.href = url.toString();
                return;
            }

            // Skip non-listing pages
            if (NON_LISTING_PATHS.some(path => url.pathname.includes(path)) ||
                POST_PAGE_REGEX.test(url.pathname)) {
                return;
            }

            // Handle subreddit links
            if (SUBREDDIT_PAGE_REGEX.test(url.pathname)) {
                e.preventDefault();
                const match = url.pathname.match(SUBREDDIT_REGEX);
                if (match) {
                    const subreddit = match[1].toLowerCase();
                    let targetSort;
                    let targetTime;

                    // Determine target sort and time based on subreddit type
                    if (SPECIAL_SUBREDDITS.includes(subreddit)) {
                        targetSort = DEFAULT_SORTS[subreddit];
                        targetTime = DEFAULT_TOP_TIME[subreddit];
                    } else {
                        targetSort = DEFAULT_SORTS.subreddit;
                        targetTime = DEFAULT_TOP_TIME.subreddit;
                    }

                    let redirectUrl = `${BASE_URL}/r/${match[1]}/${targetSort}`;
                    let queryParams = [];
                    if (targetSort === 'top') {
                        queryParams.push(`t=${url.searchParams.get('t') || targetTime}`);
                    }
                    if (flairParam) {
                        queryParams.push(flairParam);
                    }
                    if (queryParams.length > 0) {
                        redirectUrl += `?${cleanQueryString(queryParams.join('&'))}`;
                    }
                    localStorage.setItem('debugAlertMessage', `Redirecting to ${redirectUrl}`);
                    window.location.href = redirectUrl;
                }
            }
            // Handle homepage links
            else if (url.pathname === '/' || url.pathname === '') {
                e.preventDefault();
                const targetSort = DEFAULT_SORTS.home;
                let redirectUrl = targetSort === 'best' ? BASE_URL : `${BASE_URL}/${targetSort}`;
                if (targetSort === 'top') {
                    redirectUrl += `?t=${DEFAULT_TOP_TIME.home}`;
                }
                localStorage.setItem('debugAlertMessage', `Redirecting to ${redirectUrl}`);
                window.location.href = redirectUrl;
            }
        } catch (error) {
            console.error('Error processing link:', error);
        }
    }

    // Process links in the DOM
    function processLinks(links) {
        for (const link of links) {
            if (!link.href || link.hasAttribute('data-modified-by-script')) continue;
            try {
                const url = new URL(link.href);
                // Extract flair parameter if present
                const flairMatch = url.search.match(FLAIR_PARAM_REGEX);
                const flairParam = flairMatch ? flairMatch[0] : null;

                if (SUBREDDIT_PAGE_REGEX.test(url.pathname)) {
                    const match = url.pathname.match(SUBREDDIT_REGEX);
                    if (match) {
                        const subreddit = match[1].toLowerCase();
                        let targetSort;
                        let targetTime;

                        // Determine target sort and time based on subreddit type
                        if (SPECIAL_SUBREDDITS.includes(subreddit)) {
                            targetSort = DEFAULT_SORTS[subreddit];
                            targetTime = DEFAULT_TOP_TIME[subreddit];
                        } else {
                            targetSort = DEFAULT_SORTS.subreddit;
                            targetTime = DEFAULT_TOP_TIME.subreddit;
                        }

                        let newHref = `${BASE_URL}/r/${match[1]}/${targetSort}`;
                        let queryParams = [];
                        if (targetSort === 'top') {
                            queryParams.push(`t=${url.searchParams.get('t') || targetTime}`);
                        }
                        if (flairParam) {
                            queryParams.push(flairParam);
                        }
                        if (queryParams.length > 0) {
                            newHref += `?${cleanQueryString(queryParams.join('&'))}`;
                        }
                        if (newHref !== link.href) {
                            link.href = newHref;
                            link.setAttribute('data-modified-by-script', 'true');
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing link:', error);
            }
        }
    }

    // Setup link interception
    function setupLinkInterception() {
        // Use event delegation for better performance
        document.addEventListener('click', handleLinkClick, true);
        // Process existing links
        processLinks(document.querySelectorAll('a:not([data-modified-by-script="true"])'));
        // Setup mutation observer for new links
        if (!linkObserver) {
            linkObserver = new MutationObserver(mutations => {
                const newLinks = [];
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length) {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.tagName === 'A') {
                                    newLinks.push(node);
                                } else {
                                    newLinks.push(...node.querySelectorAll('a:not([data-modified-by-script="true"])'));
                                }
                            }
                        });
                    }
                }
                if (newLinks.length) {
                    processLinks(newLinks);
                }
            });
            linkObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    // Check and redirect if needed
    function checkAndRedirect() {
        const info = getPageInfo();
        if (DEBUG_MODE) {
            console.log('checkAndRedirect called:', {
                pathname: window.location.pathname,
                timestamp: new Date().toISOString()
            });
        }

        // Add check to ensure we're fully loaded
        if (!document.body) {
            if (DEBUG_MODE) {
                console.log('Document not ready, scheduling retry');
            }
            setTimeout(checkAndRedirect, 50);
            return false;
        }

        if (info.pageType && info.pageType !== 'not_listing' && info.shouldRedirect) {
            if (DEBUG_MODE) {
                console.log('Redirect check:', {
                    currentSort: info.currentSort,
                    targetSort: info.targetSort,
                    redirectUrl: info.redirectUrl,
                    flairParam: info.flairParam,
                    timestamp: new Date().toISOString()
                });
                localStorage.setItem('debugAlertMessage',
                                     `Current sort: ${info.currentSort}, Target sort: ${info.targetSort}. Redirecting to ${info.redirectUrl}`);
            }
            window.location.href = info.redirectUrl;
            return true;
        }
        return false;
    }

    // Track page state changes
    function handleStateChange(source) {
        const currentPath = window.location.pathname;
        if (DEBUG_MODE) {
            console.log('State change detected:', {
                source,
                previousPath: lastKnownLocation,
                currentPath,
                timestamp: new Date().toISOString()
            });
        }
        lastKnownLocation = currentPath;

        // Don't redirect if this is a browser navigation and we have a saved sort state
        if (source === 'popstate' && window.history.state?.sortChanged) {
            if (DEBUG_MODE) {
                console.log('Skipping redirect due to browser navigation with saved sort state:', {
                    state: window.history.state,
                    timestamp: new Date().toISOString()
                });
            }
            return;
        }

        // Special handling for /?feed=home
        if (currentPath === '/' && window.location.search.includes('feed=home')) {
            const targetSort = DEFAULT_SORTS.home;
            let redirectUrl = `${BASE_URL}/${targetSort}`;
            let queryParams = [];
            if (targetSort === 'top') {
                queryParams.push(`t=${DEFAULT_TOP_TIME.home}`);
            }
            queryParams.push('feed=home');
            if (queryParams.length > 0) {
                redirectUrl += `?${queryParams.join('&')}`;
            }
            window.location.replace(redirectUrl);
            return;
        }

        // Check if we're navigating to a special subreddit
        const subredditMatch = currentPath.match(SUBREDDIT_REGEX);
        if (subredditMatch) {
            const subreddit = subredditMatch[1].toLowerCase();
            if (SPECIAL_SUBREDDITS.includes(subreddit)) {
                if (DEBUG_MODE) {
                    console.log('Special subreddit navigation detected:', {
                        subreddit,
                        currentPath,
                        source,
                        timestamp: new Date().toISOString()
                    });
                }
                setTimeout(() => {
                    const info = getPageInfo();
                    if (DEBUG_MODE) {
                        console.log('Delayed special subreddit check:', {
                            subreddit,
                            currentSort: info.currentSort,
                            targetSort: info.targetSort,
                            shouldRedirect: info.shouldRedirect,
                            flairParam: info.flairParam,
                            timestamp: new Date().toISOString()
                        });
                    }
                    if (info.shouldRedirect) {
                        checkAndRedirect();
                    }
                }, 150);
            }
        }

        if (!window.history.state || !window.history.state.sortChanged) {
            checkAndRedirect();
        }
    }

    // Patch history methods to catch client-side navigation
    function patchHistoryMethods() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function() {
            const result = originalPushState.apply(this, arguments);
            handleStateChange('pushState');
            return result;
        };

        history.replaceState = function() {
            const result = originalReplaceState.apply(this, arguments);
            handleStateChange('replaceState');
            return result;
        };
    }

    // Initialize the script
    function init() {
        if (DEBUG_MODE) {
            console.log("Reddit Sort Redirector: Link handler loaded", {
                initialPath: window.location.pathname,
                timestamp: new Date().toISOString()
            });
            processStoredDebugMessage();
        }

        // Add MutationObserver to watch for navigation changes
        const observer = new MutationObserver((mutations) => {
            const currentPath = window.location.pathname;
            if (currentPath !== lastKnownLocation) {
                if (DEBUG_MODE) {
                    console.log('Path change detected by observer:', {
                        previousPath: lastKnownLocation,
                        currentPath,
                        timestamp: new Date().toISOString()
                    });
                }
                handleStateChange('mutationObserver');
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        // Special handling for /?feed=home
        if (window.location.pathname === '/' && window.location.search.includes('feed=home')) {
            const targetSort = DEFAULT_SORTS.home;
            let redirectUrl = `${BASE_URL}/${targetSort}`;
            let queryParams = [];
            if (targetSort === 'top') {
                queryParams.push(`t=${DEFAULT_TOP_TIME.home}`);
            }
            queryParams.push('feed=home');
            if (queryParams.length > 0) {
                redirectUrl += `?${queryParams.join('&')}`;
            }
            window.location.replace(redirectUrl);
            return;
        }

        // Try to redirect immediately if needed
        setTimeout(() => {
            if (checkAndRedirect()) {
                return;
            }
        }, 50);

        setupLinkInterception();
        patchHistoryMethods();

        // Handle navigation events
        window.addEventListener('popstate', (event) => {
            if (DEBUG_MODE) {
                console.log('Popstate event:', {
                    state: event.state,
                    currentPath: window.location.pathname,
                    timestamp: new Date().toISOString()
                });
            }

            handleStateChange('popstate');
        });

        // Track user sort changes
        document.addEventListener('click', e => {
            const target = e.target.closest('a');
            if (target && SORT_TYPES.some(sort => target.href && target.href.includes(`/${sort}`))) {
                try {
                    const url = new URL(target.href);
                    const subredditMatch = url.pathname.match(SUBREDDIT_REGEX);

                    if (subredditMatch) {
                        const subreddit = subredditMatch[1].toLowerCase();
                        if (SPECIAL_SUBREDDITS.includes(subreddit)) {
                            // Track sort changes for specific special subreddits
                            specialSubredditSortChanged[subreddit] = true;
                            if (DEBUG_MODE) {
                                console.log(`Sort changed on ${subreddit}:`, {
                                    sortChanged: specialSubredditSortChanged[subreddit],
                                    href: target.href,
                                    timestamp: new Date().toISOString()
                                });
                            }
                        } else {
                            // Regular subreddit sort change
                            subredditSortChanged = true;
                        }
                    } else {
                        // Homepage sort change
                        homePageSortChanged = true;
                    }
                } catch (error) {
                    console.error('Error processing sort change:', error);
                }
            }
        });

        // Log on unload
        window.addEventListener('beforeunload', () => {
            if (DEBUG_MODE) {
                console.log('beforeunload event:', {
                    currentPath: window.location.pathname,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Restore default sort on page load
        window.addEventListener('load', () => {
            const info = getPageInfo();
            if (!info.pageType || info.pageType === 'not_listing' || !info.shouldRedirect) {
                return;
            }
            const currentUrl = new URL(window.location.href);
            const redirectUrl = new URL(info.redirectUrl);
            if (currentUrl.pathname !== redirectUrl.pathname ||
                (info.targetSort === 'top' && currentUrl.searchParams.get('t') !== info.targetTime)) {
                localStorage.setItem('debugAlertMessage', `Restoring default sort. Redirecting to ${info.redirectUrl}`);
                window.location.href = info.redirectUrl;
            }
        });
    }

    // Run the script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
