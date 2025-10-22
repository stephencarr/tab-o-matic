// Get current tab info
let currentTab = null;
let selectedReminderDate = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  // Load stashed tabs
  loadStashedTabs();
  
  // Set up event listeners
  document.getElementById('stashCurrentBtn').addEventListener('click', showStashModal);
  document.getElementById('confirmStashBtn').addEventListener('click', stashCurrentTab);
  document.getElementById('cancelStashBtn').addEventListener('click', hideStashModal);
  
  // Quick reminder buttons
  document.querySelectorAll('.quick-reminder-btn').forEach(btn => {
    btn.addEventListener('click', handleQuickReminder);
  });
  
  // Custom datetime input
  document.getElementById('reminderInput').addEventListener('change', handleCustomReminder);
  
  // Close modal on background click
  document.getElementById('stashModal').addEventListener('click', (e) => {
    if (e.target.id === 'stashModal') {
      hideStashModal();
    }
  });
});

function showStashModal() {
  document.getElementById('stashModal').classList.add('active');
  document.getElementById('notesInput').focus();
}

function hideStashModal() {
  document.getElementById('stashModal').classList.remove('active');
  document.getElementById('notesInput').value = '';
  document.getElementById('reminderInput').value = '';
  document.getElementById('reminderInput').style.display = 'none';
  selectedReminderDate = null;
  
  // Reset button states
  document.querySelectorAll('.quick-reminder-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  // Hide selected reminder text
  const reminderText = document.getElementById('selectedReminderText');
  reminderText.classList.remove('active');
  reminderText.textContent = '';
}

function handleQuickReminder(e) {
  const btn = e.target;
  const now = new Date();
  
  // Remove selected state from all buttons
  document.querySelectorAll('.quick-reminder-btn').forEach(b => {
    b.classList.remove('selected');
  });
  
  // Check if custom date picker
  if (btn.dataset.custom) {
    document.getElementById('reminderInput').style.display = 'block';
    document.getElementById('reminderInput').focus();
    document.getElementById('selectedReminderText').classList.remove('active');
    return;
  }
  
  // Hide custom picker
  document.getElementById('reminderInput').style.display = 'none';
  
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
  
  // Store the selected date
  selectedReminderDate = reminderDate.toISOString();
  
  // Mark button as selected
  btn.classList.add('selected');
  
  // Show selected reminder text
  const reminderText = document.getElementById('selectedReminderText');
  reminderText.textContent = `⏰ ${formatReminderDate(selectedReminderDate)}`;
  reminderText.classList.add('active');
}

function handleCustomReminder(e) {
  const value = e.target.value;
  if (value) {
    selectedReminderDate = new Date(value).toISOString();
    
    // Show selected reminder text
    const reminderText = document.getElementById('selectedReminderText');
    reminderText.textContent = `⏰ ${formatReminderDate(selectedReminderDate)}`;
    reminderText.classList.add('active');
  }
}

async function stashCurrentTab() {
  const notes = document.getElementById('notesInput').value.trim();
  
  // Create stashed item
  const stashedItem = {
    id: Date.now().toString(),
    title: currentTab.title,
    url: currentTab.url,
    notes: notes,
    reminderDate: selectedReminderDate || null,
    stashedAt: new Date().toISOString()
  };
  
  // Save to storage
  const result = await chrome.storage.local.get(['stashedTabs']);
  const stashedTabs = result.stashedTabs || [];
  stashedTabs.unshift(stashedItem); // Add to beginning
  await chrome.storage.local.set({ stashedTabs });
  
  // Set reminder alarm if date is set
  if (selectedReminderDate) {
    const reminderTime = new Date(selectedReminderDate).getTime();
    chrome.runtime.sendMessage({
      action: 'setReminder',
      id: stashedItem.id,
      time: reminderTime,
      title: stashedItem.title
    });
  }
  
  // Close the current tab
  await chrome.tabs.remove(currentTab.id);
  
  // Close popup (it will close automatically when tab closes)
}

async function loadStashedTabs() {
  const result = await chrome.storage.local.get(['stashedTabs']);
  const stashedTabs = result.stashedTabs || [];
  
  const container = document.getElementById('stashedList');
  const emptyState = document.getElementById('emptyState');
  
  if (stashedTabs.length === 0) {
    emptyState.style.display = 'block';
    container.innerHTML = '';
    return;
  }
  
  emptyState.style.display = 'none';
  container.innerHTML = stashedTabs.map(item => createStashedItemHTML(item)).join('');
  
  // Add event listeners
  stashedTabs.forEach(item => {
    // Open tab
    document.getElementById(`open-${item.id}`).addEventListener('click', () => openTab(item));
    
    // Delete tab
    document.getElementById(`delete-${item.id}`).addEventListener('click', () => deleteTab(item.id));
    
    // Title click to open
    document.getElementById(`title-${item.id}`).addEventListener('click', () => openTab(item));
  });
}

function createStashedItemHTML(item) {
  const stashedDate = new Date(item.stashedAt);
  const reminderHTML = item.reminderDate 
    ? `<div class="item-reminder">⏰ ${formatReminderDate(item.reminderDate)}</div>`
    : '';
  
  const notesHTML = item.notes 
    ? `<div class="item-notes">${escapeHtml(item.notes)}</div>`
    : '';
  
  return `
    <div class="stashed-item">
      <div class="item-header">
        <div class="item-title" id="title-${item.id}">${escapeHtml(item.title)}</div>
        <button class="delete-btn" id="delete-${item.id}" title="Delete">×</button>
      </div>
      <div class="item-url">${escapeHtml(item.url)}</div>
      ${notesHTML}
      ${reminderHTML}
      <div class="timestamp">Stashed ${formatDate(stashedDate)}</div>
      <div class="item-actions">
        <button class="btn btn-primary" id="open-${item.id}">Open & Remove</button>
      </div>
    </div>
  `;
}

async function openTab(item) {
  // Open the URL
  await chrome.tabs.create({ url: item.url });
  
  // Remove from stash
  await deleteTab(item.id, false);
}

async function deleteTab(id, reload = true) {
  const result = await chrome.storage.local.get(['stashedTabs']);
  const stashedTabs = result.stashedTabs || [];
  const filteredTabs = stashedTabs.filter(item => item.id !== id);
  await chrome.storage.local.set({ stashedTabs: filteredTabs });
  
  // Clear reminder if exists
  chrome.runtime.sendMessage({
    action: 'clearReminder',
    id: id
  });
  
  if (reload) {
    loadStashedTabs();
  }
}

function formatDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

function formatReminderDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  
  if (date < now) {
    return 'Reminder overdue!';
  }
  
  const options = { 
    month: 'short', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit' 
  };
  return date.toLocaleString(undefined, options);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
