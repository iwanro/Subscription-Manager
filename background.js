// Background service worker for notifications and alarms
importScripts('utilities.js');
let alarmInterval = null;

// Store active timeout IDs for proper cleanup
const activeTimeouts = new Set();

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Subscription Manager extension installed');
  
  // Set up periodic alarm for checking expiring subscriptions
  chrome.alarms.create('checkExpiringSubscriptions', {
    delayInMinutes: 60, // Check every hour
    periodInMinutes: 60
  });
  
  // Set up periodic alarm for syncing settings
  chrome.alarms.create('syncSettings', {
    delayInMinutes: 30, // Sync every 30 minutes
    periodInMinutes: 30
  });

  // Set up periodic alarm for checking budget
  chrome.alarms.create('checkBudget', {
    delayInMinutes: 15, // Check every 15 minutes
    periodInMinutes: 15
  });
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkExpiringSubscriptions') {
    checkExpiringSubscriptions();
  } else if (alarm.name === 'syncSettings') {
    syncSettingsFromWebApp();
  } else if (alarm.name === 'checkBudget') {
    checkBudgetAlerts();
  }
});

// MODERNIZED: Listen for messages from popup with improved async handling
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  try {
    switch (request.type) {
      case 'checkSubscriptions':
        checkExpiringSubscriptions();
        sendResponse({ success: true });
        break;

      case 'getNotificationSettings':
        const notificationResult = await getNotificationSettings();
        sendResponse(notificationResult);
        break;

      case 'syncNotificationSettings':
        const syncResult = await syncNotificationSettings(request.settings);
        sendResponse(syncResult);
        break;

      case 'getAllData':
        const allDataResult = await getAllData();
        sendResponse(allDataResult);
        break;

      case 'addSubscription':
        const addResult = await handleAddSubscription(request.data);
        sendResponse(addResult);
        break;

      case 'updateSubscription':
        const updateResult = await handleUpdateSubscription(request.id, request.data);
        sendResponse(updateResult);
        break;

      case 'deleteSubscription':
        const deleteResult = await handleDeleteSubscription(request.id);
        sendResponse(deleteResult);
        break;

      case 'testNotification':
        const testNotifResult = await testNotification(request.data);
        sendResponse(testNotifResult);
        break;

      case 'testEmail':
        const testEmailResult = await testEmail(request.data);
        sendResponse(testEmailResult);
        break;

      default:
        console.warn('Unknown message type:', request.type);
        sendResponse({ error: 'Unknown message type: ' + request.type });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ error: error.message });
  }
});

// MODERNIZED: Get notification settings using async/await
async function getNotificationSettings() {
  try {
    const result = await chrome.storage.local.get(['notificationSettings']);
    return { settings: result.notificationSettings || {} };
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return { error: error.message };
  }
}

// MODERNIZED: Sync notification settings using async/await
async function syncNotificationSettings(settings) {
  try {
    const result = await chrome.storage.local.get(['baseUrl', 'apiToken']);

    if (!result.baseUrl || !result.apiToken) {
      return { error: 'Missing API configuration' };
    }

    const response = await fetch(`${result.baseUrl}/api/notification-settings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${result.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      throw new Error(`Failed to sync settings: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, data: data };
  } catch (error) {
    console.error('Error syncing notification settings:', error);
    return { error: error.message };
  }
}

// MODERNIZED: Get all data from storage
async function getAllData() {
  try {
    const result = await chrome.storage.local.get([
      'subscriptions',
      'settings',
      'notificationSettings',
      'budgetSettings',
      'emailSettings',
      'premiumStatus',
      'trialEndDate'
    ]);

    return {
      success: true,
      data: {
        subscriptions: result.subscriptions || [],
        settings: result.settings || {},
        notificationSettings: result.notificationSettings || {},
        budgetSettings: result.budgetSettings || {},
        emailSettings: result.emailSettings || {},
        premiumStatus: result.premiumStatus || 'free',
        trialEndDate: result.trialEndDate || null
      }
    };
  } catch (error) {
    console.error('Error getting all data:', error);
    return { error: error.message };
  }
}

