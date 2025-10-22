// Handle reminder notifications
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'setReminder') {
    setReminder(message.id, message.time, message.title);
  } else if (message.action === 'clearReminder') {
    clearReminder(message.id);
  } else if (message.action === 'openStashModal') {
    // Open popup when triggered from keyboard shortcut or context menu
    chrome.action.openPopup();
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'stash-tab') {
    chrome.action.openPopup();
  }
});

// Create context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'stash-tab',
    title: 'Stash this tab...',
    contexts: ['page']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'stash-tab') {
    chrome.action.openPopup();
  }
});

function setReminder(id, time, title) {
  const now = Date.now();
  const delay = time - now;
  
  if (delay > 0 && chrome.alarms) {
    // Store alarm info
    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || {};
      reminders[id] = { time, title };
      chrome.storage.local.set({ reminders });
    });
    
    // Create alarm
    chrome.alarms.create(`reminder-${id}`, { when: time });
  }
}

function clearReminder(id) {
  if (chrome.alarms) {
    chrome.alarms.clear(`reminder-${id}`);
  }
  
  chrome.storage.local.get(['reminders'], (result) => {
    const reminders = result.reminders || {};
    delete reminders[id];
    chrome.storage.local.set({ reminders });
  });
}

// Handle alarm triggers
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith('reminder-')) {
      const id = alarm.name.replace('reminder-', '');
      
      // Get reminder info
      chrome.storage.local.get(['reminders', 'stashedTabs'], (result) => {
        const reminders = result.reminders || {};
        const stashedTabs = result.stashedTabs || [];
        
        const reminder = reminders[id];
        const tab = stashedTabs.find(t => t.id === id);
        
        if (tab) {
          // Show notification
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'Tab Stash Reminder',
            message: tab.title,
            buttons: [
              { title: 'Open Tab' }
            ],
            requireInteraction: true
          }, (notificationId) => {
            // Store notification-tab mapping
            chrome.storage.local.set({ 
              [`notification-${notificationId}`]: tab.id 
            });
          });
        }
        
        // Clean up reminder
        delete reminders[id];
        chrome.storage.local.set({ reminders });
      });
    }
  });
}

// Handle notification clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) { // Open Tab button
    chrome.storage.local.get([`notification-${notificationId}`], (result) => {
      const tabId = result[`notification-${notificationId}`];
      
      if (tabId) {
        // Get the stashed tab
        chrome.storage.local.get(['stashedTabs'], (result) => {
          const stashedTabs = result.stashedTabs || [];
          const tab = stashedTabs.find(t => t.id === tabId);
          
          if (tab) {
            // Open the tab
            chrome.tabs.create({ url: tab.url });
            
            // Remove from stash
            const filteredTabs = stashedTabs.filter(t => t.id !== tabId);
            chrome.storage.local.set({ stashedTabs: filteredTabs });
          }
        });
      }
    });
    
    // Clear notification
    chrome.notifications.clear(notificationId);
  }
});

// Handle notification close
chrome.notifications.onClosed.addListener((notificationId) => {
  chrome.storage.local.remove(`notification-${notificationId}`);
});
