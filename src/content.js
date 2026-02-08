(function () {
  'use strict';

  /**
   * Feed posts (Suggested, Promoted, Recommended):
   * The <p> marker is deeply nested. Above it at some level there's always
   * a div[data-view-name="feed-full-update"], and its parent is
   * div[role="listitem"] — that's what we hide.
   */
  function findFeedPostContainer(el) {
    // Strategy 1: find the feed-full-update wrapper, then take its parent (listitem)
    const feedUpdate = el.closest('[data-view-name="feed-full-update"]');
    if (feedUpdate && feedUpdate.parentElement) {
      return feedUpdate.parentElement;
    }

    // Strategy 2: find div[role="listitem"] directly
    const listitem = el.closest('[role="listitem"]');
    if (listitem) return listitem;

    // Strategy 3: walk up and find the first ancestor whose parent has many children
    let current = el;
    while (current.parentElement) {
      const parent = current.parentElement;
      if (parent.children.length > 3) return current;
      if (parent.tagName === 'BODY' || parent.tagName === 'MAIN') return current;
      current = parent;
    }
    return null;
  }

  /**
   * "Add to your feed" sidebar block:
   * P(0) -> DIV(1, 5 children) -> DIV(2, 1 child) -> DIV(3) -> ... -> MAIN
   * The widget container is at level 2 from <p> — the first ancestor
   * whose parent has >1 children (the sidebar column with multiple widgets).
   */
  function findAddToFeedContainer(el) {
    return findSidebarWidget(el);
  }

  /**
   * "Today's puzzles" sidebar block:
   * P(0) -> DIV(1) -> DIV(2) -> DIV(3, 1 child) -> DIV(4) -> ... -> MAIN
   * Same strategy: walk up until parent has >1 siblings.
   */
  function findPuzzlesContainer(el) {
    return findSidebarWidget(el);
  }

  /**
   * Generic sidebar widget finder:
   * Walk up from the marker <p> until we find an ancestor whose parent
   * has more than 1 child element — that parent is the sidebar column,
   * and we return the current element (the widget itself).
   */
  function findSidebarWidget(el) {
    let current = el.parentElement;
    if (!current) return null;

    while (current.parentElement) {
      const parent = current.parentElement;

      // Safety: don't go above main/body
      if (
        parent.tagName === 'BODY' ||
        parent.tagName === 'MAIN' ||
        parent.getAttribute('role') === 'main'
      ) {
        return current;
      }

      // If parent has multiple children, we've found the layout container.
      // Return `current` — the widget block.
      if (parent.children.length > 1) {
        return current;
      }

      current = parent;
    }
    return current;
  }

  const FILTER_CONFIGS = [
    {
      key: 'suggested',
      textMarker: 'Suggested',
      getContainer: findFeedPostContainer,
    },
    {
      key: 'promoted',
      textMarker: 'Promoted',
      getContainer: findFeedPostContainer,
    },
    {
      key: 'promoted',
      textMarker: 'Promoted by',
      prefix: true,
      getContainer: findFeedPostContainer,
    },
    {
      key: 'recommended',
      textMarker: 'Recommended for you',
      getContainer: findFeedPostContainer,
    },
    {
      key: 'addToFeed',
      textMarker: 'Add to your feed',
      getContainer: findAddToFeedContainer,
    },
    {
      key: 'puzzles',
      // LinkedIn uses right single quotation mark U+2019
      textMarker: "Today\u2019s puzzles",
      getContainer: findPuzzlesContainer,
    },
    {
      key: 'puzzles',
      // Fallback: regular apostrophe
      textMarker: "Today's puzzles",
      getContainer: findPuzzlesContainer,
    },
  ];

  const DATA_ATTR = 'data-tfa-filter';
  const HIDDEN_ATTR = 'data-tfa-hidden';

  let activeFilters = {
    suggested: true,
    promoted: true,
    addToFeed: true,
    recommended: true,
    puzzles: true,
    sidebarAds: true,
  };

  /**
   * Check if element is a leaf-level text match (no nested block elements).
   */
  function isTextMatch(el, marker, prefix) {
    const text = el.textContent.trim();
    if (prefix ? !text.startsWith(marker) : text !== marker) return false;
    if (el.querySelector('p, div, li, section, article')) return false;
    return true;
  }

  function scanAndHide() {
    const textElements = document.querySelectorAll('p, span');

    for (const el of textElements) {
      if (el.hasAttribute(DATA_ATTR)) continue;

      for (const config of FILTER_CONFIGS) {
        if (!isTextMatch(el, config.textMarker, config.prefix)) continue;

        el.setAttribute(DATA_ATTR, config.key);

        const container = config.getContainer(el);
        if (!container || container === document.body) continue;

        container.setAttribute(DATA_ATTR, config.key);

        if (activeFilters[config.key]) {
          container.style.display = 'none';
          container.setAttribute(HIDDEN_ATTR, 'true');
        }

        break;
      }
    }

    // Sidebar ad iframes (title="advertisement")
    const adIframes = document.querySelectorAll('iframe[title="advertisement"]');
    for (const iframe of adIframes) {
      const container = findSidebarWidget(iframe);
      if (!container || container === document.body) continue;
      if (container.hasAttribute(DATA_ATTR)) continue;

      container.setAttribute(DATA_ATTR, 'sidebarAds');

      if (activeFilters.sidebarAds) {
        container.style.display = 'none';
        container.setAttribute(HIDDEN_ATTR, 'true');
      }
    }
  }

  function reapplyFilters() {
    for (const key of Object.keys(activeFilters)) {
      const containers = document.querySelectorAll(
        `[${DATA_ATTR}="${key}"]`
      );
      for (const container of containers) {
        if (container.tagName === 'P' || container.tagName === 'SPAN') continue;

        if (activeFilters[key]) {
          container.style.display = 'none';
          container.setAttribute(HIDDEN_ATTR, 'true');
        } else {
          container.style.display = '';
          container.removeAttribute(HIDDEN_ATTR);
        }
      }
    }
    scanAndHide();
  }

  let scanTimeout = null;
  function debouncedScan() {
    if (scanTimeout) return;
    scanTimeout = setTimeout(() => {
      scanTimeout = null;
      requestAnimationFrame(scanAndHide);
    }, 100);
  }

  function init() {
    chrome.storage.sync.get('filters', (result) => {
      if (result.filters) {
        activeFilters = { ...activeFilters, ...result.filters };
      }

      scanAndHide();

      const observer = new MutationObserver(debouncedScan);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.filters) {
        activeFilters = { ...activeFilters, ...changes.filters.newValue };
        reapplyFilters();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