async function checkExpiringSubscriptions() {
  try {
    // Get subscriptions and notification settings from storage
    const result = await chrome.storage.local.get(['subscriptions', 'notificationSettings']);
    
    let subscriptions = result.subscriptions || [];
    const notificationSettings = result.notificationSettings || {};
    
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Check for expired subscriptions and mark them as inactive
    let updated = false;
    subscriptions = subscriptions.map(sub => {
      if (sub.nextPaymentDate && sub.isActive) {
        const paymentDate = new Date(sub.nextPaymentDate);
        if (paymentDate < now) {
          updated = true;
          return { ...sub, isActive: false };
        }
      }
      return sub;
    });
    
    if (updated) {
      await chrome.storage.local.set({ subscriptions });
    }
    
    // Check if browser notifications are enabled
    if (!notificationSettings.browserNotifications) {
      console.log('Browser notifications are disabled');
      return;
    }

    // Check for expiring subscriptions (next 7 days)
    const expiringSoon = subscriptions.filter(sub => {
      if (!sub.nextPaymentDate || !sub.isActive) return false;
      const paymentDate = new Date(sub.nextPaymentDate);
      return paymentDate <= sevenDaysFromNow && paymentDate >= now;
    });
    
    // Check notification frequency
    const shouldNotify = checkNotificationFrequency(notificationSettings.notificationFrequency, now);
    
    if (shouldNotify && expiringSoon.length > 0) {
      expiringSoon.forEach(subscription => {
        showNotification(subscription);
      });
    }

  } catch (error) {
    console.error('Error checking subscriptions:', error);
  }
}

function checkNotificationFrequency(frequency, now) {
  const currentHour = now.getHours();
  
  switch (frequency) {
    case 'immediate':
      return true;
    case 'daily':
      // Only notify between 9 AM and 5 PM
      return currentHour >= 9 && currentHour <= 17;
    case 'weekly':
      // Only notify on Mondays at 10 AM
      return now.getDay() === 1 && currentHour === 10;
    default:
      return false;
  }
}

function showNotification(subscription) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title: 'Subscription Expiring Soon',
    message: `${subscription.name} - $${subscription.price} on ${new Date(subscription.nextPaymentDate).toLocaleDateString()}`
  });
}

// MODERNIZED: Data management handlers using async/await
async function handleAddSubscription(subscriptionData) {
  try {
    const result = await chrome.storage.local.get(['subscriptions']);
    const subscriptions = result.subscriptions || [];

    const newSubscription = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      ...subscriptionData,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    subscriptions.push(newSubscription);
    await chrome.storage.local.set({ subscriptions });

    return { success: true, subscription: newSubscription };
  } catch (error) {
    console.error('Error adding subscription:', error);
    return { error: error.message };
  }
}

// MODERNIZED: Update subscription handler using async/await
async function handleUpdateSubscription(id, updates) {
  try {
    const result = await chrome.storage.local.get(['subscriptions']);
    const subscriptions = result.subscriptions || [];

    const index = subscriptions.findIndex(sub => sub.id === id);
    if (index !== -1) {
      subscriptions[index] = {
        ...subscriptions[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ subscriptions });
      return { success: true, subscription: subscriptions[index] };
    } else {
      return { error: 'Subscription not found' };
    }
  } catch (error) {
    console.error('Error updating subscription:', error);
    return { error: error.message };
  }
}

// MODERNIZED: Delete subscription handler using async/await
async function handleDeleteSubscription(id) {
  try {
    const result = await chrome.storage.local.get(['subscriptions']);
    let subscriptions = result.subscriptions || [];

    subscriptions = subscriptions.filter(sub => sub.id !== id);
    await chrome.storage.local.set({ subscriptions });

    return { success: true };
  } catch (error) {
    console.error('Error deleting subscription:', error);
    return { error: error.message };
  }
}

