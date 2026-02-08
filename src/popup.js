document.addEventListener('DOMContentLoaded', () => {
  const checkboxes = document.querySelectorAll('input[data-filter]');

  const defaults = {
    suggested: true,
    promoted: true,
    addToFeed: true,
    recommended: true,
    puzzles: true,
    sidebarAds: true,
  };

  // Load saved settings
  chrome.storage.sync.get('filters', (result) => {
    const filters = { ...defaults, ...result.filters };
    for (const cb of checkboxes) {
      cb.checked = filters[cb.dataset.filter];
    }
  });

  // Save on toggle
  for (const cb of checkboxes) {
    cb.addEventListener('change', () => {
      const filters = {};
      for (const c of checkboxes) {
        filters[c.dataset.filter] = c.checked;
      }
      chrome.storage.sync.set({ filters });
    });
  }
});
