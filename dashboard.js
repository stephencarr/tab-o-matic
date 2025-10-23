// State
let stashedTabs = [];
let recentHistory = [];
let recentlyClosed = [];
let mostVisited = [];
let currentView = 'recent';
let selectedStashIds = new Set();
let editingStashId = null;
let editingReminderDate = null;
let currentStashFilter = 'all';
let currentDomainFilter = 'all';

// Settings with defaults
let settings = {
  panels: {
    order: ['justNow', 'earlierToday', 'recentlyClosed', 'mostVisited'],
    justNow: { enabled: true, limit: 10 },
    earlierToday: { enabled: true, limit: 25 },
    recentlyClosed: { enabled: true, limit: 25 },
    mostVisited: { enabled: true, limit: 20 }
  },
  stats: {
    tabsOpened: 0,
    firstUse: null,
    lastActivity: null,
    currentStreak: 0
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupEventListeners();
  renderRecentView();
  renderStashSidebar();
  renderDuplicateTabs();
});

// Load all data
async function loadData() {
  // Load stashed tabs
  const stashResult = await chrome.storage.local.get(['stashedTabs']);
  stashedTabs = stashResult.stashedTabs || [];
  
  // Load settings
  const settingsResult = await chrome.storage.local.get(['settings']);
  if (settingsResult.settings) {
    settings = { ...settings, ...settingsResult.settings };
  }
  
  // Load recent history (all history items for quick access)
  const historyItems = await chrome.history.search({
    text: '',
    startTime: 0, // No time restriction
    maxResults: 1000 // Large set for deduplication
  });
  recentHistory = historyItems;
  
  // Load recently closed tabs
  const recentlyClosedResult = await chrome.sessions.getRecentlyClosed({ maxResults: settings.panels.recentlyClosed.limit });
  recentlyClosed = recentlyClosedResult
    .filter(session => session.tab)
    .map(session => session.tab);
  
  // Calculate most visited from history
  mostVisited = calculateMostVisited(historyItems, settings.panels.mostVisited.limit);
}

function calculateMostVisited(historyItems, limit = 20) {
  // Count visits per URL
  const visitCounts = new Map();

  historyItems.forEach(item => {
    if (visitCounts.has(item.url)) {
      const existing = visitCounts.get(item.url);
      existing.visitCount = (existing.visitCount || 0) + (item.visitCount || 1);
      // Keep the most recent title
      if (item.lastVisitTime > existing.lastVisitTime) {
        existing.title = item.title;
        existing.lastVisitTime = item.lastVisitTime;
      }
    } else {
      visitCounts.set(item.url, {
        url: item.url,
        title: item.title,
        visitCount: item.visitCount || 1,
        lastVisitTime: item.lastVisitTime
      });
    }
  });

  // Convert to array and sort by visit count
  const sorted = Array.from(visitCounts.values())
    .sort((a, b) => b.visitCount - a.visitCount)
    .slice(0, limit);

  return sorted;
}

// Setup event listeners
function setupEventListeners() {
  // View switching
  document.getElementById('viewAllStashedBtn').addEventListener('click', () => switchToStashView());
  document.getElementById('backToRecentBtn').addEventListener('click', () => switchToRecentView());
  
  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', () => openSettingsModal());
  
  // Stash filter buttons
  document.querySelectorAll('.stash-filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      applyStashFilter(filter);
    });
  });
  
  // Search
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('stashSearchInput').addEventListener('input', handleStashSearch);
  
  // Sort
  document.getElementById('sortSelect').addEventListener('change', handleSort);
  
  // Bulk actions
  document.getElementById('openSelectedBtn').addEventListener('click', openSelected);
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelected);
  
  // Edit modal
  document.getElementById('closeEditModalBtn').addEventListener('click', closeEditModal);
  document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
  document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
  document.getElementById('deleteFromEditBtn').addEventListener('click', deleteFromEdit);
  document.getElementById('clearReminderBtn').addEventListener('click', clearEditReminder);
  
  // Quick reminder buttons in edit modal
  document.querySelectorAll('#editModal .quick-reminder-btn').forEach(btn => {
    btn.addEventListener('click', handleEditQuickReminder);
  });
  
  document.getElementById('editReminderInput').addEventListener('change', handleEditCustomReminder);
  
  // Close modal on background click
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') {
      closeEditModal();
    }
  });
}

// Switch views
function switchToStashView() {
  currentView = 'stash';
  currentStashFilter = 'all';
  currentDomainFilter = 'all';
  document.getElementById('recentView').classList.add('hidden');
  document.getElementById('stashView').classList.remove('hidden');
  renderStashView();
}

function switchToRecentView() {
  currentView = 'recent';
  document.getElementById('stashView').classList.add('hidden');
  document.getElementById('recentView').classList.remove('hidden');
}

// Render recent activity view
function renderRecentView() {
  // Clear the activity feed
  const feed = document.querySelector('.activity-feed');
  feed.innerHTML = '';
  
  // Render panels in the configured order
  settings.panels.order.forEach(panelId => {
    const panelConfig = settings.panels[panelId];
    if (!panelConfig.enabled) return;
    
    if (panelId === 'justNow') {
      const section = createSection('Just Now', 'justNowList');
      feed.appendChild(section);
      renderJustNow();
    } else if (panelId === 'earlierToday') {
      const section = createSection('Recent History', 'earlierTodayList');
      feed.appendChild(section);
      renderEarlierToday();
    } else if (panelId === 'recentlyClosed') {
      const section = createSection('Recently Closed', 'recentlyClosedList');
      feed.appendChild(section);
      renderRecentlyClosed();
    } else if (panelId === 'mostVisited') {
      const section = createSection('Most Visited', 'mostVisitedList');
      feed.appendChild(section);
      renderMostVisited();
    }
  });
  
  renderDomainFilters();
}

function createSection(title, listId) {
  const section = document.createElement('section');
  section.className = 'activity-section';
  section.innerHTML = `
    <h3 class="section-title">${title}</h3>
    <div class="activity-list" id="${listId}">
      <div class="empty-message">Loading...</div>
    </div>
  `;
  return section;
}

function renderJustNow() {
  const list = document.getElementById('justNowList');
  if (!list) return;
  
  const now = Date.now();
  const fiveMinutesAgo = now - (5 * 60 * 1000);
  
  const recent = deduplicateByUrl(
    recentHistory.filter(item => item.lastVisitTime > fiveMinutesAgo)
  ).slice(0, settings.panels.justNow.limit);
  
  if (recent.length === 0) {
    list.innerHTML = '<div class="empty-message">No recent activity</div>';
    return;
  }
  
  list.innerHTML = recent.map(item => createActivityItemHTML(item)).join('');
  
  // Add click handlers
  recent.forEach((item) => {
    try {
      const elem = document.getElementById(`activity-${item.id}`);
      if (elem) {
        elem.addEventListener('click', () => {
          window.open(item.url, '_blank');
        });
      }
    } catch (error) {
      console.warn('Failed to add event listener for item:', item.id, error);
    }
  });
}