// MODERNIZED: Test notification handler using async/await
async function testNotification(data) {
  try {
    console.log('Testing notification with data:', data);

    // Create test notification
    const notificationId = `test-${Date.now()}`;

    return new Promise((resolve) => {
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: data.title || 'Test Notification',
        message: data.message || 'This is a test notification',
        priority: 2,
        buttons: [
          { title: 'View Details' },
          { title: 'Dismiss' }
        ]
      }, (createdNotificationId) => {
        if (chrome.runtime.lastError) {
          console.error('Notification error:', chrome.runtime.lastError);
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          console.log('Test notification created:', createdNotificationId);

          // Auto-clear test notification after 5 seconds
          const timeoutId = setTimeout(() => {
            chrome.notifications.clear(createdNotificationId);
            activeTimeouts.delete(timeoutId);
          }, 5000);
          activeTimeouts.add(timeoutId);

          resolve({ success: true, notificationId: createdNotificationId });
        }
      });
    });

  } catch (error) {
    console.error('Error creating test notification:', error);
    return { error: error.message };
  }
}

// MODERNIZED: Test email handler using async/await
async function testEmail(data) {
  try {
    console.log('Testing email with data:', data);

    // Get email settings
    const result = await chrome.storage.local.get(['emailSettings']);
    const emailSettings = result.emailSettings || {};

    if (!emailSettings.service) {
      return { error: 'Email service not configured. Please configure email settings first.' };
    }

    // Send email based on configured service
    switch (emailSettings.service) {
      case 'brevo':
        return await sendBrevoEmail(data, emailSettings);
      case 'emailjs':
        return { error: 'EmailJS testing requires frontend implementation. Please save settings and test from popup.' };
      case 'custom':
        return { error: 'Custom SMTP testing not implemented yet.' };
      default:
        return { error: 'Unknown email service: ' + emailSettings.service };
    }

  } catch (error) {
    console.error('Error testing email:', error);
    return { error: error.message };
  }
}

// NOTE: sendBrevoEmail is now imported from utilities.js to avoid duplication

// Check for budget alerts and send notifications
async function checkBudgetAlerts() {
  try {
    const result = await chrome.storage.local.get(['budgetSettings', 'subscriptions', 'notificationSettings']);
    const budgetSettings = result.budgetSettings || {};
    const subscriptions = result.subscriptions || [];
    const notificationSettings = result.notificationSettings || {};
    
    if (!budgetSettings.limit || !notificationSettings.browserNotifications) {
      return; // No budget set or notifications disabled
    }
    
    const activeSubs = subscriptions.filter(sub => sub.isActive);
    const totalSpent = activeSubs.reduce((sum, sub) => sum + sub.price, 0);
    const percentage = Math.round((totalSpent / budgetSettings.limit) * 100);
    const threshold = budgetSettings.threshold || 80;
    
    // Check if we should show notification
    if (percentage > 100) {
      // Over budget
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: '💰 Budget Exceeded!',
        message: `You've exceeded your budget by $${(totalSpent - budgetSettings.limit).toFixed(2)} (${percentage}%)`,
        priority: 2
      });
    } else if (percentage > threshold) {
      // Near budget
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: '📊 Budget Warning',
        message: `You're approaching your budget limit (${percentage}% of $${budgetSettings.limit})`,
        priority: 1
      });
    }
    
  } catch (error) {
    console.error('Error checking budget alerts:', error);
  }
}

// MODERNIZED: Sync settings from web app (placeholder for future implementation)
async function syncSettingsFromWebApp() {
  try {
    console.log('Syncing settings from web app...');
    // Placeholder for future web app sync functionality
    // This would typically pull settings from a remote server
  } catch (error) {
    console.error('Error syncing settings from web app:', error);
  }
}

// Clean up on uninstall
chrome.runtime.setUninstallURL('https://your-domain.com/uninstall');

// Clean up all active timeouts when service worker is terminated
self.addEventListener('beforeunload', () => {
  activeTimeouts.forEach(timeoutId => {
    clearTimeout(timeoutId);
  });
  activeTimeouts.clear();
});