function getDateGroup(timestamp) {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay()); // Start of this week (Sunday)
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  if (timestamp >= today.getTime()) {
    return 'Today';
  } else if (timestamp >= yesterday.getTime()) {
    return 'Yesterday';
  } else if (timestamp >= thisWeekStart.getTime()) {
    return 'This Week';
  } else if (timestamp >= lastWeekStart.getTime()) {
    return 'Last Week';
  } else if (timestamp >= thisMonthStart.getTime()) {
    return 'This Month';
  } else if (timestamp >= lastMonthStart.getTime()) {
    return 'Last Month';
  } else {
    return 'Older';
  }
}

function renderEarlierToday() {
  const list = document.getElementById('earlierTodayList');
  if (!list) return;

  const now = Date.now();
  const fiveMinutesAgo = now - (5 * 60 * 1000);

  // Deduplicate and limit, excluding "Just Now" items
  const dedupedHistory = deduplicateByUrl(
    recentHistory.filter(item => item.lastVisitTime <= fiveMinutesAgo)
  ).slice(0, settings.panels.earlierToday.limit);

  if (dedupedHistory.length === 0) {
    list.innerHTML = '<div class="empty-message">No recent history</div>';
    return;
  }

  // Group by date
  const grouped = {};
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month', 'Older'];

  dedupedHistory.forEach(item => {
    const group = getDateGroup(item.lastVisitTime);
    if (!grouped[group]) {
      grouped[group] = [];
    }
    grouped[group].push(item);
  });

  // Render with group headings
  let html = '';
  groupOrder.forEach(group => {
    if (grouped[group] && grouped[group].length > 0) {
      html += `<div class="date-group-heading">${group}</div>`;
      html += grouped[group].map(item => createActivityItemHTML(item)).join('');
    }
  });

  list.innerHTML = html;

  // Add click handlers
  dedupedHistory.forEach((item) => {
    const elem = document.getElementById(`activity-${item.id}`);
    if (elem) {
      elem.addEventListener('click', () => {
        window.open(item.url, '_blank');
      });
    }
  });
}

function renderRecentlyClosed() {
  const list = document.getElementById('recentlyClosedList');
  if (!list) return;
  
  const limited = deduplicateByUrl(recentlyClosed)
    .slice(0, settings.panels.recentlyClosed.limit);
  
  if (limited.length === 0) {
    list.innerHTML = '<div class="empty-message">No recently closed tabs</div>';
    return;
  }
  
  list.innerHTML = limited.map((tab, index) => createClosedTabHTML(tab, index)).join('');
  
  // Add click handlers
  limited.forEach((tab, index) => {
    const elem = document.getElementById(`closed-${index}`);
    if (elem) {
      elem.addEventListener('click', () => {
        chrome.tabs.create({ url: tab.url });
      });
    }
  });
}

function renderMostVisited() {
  const list = document.getElementById('mostVisitedList');
  if (!list) return;
  
  const limited = deduplicateByUrl(mostVisited)
    .slice(0, settings.panels.mostVisited.limit);
  
  if (limited.length === 0) {
    list.innerHTML = '<div class="empty-message">No data available</div>';
    return;
  }
  
  list.innerHTML = limited.map((site, index) => createMostVisitedHTML(site, index)).join('');
  
  // Add click handlers
  limited.forEach((site, index) => {
    const elem = document.getElementById(`visited-${index}`);
    if (elem) {
      elem.addEventListener('click', () => {
        window.open(site.url, '_blank');
      });
    }
  });
}

function renderDomainFilters() {
  const container = document.getElementById('domainFilters');
  
  // Extract unique domains from recent history
  const domains = new Map();
  recentHistory.forEach(item => {
    try {
      const url = new URL(item.url);
      const domain = url.hostname;
      if (!domains.has(domain)) {
        domains.set(domain, {
          icon: getFaviconForDomain(domain),
          count: 1,
          faviconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
        });
      } else {
        domains.get(domain).count++;
      }
    } catch (e) {}
  });
  
  // Sort by count
  const sortedDomains = Array.from(domains.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12);
  
  // Create chips
  let html = '<button class="domain-chip active" data-domain="all"><span class="domain-icon">All</span></button>';
  sortedDomains.forEach(([domain, data]) => {
    const displayName = domain.replace('www.', '').split('.')[0];
    html += `
      <button class="domain-chip" data-domain="${escapeHtml(domain)}">
        <img src="${data.faviconUrl}" class="domain-favicon">
        <span class="domain-icon" style="display:none;">${data.icon}</span>
        <span class="domain-name">${escapeHtml(displayName)}</span>
      </button>
    `;
  });
  
  container.innerHTML = html;
  
  // Add click handlers
  container.querySelectorAll('.domain-chip').forEach(chip => {
    chip.addEventListener('click', () => handleDomainFilter(chip));
  });
}

function handleDomainFilter(chip) {
  // Update active state
  document.querySelectorAll('#domainFilters .domain-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  
  const domain = chip.dataset.domain;
  
  if (domain === 'all') {
    // Show all - re-render with full data
    renderRecentView();
    return;
  }
  
  // Filter by domain
  const filteredHistory = recentHistory.filter(item => {
    try {
      const url = new URL(item.url);
      return url.hostname === domain;
    } catch {
      return false;
    }
  });
  
  const filteredClosed = recentlyClosed.filter(tab => {
    try {
      const url = new URL(tab.url);
      return url.hostname === domain;
    } catch {
      return false;
    }
  });
  
  const filteredVisited = mostVisited.filter(site => {
    try {
      const url = new URL(site.url);
      return url.hostname === domain;
    } catch {
      return false;
    }
  });
  
  // Clear and rebuild the feed with filtered data
  const feed = document.querySelector('.activity-feed');
  feed.innerHTML = '';
  
  // Render panels in the configured order with filtered data
  settings.panels.order.forEach(panelId => {
    const panelConfig = settings.panels[panelId];
    if (!panelConfig.enabled) return;
    
    if (panelId === 'justNow') {
      const section = createSection('Just Now', 'justNowList');
      feed.appendChild(section);
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      const justNow = filteredHistory.filter(item => item.lastVisitTime > fiveMinutesAgo);
      renderFilteredList('justNowList', justNow);
    } else if (panelId === 'earlierToday') {
      const section = createSection('Recent History', 'earlierTodayList');
      feed.appendChild(section);
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      const earlier = filteredHistory.filter(item => item.lastVisitTime <= fiveMinutesAgo);
      renderFilteredHistoryWithGroups('earlierTodayList', earlier);
    } else if (panelId === 'recentlyClosed') {
      const section = createSection('Recently Closed', 'recentlyClosedList');
      feed.appendChild(section);
      renderFilteredClosedList('recentlyClosedList', filteredClosed);
    } else if (panelId === 'mostVisited') {
      const section = createSection('Most Visited', 'mostVisitedList');
      feed.appendChild(section);
      renderFilteredVisitedList('mostVisitedList', filteredVisited);
    }
  });
}

// Render stash sidebar
function renderStashSidebar() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  let overdueCount = 0;
  let todayCount = 0;
  let weekCount = 0;
  let noReminderCount = 0;
  
  stashedTabs.forEach(tab => {
    if (!tab.reminderDate) {
      noReminderCount++;
    } else {
      const reminderDate = new Date(tab.reminderDate);
      if (reminderDate < now) {
        overdueCount++;
      } else if (reminderDate >= today && reminderDate < todayEnd) {
        todayCount++;
      } else if (reminderDate >= todayEnd && reminderDate < weekFromNow) {
        weekCount++;
      }
    }
  });
  
  document.getElementById('totalStashCount').textContent = stashedTabs.length;
  document.getElementById('overdueCount').textContent = overdueCount;
  document.getElementById('todayCount').textContent = todayCount;
  document.getElementById('weekCount').textContent = weekCount;
  document.getElementById('noReminderCount').textContent = noReminderCount;
  
  // Render preview cards (top 3 by priority: overdue > today > recent)
  const preview = document.getElementById('stashPreview');
  const previewTabs = [...stashedTabs]
    .sort((a, b) => {
      if (!a.reminderDate && !b.reminderDate) return 0;
      if (!a.reminderDate) return 1;
      if (!b.reminderDate) return -1;
      return new Date(a.reminderDate) - new Date(b.reminderDate);
    })
    .slice(0, 3);
  
  if (previewTabs.length === 0) {
    preview.innerHTML = '<div class="empty-message" style="padding: 10px;">No stashed tabs</div>';
  } else {
    preview.innerHTML = previewTabs.map(tab => createPreviewCardHTML(tab)).join('');
    
    // Add click handlers
    previewTabs.forEach(tab => {
      const elem = document.getElementById(`preview-${tab.id}`);
      if (elem) {
        elem.addEventListener('click', () => {
          openStashedTab(tab.id);
        });
      }
    });
  }
  
  // Add click handlers to category items
  document.querySelectorAll('.category-item').forEach(item => {
    item.addEventListener('click', () => {
      // Switch to stash view and apply filter
      switchToStashView();
      const filter = item.dataset.filter;
      applyStashFilter(filter);
    });
  });
}

// Apply filter to stash view
function applyStashFilter(filter) {
  currentStashFilter = filter;
  
  // Update active button
  document.querySelectorAll('.stash-filters .filter-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.filter === filter) {
      btn.classList.add('active');
    }
  });
  
  renderStashView();
}

// Render stash management view
function renderStashView() {
  document.getElementById('stashViewCount').textContent = stashedTabs.length;
  
  const list = document.getElementById('stashList');
  
  if (stashedTabs.length === 0) {
    list.innerHTML = '<div class="empty-message">No stashed tabs yet</div>';
    return;
  }
  
  // Apply filters
  let filteredTabs = [...stashedTabs];
  
  // Filter by reminder status
  if (currentStashFilter !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    filteredTabs = filteredTabs.filter(tab => {
      if (currentStashFilter === 'overdue') {
        return tab.reminderDate && new Date(tab.reminderDate) < now;
      } else if (currentStashFilter === 'today') {
        const reminderDate = tab.reminderDate ? new Date(tab.reminderDate) : null;
        return reminderDate && reminderDate >= today && reminderDate < todayEnd;
      } else if (currentStashFilter === 'week') {
        const reminderDate = tab.reminderDate ? new Date(tab.reminderDate) : null;
        return reminderDate && reminderDate >= todayEnd && reminderDate < weekFromNow;
      } else if (currentStashFilter === 'none') {
        return !tab.reminderDate;
      }
      return true;
    });
  }
  
  // Filter by domain
  if (currentDomainFilter !== 'all') {
    filteredTabs = filteredTabs.filter(tab => {
      try {
        const url = new URL(tab.url);
        return url.hostname === currentDomainFilter;
      } catch {
        return false;
      }
    });
  }
  
  if (filteredTabs.length === 0) {
    list.innerHTML = '<div class="empty-message">No tabs match the current filters</div>';
    return;
  }
  
  // Group by reminder status
  const now = new Date();
  const overdue = [];
  const today = [];
  const thisWeek = [];
  const later = [];
  const none = [];
  
  filteredTabs.forEach(tab => {
    if (!tab.reminderDate) {
      none.push(tab);
    } else {
      const reminderDate = new Date(tab.reminderDate);
      if (reminderDate < now) {
        overdue.push(tab);
      } else if (isSameDay(reminderDate, now)) {
        today.push(tab);
      } else if (isThisWeek(reminderDate)) {
        thisWeek.push(tab);
      } else {
        later.push(tab);
      }
    }
  });
  
  let html = '';
  
  if (overdue.length > 0) {
    html += '<h3 class="stash-group-title">🔴 OVERDUE</h3>';
    html += overdue.map(tab => createStashItemHTML(tab, true)).join('');
  }
  
  if (today.length > 0) {
    html += '<h3 class="stash-group-title">⏰ TODAY</h3>';
    html += today.map(tab => createStashItemHTML(tab)).join('');
  }
  
  if (thisWeek.length > 0) {
    html += '<h3 class="stash-group-title">📅 THIS WEEK</h3>';
    html += thisWeek.map(tab => createStashItemHTML(tab)).join('');
  }
  
  if (later.length > 0) {
    html += '<h3 class="stash-group-title">📆 LATER</h3>';
    html += later.map(tab => createStashItemHTML(tab)).join('');
  }
  
  if (none.length > 0) {
    html += '<h3 class="stash-group-title">📋 NO REMINDER</h3>';
    html += none.map(tab => createStashItemHTML(tab)).join('');
  }
  
  list.innerHTML = html;
  
  // Add event listeners
  stashedTabs.forEach(tab => {
    // Checkbox
    const checkbox = document.getElementById(`check-${tab.id}`);
    if (checkbox) {
      checkbox.addEventListener('change', (e) => handleCheckbox(tab.id, e.target.checked));
    }
    
    // Open button
    const openBtn = document.getElementById(`open-${tab.id}`);
    if (openBtn) {
      openBtn.addEventListener('click', () => openStashedTab(tab.id));
    }
    
    // Edit button
    const editBtn = document.getElementById(`edit-${tab.id}`);
    if (editBtn) {
      editBtn.addEventListener('click', () => openEditModal(tab.id));
    }
    
    // Delete button
    const deleteBtn = document.getElementById(`delete-${tab.id}`);
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => deleteStashedTab(tab.id));
    }
  });
  
  // Render domain filters for stash view
  renderStashDomainFilters();
}

function renderStashDomainFilters() {
  const container = document.getElementById('stashDomainFilters');
  
  // Extract unique domains
  const domains = new Map();
  stashedTabs.forEach(tab => {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      if (!domains.has(domain)) {
        domains.set(domain, {
          icon: getFaviconForDomain(domain),
          count: 1,
          faviconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
        });
      } else {
        domains.get(domain).count++;
      }
    } catch (e) {}
  });
  
  let html = '<button class="domain-chip active" data-domain="all"><span class="domain-icon">All Domains</span></button>';
  Array.from(domains.entries()).forEach(([domain, data]) => {
    const displayName = domain.replace('www.', '').split('.')[0];
    html += `
      <button class="domain-chip" data-domain="${escapeHtml(domain)}">
        <img src="${data.faviconUrl}" class="domain-favicon">
        <span class="domain-icon" style="display:none;">${data.icon}</span>
        <span class="domain-name">${escapeHtml(displayName)}</span>
        <span class="domain-count">(${data.count})</span>
      </button>
    `;
  });
  
  container.innerHTML = html;
  
  // Add click handlers
  container.querySelectorAll('.domain-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#stashDomainFilters .domain-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentDomainFilter = chip.dataset.domain;
      renderStashView();
    });
  });
}

// HTML creators
function createActivityItemHTML(item) {
  const hasReminder = stashedTabs.some(tab => tab.url === item.url);
  const timeSince = getTimeSince(item.lastVisitTime);
  const domain = getDomain(item.url);

  return `
    <div class="activity-item" id="activity-${item.id}">
      <div class="item-favicon">
        <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" alt="" />
      </div>
      <div class="item-content">
        <div class="item-title">${escapeHtml(item.title || 'Untitled')}</div>
        <div class="item-meta">
          <span>${domain}</span>
          <span>•</span>
          <span>${timeSince}</span>
          ${hasReminder ? '<span class="reminder-indicator">⏰</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

function createClosedTabHTML(tab, index) {
  const hasReminder = stashedTabs.some(t => t.url === tab.url);
  const domain = getDomain(tab.url);

  return `
    <div class="activity-item" id="closed-${index}">
      <div class="item-favicon">
        <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" alt="" />
      </div>
      <div class="item-content">
        <div class="item-title">${escapeHtml(tab.title || 'Untitled')}</div>
        <div class="item-meta">
          <span>${domain}</span>
          ${hasReminder ? '<span class="reminder-indicator">⏰</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

function createMostVisitedHTML(site, index) {
  const domain = getDomain(site.url);
  const visitCount = site.visitCount || 0;

  return `
    <div class="activity-item" id="visited-${index}">
      <div class="item-favicon">
        <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" alt="" />
      </div>
      <div class="item-content">
        <div class="item-title">${escapeHtml(site.title || 'Untitled')}</div>
        <div class="item-meta">
          <span>${domain}</span>
          <span class="visit-count">${visitCount} visits</span>
        </div>
      </div>
    </div>
  `;
}

function createPreviewCardHTML(tab) {
  const reminderText = tab.reminderDate ? formatReminderDate(tab.reminderDate) : '';
  const isOverdue = tab.reminderDate && new Date(tab.reminderDate) < new Date();

  return `
    <div class="preview-card" id="preview-${tab.id}">
      <div class="preview-card-title">${escapeHtml(tab.title)}</div>
      <div class="preview-card-meta">
        <span class="material-symbols-outlined" style="font-size: 14px; color: ${isOverdue ? '#B3261E' : tab.reminderDate ? '#6750A4' : '#79747E'};">
          ${isOverdue ? 'error' : tab.reminderDate ? 'alarm' : 'description'}
        </span>
        ${reminderText || 'No reminder'}
      </div>
    </div>
  `;
}

function createStashItemHTML(tab, isOverdue = false) {
  const stashedTime = formatDate(new Date(tab.stashedAt));
  const reminderText = tab.reminderDate ? formatReminderDate(tab.reminderDate) : '';
  const domain = getDomain(tab.url);

  return `
    <div class="stash-item ${isOverdue ? 'overdue' : ''}" id="stash-${tab.id}">
      <div class="stash-item-header">
        <input type="checkbox" class="stash-checkbox" id="check-${tab.id}">
        <div class="stash-favicon">
          <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" alt="" />
        </div>
        <div class="stash-content">
          <div class="stash-title">${escapeHtml(tab.title)}</div>
          <div class="stash-url">${escapeHtml(tab.url)}</div>
          ${tab.notes ? `<div class="stash-notes">${escapeHtml(tab.notes)}</div>` : ''}
          <div class="stash-meta">
            <span>Stashed ${stashedTime}</span>
            ${tab.reminderDate ? `<span class="stash-reminder">${reminderText}</span>` : ''}
          </div>
          <div class="stash-actions">
            <button class="stash-btn primary" id="open-${tab.id}">Open</button>
            <button class="stash-btn" id="edit-${tab.id}">Edit</button>
            <button class="stash-btn danger" id="delete-${tab.id}">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Actions
async function openStashedTab(id) {
  const tab = stashedTabs.find(t => t.id === id);
  if (!tab) return;
  
  // Open the URL
  await chrome.tabs.create({ url: tab.url });
  
  // Update stats
  settings.stats.tabsOpened = (settings.stats.tabsOpened || 0) + 1;
  if (!settings.stats.firstUse) {
    settings.stats.firstUse = Date.now();
  }
  // Update streak
  const today = new Date().setHours(0, 0, 0, 0);
  if (!settings.stats.lastActivity || settings.stats.lastActivity < today) {
    settings.stats.currentStreak = (settings.stats.currentStreak || 0) + 1;
  }
  settings.stats.lastActivity = Date.now();
  await chrome.storage.local.set({ settings });
  
  // Remove from stash
  await deleteStashedTab(id, false);
}

async function deleteStashedTab(id, reload = true) {
  stashedTabs = stashedTabs.filter(t => t.id !== id);
  await chrome.storage.local.set({ stashedTabs });
  
  // Clear reminder
  chrome.runtime.sendMessage({
    action: 'clearReminder',
    id: id
  });
  
  if (reload) {
    if (currentView === 'stash') {
      renderStashView();
    }
    renderStashSidebar();
  }
}

function handleCheckbox(id, checked) {
  if (checked) {
    selectedStashIds.add(id);
  } else {
    selectedStashIds.delete(id);
  }
  
  // Update bulk actions visibility
  const bulkActions = document.getElementById('bulkActions');
  if (selectedStashIds.size > 0) {
    bulkActions.classList.remove('hidden');
    document.getElementById('selectedCount').textContent = `${selectedStashIds.size} selected`;
  } else {
    bulkActions.classList.add('hidden');
  }
}

async function openSelected() {
  for (const id of selectedStashIds) {
    const tab = stashedTabs.find(t => t.id === id);
    if (tab) {
      await chrome.tabs.create({ url: tab.url });
    }
  }
  
  // Remove all selected from stash
  stashedTabs = stashedTabs.filter(t => !selectedStashIds.has(t.id));
  await chrome.storage.local.set({ stashedTabs });
  
  selectedStashIds.clear();
  renderStashView();
  renderStashSidebar();
}

async function deleteSelected() {
  if (!confirm(`Delete ${selectedStashIds.size} stashed tabs?`)) return;
  
  stashedTabs = stashedTabs.filter(t => !selectedStashIds.has(t.id));
  await chrome.storage.local.set({ stashedTabs });
  
  selectedStashIds.clear();
  renderStashView();
  renderStashSidebar();
}

// Edit modal
function openEditModal(id) {
  editingStashId = id;
  const tab = stashedTabs.find(t => t.id === id);
  if (!tab) return;
  
  document.getElementById('editTabTitle').textContent = tab.title;
  document.getElementById('editTabUrl').textContent = tab.url;
  document.getElementById('editNotesInput').value = tab.notes || '';
  
  if (tab.reminderDate) {
    editingReminderDate = tab.reminderDate;
    document.getElementById('editCurrentReminder').textContent = `Current: ${formatReminderDate(tab.reminderDate)}`;
    document.getElementById('editCurrentReminder').style.display = 'block';
  } else {
    editingReminderDate = null;
    document.getElementById('editCurrentReminder').style.display = 'none';
  }
  
  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
  editingStashId = null;
  editingReminderDate = null;
  
  // Reset form
  document.getElementById('editNotesInput').value = '';
  document.getElementById('editReminderInput').value = '';
  document.getElementById('editReminderInput').style.display = 'none';
  
  // Reset buttons
  document.querySelectorAll('#editModal .quick-reminder-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
}

function handleEditQuickReminder(e) {
  const btn = e.target;
  const now = new Date();
  
  // Remove selected state
  document.querySelectorAll('#editModal .quick-reminder-btn').forEach(b => {
    b.classList.remove('selected');
  });
  
  // Check if custom
  if (btn.dataset.custom) {
    document.getElementById('editReminderInput').style.display = 'block';
    document.getElementById('editReminderInput').focus();
    return;
  }
  
  // Hide custom picker
  document.getElementById('editReminderInput').style.display = 'none';
  
  // Calculate reminder date
  let reminderDate = new Date();
  
  if (btn.dataset.hours) {
    const hours = parseInt(btn.dataset.hours);
    reminderDate = new Date(now.getTime() + hours * 60 * 60 * 1000);
  } else if (btn.dataset.tomorrow) {
    reminderDate.setDate(now.getDate() + 1);
    reminderDate.setHours(parseInt(btn.dataset.tomorrow), 0, 0, 0);
  } else if (btn.dataset.days) {
    const days = parseInt(btn.dataset.days);
    reminderDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }
  
  editingReminderDate = reminderDate.toISOString();
  btn.classList.add('selected');
  
  document.getElementById('editCurrentReminder').textContent = `New: ${formatReminderDate(editingReminderDate)}`;
  document.getElementById('editCurrentReminder').style.display = 'block';
}

function handleEditCustomReminder(e) {
  const value = e.target.value;
  if (value) {
    editingReminderDate = new Date(value).toISOString();
    document.getElementById('editCurrentReminder').textContent = `New: ${formatReminderDate(editingReminderDate)}`;
    document.getElementById('editCurrentReminder').style.display = 'block';
  }
}

function clearEditReminder() {
  editingReminderDate = null;
  document.getElementById('editCurrentReminder').style.display = 'none';
  document.getElementById('editReminderInput').value = '';
  document.querySelectorAll('#editModal .quick-reminder-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
}

async function saveEdit() {
  const tab = stashedTabs.find(t => t.id === editingStashId);
  if (!tab) return;
  
  tab.notes = document.getElementById('editNotesInput').value.trim();
  tab.reminderDate = editingReminderDate;
  
  await chrome.storage.local.set({ stashedTabs });
  
  // Update reminder
  if (editingReminderDate) {
    chrome.runtime.sendMessage({
      action: 'setReminder',
      id: tab.id,
      time: new Date(editingReminderDate).getTime(),
      title: tab.title
    });
  } else {
    chrome.runtime.sendMessage({
      action: 'clearReminder',
      id: tab.id
    });
  }
  
  closeEditModal();
  renderStashView();
  renderStashSidebar();
}

async function deleteFromEdit() {
  if (!confirm('Delete this stashed tab?')) return;
  
  await deleteStashedTab(editingStashId);
  closeEditModal();
}

// Search and sort
function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  
  if (!query) {
    // Reset to show all
    renderRecentView();
    return;
  }
  
  // Filter recent history
  const filteredHistory = recentHistory.filter(item => {
    return item.title?.toLowerCase().includes(query) || 
           item.url?.toLowerCase().includes(query);
  });
  
  // Filter recently closed
  const filteredClosed = recentlyClosed.filter(tab => {
    return tab.title?.toLowerCase().includes(query) || 
           tab.url?.toLowerCase().includes(query);
  });
  
  // Filter most visited
  const filteredVisited = mostVisited.filter(site => {
    return site.title?.toLowerCase().includes(query) || 
           site.url?.toLowerCase().includes(query);
  });
  
  // Clear and rebuild the feed with filtered data
  const feed = document.querySelector('.activity-feed');
  feed.innerHTML = '';
  
  // Render panels in the configured order with filtered data
  settings.panels.order.forEach(panelId => {
    const panelConfig = settings.panels[panelId];
    if (!panelConfig.enabled) return;
    
    if (panelId === 'justNow') {
      const section = createSection('Just Now', 'justNowList');
      feed.appendChild(section);
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      const justNow = filteredHistory.filter(item => item.lastVisitTime > fiveMinutesAgo);
      renderFilteredList('justNowList', justNow);
    } else if (panelId === 'earlierToday') {
      const section = createSection('Recent History', 'earlierTodayList');
      feed.appendChild(section);
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      const earlier = filteredHistory.filter(item => item.lastVisitTime <= fiveMinutesAgo);
      renderFilteredHistoryWithGroups('earlierTodayList', earlier);
    } else if (panelId === 'recentlyClosed') {
      const section = createSection('Recently Closed', 'recentlyClosedList');
      feed.appendChild(section);
      renderFilteredClosedList('recentlyClosedList', filteredClosed);
    } else if (panelId === 'mostVisited') {
      const section = createSection('Most Visited', 'mostVisitedList');
      feed.appendChild(section);
      renderFilteredVisitedList('mostVisitedList', filteredVisited);
    }
  });
}

function renderFilteredList(containerId, items) {
  const list = document.getElementById(containerId);

  if (!list) return;

  const deduped = deduplicateByUrl(items).slice(0, 25);

  if (deduped.length === 0) {
    list.innerHTML = '<div class="empty-message">No matching results</div>';
    return;
  }

  list.innerHTML = deduped.map(item => createActivityItemHTML(item)).join('');

  deduped.forEach((item) => {
    const elem = document.getElementById(`activity-${item.id}`);
    if (elem) {
      elem.addEventListener('click', () => {
        window.open(item.url, '_blank');
      });
    }
  });
}

function renderFilteredHistoryWithGroups(containerId, items) {
  const list = document.getElementById(containerId);

  if (!list) return;

  const deduped = deduplicateByUrl(items).slice(0, settings.panels.earlierToday.limit);

  if (deduped.length === 0) {
    list.innerHTML = '<div class="empty-message">No matching results</div>';
    return;
  }

  // Group by date
  const grouped = {};
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month', 'Older'];

  deduped.forEach(item => {
    const group = getDateGroup(item.lastVisitTime);
    if (!grouped[group]) {
      grouped[group] = [];
    }
    grouped[group].push(item);
  });

  // Render with group headings
  let html = '';
  groupOrder.forEach(group => {
    if (grouped[group] && grouped[group].length > 0) {
      html += `<div class="date-group-heading">${group}</div>`;
      html += grouped[group].map(item => createActivityItemHTML(item)).join('');
    }
  });

  list.innerHTML = html;

  // Add click handlers
  deduped.forEach((item) => {
    const elem = document.getElementById(`activity-${item.id}`);
    if (elem) {
      elem.addEventListener('click', () => {
        window.open(item.url, '_blank');
      });
    }
  });
}

function renderFilteredClosedList(containerId, items) {
  const list = document.getElementById(containerId);
  
  if (!list) return;
  
  const deduped = deduplicateByUrl(items);
  
  if (deduped.length === 0) {
    list.innerHTML = '<div class="empty-message">No matching results</div>';
    return;
  }
  
  list.innerHTML = deduped.map((tab, index) => createClosedTabHTML(tab, index)).join('');
  
  deduped.forEach((tab, index) => {
    const elem = document.getElementById(`closed-${index}`);
    if (elem) {
      elem.addEventListener('click', () => {
        chrome.tabs.create({ url: tab.url });
      });
    }
  });
}

function renderFilteredVisitedList(containerId, items) {
  const list = document.getElementById(containerId);
  
  if (!list) return;
  
  const deduped = deduplicateByUrl(items);
  
  if (deduped.length === 0) {
    list.innerHTML = '<div class="empty-message">No matching results</div>';
    return;
  }
  
  list.innerHTML = deduped.map((site, index) => createMostVisitedHTML(site, index)).join('');
  
  deduped.forEach((site, index) => {
    const elem = document.getElementById(`visited-${index}`);
    if (elem) {
      elem.addEventListener('click', () => {
        window.open(site.url, '_blank');
      });
    }
  });
}

function handleStashSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  
  if (!query) {
    renderStashView();
    return;
  }
  
  // Filter stashed tabs
  const filtered = stashedTabs.filter(tab => {
    return tab.title?.toLowerCase().includes(query) ||
           tab.url?.toLowerCase().includes(query) ||
           tab.notes?.toLowerCase().includes(query);
  });
  
  // Render filtered results
  renderFilteredStashList(filtered);
}

function renderFilteredStashList(filtered) {
  const list = document.getElementById('stashList');
  
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-message">No matching stashed tabs</div>';
    return;
  }
  
  list.innerHTML = filtered.map(tab => createStashItemHTML(tab)).join('');
  
  // Add event listeners
  filtered.forEach(tab => {
    const checkbox = document.getElementById(`check-${tab.id}`);
    if (checkbox) {
      checkbox.addEventListener('change', (e) => handleCheckbox(tab.id, e.target.checked));
    }
    
    const openBtn = document.getElementById(`open-${tab.id}`);
    if (openBtn) {
      openBtn.addEventListener('click', () => openStashedTab(tab.id));
    }
    
    const editBtn = document.getElementById(`edit-${tab.id}`);
    if (editBtn) {
      editBtn.addEventListener('click', () => openEditModal(tab.id));
    }
    
    const deleteBtn = document.getElementById(`delete-${tab.id}`);
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => deleteStashedTab(tab.id));
    }
  });
}

function handleSort(e) {
  // TODO: Implement sorting
  console.log('Sort by:', e.target.value);
}

// Settings Modal
function openSettingsModal() {
  // Populate current settings
  document.getElementById('showJustNow').checked = settings.panels.justNow.enabled;
  document.getElementById('limitJustNow').value = settings.panels.justNow.limit;
  document.getElementById('showEarlierToday').checked = settings.panels.earlierToday.enabled;
  document.getElementById('limitEarlierToday').value = settings.panels.earlierToday.limit;
  document.getElementById('showRecentlyClosed').checked = settings.panels.recentlyClosed.enabled;
  document.getElementById('limitRecentlyClosed').value = settings.panels.recentlyClosed.limit;
  document.getElementById('showMostVisited').checked = settings.panels.mostVisited.enabled;
  document.getElementById('limitMostVisited').value = settings.panels.mostVisited.limit;
  
  // Reorder panels based on saved order
  const container = document.getElementById('panelSettings');
  const items = Array.from(container.children);
  settings.panels.order.forEach(panelId => {
    const item = items.find(el => el.dataset.panel === panelId);
    if (item) container.appendChild(item);
  });
  
  // Update statistics
  updateStatistics();
  
  // Setup drag and drop
  setupPanelDragAndDrop();
  
  document.getElementById('settingsModal').classList.add('active');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('active');
}

async function saveSettings() {
  // Get panel order
  const panelItems = document.querySelectorAll('.panel-setting-item');
  settings.panels.order = Array.from(panelItems).map(item => item.dataset.panel);
  
  // Get panel settings
  settings.panels.justNow.enabled = document.getElementById('showJustNow').checked;
  settings.panels.justNow.limit = parseInt(document.getElementById('limitJustNow').value);
  settings.panels.earlierToday.enabled = document.getElementById('showEarlierToday').checked;
  settings.panels.earlierToday.limit = parseInt(document.getElementById('limitEarlierToday').value);
  settings.panels.recentlyClosed.enabled = document.getElementById('showRecentlyClosed').checked;
  settings.panels.recentlyClosed.limit = parseInt(document.getElementById('limitRecentlyClosed').value);
  settings.panels.mostVisited.enabled = document.getElementById('showMostVisited').checked;
  settings.panels.mostVisited.limit = parseInt(document.getElementById('limitMostVisited').value);
  
  // Save to storage
  await chrome.storage.local.set({ settings });
  
  // Reload the view
  renderRecentView();
  
  closeSettingsModal();
}

function resetSettings() {
  if (!confirm('Reset all settings to defaults? (This will not reset your statistics)')) return;
  
  // Keep existing stats
  const currentStats = { ...settings.stats };
  
  settings = {
    panels: {
      order: ['justNow', 'earlierToday', 'recentlyClosed', 'mostVisited'],
      justNow: { enabled: true, limit: 10 },
      earlierToday: { enabled: true, limit: 25 },
      recentlyClosed: { enabled: true, limit: 25 },
      mostVisited: { enabled: true, limit: 20 }
    },
    stats: currentStats
  };
  
  chrome.storage.local.set({ settings });
  openSettingsModal(); // Refresh the modal
  renderRecentView();
}

function updateStatistics() {
  // Completion Rate - percentage of stashed tabs that were opened (not just deleted)
  const completionRate = stashedTabs.length > 0 
    ? Math.round((settings.stats.tabsOpened / (settings.stats.tabsOpened + stashedTabs.length)) * 100)
    : 0;
  document.getElementById('statCompletionRate').textContent = completionRate + '%';
  
  // Tab Overload Avoided - total tabs that would otherwise be clogging your browser
  const tabsAvoided = (settings.stats.tabsOpened || 0) + stashedTabs.length;
  document.getElementById('statTimeSaved').textContent = tabsAvoided;
  
  // Top domain today from history
  const domainCounts = {};
  recentHistory.forEach(item => {
    try {
      const domain = new URL(item.url).hostname.replace('www.', '');
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    } catch (e) {}
  });
  const topDomain = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])[0];
  document.getElementById('statTopDomain').textContent = topDomain 
    ? topDomain[0].split('.')[0] 
    : '—';
  
  // Daily average - tabs opened per day
  const daysActive = Math.max(1, Math.ceil((Date.now() - (settings.stats.firstUse || Date.now())) / (1000 * 60 * 60 * 24)));
  const dailyAvg = Math.round((settings.stats.tabsOpened || 0) / daysActive);
  document.getElementById('statDailyAverage').textContent = dailyAvg;
  
  // Streak - consecutive days with activity
  const streak = settings.stats.currentStreak || 0;
  document.getElementById('statLongestStreak').textContent = streak + 'd';
  
  // Focus Score - based on completed tabs vs overdue
  const now = new Date();
  const overdue = stashedTabs.filter(tab => tab.reminderDate && new Date(tab.reminderDate) < now).length;
  const completed = settings.stats.tabsOpened || 0;
  const focusScore = completed + overdue > 0
    ? Math.round((completed / (completed + overdue)) * 100)
    : 100;
  document.getElementById('statProductivityScore').textContent = focusScore;
}

function setupPanelDragAndDrop() {
  const container = document.getElementById('panelSettings');
  const items = container.querySelectorAll('.panel-setting-item');
  
  let draggedItem = null;
  
  items.forEach(item => {
    item.draggable = true;
    
    item.addEventListener('dragstart', (e) => {
      draggedItem = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedItem = null;
    });
    
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = getDragAfterElement(container, e.clientY);
      if (afterElement == null) {
        container.appendChild(draggedItem);
      } else {
        container.insertBefore(draggedItem, afterElement);
      }
    });
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.panel-setting-item:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Setup settings modal event listeners
document.getElementById('closeSettingsBtn').addEventListener('click', closeSettingsModal);
document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
document.getElementById('resetSettingsBtn').addEventListener('click', resetSettings);
document.getElementById('settingsModal').addEventListener('click', (e) => {
  if (e.target.id === 'settingsModal') {
    closeSettingsModal();
  }
});

// Duplicate Tab Detection
async function detectDuplicateTabs() {
  const tabs = await chrome.tabs.query({});
  const urlMap = new Map();
  const duplicates = [];
  
  tabs.forEach(tab => {
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return; // Skip chrome internal pages
    }
    
    if (urlMap.has(tab.url)) {
      duplicates.push({
        url: tab.url,
        title: tab.title,
        tabIds: [...urlMap.get(tab.url), tab.id]
      });
      urlMap.get(tab.url).push(tab.id);
    } else {
      urlMap.set(tab.url, [tab.id]);
    }
  });
  
  // Filter to only URLs with actual duplicates
  const uniqueDuplicates = [];
  urlMap.forEach((tabIds, url) => {
    if (tabIds.length > 1) {
      const tab = tabs.find(t => t.url === url);
      uniqueDuplicates.push({
        url: url,
        title: tab.title,
        count: tabIds.length,
        tabIds: tabIds
      });
    }
  });
  
  return uniqueDuplicates;
}

async function renderDuplicateTabs() {
  const section = document.getElementById('duplicateTabsSection');
  const list = document.getElementById('duplicateList');
  const countSpan = document.getElementById('duplicateCount');
  
  // Safety check - elements might not exist yet
  if (!section || !list || !countSpan) {
    return;
  }
  
  const duplicates = await detectDuplicateTabs();
  
  if (duplicates.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  
  const totalDupes = duplicates.reduce((sum, dup) => sum + (dup.count - 1), 0);
  countSpan.textContent = totalDupes;
  
  list.innerHTML = duplicates.map(dup => {
    const title = escapeHtml(dup.title || 'Untitled');
    return `
      <div class="duplicate-item">
        <strong>${title}</strong>
        <span>${dup.count} copies</span>
      </div>
    `;
  }).join('');
}

async function closeDuplicateTabs() {
  const duplicates = await detectDuplicateTabs();
  
  if (duplicates.length === 0) {
    alert('No duplicate tabs found!');
    return;
  }
  
  const totalToClose = duplicates.reduce((sum, dup) => sum + (dup.count - 1), 0);
  
  if (!confirm(`Close ${totalToClose} duplicate tabs?`)) {
    return;
  }
  
  // For each duplicate URL, keep the first tab and close the rest
  for (const dup of duplicates) {
    const tabsToClose = dup.tabIds.slice(1); // Keep first, close rest
    await chrome.tabs.remove(tabsToClose);
  }
  
  // Refresh the duplicate detection
  await renderDuplicateTabs();
}

async function groupTabsByDomain() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });

    if (!confirm('Group all tabs in this window by domain?\n\nThis will create tab groups for each domain (e.g., all Google Docs together).')) {
      return;
    }

    // Skip chrome internal pages
    const regularTabs = tabs.filter(tab =>
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://')
    );

    if (regularTabs.length === 0) {
      alert('No tabs to group!');
      return;
    }

    // Group tabs by full domain (includes subdomain)
    const domainGroups = new Map();
    regularTabs.forEach(tab => {
      try {
        const url = new URL(tab.url);
        const domain = url.hostname; // Keeps full domain including subdomains
        if (!domainGroups.has(domain)) {
          domainGroups.set(domain, []);
        }
        domainGroups.get(domain).push(tab.id);
      } catch (e) {
        console.warn('Failed to parse URL:', tab.url);
      }
    });

    // Create tab groups for each domain (Chrome 89+)
    let groupedCount = 0;
    for (const [domain, tabIds] of domainGroups) {
      if (tabIds.length >= 1) { // Group even single tabs for consistency
        try {
          const groupId = await chrome.tabs.group({ tabIds });
          await chrome.tabGroups.update(groupId, {
            title: domain.replace('www.', ''),
            collapsed: false
          });
          groupedCount++;
        } catch (e) {
          console.error('Failed to create group for domain:', domain, e);
        }
      }
    }

    alert(`Grouped ${regularTabs.length} tabs into ${groupedCount} domain groups!`);
  } catch (error) {
    console.error('Error grouping tabs:', error);
    alert('Failed to group tabs. Please try again.');
  }
}

async function splitTabsToWindows() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });

    if (!confirm('Split tabs by domain into separate windows?\n\nThis will create a new window for each domain (e.g., all Google Docs in one window).')) {
      return;
    }

    // Skip chrome internal pages
    const regularTabs = tabs.filter(tab =>
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://')
    );

    if (regularTabs.length === 0) {
      alert('No tabs to split!');
      return;
    }

    // Group tabs by full domain (includes subdomain)
    const domainGroups = new Map();
    regularTabs.forEach(tab => {
      try {
        const url = new URL(tab.url);
        const domain = url.hostname;
        if (!domainGroups.has(domain)) {
          domainGroups.set(domain, []);
        }
        domainGroups.get(domain).push(tab);
      } catch (e) {
        console.warn('Failed to parse URL:', tab.url);
      }
    });

    const currentWindowId = tabs[0].windowId;
    let windowsCreated = 0;

    // Create new window for each domain
    for (const [domain, domainTabs] of domainGroups) {
      if (domainTabs.length >= 1) {
        try {
          // Create new window with all tabs of this domain
          const tabIds = domainTabs.map(t => t.id);
          const newWindow = await chrome.windows.create({
            tabId: tabIds[0]
          });

          // Move remaining tabs to the new window
          if (tabIds.length > 1) {
            await chrome.tabs.move(tabIds.slice(1), {
              windowId: newWindow.id,
              index: -1
            });
          }

          windowsCreated++;
        } catch (e) {
          console.error('Failed to create window for domain:', domain, e);
        }
      }
    }

    alert(`Split ${regularTabs.length} tabs into ${windowsCreated} windows by domain!`);
  } catch (error) {
    console.error('Error splitting tabs:', error);
    alert('Failed to split tabs. Please try again.');
  }
}

async function ungroupAll() {
  try {
    // Only get normal windows (exclude popup, devtools, etc.)
    const allWindows = await chrome.windows.getAll({
      populate: true,
      windowTypes: ['normal']
    });

    if (allWindows.length === 0) {
      alert('No normal windows found!');
      return;
    }

    if (!confirm('Ungroup all tabs and merge into a single window?\n\nThis will remove all tab groups and move all tabs to one window.')) {
      return;
    }

    // Collect all tabs from normal windows (excluding chrome:// pages and pinned tabs)
    const allTabs = [];
    let mainWindowId = allWindows[0].id; // Use first normal window as main

    for (const window of allWindows) {
      for (const tab of window.tabs) {
        if (!tab.url.startsWith('chrome://') &&
            !tab.url.startsWith('chrome-extension://') &&
            !tab.pinned) {
          allTabs.push(tab);
        }
      }
    }

    if (allTabs.length === 0) {
      alert('No tabs to ungroup!');
      return;
    }

    // First, ungroup all tabs (remove from tab groups)
    for (const tab of allTabs) {
      if (tab.groupId !== -1) {
        try {
          await chrome.tabs.ungroup(tab.id);
        } catch (e) {
          console.warn('Failed to ungroup tab:', tab.id, e);
        }
      }
    }

    // Move all tabs to the main window
    const tabsToMove = allTabs.filter(tab => tab.windowId !== mainWindowId);
    if (tabsToMove.length > 0) {
      const tabIds = tabsToMove.map(t => t.id);
      try {
        await chrome.tabs.move(tabIds, {
          windowId: mainWindowId,
          index: -1
        });
      } catch (e) {
        console.error('Failed to move tabs:', e);
        throw e;
      }
    }

    // Close empty normal windows
    for (const window of allWindows) {
      if (window.id !== mainWindowId) {
        const remainingTabs = await chrome.tabs.query({ windowId: window.id });
        if (remainingTabs.length === 0) {
          try {
            await chrome.windows.remove(window.id);
          } catch (e) {
            console.warn('Failed to close window:', window.id, e);
          }
        }
      }
    }

    alert(`Ungrouped and merged ${allTabs.length} tabs into a single window!`);
  } catch (error) {
    console.error('Error ungrouping tabs:', error);
    alert('Failed to ungroup tabs. Please try again.');
  }
}

// Setup organization event listeners
const closeDuplicatesBtn = document.getElementById('closeDuplicatesBtn');
const groupByDomainBtn = document.getElementById('groupByDomainBtn');
const groupToWindowsBtn = document.getElementById('groupToWindowsBtn');
const ungroupAllBtn = document.getElementById('ungroupAllBtn');

if (closeDuplicatesBtn) {
  closeDuplicatesBtn.addEventListener('click', closeDuplicateTabs);
}
if (groupByDomainBtn) {
  groupByDomainBtn.addEventListener('click', groupTabsByDomain);
}
if (groupToWindowsBtn) {
  groupToWindowsBtn.addEventListener('click', splitTabsToWindows);
}
if (ungroupAllBtn) {
  ungroupAllBtn.addEventListener('click', ungroupAll);
}

// Utility functions
function deduplicateByUrl(items) {
  const seen = new Map();
  const result = [];
  
  // Process in reverse so we keep the most recent (last) occurrence
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!seen.has(item.url)) {
      seen.set(item.url, true);
      result.unshift(item); // Add to front to maintain original order
    }
  }
  
  return result;
}

function getFavicon(url) {
  try {
    const domain = new URL(url).hostname;
    return getFaviconForDomain(domain);
  } catch {
    return '📄';
  }
}

function getFaviconForDomain(domain) {
  if (domain.includes('gmail.com') || domain.includes('mail.google.com')) return '📧';
  if (domain.includes('docs.google.com')) return '📄';
  if (domain.includes('sheets.google.com')) return '📊';
  if (domain.includes('slides.google.com')) return '📽️';
  if (domain.includes('calendar.google.com')) return '📅';
  if (domain.includes('drive.google.com')) return '💾';
  if (domain.includes('meet.google.com')) return '🎥';
  if (domain.includes('github.com')) return '🐙';
  if (domain.includes('youtube.com')) return '▶️';
  if (domain.includes('reddit.com')) return '🤖';
  if (domain.includes('twitter.com') || domain.includes('x.com')) return '🐦';
  return '🌐';
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getTimeSince(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

function formatReminderDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  
  if (date < now) {
    return 'Overdue!';
  }
  
  const options = { 
    month: 'short', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit' 
  };
  return date.toLocaleString(undefined, options);
}

function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

function isThisWeek(date) {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return date < weekFromNow;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
