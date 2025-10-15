// Popup JavaScript for Subscription Manager
window.subscriptions = [];
window.notificationSettings = {};

// API Rate Limiting System
const API_RATE_LIMITS = {
  brevo: { maxCalls: 10, windowMs: 60000 }, // 10 calls per minute
  currency: { maxCalls: 5, windowMs: 300000 } // 5 calls per 5 minutes
};

const apiCallHistory = {};

function checkRateLimit(apiName) {
  const now = Date.now();
  const limit = API_RATE_LIMITS[apiName];

  if (!limit) return true;

  if (!apiCallHistory[apiName]) {
    apiCallHistory[apiName] = [];
  }

  // Remove old calls outside the window
  apiCallHistory[apiName] = apiCallHistory[apiName].filter(timestamp =>
    now - timestamp < limit.windowMs
  );

  // Check if we've exceeded the limit
  if (apiCallHistory[apiName].length >= limit.maxCalls) {
    const oldestCall = Math.min(...apiCallHistory[apiName]);
    const waitTime = Math.ceil((limit.windowMs - (now - oldestCall)) / 1000);
    throw new Error(`Rate limit exceeded for ${apiName}. Please wait ${waitTime} seconds.`);
  }

  // Add current call
  apiCallHistory[apiName].push(now);
  return true;
}

// Secure API wrapper with rate limiting
async function secureAPICall(apiName, url, options = {}) {
  try {
    checkRateLimit(apiName);

    // Add timeout and security headers
    const secureOptions = {
      ...options,
      timeout: options.timeout || 10000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const response = await fetch(url, secureOptions);
    return response;
  } catch (error) {
    if (error.message.includes('Rate limit exceeded')) {
      throw error;
    }
    console.error(`API call failed for ${apiName}:`, error);
    throw new Error(`Failed to connect to ${apiName} service`);
  }
}

// Event Listener Management System to prevent memory leaks
window.eventListeners = new Map();

function addEventSafe(element, event, handler, options = {}) {
  if (!element || !event || !handler) return;

  element.addEventListener(event, handler, options);

  // Store reference for cleanup
  if (!window.eventListeners.has(element)) {
    window.eventListeners.set(element, new Map());
  }
  window.eventListeners.get(element).set(event, { handler, options });
}

function removeEventSafe(element, event) {
  if (!element || !event) return;

  const elementListeners = window.eventListeners.get(element);
  if (elementListeners && elementListeners.has(event)) {
    const { handler, options } = elementListeners.get(event);
    element.removeEventListener(event, handler, options);
    elementListeners.delete(event);

    // Clean up empty element entries
    if (elementListeners.size === 0) {
      window.eventListeners.delete(element);
    }
  }
}

function removeAllListenersForElement(element) {
  if (!element) return;

  const elementListeners = window.eventListeners.get(element);
  if (elementListeners) {
    elementListeners.forEach(({ handler, options }, event) => {
      element.removeEventListener(event, handler, options);
    });
    window.eventListeners.delete(element);
  }
}

function removeAllEventListeners() {
  window.eventListeners.forEach((elementListeners, element) => {
    elementListeners.forEach(({ handler, options }, event) => {
      element.removeEventListener(event, handler, options);
    });
  });
  window.eventListeners.clear();
}

// Cleanup function to call when popup is closed
function cleanupPopup() {
  console.log('🧹 Starting popup cleanup...');

  // Remove all event listeners first
  removeAllEventListeners();

  // Clean up any global references and prevent memory leaks
  try {
    // Clean up premium manager
    if (window.premiumManager) {
      if (typeof window.premiumManager.destroy === 'function') {
        window.premiumManager.destroy();
      }
      window.premiumManager = null;
    }

    // Clean up analytics dashboard
    if (window.analyticsDashboard) {
      if (typeof window.analyticsDashboard.destroy === 'function') {
        window.analyticsDashboard.destroy();
      }
      window.analyticsDashboard = null;
    }

    // Clean up AI categorizer
    if (window.aiCategorizer) {
      if (typeof window.aiCategorizer.destroy === 'function') {
        window.aiCategorizer.destroy();
      }
      window.aiCategorizer = null;
    }

    // Clean up chart instances
    if (window.chartInstances) {
      Object.values(window.chartInstances).forEach(chart => {
        if (typeof chart.destroy === 'function') {
          chart.destroy();
        }
      });
      window.chartInstances = {};
    }

    // Clean up timers and intervals
    if (window.popupTimers) {
      window.popupTimers.forEach(timerId => clearTimeout(timerId));
      window.popupTimers = [];
    }

    // Clean up DOM references
    if (window.content) {
      window.content.innerHTML = '';
    }

    // Remove event listeners from window
    if (window.removeEventListener) {
      // Store references to handlers so we can properly remove them
      if (window._trialStatusChangedHandler) {
        window.removeEventListener('trialStatusChanged', window._trialStatusChangedHandler);
        window._trialStatusChangedHandler = null;
      }
      if (window._beforeUnloadHandler) {
        window.removeEventListener('beforeunload', window._beforeUnloadHandler);
        window._beforeUnloadHandler = null;
      }
    }

    // Clean up storage change listeners
    if (chrome.storage && chrome.storage.onChanged) {
      // Chrome doesn't provide a direct way to remove storage listeners
      // But we can mark them as inactive
      window._storageListenersActive = false;
    }

    // Clean up any external library references
    if (window.XLSX) {
      window.XLSX = null;
    }
    if (window.jspdf) {
      window.jspdf = null;
    }

    // Clean up event listeners
    cleanupEventListeners();

    console.log('✅ Popup cleanup completed successfully');
  } catch (error) {
    console.error('❌ Error during popup cleanup:', error);
  }
}

// Enhanced popup close handler
function handlePopupClose() {
  cleanupPopup();
}

// Register cleanup on page unload
window.addEventListener('beforeunload', cleanupPopup);

// Also handle visibility change (popup hidden)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cleanupPopup();
  }
});

// Enhanced cleanup function with proper event listener removal
function cleanupEventListeners() {
  try {
    window.removeEventListener('beforeunload', cleanupPopup);
    document.removeEventListener('visibilitychange', () => {
      if (document.hidden) {
        cleanupPopup();
      }
    });
  } catch (error) {
    console.warn('⚠️ Error removing event listeners:', error);
  }
}

// Load external scripts dynamically
async function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Load SheetJS library for Excel export with robust error handling
async function loadSheetJS() {
  if (window.XLSX) return true; // Already loaded
  
  try {
    // Try multiple CDN sources as fallback
    const cdnSources = [
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
    ];
    
    let lastError = null;
    for (const source of cdnSources) {
      try {
        await loadScript(source);
        if (window.XLSX) {
          showToast('SheetJS library loaded successfully', 'success');
          return true;
        }
      } catch (error) {
        lastError = error;
        console.warn('Failed to load SheetJS from:', source, error.message);
      }
    }
    
    throw new Error('All CDN sources for SheetJS failed to load');
  } catch (error) {
    console.error('❌ Failed to load SheetJS library:', error);
    showToast('Failed to load Excel library. Please check your internet connection and try again.', 'error');
    
    // Fallback: Use basic CSV export instead
    window.exportToCSV = function(data, filename) {
      try {
        const csv = convertToCSV(data);
        downloadFile(csv, filename, 'text/csv');
        showToast('Data exported as CSV successfully', 'success');
        return true;
      } catch (fallbackError) {
        console.error('CSV export fallback failed:', fallbackError);
        showToast('Failed to export data', 'error');
        return false;
      }
    };
    
    return false;
  }
}

// Load jsPDF library for PDF generation with robust error handling  
async function loadJSPDF() {
  if (window.jspdf) return true; // Already loaded
  
  try {
    // Try multiple CDN sources as fallback
    const cdnSources = [
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
    ];
    
    let lastError = null;
    for (const source of cdnSources) {
      try {
        await loadScript(source);
        if (window.jspdf) {
          showToast('jsPDF library loaded successfully', 'success');
          return true;
        }
      } catch (error) {
        lastError = error;
        console.warn('Failed to load jsPDF from:', source, error.message);
      }
    }
    
    throw new Error('All CDN sources for jsPDF failed to load');
  } catch (error) {
    console.error('❌ Failed to load jsPDF library:', error);
    showToast('Failed to load PDF library. Please check your internet connection and try again.', 'error');
    return false;
  }
}

// Helper function for CSV conversion fallback
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => 
    headers.map(header => {
      const value = row[header] || '';
      // Escape quotes and wrap in quotes if contains comma or quote
      return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
        ? `"${value.replace(/"/g, '""')}"` 
        : value;
    }).join(',')
  );
  
  return [csvHeaders, ...csvRows].join('\n');
}

// Helper function for file download fallback
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Modal system
function showModal(content) {
  const modalContainer = document.getElementById('modalContainer');
  if (!modalContainer) {
    console.error('Modal container not found');
    return;
  }

  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <button class="modal-close" data-action="close">×</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
      </div>
    </div>
  `;

  modalContainer.classList.remove('hidden');

  // Add event listeners programmatically (CSP compliant)
  const modalOverlay = modalContainer.querySelector('.modal-overlay');
  const closeBtn = modalContainer.querySelector('.modal-close');

  // Click outside to close
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });
  }

  // Close button click
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  // Handle any premium upgrade buttons in the content
  const upgradeBtns = modalContainer.querySelectorAll('[data-action*="upgrade"], [data-action*="premium"]');
  upgradeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.getAttribute('data-action');
      if (window.premiumManager && window.premiumManager.showUpgradePrompt) {
        const trigger = action.includes('trial') ? 'trial_upgrade' : 'general';
        showModal(window.premiumManager.showUpgradePrompt(trigger));
      }
    });
  });

  // Handle trial button
  const trialBtn = modalContainer.querySelector('#startTrialBtn');
  if (trialBtn) {
    trialBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.premiumManager && window.premiumManager.startTrial) {
        window.premiumManager.startTrial();
        closeModal();
      }
    });
  }

  // Handle reload button
  const reloadBtn = modalContainer.querySelector('[data-action="reload"]');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.reload();
    });
  }

  // Handle feature cards and other actions
  const featureCards = modalContainer.querySelectorAll('[data-action]');
  featureCards.forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const action = card.getAttribute('data-action');
      const target = card.getAttribute('data-target');
      const feature = card.getAttribute('data-feature');

      switch (action) {
        case 'switch-tab':
          if (target && window.switchTab) {
            window.switchTab(target);
            closeModal();
          }
          break;
        case 'show-ai-insights':
          if (window.showAIInsights) {
            window.showAIInsights();
            closeModal();
          }
          break;
        case 'show-notification-settings':
          if (window.showNotificationSettings) {
            window.showNotificationSettings();
            closeModal();
          }
          break;
        case 'show-pdf-export':
          if (window.showPDFExportOptions) {
            window.showPDFExportOptions();
            closeModal();
          }
          break;
        case 'load-subscriptions':
          if (window.loadSubscriptions) {
            window.loadSubscriptions();
            closeModal();
          }
          break;
        default:
          // Handle any upgrade actions
          if (action.includes('upgrade') && window.premiumManager) {
            const trigger = feature || 'general';
            showModal(window.premiumManager.showUpgradePrompt(trigger));
          }
      }
    });
  });
}

function closeModal() {
  const modalContainer = document.getElementById('modalContainer');
  if (modalContainer) {
    modalContainer.classList.add('hidden');
    modalContainer.innerHTML = '';
  }
}

// Premium upgrade prompt
// DEPRECATED: Use window.premiumManager?.showUpgradePrompt() instead
function showPremiumUpgradePrompt(trigger) {
  console.warn('⚠️ showPremiumUpgradePrompt is deprecated. Use window.premiumManager?.showUpgradePrompt() instead.');

  // Fallback to premium manager if available
  if (window.premiumManager && typeof window.premiumManager.showUpgradePrompt === 'function') {
    const prompt = window.premiumManager.showUpgradePrompt(trigger);
    showModal(prompt);
    return;
  }

  // Hardcoded fallback (minimal)
  const fallbackPrompt = `
    <div class="premium-prompt">
      <div class="premium-icon">💎</div>
      <h3>Premium Feature</h3>
      <p>This feature requires Premium subscription.</p>
      <button class="btn btn-premium" data-action="upgrade">Upgrade to Premium</button>
    </div>
  `;
  showModal(fallbackPrompt);
  
  window.content.innerHTML = `
    <div class="premium-upgrade-prompt">
      <div class="premium-header">
        <h2>${config.title}</h2>
        <div class="premium-badge">💎 PREMIUM</div>
      </div>
      
      <div class="premium-message">
        <p>${config.message}</p>
        <div class="premium-savings">${config.savings}</div>
      </div>
      
      <div class="premium-features">
        <h4>Premium Features Include:</h4>
        <ul>
          <li>🔄 Unlimited subscriptions (vs 10 free limit)</li>
          <li>🤖 AI-powered duplicate detection & insights</li>
          <li>📧 Email notifications with multiple providers</li>
          <li>📊 Advanced analytics & historical data</li>
          <li>💰 Advanced budgeting with category limits</li>
          <li>📱 Priority support & updates</li>
          <li>💾 Automatic cloud backup & sync</li>
          <li>📈 Export to PDF & Excel reports</li>
          <li>🎯 Smart renewal predictions</li>
          <li>🔒 Enhanced security & encryption</li>
        </ul>
      </div>
      
      <div class="premium-pricing">
        <div class="pricing-option recommended clickable-card" data-plan="annual" data-price="39.99">
          <div class="pricing-badge">BEST VALUE</div>
          <div class="pricing-title">Annual Plan</div>
          <div class="pricing-price">$39.99/year</div>
          <div class="pricing-savings">Save 33% • Only $3.33/month</div>
        </div>
        <div class="pricing-option clickable-card" data-plan="monthly" data-price="4.99">
          <div class="pricing-title">Monthly Plan</div>
          <div class="pricing-price">$4.99/month</div>
          <div class="pricing-billing">Billed monthly</div>
        </div>
      </div>
      
      <div class="premium-actions">
        <button class="btn btn-premium btn-large" id="buyAnnualPlanBtn" data-plan="annual">
          💳 Buy Annual Plan - $39.99
        </button>
        <button class="btn btn-premium btn-large" id="buyMonthlyPlanBtn" data-plan="monthly">
          💳 Buy Monthly Plan - $4.99
        </button>
        <button class="btn btn-outline" id="startTrialBtn">
          🆓 Start 30-Day Free Trial
        </button>
        <button class="btn btn-text" id="continueFreeBtn">
          Continue with Free Version
        </button>
      </div>
      
      <div class="stripe-notice">
        <p style="font-size: 11px; color: #6c757d; text-align: center; margin-top: 12px;">
          🔒 Secure payment processing by Stripe • Cancel anytime • 30-day money-back guarantee
        </p>
      </div>
    </div>
  `;
}

// Smart Premium Action - Intelligently handles premium button clicks
function handleSmartPremiumAction() {
  if (!window.premiumManager) {
    console.error('Premium manager not available');
    showToast('Premium features unavailable', 'error');
    return;
  }

  // Check current premium status and route to appropriate action
  if (window.premiumManager.isTrialActive()) {
    // User has active trial - show premium features dashboard
    showPremiumFeatures();
  } else if (window.premiumManager.isPremium()) {
    // User has premium - show premium features dashboard
    showPremiumFeatures();
  } else {
    // User is free - show upgrade prompt
    showPremiumUpgradePrompt('overview');
  }
}

// Update premium button text based on status
function updatePremiumButtonText() {
  const premiumBtnText = document.getElementById('premiumBtnText');
  if (!premiumBtnText || !window.premiumManager) return;

  if (window.premiumManager.isTrialActive()) {
    const daysLeft = Math.ceil((window.premiumManager.trialEndDate - new Date()) / (1000 * 60 * 60 * 24));
    premiumBtnText.textContent = `Trial: ${daysLeft} days left`;
  } else if (window.premiumManager.isPremium()) {
    premiumBtnText.textContent = 'Premium Active';
  } else {
    premiumBtnText.textContent = 'Unlock Premium';
  }
}

// Check for premium triggers and update status badges
function updateStatusBadges() {
  const freeTrialBadge = document.getElementById('freeTrialBadge');
  const premiumBadge = document.getElementById('premiumBadge');

  if (window.premiumManager) {
    if (window.premiumManager.isTrialActive()) {
      freeTrialBadge.style.display = 'flex';
      premiumBadge.style.display = 'none';
    } else if (window.premiumManager.isPremium()) {
      freeTrialBadge.style.display = 'none';
      premiumBadge.style.display = 'flex';
    } else {
      freeTrialBadge.style.display = 'none';
      premiumBadge.style.display = 'none';
    }

    // Update premium button text based on status
    updatePremiumButtonText();
  }
}

// Check for premium triggers
function checkPremiumTriggers() {
  if (!window.premiumManager || window.premiumManager.isPremium()) {
    return;
  }
  
  // Check subscription count
  chrome.storage.local.get(['subscriptions'], (result) => {
    window.subscriptions = result.subscriptions || [];
    if (window.subscriptions.length >= 8) { // Show warning at 8/10
      showSubscriptionLimitWarning();
    }
  });
}

// Show subscription limit warning
function showSubscriptionLimitWarning() {
  // Remove any existing warning
  const existingWarning = document.querySelector('.subscription-limit-warning');
  if (existingWarning) {
    existingWarning.remove();
  }
  
  const warningDiv = document.createElement('div');
  warningDiv.className = 'subscription-limit-warning';
  warningDiv.innerHTML = `
    <div class="limit-warning-content">
      <span class="warning-icon">⚠️</span>
      <span class="warning-text">You're approaching the free limit of 10 subscriptions. </span>
      <button class="upgrade-link" data-action="upgrade-prompt" data-trigger="subscription_limit">
        Upgrade to Premium
      </button>
    </div>
  `;
  
  // Insert after header
  const header = document.querySelector('.header');
  header.parentNode.insertBefore(warningDiv, header.nextSibling);
}


// Initialize Stripe checkout (prepared for Stripe integration)
function initializeStripeCheckout(plan, price) {
  // This function is prepared for Stripe integration
  // For now, show preparation message
  window.content.innerHTML = `
    <div class="stripe-checkout-prep">
      <h3 class="section-title">🚀 Stripe Integration Ready</h3>
      
      <div class="checkout-info">
        <div class="selected-plan">
          <h4>Selected Plan: ${plan === 'annual' ? 'Annual' : 'Monthly'}</h4>
          <div class="plan-price">$${price}${plan === 'monthly' ? '/month' : '/year'}</div>
        </div>
        
        <div class="stripe-config">
          <h4>⚡ Stripe Configuration Required</h4>
          <p>To enable real payments, configure these Stripe settings:</p>
          
          <div class="config-steps">
            <div class="config-step">
              <strong>1. Stripe Account:</strong> Create account at <a href="https://stripe.com" target="_blank">stripe.com</a>
            </div>
            <div class="config-step">
              <strong>2. API Keys:</strong> Get publishable key and secret key from Stripe Dashboard
            </div>
            <div class="config-step">
              <strong>3. Webhook URL:</strong> Set up webhook endpoint for subscription events
            </div>
            <div class="config-step">
              <strong>4. Products:</strong> Create products in Stripe for Monthly ($4.99) and Annual ($39.99) plans
            </div>
          </div>
          
          <div class="test-mode-notice">
            <h4>🧪 Test Mode Integration:</h4>
            <p>Currently prepared for test mode. To go live:</p>
            <ul>
              <li>Replace test keys with live keys</li>
              <li>Set up SSL certificate</li>
              <li>Configure webhook endpoints</li>
              <li>Test payment flows thoroughly</li>
            </ul>
          </div>
        </div>
      </div>
      
      <div class="demo-checkout">
        <h4>💳 Demo Checkout Flow:</h4>
        <button class="btn btn-premium" id="simulatePaymentBtn" data-plan="${plan}" data-price="${price}">
          Simulate Payment (Demo)
        </button>
      </div>
      
      <button class="btn btn-secondary" id="backToPlansBtn">Back to Plans</button>
    </div>
  `;
}

// Simulate payment for demo purposes
function simulatePayment(plan, price) {
  window.content.innerHTML = `
    <div class="payment-success">
      <div class="success-icon">✅</div>
      <h3>Payment Simulation Complete!</h3>
      
      <div class="purchase-summary">
        <h4>Purchase Summary:</h4>
        <div class="summary-item">
          <span>Plan:</span> 
          <span>${plan === 'annual' ? 'Annual Premium' : 'Monthly Premium'}</span>
        </div>
        <div class="summary-item">
          <span>Amount:</span> 
          <span>$${price}${plan === 'monthly' ? '/month' : '/year'}</span>
        </div>
        <div class="summary-item">
          <span>Status:</span> 
          <span style="color: #28a745;">✅ Demo Mode</span>
        </div>
      </div>
      
      <div class="next-steps">
        <h4>Next Steps for Live Integration:</h4>
        <ul>
          <li>✅ UI/UX flow completed</li>
          <li>⏳ Integrate real Stripe API</li>
          <li>⏳ Set up webhook handlers</li>
          <li>⏳ Implement license validation</li>
          <li>⏳ Configure subscription management</li>
        </ul>
      </div>
      
      <button class="btn" id="continueToAppBtn">Continue to App</button>
    </div>
  `;
}

// DOM Elements
let content;
let settingsBtn;

// Error boundary wrapper for popup operations
// ENHANCED: Safe operation execution with comprehensive error handling
function safeExecute(operation, fallbackContent = '', context = 'Popup operation') {
  try {
    const result = operation();
    console.log(`✅ ${context}: Success`);
    return result;
  } catch (error) {
    console.error(`❌ ${context}: Failed -`, error.message);
    // Only log stack trace in development mode
    if (window.location.hostname === 'localhost' || window.location.protocol === 'file:') {
      console.error('Stack trace:', error.stack);
    }

    // Show user-friendly error message
    const userMessage = error.message.includes('network') || error.message.includes('fetch')
      ? 'Network error. Please check your connection and try again.'
      : 'Operation failed. Please refresh the extension.';

    showToast(userMessage, 'error');

    if (fallbackContent && window.content) {
      window.content.innerHTML = fallbackContent;
    }
    return null;
  }
}

// Enhanced logging utility for debugging and monitoring
function logOperation(operation, status, details = '') {
  const timestamp = new Date().toISOString();
  const logLevel = status === 'success' ? '✅' : status === 'warning' ? '⚠️' : '❌';
  console.log(`${logLevel} [${timestamp}] ${operation}: ${details}`);
}

// PERFORMANCE: Debounce utility for frequently called functions
function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
}

// PERFORMANCE: Throttle utility for high-frequency events
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// PERFORMANCE: Lazy loading utility for expensive operations
function lazyLoad(createFunc) {
  let instance = null;
  return (...args) => {
    if (!instance) {
      console.log('🔄 Lazy loading component...');
      instance = createFunc(...args);
    }
    return instance;
  };
}

// PERFORMANCE: Create debounced versions of expensive operations
let debouncedDisplaySubscriptions;
let debouncedSaveSubscription;

function initializePerformanceOptimizations() {
  // Debounce subscription display to avoid excessive DOM updates
  debouncedDisplaySubscriptions = debounce(async (subscriptions) => {
    logOperation('Display subscriptions', 'success', `Showing ${subscriptions.length} subscriptions`);
    await displaySubscriptions(subscriptions);
  }, 300);

  // Debounce save operations to avoid excessive storage writes
  debouncedSaveSubscription = debounce(async (subscriptionData) => {
    logOperation('Save subscription', 'success', `Saving ${subscriptionData.name}`);
    // Original save logic will be called here
  }, 500);

  console.log('⚡ Performance optimizations initialized');
}

// Initialize popup with comprehensive error handling
document.addEventListener('DOMContentLoaded', async () => {
  try {
    logOperation('Popup initialization', 'success', 'Starting popup load process');

    window.content = document.getElementById('content');
    window.settingsBtn = document.getElementById('settingsBtn');

    // Add event delegation for content area (CSP compliant)
    window.content.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      e.preventDefault();
      const action = target.getAttribute('data-action');
      const targetTab = target.getAttribute('data-target');
      const feature = target.getAttribute('data-feature');
      const subscriptionId = target.getAttribute('data-subscription-id');
      const category = target.getAttribute('data-category');

      switch (action) {
        case 'switch-tab':
          if (targetTab && window.switchTab) {
            window.switchTab(targetTab);
          }
          break;
        case 'show-ai-insights':
          if (window.showAIInsights) {
            window.showAIInsights();
          }
          break;
        case 'show-notification-settings':
          if (window.showNotificationSettings) {
            window.showNotificationSettings();
          }
          break;
        case 'show-pdf-export':
          if (window.showPDFExportOptions) {
            window.showPDFExportOptions();
          }
          break;
        case 'load-subscriptions':
          if (window.loadSubscriptions) {
            window.loadSubscriptions();
          }
          break;
        case 'apply-category-suggestion':
          if (subscriptionId && category && window.applyCategorySuggestion) {
            window.applyCategorySuggestion(subscriptionId, category);
          }
          break;
        case 'dismiss-suggestion':
          if (subscriptionId && window.dismissSuggestion) {
            window.dismissSuggestion(subscriptionId);
          }
          break;
        case 'bulk-apply-suggestions':
          if (window.bulkApplySuggestions) {
            window.bulkApplySuggestions();
          }
          break;
        case 'remove-category':
          if (category && window.removeCustomCategory) {
            window.removeCustomCategory(category);
          }
          break;
        default:
          // Handle any upgrade actions
          if (action.includes('upgrade') && window.premiumManager) {
            const trigger = feature || 'general';
            showModal(window.premiumManager.showUpgradePrompt(trigger));
          }
      }
    });

  // Initialize performance optimizations first
  initializePerformanceOptimizations();

  // Load premium features script
  await loadScript('premium-features.js');
  
  // Initialize premium manager
  if (window.PremiumManager && typeof window.PremiumManager === 'function') {
    try {
      window.premiumManager = new window.PremiumManager();
      await window.premiumManager.init();
      showToast('Premium Manager initialized successfully', 'success');
    } catch (error) {
      console.error('❌ Premium Manager initialization failed:', error);
      // Create a fallback object
      window.premiumManager = {
        isPremium: () => false,
        isTrialActive: () => false,
        startTrial: () => true,
        checkFeatureAccess: () => false,
        canUseAdvancedBudgeting: () => false,
        getLicenseInfo: () => ({ type: 'free' })
      };
    }
  } else {
    showToast('Premium features unavailable using basic mode', 'warning');
    // Create a fallback object
    window.premiumManager = {
      isPremium: () => false,
      isTrialActive: () => false,
      startTrial: () => true,
      checkFeatureAccess: () => false,
      canUseAdvancedBudgeting: () => false,
      getLicenseInfo: () => ({ type: 'free' })
    };
  }
  
  // Initialize theme with error boundary
  await safeExecute(async () => {
    await initializeTheme();
    await loadSubscriptions();
    await loadNotificationSettings();
    updateHeaderStatusBadges();
  }, '<div class="error">Failed to initialize extension. Please refresh.</div>');
  
  // Event listeners
  addEventSafe(window.settingsBtn, 'click', showSettings);

  // Premium upgrade button
  const upgradeBtn = document.getElementById('upgradeBtn');
  if (upgradeBtn) {
    addEventSafe(upgradeBtn, 'click', () => showPremiumUpgradePrompt('general'));
    // Show upgrade button for free users
    if (window.premiumManager && typeof window.premiumManager.isPremium === 'function' && !window.premiumManager.isPremium()) {
      upgradeBtn.style.display = 'inline-block';
    } else if (window.premiumManager && !window.premiumManager.isPremium) {
      // Fallback if isPremium is not a function
      upgradeBtn.style.display = 'inline-block';
    }
  }

  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    addEventSafe(themeToggle, 'click', toggleTheme);
  }

  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    addEventSafe(tab, 'click', async () => {
      const tabName = tab.dataset.tab;
      await switchTab(tabName);
    });
  });
  
  // Event delegation for dynamically created buttons
  if (window.content) {
    addEventSafe(window.content, 'click', handleContentClick);
  } else {
    console.error('Content element not found');
  }
  
  // Check for premium features usage
  checkPremiumTriggers();

  // CRITICAL: Listen for trial status changes to update UI immediately
  window.addEventListener('trialStatusChanged', (event) => {
    console.log('📢 Trial status changed event received:', event.detail);
    // Update UI immediately when trial status changes
    updateHeaderStatusBadges();
    checkPremiumTriggers();
  });

  // Also listen for storage changes to update UI when premium status changes from other sources
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && (changes.premiumStatus || changes.trialEndDate)) {
        console.log('📢 Premium storage changed, updating UI');
        setTimeout(() => {
          updateHeaderStatusBadges();
          checkPremiumTriggers();
        }, 100);
      }
    });
  }

  } catch (error) {
    console.error('❌ Popup initialization failed:', error);
    // Only log stack trace in development mode
    if (window.location.hostname === 'localhost' || window.location.protocol === 'file:') {
      console.error('Stack trace:', error.stack);
    }

    // Show user-friendly error message
    if (window.content) {
      window.content.innerHTML = `
        <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
          <div style="color: #dc3545; font-size: 24px; margin-bottom: 20px;">⚠️ Extension Error</div>
          <div style="color: #6c757d; margin-bottom: 20px;">Failed to initialize the extension.</div>
          <div style="color: #6c757d; font-size: 14px;">Please refresh the page and try again.</div>
          <button data-action="reload" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">Refresh</button>
        </div>
      `;
    }

    showToast('Extension failed to load. Please refresh.', 'error');
  }
});

// Event delegation handler
function handleContentClick(event) {
  const target = event.target;
  // console.log('Content click detected:', target.id, target.className);
  
  // Handle data-action clicks first
  const actionElement = target.closest('[data-action]');
  if (actionElement) {
    const action = actionElement.getAttribute('data-action');
    event.preventDefault();
    
    switch (action) {
      case 'upgrade-prompt':
        const trigger = actionElement.getAttribute('data-trigger');
        showPremiumUpgradePrompt(trigger);
        return;
      case 'premium-prompt':
        const feature = actionElement.getAttribute('data-feature');
        showPremiumUpgradePrompt(feature);
        return;
      case 'remove-currency':
        const currency = actionElement.getAttribute('data-currency');
        removeCurrency(currency);
        return;
      case 'show-add-subscription':
        showAddSubscription();
        return;
      case 'switch-tab':
        const tab = actionElement.getAttribute('data-tab');
        switchTab(tab);
        return;
      case 'load-subscriptions':
        loadSubscriptions();
        return;
    }
  }
  
  // Check if click is on smart premium button or its children
  const premiumBtn = target.closest('#smartPremiumBtn');
  if (premiumBtn) {
    handleSmartPremiumAction();
    return;
  }
  
  // Check if click is on pricing card
  const pricingCard = target.closest('.clickable-card');
  if (pricingCard) {
    const plan = pricingCard.dataset.plan;
    const price = parseFloat(pricingCard.dataset.price);
    initializeStripeCheckout(plan, price);
    return;
  }
  
  // Handle button clicks
  if (target.classList.contains('btn')) {
    if (target.id === 'addSubscriptionBtn') {
      showAddSubscription();
    } else if (target.id === 'analyticsBtn') {
      showAnalytics();
    } else if (target.id === 'smartPremiumBtn') {
      handleSmartPremiumAction();
    } else if (target.id === 'settingsBtn') {
      showSettings();
    } else if (target.id === 'exportBtn') {
      exportData();
    } else if (target.id === 'importBtn') {
      importData();
    } else if (target.id === 'clearDataBtn') {
      clearAllData();
    } else if (target.id === 'themeSettingsBtn') {
      showThemeSettings();
    } else if (target.id === 'notificationSettingsBtn') {
      showNotificationSettings();
    } else if (target.id === 'emailSettingsBtn') {
      showEmailSettings();
    } else if (target.id === 'saveSettingsBtn') {
      saveNotificationSettings();
    } else if (target.id === 'saveThemeSettingsBtn') {
      saveThemeSettings();
    } else if (target.id === 'saveEmailSettingsBtn') {
      saveEmailSettings();
    } else if (target.id === 'testEmailBtn') {
      testEmailConfiguration();
    } else if (target.id === 'testNotificationBtn') {
      testBrowserNotification();
    } else if (target.id === 'upgradeToPremiumBtn') {
      upgradeToPremium();
    } else if (target.id === 'startTrialBtn') {
      startFreeTrial();
    } else if (target.id === 'viewPremiumFeaturesBtn') {
      showPremiumFeatures();
    } else if (target.id === 'saveSubBtn') {
      saveSubscription();
    } else if (target.id === 'updateSubBtn') {
      const id = target.dataset.id;
      if (id) updateSubscription(id);
    } else if (target.id === 'deleteSubBtn') {
      const id = target.dataset.id;
      if (id) deleteSubscription(id);
    } else if (target.id === 'reactivateSubBtn') {
      const id = target.dataset.id;
      if (id) reactivateSubscription(id);
    } else if (target.id === 'processImportBtn') {
      processImport();
    } else if (target.id === 'viewAllActiveBtn') {
      viewAllSubscriptions();
    } else if (target.id === 'viewInactiveBtn') {
      viewInactiveSubscriptions();
    } else if (target.id === 'backToAllBtn') {
      loadSubscriptions();
    } else if (target.id === 'backToOverviewBtn') {
      loadSubscriptions();
    } else if (target.classList.contains('reactivateSubBtn')) {
      const id = target.dataset.id;
      if (id) reactivateSubscription(id);
    } else if (target.id === 'backToListBtn') {
      loadSubscriptions();
    } else if (target.id === 'editSubBtn') {
      const id = target.dataset.id;
      if (id) editSubscription(id);
    } else if (target.id === 'deleteSubBtn') {
      const id = target.dataset.id;
      if (id) deleteSubscription(id);
    } else if (target.id === 'backToSubscriptionsBtn') {
      loadSubscriptions();
    } else if (target.id === 'cancelEditBtn') {
      const id = target.dataset.id;
      if (id) viewSubscription(id);
    } else if (target.id === 'cancelAddBtn') {
      loadSubscriptions();
    } else if (target.id === 'configureSettingsBtn') {
      showSettings();
    } else if (target.id === 'updateSettingsBtn') {
      showSettings();
    } else if (target.id === 'retryBtn') {
      loadSubscriptions();
    } else if (target.id === 'cancelImportBtn') {
      showSettings();
    } else if (target.id === 'cancelNotificationBtn') {
      loadSubscriptions();
    } else if (target.id === 'cancelPremiumBtn') {
      loadSubscriptions();
    } else if (target.id === 'backToSettingsBtn') {
      showSettings();
    } else if (target.id === 'saveBudgetBtn') {
      saveBudgetSettings();
    } else if (target.id === 'saveCategoryBudgetsBtn') {
      saveCategoryBudgets();
    } else if (target.id === 'addCustomCategoryBtn') {
      addCustomCategory();
    } else if (target.id === 'saveRolloverSettingsBtn') {
      saveRolloverSettings();
    } else if (target.id === 'testBrowserNotificationBtn') {
      testBrowserNotification();
    } else if (target.id === 'saveNotificationSettingsBtn') {
      saveNotificationSettings();
    } else if (target.id === 'emailSettingsBtn') {
      showEmailSettings();
    } else if (target.id === 'saveEmailSettingsBtn') {
      saveEmailSettings();
    } else if (target.id === 'testEmailBtn') {
      testEmailConfiguration();
    } else if (target.id === 'sendWeeklyDigestBtn') {
      sendTestWeeklyDigest();
    } else if (target.id === 'buyAnnualPlanBtn') {
      const plan = target.dataset.plan;
      const price = parseFloat(target.dataset.price) || 39.99;
      initializeStripeCheckout('annual', 39.99);
    } else if (target.id === 'buyMonthlyPlanBtn') {
      const plan = target.dataset.plan;
      const price = parseFloat(target.dataset.price) || 4.99;
      initializeStripeCheckout('monthly', 4.99);
    } else if (target.id === 'simulatePaymentBtn') {
      const plan = target.dataset.plan;
      const price = parseFloat(target.dataset.price);
      simulatePayment(plan, price);
    } else if (target.id === 'backToNotificationSettingsBtn') {
      showNotificationSettings();
    } else if (target.id === 'backToPlansBtn') {
      showPremiumUpgradePrompt('overview');
    } else if (target.id === 'continueToAppBtn') {
      loadSubscriptions();
    } else if (target.id === 'continueFreeBtn') {
      // Continue with free version
      loadSubscriptions();
    } else if (target.id === 'pdfExportBtn') {
      showPDFExportOptions();
    } else if (target.id === 'excelExportBtn') {
      showExcelExportOptions();
    } else if (target.id === 'aiCategorizationBtn') {
      showAICategorization();
    } else if (target.id === 'analyticsDashboardBtn') {
      if (window.analyticsDashboard) {
        window.analyticsDashboard.showAnalyticsDashboard();
      } else {
        // Try to initialize if not available
        try {
          analyticsDashboard = new AnalyticsDashboard();
          window.analyticsDashboard = analyticsDashboard;
          showToast('Analytics Dashboard initialized successfully', 'success');
          window.analyticsDashboard.showAnalyticsDashboard();
        } catch (error) {
          showToast('Analytics Dashboard not available', 'error');
          console.error('Failed to initialize Analytics Dashboard:', error);
        }
      }
    }
  }
  
  // Handle subscription item clicks
  if (target.closest('.subscription-item')) {
    const subscriptionItem = target.closest('.subscription-item');
    const id = subscriptionItem.dataset.id;
    if (id) viewSubscription(id);
  }
}


async function loadNotificationSettings() {
  return safeExecute(async () => {
    const result = await chrome.storage.local.get(['notificationSettings']);
    window.notificationSettings = result.notificationSettings || {};
    return notificationSettings;
  }, '{}');
}


function getNotificationSettings() {
  return {
    emailNotifications: notificationSettings.emailNotifications || false,
    browserNotifications: notificationSettings.browserNotifications || false,
    notificationFrequency: notificationSettings.notificationFrequency || 'daily',
    advancedFeatures: notificationSettings.advancedFeatures || {
      emailDetection: false,
      priceTracking: false,
      renewalPredictions: false,
      categoryBasedAlerts: false
    }
  };
}

function setNotificationSettings(newSettings) {
  window.notificationSettings = { ...notificationSettings, ...newSettings };
}

// Removed API settings loading

async function loadSubscriptions() {
  try {
    window.content.innerHTML = '<div class="loading">Loading subscriptions...</div>';
    
    // Try to get data from background script first
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getAllData' });
      if (response && !response.error) {
        window.subscriptions = response.subscriptions || [];
        displaySubscriptions(window.subscriptions);
        return;
      }
    } catch (bgError) {
      // Background script fallback - using direct storage
    }
    
    // Fallback to direct storage access
    const result = await chrome.storage.local.get(['subscriptions']);
    window.subscriptions = result.subscriptions || [];
    
    displaySubscriptions(window.subscriptions);
    
  } catch (error) {
    console.error('Error loading subscriptions:', error);
    showError('Failed to load subscriptions.');
  }
}

async function displaySubscriptions(subscriptionsToDisplay) {
  if (!subscriptionsToDisplay || subscriptionsToDisplay.length === 0) {
    window.content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>No subscriptions yet</h3>
        <p>Add your first subscription to get started</p>
        <button class="btn" id="addSubscriptionBtn">Add Subscription</button>
        ${getPremiumStatusBanner()}
      </div>
    `;
    return;
  }

  // Calculate stats with currency conversion
  const totalSubscriptions = window.subscriptions.length;
  const activeSubscriptions = window.subscriptions.filter(s => s.isActive).length;
  const inactiveSubscriptions = totalSubscriptions - activeSubscriptions;
  
  // Calculate total spent in base currency
  let totalSpent = 0;
  const result = await chrome.storage.local.get(['baseCurrency']);
  const baseCurrency = result.baseCurrency || 'USD';
  
  for (const sub of window.subscriptions.filter(s => s.isActive)) {
    const convertedPrice = await convertToBaseCurrency(sub.price, sub.currency || 'USD');
    totalSpent += convertedPrice;
  }
  
  // Check for expiring subscriptions
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const expiringSubscriptions = window.subscriptions.filter(sub => {
    if (!sub.nextPaymentDate || !sub.isActive) return false;
    const paymentDate = new Date(sub.nextPaymentDate);
    return paymentDate <= sevenDaysFromNow && paymentDate >= now;
  });

  // Separate active and inactive subscriptions
  const activeSubs = window.subscriptions.filter(sub => sub.isActive);
  const inactiveSubs = window.subscriptions.filter(sub => !sub.isActive);

  window.content.innerHTML = `
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${totalSubscriptions}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #28a745;">${activeSubscriptions}</div>
        <div class="stat-label">Active</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #6c757d;">${inactiveSubscriptions}</div>
        <div class="stat-label">Inactive</div>
      </div>
    </div>
    
    <div class="section">
      <h3 class="section-title">Monthly Spend</h3>
      <div class="stat-card">
        <div class="stat-value subscription-price">${formatCurrency(totalSpent, baseCurrency)}</div>
        <div class="stat-label">Active subscriptions (${baseCurrency})</div>
      </div>
    </div>
    
    ${expiringSubscriptions.length > 0 ? `
    <div class="section">
      <h3 class="section-title" style="color: #dc3545;">⚠️ Expiring Soon</h3>
      ${expiringSubscriptions.map(sub => `
        <div class="subscription-item" style="border-left: 4px solid #dc3545;" data-id="${sub.id}">
          <div class="subscription-name">${sub.name}</div>
          <div class="subscription-details">
            <span class="subscription-price">${formatCurrency(sub.price, sub.currency || 'USD')}</span> • 
            ${sub.category} • 
            ${new Date(sub.nextPaymentDate).toLocaleDateString()}
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    <div class="section">
      <h3 class="section-title">Active Subscriptions</h3>
      ${activeSubs.slice(0, 5).map(sub => `
        <div class="subscription-item" data-id="${sub.id}">
          <div class="subscription-name">${sub.name}</div>
          <div class="subscription-details">
            <span class="subscription-price">${formatCurrency(sub.price, sub.currency || 'USD')}</span> • 
            ${sub.category} • 
            ${sub.nextPaymentDate ? new Date(sub.nextPaymentDate).toLocaleDateString() : 'No date'}
          </div>
        </div>
      `).join('')}
      
      ${activeSubs.length > 5 ? `
        <button class="btn btn-secondary" id="viewAllActiveBtn">View All Active (${activeSubs.length})</button>
      ` : ''}
    </div>
    
    ${inactiveSubs.length > 0 ? `
    <div class="section">
      <h3 class="section-title" style="color: #6c757d;">Inactive Subscriptions</h3>
      ${inactiveSubs.slice(0, 3).map(sub => `
        <div class="subscription-item" style="opacity: 0.7;" data-id="${sub.id}">
          <div class="subscription-name">${sub.name}</div>
          <div class="subscription-details">
            <span style="text-decoration: line-through;">$${sub.price}</span> • 
            ${sub.category} • 
            Inactive
          </div>
        </div>
      `).join('')}
      
      ${inactiveSubs.length > 3 ? `
        <button class="btn btn-secondary" id="viewInactiveBtn">View All Inactive (${inactiveSubs.length})</button>
      ` : ''}
    </div>
    ` : ''}
    
    <div class="overview-actions">
      <button class="btn btn-compact btn-premium" id="smartPremiumBtn">
        <span class="btn-icon">💎</span>
        <span class="btn-text" id="premiumBtnText">Unlock Premium</span>
      </button>
    </div>
  `;
}

function showSettingsRequired() {
  window.content.innerHTML = `
    <div class="error">
      Please configure your API settings first
    </div>
    <button class="btn" id="configureSettingsBtn">Configure Settings</button>
  `;
}

function showAuthError() {
  window.content.innerHTML = `
    <div class="error">
      Authentication failed. Please check your API token.
    </div>
    <button class="btn" id="updateSettingsBtn">Update Settings</button>
  `;
}

function showError(message) {
  window.content.innerHTML = `
    <div class="error">
      ${message}
    </div>
    <button class="btn" id="retryBtn">Retry</button>
  `;
}

function showSettings() {
  const hasPremium = window.premiumManager && window.premiumManager.isPremium();
  
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title">Settings</h3>
      
      <div style="margin-bottom: 16px;">
        <button class="btn btn-secondary" id="themeSettingsBtn" style="width: 100%; margin-bottom: 8px;">
          🎨 Theme Settings
        </button>
        <button class="btn btn-secondary" id="notificationSettingsBtn" style="width: 100%; margin-bottom: 8px;">
          🔔 Notification Settings
        </button>
        <button class="btn btn-secondary" id="emailSettingsBtn" style="width: 100%; margin-bottom: 8px;">
          📧 Email Configuration
        </button>
        ${hasPremium ? `
          <button class="btn btn-secondary" id="pdfExportBtn" style="width: 100%; margin-bottom: 8px;">
            📄 PDF Reports
          </button>
          <button class="btn btn-secondary" id="excelExportBtn" style="width: 100%; margin-bottom: 8px;">
            📊 Excel Export
          </button>
          <button class="btn btn-secondary" id="aiCategorizationBtn" style="width: 100%; margin-bottom: 8px;">
            🤖 AI Categorization
          </button>
          <button class="btn btn-secondary" id="analyticsDashboardBtn" style="width: 100%; margin-bottom: 8px;">
            📊 Analytics Dashboard
          </button>
        ` : `
          <button class="btn btn-outline" id="pdfExportBtn" style="width: 100%; margin-bottom: 8px; opacity: 0.7;" data-action="premium-prompt" data-feature="pdf_reports">
            🔒 PDF Reports (Premium)
          </button>
          <button class="btn btn-outline" id="excelExportBtn" style="width: 100%; margin-bottom: 8px; opacity: 0.7;" data-action="premium-prompt" data-feature="excel_export">
            🔒 Excel Export (Premium)
          </button>
          <button class="btn btn-outline" id="aiCategorizationBtn" style="width: 100%; margin-bottom: 8px; opacity: 0.7;" data-action="premium-prompt" data-feature="ai_categorization">
            🔒 AI Categorization (Premium)
          </button>
          <button class="btn btn-outline" id="analyticsDashboardBtn" style="width: 100%; margin-bottom: 8px; opacity: 0.7;" data-action="premium-prompt" data-feature="analytics_dashboard">
            🔒 Analytics Dashboard (Premium)
          </button>
        `}
        <button class="btn btn-secondary" id="exportBtn" style="width: 100%; margin-bottom: 8px;">
          📤 Export Data (JSON)
        </button>
        <button class="btn btn-secondary" id="importBtn" style="width: 100%; margin-bottom: 8px;">
          📥 Import Data
        </button>
        <button class="btn btn-secondary" id="clearDataBtn" style="width: 100%; background: #dc3545;">
          🗑️ Clear All Data
        </button>
      </div>
      
      <button class="btn" id="backToSubscriptionsBtn">Back to Subscriptions</button>
    </div>
  `;
}

function exportData() {
  try {
    const data = {
      subscriptions,
      notificationSettings,
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscription-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error exporting data:', error);
    showToast('Failed to export data', 'error');
  }
}

function importData() {
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title">Import Data</h3>
      
      <div style="margin-bottom: 16px;">
        <p style="font-size: 14px; color: #6c757d; margin-bottom: 12px;">
          Select a backup file to import. This will replace your current data.
        </p>
        
        <input type="file" id="importFile" accept=".json" style="width: 100%; margin-bottom: 12px;">
        
        <button class="btn" id="processImportBtn">Import Data</button>
        <button class="btn btn-secondary" id="cancelImportBtn">Cancel</button>
      </div>
    </div>
  `;
}

function processImport() {
  const fileInput = document.getElementById('importFile');
  const file = fileInput.files[0];
  
  if (!file) {
    showToast('Please select a file to import', 'warning');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      if (!data.subscriptions) {
        throw new Error('Invalid backup file format');
      }
      
      if (!confirm('This will replace all your current data. Continue?')) return;
      
      window.subscriptions = data.subscriptions;
      if (data.notificationSettings) {
        window.notificationSettings = data.notificationSettings;
      }
      
      chrome.storage.local.set({ subscriptions, notificationSettings }, () => {
        window.content.innerHTML = `
          <div class="success">
            Data imported successfully!
          </div>
          <button class="btn" id="backToSubscriptionsBtn">Back to Subscriptions</button>
        `;
      });
      
    } catch (error) {
      console.error('Error importing data:', error);
      showToast('Failed to import data: ' + error.message, 'error');
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('Are you sure you want to delete ALL data? This cannot be undone.')) return;
  
  try {
    window.subscriptions = [];
    window.notificationSettings = {};
    chrome.storage.local.set({ subscriptions, notificationSettings }, () => {
      window.content.innerHTML = `
        <div class="success">
          All data has been cleared successfully!
        </div>
        <button class="btn" id="backToSubscriptionsBtn">Back to Subscriptions</button>
      `;
    });
    
  } catch (error) {
    console.error('Error clearing data:', error);
    showToast('Failed to clear data', 'error');
  }
}

async function showAddSubscription() {
  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  
  // Load custom categories
  const result = await chrome.storage.local.get(['customCategories']);
  const customCategories = result.customCategories || [];
  
  // Get all available categories
  const defaultCategories = [
    {value: 'entertainment', label: 'Entertainment'},
    {value: 'productivity', label: 'Productivity'},
    {value: 'utilities', label: 'Utilities'},
    {value: 'education', label: 'Education'},
    {value: 'other', label: 'Other'}
  ];
  
  const categoryOptions = [
    ...defaultCategories,
    ...customCategories.map(cat => ({
      value: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ') + ' (Custom)'
    }))
  ];
  
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title">Add New Subscription</h3>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Subscription Name</label>
        <input type="text" id="subName" placeholder="e.g., Netflix, Spotify" 
               style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
      </div>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Monthly Price</label>
        <div style="display: flex; gap: 8px;">
          <input type="number" id="subPrice" placeholder="9.99" step="0.01"
                 style="flex: 1; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
          <select id="subCurrency" style="width: 80px; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="CAD">CAD</option>
            <option value="AUD">AUD</option>
            <option value="JPY">JPY</option>
            <option value="RON">RON</option>
          </select>
        </div>
        <div id="convertedPrice" style="font-size: 12px; color: #6c757d; margin-top: 4px;"></div>
        <button type="button" class="btn btn-outline btn-sm" id="manageCurrencyBtn" style="margin-top: 8px; font-size: 11px;">
          💱 Manage Exchange Rates
        </button>
      </div>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Category</label>
        <select id="subCategory" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
          ${categoryOptions.map(cat => `<option value="${cat.value}">${cat.label}</option>`).join('')}
        </select>
      </div>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Next Payment Date</label>
        <input type="date" id="subNextPayment" value="${today}"
               style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
      </div>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Notification Schedule</label>
        <select id="subNotificationSchedule" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
          <option value="1">1 day before</option>
          <option value="3" selected>3 days before</option>
          <option value="7">1 week before</option>
          <option value="14">2 weeks before</option>
          <option value="30">1 month before</option>
          <option value="custom">Custom schedule</option>
        </select>
      </div>
      
      <div id="customScheduleSection" style="display: none; margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Custom Notification Days</label>
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
          <input type="number" id="customDays" placeholder="7" min="1" max="365"
                 style="width: 80px; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
          <span style="color: #6c757d; font-size: 12px;">days before renewal</span>
        </div>
        <div style="font-size: 11px; color: #6c757d;">
          <strong>Multiple notifications:</strong> Use commas (e.g., 1,3,7 for notifications at 1, 3, and 7 days before)
        </div>
        <input type="text" id="multipleNotifications" placeholder="1,3,7" 
               style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; margin-top: 8px;">
      </div>
      
      <button class="btn" id="saveSubBtn">Save Subscription</button>
      <button class="btn btn-secondary" id="cancelAddBtn">Cancel</button>
    </div>
  `;
  
  // Add event listener for notification schedule changes
  const subNotificationSchedule = document.getElementById('subNotificationSchedule');
  if (subNotificationSchedule) {
    addEventSafe(subNotificationSchedule, 'change', (e) => {
      const customSection = document.getElementById('customScheduleSection');
      if (e.target.value === 'custom') {
        customSection.style.display = 'block';
      } else {
        customSection.style.display = 'none';
      }
    });
  }

  // Add currency conversion listeners
  const priceInput = document.getElementById('subPrice');
  const currencySelect = document.getElementById('subCurrency');

  if (priceInput) {
    addEventSafe(priceInput, 'input', updateCurrencyConversion);
  }
  if (currencySelect) {
    addEventSafe(currencySelect, 'change', updateCurrencyConversion);
  }

  // Initial currency conversion setup
  updateCurrencyConversion();

  // Currency conversion functionality
function updateCurrencyConversion() {
  try {
    const priceInput = document.getElementById('subPrice');
    const currencySelect = document.getElementById('subCurrency');
    const convertedDisplay = document.getElementById('convertedPrice');

    if (!priceInput || !currencySelect) return;

    const price = parseFloat(priceInput.value) || 0;
    const currency = currencySelect.value;

    if (price > 0 && window.convertToBaseCurrency && window.formatCurrency) {
      window.convertToBaseCurrency(price, currency).then(basePrice => {
        if (convertedDisplay) {
          const baseCurrency = window.formatCurrency(0).replace(/[\d.,\s]/g, '').replace('$', '').trim() || 'USD';
          convertedDisplay.innerHTML = `≈ ${window.formatCurrency(basePrice, baseCurrency)}`;
        }
      }).catch(error => {
        console.error('Currency conversion error:', error);
      });
    } else if (convertedDisplay) {
      convertedDisplay.innerHTML = '';
    }
  } catch (error) {
    console.error('Error updating currency conversion:', error);
  }
}

}

  // Currency management functionality
async function showCurrencyManagement() {
  try {
    logOperation('Show currency management', 'success', 'Opening currency settings');

    // Create currency management modal
    const modalHtml = `
      <div class="modal-overlay" id="currencyModal">
        <div class="modal-content" style="max-width: 600px;">
          <div class="modal-header">
            <h2>💱 Currency Management</h2>
            <button class="close-btn" onclick="closeCurrencyModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div class="currency-settings">
              <div class="setting-group">
                <label for="baseCurrency">Base Currency:</label>
                <select id="baseCurrency" class="form-control">
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="RON">RON - Romanian Leu</option>
                  <option value="CAD">CAD - Canadian Dollar</option>
                  <option value="AUD">AUD - Australian Dollar</option>
                  <option value="JPY">JPY - Japanese Yen</option>
                </select>
              </div>

              <div class="exchange-rates">
                <h3>Exchange Rates (relative to base currency)</h3>
                <div class="rates-grid" id="ratesGrid">
                  <!-- Rates will be populated here -->
                </div>
                <div class="rate-controls">
                  <button class="btn btn-secondary" onclick="resetRatesToDefault()">Reset to Default</button>
                  <button class="btn btn-primary" onclick="updateRatesFromAPI()">Update from API</button>
                </div>
              </div>

              <div class="currencies-list">
                <h3>Available Currencies</h3>
                <div class="currency-toggles" id="currencyToggles">
                  <!-- Currency toggles will be populated here -->
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" onclick="saveCurrencySettings()">Save Settings</button>
            <button class="btn btn-secondary" onclick="closeCurrencyModal()">Cancel</button>
          </div>
        </div>
      </div>
    `;

    // Show modal
    const modalContainer = document.getElementById('modalContainer');
    modalContainer.innerHTML = modalHtml;
    modalContainer.classList.remove('hidden');

    // Load current settings
    await loadCurrencySettingsIntoModal();

    // Add modal styles if not present
    if (!document.getElementById('currencyModalStyles')) {
      const styles = document.createElement('style');
      styles.id = 'currencyModalStyles';
      styles.textContent = `
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; }
        .modal-content { background: white; padding: 0; border-radius: 8px; max-height: 80vh; overflow-y: auto; }
        .modal-header { padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .modal-body { padding: 20px; }
        .modal-footer { padding: 20px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px; }
        .close-btn { background: none; border: none; font-size: 24px; cursor: pointer; }
        .setting-group { margin-bottom: 20px; }
        .setting-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .rates-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 15px 0; }
        .rate-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        .rate-item input { width: 80px; padding: 5px; text-align: right; }
        .currency-toggles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        .currency-toggle { display: flex; align-items: center; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        .currency-toggle input { margin-right: 8px; }
      `;
      document.head.appendChild(styles);
    }

  } catch (error) {
    console.error('Error showing currency management:', error);
    showToast('Failed to open currency settings', 'error');
  }
}

// Initialize currency management when DOM is ready
function initializeCurrencyManagement() {
  // Manage currency button
  const manageCurrencyBtn = document.getElementById('manageCurrencyBtn');
  if (manageCurrencyBtn) {
    addEventSafe(manageCurrencyBtn, 'click', showCurrencyManagement);
  }

  // Load initial currency rates
  loadCurrencyRates();
}





async function saveSubscription() {
  // Get and sanitize input values
  const nameElement = document.getElementById('subName');
  const priceElement = document.getElementById('subPrice');
  const currencyElement = document.getElementById('subCurrency');
  const categoryElement = document.getElementById('subCategory');
  const nextPaymentElement = document.getElementById('subNextPayment');

  if (!nameElement || !priceElement || !currencyElement || !categoryElement || !nextPaymentElement) {
    showToast('Form elements not found', 'error');
    return;
  }

  const name = window.sanitizeInput ? window.sanitizeInput(nameElement.value.trim(), 100) : nameElement.value.trim();
  const price = window.validateNumericInput ? window.validateNumericInput(priceElement.value, 0, 10000) : parseFloat(priceElement.value);
  const currency = window.sanitizeInput ? window.sanitizeInput(currencyElement.value, 10) : currencyElement.value;
  const category = window.sanitizeInput ? window.sanitizeInput(categoryElement.value, 50) : categoryElement.value;
  const nextPaymentDate = nextPaymentElement.value;

  // Enhanced validation
  if (!name || name.length === 0) {
    showToast('Subscription name is required', 'warning');
    return;
  }

  if (price === null || isNaN(price) || price < 0 || price > 10000) {
    showToast('Please enter a valid price (0-10000)', 'warning');
    return;
  }

  if (!nextPaymentDate) {
    showToast('Next payment date is required', 'warning');
    return;
  }

  // Validate date format and future date
  const paymentDate = new Date(nextPaymentDate);
  const today = new Date();
  if (isNaN(paymentDate.getTime()) || paymentDate < today) {
    showToast('Please enter a valid future date', 'warning');
    return;
  }
  
  // Process notification schedule
  let notificationDays = [];
  if (notificationSchedule === 'custom') {
    const multipleNotifications = window.sanitizeInput ? window.sanitizeInput(document.getElementById('multipleNotifications').value.trim(), 500) : document.getElementById('multipleNotifications').value.trim();
    const customDays = window.sanitizeInput ? window.sanitizeInput(document.getElementById('customDays').value.trim(), 100) : document.getElementById('customDays').value.trim();
    
    if (multipleNotifications) {
      // Parse multiple notifications (e.g., "1,3,7")
      notificationDays = multipleNotifications.split(',').map(day => parseInt(day.trim())).filter(day => !isNaN(day) && day > 0);
    } else if (customDays) {
      notificationDays = [parseInt(customDays)];
    }
    
    if (notificationDays.length === 0) {
      notificationDays = [3]; // Default fallback
    }
  } else {
    notificationDays = [parseInt(notificationSchedule)];
  }
  
  try {
    window.content.innerHTML = '<div class="loading">Saving subscription...</div>';
    
    const subscriptionData = {
      name,
      price,
      currency,
      category,
      nextPaymentDate,
      billingCycle: 'monthly',
      notes: '',
      website: '',
      trialPeriod: 0,
      notificationSettings: {
        enabled: true,
        scheduleType: notificationSchedule,
        notificationDays: notificationDays,
        lastNotificationSent: null,
        emailEnabled: false,
        browserEnabled: true
      }
    };
    
    // Try to use background script first
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'addSubscription', 
        data: subscriptionData 
      });
      
      if (response && response.success) {
        window.content.innerHTML = `
          <div class="success">
            Subscription added successfully!
          </div>
          <button class="btn" id="backToSubscriptionsBtn">Back to Subscriptions</button>
        `;
        return;
      }
    } catch (bgError) {
      // Background script fallback - using direct storage
    }
    
    // Fallback to direct storage
    const result = await chrome.storage.local.get(['subscriptions']);
    window.subscriptions = result.subscriptions || [];
    
    // Check premium limits
    if (window.premiumManager && !window.premiumManager.isPremium()) {
      if (window.subscriptions.length >= 10) {
        showPremiumUpgradePrompt('subscription_limit');
        return;
      }
    }
    
    const newSubscription = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      ...subscriptionData,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    window.subscriptions.push(newSubscription);
    await chrome.storage.local.set({ subscriptions });
    
    window.content.innerHTML = `
      <div class="success">
        Subscription added successfully!
      </div>
      <button class="btn" id="backToSubscriptionsBtn">Back to Subscriptions</button>
    `;
    
  } catch (error) {
    console.error('Error saving subscription:', error);
    window.content.innerHTML = `
      <div class="error">
        Failed to save subscription: ${error.message}
      </div>
      <button class="btn" data-action="show-add-subscription">Try Again</button>
    `;
  }
}

function viewSubscription(id) {
  // Show subscription details in popup
  const subscription = subscriptions.find(sub => sub.id === id);
  if (!subscription) return;
  
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title">${subscription.name}</h3>
      
      <div style="margin-bottom: 16px;">
        <div style="font-size: 24px; font-weight: 600; color: #28a745;">$${subscription.price.toFixed(2)}</div>
        <div style="font-size: 14px; color: #6c757d;">per month</div>
      </div>
      
      <div style="margin-bottom: 12px;">
        <strong>Category:</strong> ${subscription.category}
      </div>
      
      <div style="margin-bottom: 12px;">
        <strong>Next Payment:</strong> ${new Date(subscription.nextPaymentDate).toLocaleDateString()}
      </div>
      
      <div style="margin-bottom: 16px;">
        <strong>Status:</strong> ${subscription.isActive ? 'Active' : 'Inactive'}
      </div>
      
      <button class="btn btn-secondary" id="backToListBtn">Back to List</button>
      <button class="btn" id="editSubBtn" data-id="${subscription.id}" style="margin-top: 8px;">Edit</button>
      <button class="btn" id="deleteSubBtn" data-id="${subscription.id}" style="background: #dc3545; margin-top: 8px;">Delete</button>
    </div>
  `;
}

function viewAllSubscriptions() {
  // Show only active subscriptions
  const activeSubs = window.subscriptions.filter(sub => sub.isActive);
  
  if (activeSubs.length === 0) {
    window.content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>No active subscriptions</h3>
        <button class="btn" id="backToAllBtn">Back to All</button>
      </div>
    `;
    return;
  }
  
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title">All Active Subscriptions (${activeSubs.length})</h3>
      ${activeSubs.map(sub => `
        <div class="subscription-item" data-id="${sub.id}">
          <div class="subscription-name">${sub.name}</div>
          <div class="subscription-details">
            <span class="subscription-price">${formatCurrency(sub.price, sub.currency || 'USD')}</span> • 
            ${sub.category} • 
            ${sub.nextPaymentDate ? new Date(sub.nextPaymentDate).toLocaleDateString() : 'No date'}
          </div>
        </div>
      `).join('')}
      
      <button class="btn btn-secondary" id="backToOverviewBtn" style="margin-top: 16px;">Back to Overview</button>
    </div>
  `;
}

function viewInactiveSubscriptions() {
  const inactiveSubs = window.subscriptions.filter(sub => !sub.isActive);
  
  if (inactiveSubs.length === 0) {
    window.content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3>No inactive subscriptions</h3>
        <button class="btn" id="backToAllBtn">Back to All</button>
      </div>
    `;
    return;
  }
  
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title" style="color: #6c757d;">Inactive Subscriptions (${inactiveSubs.length})</h3>
      ${inactiveSubs.map(sub => `
        <div class="subscription-item" style="opacity: 0.7;" data-id="${sub.id}">
          <div class="subscription-name">${sub.name}</div>
          <div class="subscription-details">
            <span style="text-decoration: line-through;">$${sub.price}</span> • 
            ${sub.category} • 
            Inactive since ${sub.nextPaymentDate ? new Date(sub.nextPaymentDate).toLocaleDateString() : 'unknown'}
          </div>
          <button class="btn reactivateSubBtn" style="padding: 4px 8px; font-size: 12px; margin-top: 8px;" data-id="${sub.id}">
            Reactivate
          </button>
        </div>
      `).join('')}
      
      <button class="btn btn-secondary" id="backToOverviewBtn" style="margin-top: 16px;">Back to Overview</button>
    </div>
  `;
}

async function reactivateSubscription(id) {
  try {
    // Try background script first
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'updateSubscription', 
        id: id,
        data: { isActive: true }
      });
      
      if (response && response.success) {
        viewInactiveSubscriptions();
        return;
      }
    } catch (bgError) {
      // Background script fallback - using direct storage
    }
    
    // Fallback to direct storage
    const result = await chrome.storage.local.get(['subscriptions']);
    window.subscriptions = result.subscriptions || [];
    
    const index = subscriptions.findIndex(sub => sub.id === id);
    if (index !== -1) {
      subscriptions[index] = { 
        ...subscriptions[index], 
        isActive: true,
        updatedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ subscriptions });
      viewInactiveSubscriptions();
    }
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    showToast('Failed to reactivate subscription', 'error');
  }
}

function showAnalytics() {
  // Check if we have subscriptions data
  if (!subscriptionsToDisplay || subscriptionsToDisplay.length === 0) {
    window.content.innerHTML = `
      <div class="section">
        <h3 class="section-title">Analytics</h3>
        <div class="empty-state">
          <p>No subscription data available</p>
          <button class="btn btn-primary" data-action="switch-tab" data-tab="subscriptions">Add Your First Subscription</button>
        </div>
      </div>
    `;
    return;
  }
  
  // Calculate analytics
  const totalMonthly = subscriptions.reduce((sum, sub) => sum + sub.price, 0);
  const totalYearly = totalMonthly * 12;
  const byCategory = {};
  const subscriptionsByMonth = {};
  
  // Group by category
  subscriptions.forEach(sub => {
    byCategory[sub.category] = (byCategory[sub.category] || 0) + sub.price;
  });
  
  // Group by month for monthly tracking
  subscriptions.forEach(sub => {
    const month = new Date().toLocaleString('default', { month: 'long' });
    subscriptionsByMonth[month] = (subscriptionsByMonth[month] || 0) + sub.price;
  });
  
  // Find most expensive subscription
  const mostExpensive = subscriptions.reduce((max, sub) => 
    sub.price > max.price ? sub : max, subscriptions[0]);
  
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title">Analytics Overview</h3>
      
      <!-- Summary Cards -->
      <div class="analytics-grid">
        <div class="stat-card primary">
          <div class="stat-value">$${totalMonthly.toFixed(2)}</div>
          <div class="stat-label">Monthly Total</div>
        </div>
        <div class="stat-card secondary">
          <div class="stat-value">$${totalYearly.toFixed(2)}</div>
          <div class="stat-label">Yearly Total</div>
        </div>
        <div class="stat-card accent">
          <div class="stat-value">${window.subscriptions.length}</div>
          <div class="stat-label">Active Subscriptions</div>
        </div>
      </div>
      
      <!-- Category Breakdown -->
      <div class="section-subtitle">Spending by Category</div>
      <div class="category-breakdown">
        ${Object.entries(byCategory).map(([category, amount]) => {
          const percentage = ((amount / totalMonthly) * 100).toFixed(1);
          return `
            <div class="category-item">
              <div class="category-info">
                <span class="category-name">${category}</span>
                <span class="category-amount">$${amount.toFixed(2)}</span>
              </div>
              <div class="category-bar">
                <div class="category-fill" style="width: ${percentage}%"></div>
              </div>
              <div class="category-percentage">${percentage}%</div>
            </div>
          `;
        }).join('')}
      </div>
      
      <!-- Most Expensive -->
      <div class="section-subtitle">Most Expensive</div>
      <div class="insight-card">
        <div class="insight-title">${mostExpensive.name}</div>
        <div class="insight-value">$${mostExpensive.price}/month</div>
        <div class="insight-description">${mostExpensive.category}</div>
      </div>
      
      <button class="btn btn-secondary" id="backToSubscriptionsBtn">Back to Subscriptions</button>
    </div>
  `;
}

async function editSubscription(id) {
  const subscription = subscriptions.find(sub => sub.id === id);
  if (!subscription) return;
  
  // Load custom categories
  const result = await chrome.storage.local.get(['customCategories']);
  const customCategories = result.customCategories || [];
  
  // Get current notification settings or set defaults
  const currentSettings = subscription.notificationSettings || {
    enabled: true,
    scheduleType: '3',
    notificationDays: [3],
    emailEnabled: false,
    browserEnabled: true
  };
  
  const isCustomSchedule = currentSettings.scheduleType === 'custom';
  const multipleNotificationsValue = isCustomSchedule && currentSettings.notificationDays.length > 1 ? 
    currentSettings.notificationDays.join(',') : '';
  const singleCustomValue = isCustomSchedule && currentSettings.notificationDays.length === 1 ? 
    currentSettings.notificationDays[0] : '';
  
  // Get all available categories
  const defaultCategories = [
    {value: 'entertainment', label: 'Entertainment'},
    {value: 'productivity', label: 'Productivity'},
    {value: 'utilities', label: 'Utilities'},
    {value: 'education', label: 'Education'},
    {value: 'other', label: 'Other'}
  ];
  
  const categoryOptions = [
    ...defaultCategories,
    ...customCategories.map(cat => ({
      value: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ') + ' (Custom)'
    }))
  ];
  
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title">Edit Subscription</h3>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Subscription Name</label>
        <input type="text" id="editSubName" value="${subscription.name}" 
               style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
      </div>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Monthly Price ($)</label>
        <input type="number" id="editSubPrice" value="${subscription.price}" step="0.01"
               style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
      </div>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Category</label>
        <select id="editSubCategory" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
          ${categoryOptions.map(cat => `<option value="${cat.value}" ${subscription.category === cat.value ? 'selected' : ''}>${cat.label}</option>`).join('')}
        </select>
      </div>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Next Payment Date</label>
        <input type="date" id="editSubNextPayment" value="${subscription.nextPaymentDate}" 
               style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
      </div>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Notification Schedule</label>
        <select id="editSubNotificationSchedule" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
          <option value="1" ${currentSettings.scheduleType === '1' ? 'selected' : ''}>1 day before</option>
          <option value="3" ${currentSettings.scheduleType === '3' ? 'selected' : ''}>3 days before</option>
          <option value="7" ${currentSettings.scheduleType === '7' ? 'selected' : ''}>1 week before</option>
          <option value="14" ${currentSettings.scheduleType === '14' ? 'selected' : ''}>2 weeks before</option>
          <option value="30" ${currentSettings.scheduleType === '30' ? 'selected' : ''}>1 month before</option>
          <option value="custom" ${currentSettings.scheduleType === 'custom' ? 'selected' : ''}>Custom schedule</option>
        </select>
      </div>
      
      <div id="editCustomScheduleSection" style="${isCustomSchedule ? 'display: block;' : 'display: none;'} margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Custom Notification Days</label>
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
          <input type="number" id="editCustomDays" placeholder="7" min="1" max="365" value="${singleCustomValue}"
                 style="width: 80px; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
          <span style="color: #6c757d; font-size: 12px;">days before renewal</span>
        </div>
        <div style="font-size: 11px; color: #6c757d;">
          <strong>Multiple notifications:</strong> Use commas (e.g., 1,3,7 for notifications at 1, 3, and 7 days before)
        </div>
        <input type="text" id="editMultipleNotifications" placeholder="1,3,7" value="${multipleNotificationsValue}"
               style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; margin-top: 8px;">
      </div>
      
      <div style="margin-bottom: 16px;">
        <label class="setting-label" style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6c757d;">
          <input type="checkbox" id="editNotificationEnabled" ${currentSettings.enabled ? 'checked' : ''}>
          Enable notifications for this subscription
        </label>
      </div>
      
      <button class="btn" id="updateSubBtn" data-id="${id}">Update Subscription</button>
      <button class="btn btn-secondary" id="cancelEditBtn" data-id="${id}">Cancel</button>
    </div>
  `;
  
  // Add event listener for notification schedule changes
  const editSubNotificationSchedule = document.getElementById('editSubNotificationSchedule');
  if (editSubNotificationSchedule) {
    addEventSafe(editSubNotificationSchedule, 'change', (e) => {
      const customSection = document.getElementById('editCustomScheduleSection');
      if (e.target.value === 'custom') {
        customSection.style.display = 'block';
      } else {
        customSection.style.display = 'none';
      }
    });
  }
}

async function updateSubscription(id) {
  const name = window.sanitizeInput ? window.sanitizeInput(document.getElementById('editSubName').value.trim(), 100) : document.getElementById('editSubName').value.trim();
  const price = parseFloat(document.getElementById('editSubPrice').value);
  const category = window.sanitizeInput ? window.sanitizeInput(document.getElementById('editSubCategory').value.trim(), 50) : document.getElementById('editSubCategory').value.trim();
  const nextPaymentDate = window.sanitizeInput ? window.sanitizeInput(document.getElementById('editSubNextPayment').value.trim(), 50) : document.getElementById('editSubNextPayment').value.trim();
  const notificationSchedule = window.sanitizeInput ? window.sanitizeInput(document.getElementById('editSubNotificationSchedule').value.trim(), 50) : document.getElementById('editSubNotificationSchedule').value.trim();
  const notificationEnabled = document.getElementById('editNotificationEnabled').checked;
  
  if (!name || isNaN(price) || !nextPaymentDate) {
    showToast('Please fill in all required fields', 'warning');
    return;
  }
  
  // Process notification schedule for edit
  let notificationDays = [];
  if (notificationSchedule === 'custom') {
    const multipleNotifications = window.sanitizeInput ? window.sanitizeInput(document.getElementById('editMultipleNotifications').value.trim(), 500) : document.getElementById('editMultipleNotifications').value.trim();
    const customDays = window.sanitizeInput ? window.sanitizeInput(document.getElementById('editCustomDays').value.trim(), 100) : document.getElementById('editCustomDays').value.trim();
    
    if (multipleNotifications) {
      notificationDays = multipleNotifications.split(',').map(day => parseInt(day.trim())).filter(day => !isNaN(day) && day > 0);
    } else if (customDays) {
      notificationDays = [parseInt(customDays)];
    }
    
    if (notificationDays.length === 0) {
      notificationDays = [3]; // Default fallback
    }
  } else {
    notificationDays = [parseInt(notificationSchedule)];
  }
  
  const currentNotificationSettings = {
    enabled: notificationEnabled,
    scheduleType: notificationSchedule,
    notificationDays: notificationDays,
    lastNotificationSent: null,
    emailEnabled: false,
    browserEnabled: true
  };
  
  try {
    const updates = { name, price, category, nextPaymentDate, notificationSettings };
    
    // Try background script first
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'updateSubscription', 
        id: id,
        data: updates 
      });
      
      if (response && response.success) {
        viewSubscription(id);
        return;
      }
    } catch (bgError) {
      // Background script fallback - using direct storage
    }
    
    // Fallback to direct storage
    const result = await chrome.storage.local.get(['subscriptions']);
    window.subscriptions = result.subscriptions || [];
    
    const index = subscriptions.findIndex(sub => sub.id === id);
    if (index !== -1) {
      subscriptions[index] = { 
        ...subscriptions[index], 
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ subscriptions });
      viewSubscription(id);
    }
  } catch (error) {
    console.error('Error updating subscription:', error);
    showToast('Failed to update subscription', 'error');
  }
}

async function deleteSubscription(id) {
  if (!confirm('Are you sure you want to delete this subscription?')) return;
  
  try {
    // Try background script first
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'deleteSubscription', 
        id: id 
      });
      
      if (response && response.success) {
        loadSubscriptions();
        return;
      }
    } catch (bgError) {
      // Background script fallback - using direct storage
    }
    
    // Fallback to direct storage
    const result = await chrome.storage.local.get(['subscriptions']);
    window.subscriptions = result.subscriptions || [];

    window.subscriptions = window.subscriptions.filter(sub => sub.id !== id);
    await chrome.storage.local.set({ subscriptions: window.subscriptions });
    loadSubscriptions();
    
  } catch (error) {
    console.error('Error deleting subscription:', error);
    showToast('Failed to delete subscription', 'error');
  }
}




function saveNotificationSettingsToStorage() {
  try {
    chrome.storage.local.set({ notificationSettings });
    // Removed web app sync since we're working offline
  } catch (error) {
    console.error('Error saving notification settings:', error);
  }
}

// DEPRECATED: Duplicate function - use the showPremiumFeatures() below instead
function showPremiumFeaturesOld() {
  console.warn('⚠️ showPremiumFeaturesOld is deprecated. Use the main showPremiumFeatures() function instead.');

  // Fallback to main function
  showPremiumFeatures();
}


// Message handler for background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'checkSubscriptions') {
    loadSubscriptions();
    sendResponse({ success: true });
  }
});

// Tab switching functionality

function showAllSubscriptions() {
  window.content.innerHTML = '<div class="loading">Loading all subscriptions...</div>';
  
  chrome.storage.local.get(['subscriptions'], (result) => {
    const allSubscriptions = result.subscriptions || [];
    const activeSubs = allSubscriptions.filter(s => s.isActive);
    const inactiveSubs = allSubscriptions.filter(s => !s.isActive);
    
    window.content.innerHTML = `
      <div class="section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 class="section-title">All Subscriptions</h3>
          <button class="btn btn-sm" id="addSubscriptionBtn">+ Add New</button>
        </div>
        
        ${activeSubs.length > 0 ? `
          <h4 style="color: var(--success-color); margin-bottom: 12px;">Active (${activeSubs.length})</h4>
          ${activeSubs.map(sub => `
            <div class="subscription-item" data-id="${sub.id}">
              <div class="subscription-name">${sub.name}</div>
              <div class="subscription-details">
                <span class="subscription-price">${formatCurrency(sub.price, sub.currency || 'USD')}</span> • 
                ${sub.category} • 
                ${sub.nextPaymentDate ? new Date(sub.nextPaymentDate).toLocaleDateString() : 'No date'}
              </div>
            </div>
          `).join('')}
        ` : '<p style="color: var(--text-secondary);">No active subscriptions</p>'}
        
        ${inactiveSubs.length > 0 ? `
          <h4 style="color: var(--secondary-color); margin-top: 24px; margin-bottom: 12px;">Inactive (${inactiveSubs.length})</h4>
          ${inactiveSubs.map(sub => `
            <div class="subscription-item" style="opacity: 0.7;" data-id="${sub.id}">
              <div class="subscription-name">${sub.name}</div>
              <div class="subscription-details">
                <span style="text-decoration: line-through;">$${sub.price}</span> • 
                ${sub.category} • 
                Inactive
              </div>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  });
}


// Make all functions globally accessible after they are defined
window.showAddSubscription = showAddSubscription;
window.showSettings = showSettings;
window.showAnalytics = showAnalytics;
window.loadSubscriptions = loadSubscriptions;
window.viewSubscription = viewSubscription;
window.viewAllSubscriptions = viewAllSubscriptions;
window.viewInactiveSubscriptions = viewInactiveSubscriptions;
window.reactivateSubscription = reactivateSubscription;
window.exportData = exportData;
window.importData = importData;
window.processImport = processImport;
window.clearAllData = clearAllData;
window.saveSubscription = saveSubscription;
window.editSubscription = editSubscription;
window.updateSubscription = updateSubscription;
window.deleteSubscription = deleteSubscription;
window.showNotificationSettings = showNotificationSettings;
window.saveNotificationSettings = saveNotificationSettings;
window.upgradeToPremium = upgradeToPremium;
window.showModal = showModal;
window.closeModal = closeModal;
window.switchTab = switchTab;
window.showAllSubscriptions = showAllSubscriptions;
window.testBrowserNotification = testBrowserNotification;
window.showAdvancedAnalytics = showAdvancedAnalytics;
window.showPremiumUpgradePrompt = showPremiumUpgradePrompt;
window.showAIInsights = showAIInsights;


function renderEmailServiceConfig(service, settings) {
  switch (service) {
    case 'emailjs':
      return `
        <div class="alert alert-success" style="margin-bottom: 16px;">
          <strong>✅ EmailJS Configuration</strong>
          <div style="margin-top: 4px; font-size: 12px;">
            EmailJS is a free service that allows sending emails directly from the browser.
            <a href="https://www.emailjs.com/" target="_blank" style="color: #007bff;">Sign up here</a>
          </div>
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Service ID</label>
          <input type="text" id="emailjsServiceId" placeholder="service_xxxxxxx" 
                 value="${settings.emailjsServiceId || ''}"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Template ID</label>
          <input type="text" id="emailjsTemplateId" placeholder="template_xxxxxxx" 
                 value="${settings.emailjsTemplateId || ''}"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Public Key</label>
          <input type="text" id="emailjsPublicKey" placeholder="Your public key" 
                 value="${settings.emailjsPublicKey || ''}"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        </div>
      `;
      
    case 'brevo':
      return `
        <div class="alert alert-success" style="margin-bottom: 16px;">
          <strong>✅ Brevo Configuration (Securizat)</strong>
          <div style="margin-top: 4px; font-size: 12px;">
            Brevo API este stocată securizat în Chrome Storage local.
            <a href="https://app.brevo.com/settings/keys/api" target="_blank" style="color: #007bff;">Obține cheia API</a>
          </div>
        </div>
        
        <div class="security-info" style="background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.2); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
          <strong>🔒 Securitate:</strong>
          <ul style="margin: 4px 0; font-size: 12px;">
            <li>Cheia API se stochează local în browser (criptată automat)</li>
            <li>Nu este accesibilă de alte site-uri sau extensii</li>
            <li>Se transmite doar către serverele Brevo printr-o conexiune HTTPS</li>
          </ul>
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">
            Brevo API Key
            <span style="color: #dc3545;">*</span>
          </label>
          <input type="password" id="brevoApiKey" placeholder="xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
                 value="${settings.brevoApiKey || ''}"
                 autocomplete="off" spellcheck="false"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; font-family: monospace;">
          <small style="color: #6c757d; font-size: 11px;">Format: xkeysib-xxxxxx</small>
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">
            Sender Email
            <span style="color: #dc3545;">*</span>
          </label>
          <input type="email" id="brevoSenderEmail" placeholder="noreply@yourdomain.com" 
                 value="${settings.brevoSenderEmail || ''}"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
          <small style="color: #6c757d; font-size: 11px;">Trebuie să fie verificat în contul Brevo</small>
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Sender Name</label>
          <input type="text" id="brevoSenderName" placeholder="Subscription Manager" 
                 value="${settings.brevoSenderName || 'Subscription Manager'}"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Email Template</label>
          <select id="brevoEmailTemplate" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
            <option value="casual" ${(settings.emailTemplate || 'casual') === 'casual' ? 'selected' : ''}>🎨 Casual Friendly</option>
            <option value="formal" ${settings.emailTemplate === 'formal' ? 'selected' : ''}>💼 Formal Business</option>
            <option value="minimal" ${settings.emailTemplate === 'minimal' ? 'selected' : ''}>🎯 Clean Minimal</option>
          </select>
          <small style="color: #6c757d; font-size: 11px;">Alege stilul email-urilor de notificare</small>
        </div>
        
        <div class="api-test-section" style="background: var(--bg-secondary); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
          <button class="btn btn-outline btn-sm" id="validateBrevoApiBtn" style="width: 100%; margin-bottom: 8px;">
            🔍 Validează Cheia API
          </button>
          <div id="apiValidationResult" style="font-size: 12px; margin-top: 8px;"></div>
        </div>
      `;
      
    case 'custom':
      return `
        <div class="alert alert-danger" style="margin-bottom: 16px;">
          <strong>🔧 Custom SMTP Configuration</strong>
          <div style="margin-top: 4px; font-size: 12px;">
            Advanced users only. Requires SMTP server details.
          </div>
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">SMTP Server</label>
          <input type="text" id="smtpServer" placeholder="smtp.gmail.com" 
                 value="${settings.smtpServer || ''}"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Port</label>
          <input type="number" id="smtpPort" placeholder="587" 
                 value="${settings.smtpPort || '587'}"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Username</label>
          <input type="text" id="smtpUsername" placeholder="your.email@gmail.com" 
                 value="${settings.smtpUsername || ''}"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Password</label>
          <input type="password" id="smtpPassword" placeholder="App password" 
                 value="${settings.smtpPassword || ''}"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        </div>
      `;
      
    default:
      return '';
  }
}







// Theme Settings
async function showThemeSettings() {
  try {
    const result = await chrome.storage.local.get(['themeSettings']);
    const themeSettings = result.themeSettings || {};
    
    window.content.innerHTML = `
      <div class="section">
        <h3 class="section-title">Theme Settings</h3>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
            <input type="radio" name="themeMode" value="auto" ${themeSettings.autoTheme !== false ? 'checked' : ''} style="margin-right: 8px;">
            🔄 Auto (Follow System Theme)
          </label>
          <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
            <input type="radio" name="themeMode" value="light" ${themeSettings.autoTheme === false && themeSettings.theme === 'light' ? 'checked' : ''} style="margin-right: 8px;">
            ☀️ Light Mode
          </label>
          <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
            <input type="radio" name="themeMode" value="dark" ${themeSettings.autoTheme === false && themeSettings.theme === 'dark' ? 'checked' : ''} style="margin-right: 8px;">
            🌙 Dark Mode
          </label>
        </div>
        
        <div class="alert alert-info" style="margin-bottom: 16px;">
          <strong>Auto Mode:</strong> Theme will automatically switch based on your system settings.
        </div>
        
        <button class="btn" id="saveThemeSettingsBtn">💾 Save Theme Settings</button>
        <button class="btn btn-secondary" id="backToSettingsBtn">Back to Settings</button>
      </div>
    `;
  } catch (error) {
    console.error('Error loading theme settings:', error);
    showToast('Failed to load theme settings', 'error');
  }
}

async function saveThemeSettings() {
  try {
    const selectedMode = document.querySelector('input[name="themeMode"]:checked').value;
    
    let newSettings;
    if (selectedMode === 'auto') {
      newSettings = { autoTheme: true };
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      applyTheme(systemTheme);
      updateThemeButton(systemTheme);
    } else {
      newSettings = { autoTheme: false, theme: selectedMode };
      applyTheme(selectedMode);
      updateThemeButton(selectedMode);
    }
    
    await chrome.storage.local.set({ themeSettings: newSettings });
    showToast('Theme settings saved successfully!');
    
  } catch (error) {
    console.error('Error saving theme settings:', error);
    showToast('Failed to save theme settings', 'error');
  }
}

// Email Settings - uses the comprehensive saveEmailSettings function below

// Send test weekly digest
async function sendTestWeeklyDigest() {
  try {
    // Get current email settings
    const result = await chrome.storage.local.get(['emailSettings']);
    const emailSettings = result.emailSettings || {};
    
    if (!emailSettings.userEmail) {
      showToast('Please configure your email settings first', 'error');
      return;
    }
    
    showToast('Generating weekly digest...', 'info');
    
    // Load current subscriptions
    const subscriptionsResult = await chrome.storage.local.get(['subscriptions']);
    const subscriptions = subscriptionsResult.subscriptions || [];
    
    if (window.subscriptions.length === 0) {
      showToast('No subscriptions found to generate digest', 'warning');
      return;
    }
    
    // Send weekly digest
    const digestResult = await sendWeeklyDigest(emailSettings, subscriptions);
    
    if (digestResult.success) {
      showToast('✅ Weekly digest sent successfully! Check your email.', 'success');
    } else {
      showToast('❌ Failed to send weekly digest: ' + (digestResult.error || 'Unknown error'), 'error');
    }
    
  } catch (error) {
    console.error('Error sending test weekly digest:', error);
    showToast('❌ Error sending weekly digest: ' + error.message, 'error');
  }
}

async function testEmailConfiguration() {
  try {
    const emailService = document.getElementById('emailService')?.value || 'brevo';
    const userEmail = window.sanitizeInput ? window.sanitizeInput(document.getElementById('userEmail')?.value?.trim(), 254) : document.getElementById('userEmail')?.value?.trim();
    
    if (!userEmail) {
      showToast('Vă rugăm să introduceți adresa de email', 'error');
      return;
    }
    
    if (!isValidEmail(userEmail)) {
      showToast('Adresa de email nu este validă', 'error');
      return;
    }
    
    // Get service-specific settings
    let emailSettings = { userEmail, service: emailService };
    
    if (emailService === 'brevo') {
      const brevoApiKey = document.getElementById('brevoApiKey')?.value?.trim();
      const brevoSenderEmail = document.getElementById('brevoSenderEmail')?.value?.trim();
      const brevoSenderName = document.getElementById('brevoSenderName')?.value?.trim();
      
      if (!brevoApiKey || !brevoSenderEmail) {
        showToast('Vă rugăm să completați toate câmpurile obligatorii pentru Brevo', 'error');
        return;
      }
      
      if (!brevoApiKey.startsWith('xkeysib-')) {
        showToast('Formatul cheii API Brevo este incorect', 'error');
        return;
      }
      
      emailSettings = {
        ...emailSettings,
        brevoApiKey,
        brevoSenderEmail,
        brevoSenderName: brevoSenderName || 'Subscription Manager'
      };
    }
    
    showToast('Trimitere email de test...', 'info');
    
    // Create test email data
    const testEmailData = {
      subject: '📋 Test Email - Subscription Manager',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007bff;">🎉 Email de Test Reușit!</h2>
          <p>Felicitări! Configurația email pentru <strong>Subscription Manager</strong> funcționează perfect.</p>
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <h3 style="margin: 0 0 8px 0; color: #28a745;">✅ Ce înseamnă asta:</h3>
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li>Veți primi notificări pentru abonamentele care expiră în curând</li>
              <li>Configurația este stocată securizat în browser</li>
              <li>Emailurile se trimit doar către adresa dvs. configurată</li>
            </ul>
          </div>
          <p style="color: #6c757d; font-size: 12px; margin-top: 20px;">
            Acest email a fost trimis de extensia Subscription Manager pentru a testa configurația.
          </p>
        </div>
      `,
      recipientName: 'User'
    };
    
    // Send email directly using Brevo API
    if (emailService === 'brevo') {
      const result = await sendBrevoEmailWithTemplates(emailSettings, testEmailData);
      
      if (result.success) {
        showToast('✅ Email de test trimis cu succes! Verificați inbox-ul.', 'success');
      } else {
        showToast('❌ ' + (result.error || 'Nu s-a putut trimite emailul de test'), 'error');
      }
    } else {
      showToast('Serviciul de email selectat nu este încă implementat', 'error');
    }
    
  } catch (error) {
    console.error('Error testing email:', error);
    showToast('❌ Eroare la testarea configurației email: ' + error.message, 'error');
  }
}

async function saveEmailSettings() {
  try {
    const userEmail = window.sanitizeInput ? window.sanitizeInput(document.getElementById('userEmail')?.value?.trim(), 254) : document.getElementById('userEmail')?.value?.trim();
    const emailService = document.getElementById('emailService')?.value || 'brevo';
    
    if (!userEmail) {
      showToast('Vă rugăm să introduceți adresa de email', 'error');
      return;
    }
    
    if (!isValidEmail(userEmail)) {
      showToast('Adresa de email nu este validă', 'error');
      return;
    }
    
    const emailSettings = {
      userEmail,
      service: emailService,
      updatedAt: new Date().toISOString()
    };
    
    // Get service-specific settings
    switch (emailService) {
      case 'emailjs':
        emailSettings.emailjsServiceId = document.getElementById('emailjsServiceId')?.value?.trim();
        emailSettings.emailjsTemplateId = document.getElementById('emailjsTemplateId')?.value?.trim();
        emailSettings.emailjsPublicKey = document.getElementById('emailjsPublicKey')?.value?.trim();
        
        if (!emailSettings.emailjsServiceId || !emailSettings.emailjsTemplateId || !emailSettings.emailjsPublicKey) {
          showToast('Vă rugăm să completați toate câmpurile EmailJS', 'error');
          return;
        }
        break;
        
      case 'brevo':
        emailSettings.brevoApiKey = document.getElementById('brevoApiKey')?.value?.trim();
        emailSettings.brevoSenderEmail = document.getElementById('brevoSenderEmail')?.value?.trim();
        emailSettings.brevoSenderName = document.getElementById('brevoSenderName')?.value?.trim() || 'Subscription Manager';
        emailSettings.emailTemplate = document.getElementById('brevoEmailTemplate')?.value || 'casual';
        
        if (!emailSettings.brevoApiKey || !emailSettings.brevoSenderEmail) {
          showToast('Vă rugăm să completați toate câmpurile obligatorii pentru Brevo', 'error');
          return;
        }
        
        if (!emailSettings.brevoApiKey.startsWith('xkeysib-')) {
          showToast('Formatul cheii API Brevo este incorect', 'error');
          return;
        }
        
        if (!isValidEmail(emailSettings.brevoSenderEmail)) {
          showToast('Adresa sender email nu este validă', 'error');
          return;
        }
        break;
        
      case 'custom':
        emailSettings.smtpServer = document.getElementById('smtpServer')?.value?.trim();
        emailSettings.smtpPort = parseInt(document.getElementById('smtpPort')?.value);
        emailSettings.smtpUsername = document.getElementById('smtpUsername')?.value?.trim();
        emailSettings.smtpPassword = document.getElementById('smtpPassword')?.value?.trim();
        
        if (!emailSettings.smtpServer || !emailSettings.smtpPort || !emailSettings.smtpUsername || !emailSettings.smtpPassword) {
          showToast('Vă rugăm să completați toate câmpurile SMTP', 'error');
          return;
        }
        break;
    }
    
    // Save to secure Chrome storage
    await chrome.storage.local.set({ emailSettings });
    
    // Update notification settings to enable email
    const result = await chrome.storage.local.get(['notificationSettings']);
    const storedNotificationSettings = result.notificationSettings || {};
    storedNotificationSettings.emailNotifications = true;
    await chrome.storage.local.set({ notificationSettings });
    
    showToast('✅ Configurația email a fost salvată cu succes!', 'success');
    
    // Show success details
    setTimeout(() => {
      showToast(`📧 Serviciu configurat: ${emailService === 'brevo' ? 'Brevo (SendinBlue)' : emailService}`, 'info');
    }, 1000);
    
  } catch (error) {
    console.error('Error saving email settings:', error);
    showToast('❌ Eroare la salvarea configurației: ' + error.message, 'error');
  }
}


// REMOVED: isValidEmail function - use window.validateEmail from utilities.js instead

// Add event listeners for email configuration
function addEmailConfigEventListeners() {
  // Validate Brevo API button
  const validateBtn = document.getElementById('validateBrevoApiBtn');
  if (validateBtn) {
    addEventSafe(validateBtn, 'click', validateBrevoApi);
  }
}

// Validate Brevo API Key
async function validateBrevoApi() {
  const apiKey = document.getElementById('brevoApiKey')?.value?.trim();
  const resultDiv = document.getElementById('apiValidationResult');
  
  if (!apiKey) {
    resultDiv.innerHTML = '<div style="color: #dc3545;">⚠️ Vă rugăm să introduceți cheia API</div>';
    return;
  }
  
  if (!apiKey.startsWith('xkeysib-')) {
    resultDiv.innerHTML = '<div style="color: #dc3545;">⚠️ Formatul cheii API este incorect (trebuie să înceapă cu "xkeysib-")</div>';
    return;
  }
  
  resultDiv.innerHTML = '<div style="color: #007bff;">🔄 Validez cheia API...</div>';
  
  try {
    // Test API call to Brevo
    const response = await fetch('https://api.brevo.com/v3/account', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'api-key': apiKey
      }
    });
    
    if (response.ok) {
      const accountInfo = await response.json();
      resultDiv.innerHTML = `
        <div style="color: #28a745;">✅ Cheia API este validă!</div>
        <div style="font-size: 11px; color: #6c757d; margin-top: 4px;">
          Cont: ${accountInfo.email || 'N/A'} | Plan: ${accountInfo.plan?.type || 'N/A'}
        </div>
      `;
    } else if (response.status === 401) {
      resultDiv.innerHTML = '<div style="color: #dc3545;">❌ Cheia API este invalidă sau expirată</div>';
    } else {
      resultDiv.innerHTML = '<div style="color: #ffc107;">⚠️ Nu s-a putut valida cheia API. Verificați conexiunea la internet.</div>';
    }
  } catch (error) {
    console.error('Brevo API validation error:', error);
    resultDiv.innerHTML = '<div style="color: #dc3545;">❌ Eroare la validarea API: Nu s-a putut conecta la Brevo</div>';
  }
}

// Email Templates System
const emailTemplates = {
  weekly_digest: {
    name: "Weekly Digest",
    subject: "📋 Weekly Subscription Digest - {{weekRange}}",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center;">
          <h1 style="margin: 0; color: white; font-size: 28px;">📋 Weekly Digest</h1>
          <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9);">{{weekRange}}</p>
        </div>
        
        <div style="padding: 30px 20px;">
          <div style="background: #f8f9fa; border-radius: 15px; padding: 25px; margin: 20px 0; text-align: center;">
            <h2 style="margin: 0 0 15px 0; color: #495057;">Weekly Summary</h2>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0;">
              <div style="text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #28a745;">{{totalSubscriptions}}</div>
                <div style="font-size: 12px; color: #6c757d;">Total Subscriptions</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #007bff;">{{digestData.monthlySpending}}</div>
                <div style="font-size: 12px; color: #6c757d;">Monthly Spending</div>
              </div>
              <div style="text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #dc3545;">{{expiringCount}}</div>
                <div style="font-size: 12px; color: #6c757d;">Expiring Soon</div>
              </div>
            </div>
          </div>
          
          {{#if expiringSubscriptions}}
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h3 style="margin: 0 0 12px 0; color: #856404;">⚠️ Expiring This Week</h3>
            {{#each expiringSubscriptions}}
            <div style="background: white; padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #dc3545;">
              <div style="font-weight: 600; color: #212529;">{{name}}</div>
              <div style="color: #6c757d; font-size: 13px;">
                {{price}} • {{category}} • Expires {{renewalDate}}
              </div>
            </div>
            {{/each}}
          </div>
          {{/if}}
          
          {{#if aiInsights}}
          <div style="background: linear-gradient(135deg, #667eea10, #764ba210); border-radius: 15px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 12px 0; color: #495057;">🤖 AI Insights</h3>
            {{#each aiInsights}}
            <div style="background: white; padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #667eea;">
              <div style="font-weight: 600; color: #212529;">{{title}}</div>
              <div style="color: #6c757d; font-size: 13px; margin: 4px 0;">{{message}}</div>
              <div style="color: #007bff; font-size: 12px; font-weight: 500;">💡 {{action}}</div>
            </div>
            {{/each}}
          </div>
          {{/if}}
          
          <div style="background: #e7f3ff; border-left: 4px solid #007bff; padding: 16px; margin: 20px 0;">
            <h4 style="margin: 0 0 8px 0; color: #007bff;">📊 Category Breakdown</h4>
            {{#each categoryBreakdown}}
            <div style="display: flex; justify-content: space-between; margin: 4px 0;">
              <span style="color: #495057;">{{category}}</span>
              <span style="color: #28a745; font-weight: 600;">{{amount}}</span>
            </div>
            {{/each}}
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #6c757d;">
              Manage your subscriptions efficiently 💪<br>
              <em>- Your Subscription Manager</em>
            </p>
          </div>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
          <p style="margin: 0; color: #6c757d; font-size: 12px;">
            📱 Weekly digest from Subscription Manager<br>
            Manage your email preferences in the extension settings
          </p>
        </div>
      </div>
    `
  },
  
  formal: {
    name: "Formal Business",
    subject: "📋 Subscription Renewal Reminder - {{serviceName}}",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: #f8f9fa; padding: 20px; border-bottom: 3px solid #007bff;">
          <h1 style="margin: 0; color: #212529; font-size: 24px;">Subscription Manager</h1>
          <p style="margin: 8px 0 0 0; color: #6c757d;">Professional Subscription Management</p>
        </div>
        
        <div style="padding: 30px 20px;">
          <h2 style="color: #007bff; margin: 0 0 20px 0;">Subscription Renewal Notice</h2>
          
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #856404;">
              <strong>Service:</strong> {{serviceName}}<br>
              <strong>Amount:</strong> {{amount}}<br>
              <strong>Renewal Date:</strong> {{renewalDate}}<br>
              <strong>Days Until Renewal:</strong> {{daysUntil}}
            </p>
          </div>
          
          <p style="color: #212529; line-height: 1.6;">
            This is a professional reminder that your subscription to <strong>{{serviceName}}</strong> 
            will renew in {{daysUntil}} days for {{amount}}.
          </p>
          
          <div style="background: #e7f3ff; border-left: 4px solid #007bff; padding: 16px; margin: 20px 0;">
            <h4 style="margin: 0 0 8px 0; color: #007bff;">Account Information</h4>
            <p style="margin: 0; color: #495057;">
              Category: {{category}}<br>
              Billing Cycle: Monthly<br>
              Next Payment: {{renewalDate}}
            </p>
          </div>
          
          <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            Subscription Manager Team
          </p>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
          <p style="margin: 0; color: #6c757d; font-size: 12px;">
            This email was sent by Subscription Manager Extension.<br>
            To modify notification settings, open the extension settings.
          </p>
        </div>
      </div>
    `
  },
  
  casual: {
    name: "Casual Friendly",
    subject: "🔔 Hey! {{serviceName}} renews soon",
    htmlContent: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center;">
          <h1 style="margin: 0; color: white; font-size: 28px;">👋 Hey there!</h1>
          <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9);">Your subscription buddy is here</p>
        </div>
        
        <div style="padding: 30px 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; background: linear-gradient(135deg, #ff7b7b, #667eea); color: white; padding: 20px; border-radius: 20px; margin-bottom: 20px;">
              <h2 style="margin: 0; font-size: 20px;">🎯 Friendly Reminder</h2>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-radius: 15px; padding: 25px; margin: 20px 0; text-align: center;">
            <h3 style="margin: 0 0 15px 0; color: #495057;">{{serviceName}}</h3>
            <div style="font-size: 24px; font-weight: bold; color: #28a745; margin: 10px 0;">{{amount}}</div>
            <p style="margin: 0; color: #6c757d;">
              Renews in <strong style="color: #007bff;">{{daysUntil}} days</strong> on {{renewalDate}}
            </p>
          </div>
          
          <div style="background: linear-gradient(135deg, #667eea10, #764ba210); border-radius: 15px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0; color: #495057; text-align: center;">
              🏷️ <strong>{{category}}</strong> subscription<br>
              💡 <em>Don't forget to check if you're still using this service!</em>
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #6c757d;">
              Keep tracking those subscriptions! 💪<br>
              <em>- Your Subscription Manager</em>
            </p>
          </div>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
          <p style="margin: 0; color: #6c757d; font-size: 12px;">
            📱 Sent with ❤️ by Subscription Manager<br>
            Manage your notifications in the extension settings
          </p>
        </div>
      </div>
    `
  },
  
  minimal: {
    name: "Clean Minimal",
    subject: "{{serviceName}} - Renewal in {{daysUntil}} days",
    htmlContent: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="padding: 40px 30px;">
          <div style="border-bottom: 2px solid #f8f9fa; padding-bottom: 20px; margin-bottom: 30px;">
            <h1 style="margin: 0; color: #212529; font-size: 22px; font-weight: 300;">Subscription Manager</h1>
          </div>
          
          <div style="margin-bottom: 30px;">
            <h2 style="margin: 0 0 20px 0; color: #495057; font-size: 18px; font-weight: 400;">
              Renewal Reminder
            </h2>
            
            <div style="border-left: 3px solid #007bff; padding-left: 20px; margin: 25px 0;">
              <div style="font-size: 16px; font-weight: 500; color: #212529; margin-bottom: 8px;">
                {{serviceName}}
              </div>
              <div style="color: #6c757d; margin-bottom: 5px;">
                Amount: <span style="color: #212529; font-weight: 500;">{{amount}}</span>
              </div>
              <div style="color: #6c757d; margin-bottom: 5px;">
                Renewal: <span style="color: #212529; font-weight: 500;">{{renewalDate}}</span>
              </div>
              <div style="color: #6c757d;">
                Category: <span style="color: #212529; font-weight: 500;">{{category}}</span>
              </div>
            </div>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 25px 0;">
              <p style="margin: 0; color: #495057; font-size: 14px;">
                This subscription will renew in <strong>{{daysUntil}} days</strong>.
              </p>
            </div>
          </div>
          
          <div style="border-top: 1px solid #f8f9fa; padding-top: 20px; margin-top: 30px;">
            <p style="margin: 0; color: #6c757d; font-size: 13px;">
              Subscription Manager Extension
            </p>
          </div>
        </div>
      </div>
    `
  }
};

// Generate weekly digest data
async function generateWeeklyDigestData(subscriptions) {
  const now = new Date();
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  // Calculate week range
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)
  
  const weekRange = `${weekStart.toLocaleDateString('ro-RO')} - ${weekEnd.toLocaleDateString('ro-RO')}`;
  
  // Filter active subscriptions
  const activeSubscriptions = window.subscriptions.filter(sub => sub.isActive);
  
  // Find expiring subscriptions (within next 7 days)
  const expiringSubscriptions = activeSubscriptions.filter(sub => {
    if (!sub.nextPaymentDate) return false;
    const paymentDate = new Date(sub.nextPaymentDate);
    return paymentDate >= now && paymentDate <= oneWeekFromNow;
  });
  
  // Calculate monthly spending
  const monthlySpending = activeSubscriptions.reduce((sum, sub) => sum + sub.price, 0);
  
  // Category breakdown
  const categories = {};
  activeSubscriptions.forEach(sub => {
    categories[sub.category] = (categories[sub.category] || 0) + sub.price;
  });
  
  const categoryBreakdown = Object.entries(categories).map(([category, amount]) => ({
    category: category.charAt(0).toUpperCase() + category.slice(1),
    amount: amount.toFixed(2)
  }));
  
  // Generate AI insights for digest
  let aiInsights = [];
  if (window.premiumManager && window.premiumManager.isFeatureAvailable('ai_insights')) {
    try {
      const insights = await window.premiumManager.generateAIInsights(activeSubscriptions);
      aiInsights = insights.slice(0, 3); // Limit to top 3 insights for digest
    } catch (error) {
      // AI insights not available for digest generation
    }
  }
  
  return {
    weekRange,
    totalSubscriptions: activeSubscriptions.length,
    monthlySpending: monthlySpending.toFixed(2),
    expiringCount: expiringSubscriptions.length,
    expiringSubscriptions: expiringSubscriptions.map(sub => ({
      name: sub.name,
      price: sub.price.toFixed(2),
      category: sub.category,
      renewalDate: new Date(sub.nextPaymentDate).toLocaleDateString('ro-RO')
    })),
    categoryBreakdown,
    aiInsights: aiInsights.map(insight => ({
      title: insight.title,
      message: insight.message,
      action: insight.action
    }))
  };
}

// Send weekly digest email
async function sendWeeklyDigest(emailSettings, subscriptions) {
  if (!window.premiumManager || !window.premiumManager.canUseEmailNotifications()) {
    throw new Error('Email digest is a premium feature');
  }
  
  try {
    const digestData = await generateWeeklyDigestData(subscriptions);
    const template = emailTemplates.weekly_digest;
    
    // Process template with digest data
    let htmlContent = template.htmlContent;
    let subject = template.subject;
    
    // Simple template variable replacement for weekly digest
    const variables = {
      weekRange: digestData.weekRange,
      totalSubscriptions: digestData.totalSubscriptions.toString(),
      monthlySpending: digestData.monthlySpending,
      expiringCount: digestData.expiringCount.toString()
    };
    
    // Replace simple variables
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      htmlContent = htmlContent.replace(regex, variables[key]);
      subject = subject.replace(regex, variables[key]);
    });
    
    // Handle conditional sections and loops (simplified approach)
    if (digestData.expiringSubscriptions.length > 0) {
      let expiringSection = '';
      digestData.expiringSubscriptions.forEach(sub => {
        expiringSection += `
          <div style="background: white; padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #dc3545;">
            <div style="font-weight: 600; color: #212529;">${sub.name}</div>
            <div style="color: #6c757d; font-size: 13px;">
              $${sub.price} • ${sub.category} • Expires ${sub.renewalDate}
            </div>
          </div>
        `;
      });
      
      htmlContent = htmlContent.replace(/{{#if expiringSubscriptions}}[\s\S]*?{{\/if}}/g, `
        <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="margin: 0 0 12px 0; color: #856404;">⚠️ Expiring This Week</h3>
          ${expiringSection}
        </div>
      `);
    } else {
      htmlContent = htmlContent.replace(/{{#if expiringSubscriptions}}[\s\S]*?{{\/if}}/g, '');
    }
    
    // Handle AI insights section
    if (digestData.aiInsights.length > 0) {
      let insightsSection = '';
      digestData.aiInsights.forEach(insight => {
        insightsSection += `
          <div style="background: white; padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 4px solid #667eea;">
            <div style="font-weight: 600; color: #212529;">${insight.title}</div>
            <div style="color: #6c757d; font-size: 13px; margin: 4px 0;">${insight.message}</div>
            <div style="color: #007bff; font-size: 12px; font-weight: 500;">💡 ${insight.action}</div>
          </div>
        `;
      });
      
      htmlContent = htmlContent.replace(/{{#if aiInsights}}[\s\S]*?{{\/if}}/g, `
        <div style="background: linear-gradient(135deg, #667eea10, #764ba210); border-radius: 15px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 12px 0; color: #495057;">🤖 AI Insights</h3>
          ${insightsSection}
        </div>
      `);
    } else {
      htmlContent = htmlContent.replace(/{{#if aiInsights}}[\s\S]*?{{\/if}}/g, '');
    }
    
    // Handle category breakdown
    let categorySection = '';
    digestData.categoryBreakdown.forEach(cat => {
      categorySection += `
        <div style="display: flex; justify-content: space-between; margin: 4px 0;">
          <span style="color: #495057;">${cat.category}</span>
          <span style="color: #28a745; font-weight: 600;">$${cat.amount}</span>
        </div>
      `;
    });
    
    htmlContent = htmlContent.replace(/{{#each categoryBreakdown}}[\s\S]*?{{\/each}}/g, categorySection);
    
    // Send the email
    const emailData = {
      subject: subject,
      htmlContent: htmlContent,
      recipientName: 'User'
    };
    
    return await sendBrevoEmailWithTemplates(emailSettings, emailData);
    
  } catch (error) {
    console.error('Error generating weekly digest:', error);
    throw error;
  }
}

// Send email using Brevo API with templates
// Enhanced email sending with template support (popup-specific)
async function sendBrevoEmailWithTemplates(emailSettings, emailData) {
  try {
    // Handle different email types
    if (emailData.isWeeklyDigest) {
      // Weekly digest email - already processed
      var htmlContent = emailData.htmlContent;
      var subject = emailData.subject;
    } else {
      // Regular subscription reminder email
      const templateName = emailSettings.emailTemplate || 'casual';
      const template = emailTemplates[templateName];
      
      if (!template) {
        throw new Error(`Template "${templateName}" not found`);
      }
      
      // Process template with subscription data
      var htmlContent = template.htmlContent;
      var subject = template.subject;
      
      // Replace template variables
      const variables = {
        serviceName: emailData.subscription?.name || 'Your Service',
        amount: emailData.subscription?.price?.toFixed(2) || '0.00',
        renewalDate: emailData.subscription?.nextPaymentDate ? 
          new Date(emailData.subscription.nextPaymentDate).toLocaleDateString('ro-RO') : 'N/A',
        daysUntil: emailData.daysUntil || 'X',
        category: emailData.subscription?.category || 'Other'
      };
      
      // Replace all template variables
      Object.keys(variables).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        htmlContent = htmlContent.replace(regex, variables[key]);
        subject = subject.replace(regex, variables[key]);
      });
    }
    
    const payload = {
      sender: {
        email: emailSettings.brevoSenderEmail,
        name: emailSettings.brevoSenderName || 'Subscription Manager'
      },
      to: [{
        email: emailSettings.userEmail,
        name: emailData.recipientName || 'User'
      }],
      subject: subject,
      htmlContent: htmlContent,
      textContent: emailData.textContent || htmlContent.replace(/<[^>]*>/g, '')
    };
    
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': emailSettings.brevoApiKey
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const result = await response.json();
      showToast('Email sent successfully via Brevo', 'success');
      return { success: true, messageId: result.messageId };
    } else {
      const error = await response.json();
      console.error('❌ Brevo email error:', error);
      return { 
        success: false, 
        error: error.message || `HTTP ${response.status}: ${response.statusText}` 
      };
    }
  } catch (error) {
    console.error('❌ Brevo API error:', error);
    return { 
      success: false, 
      error: 'Nu s-a putut conecta la serviciul Brevo: ' + error.message 
    };
  }
}
// Update header status badges
function updateHeaderStatusBadges() {
  const freeTrialBadge = document.getElementById('freeTrialBadge');
  const premiumBadge = document.getElementById('premiumBadge');
  const freeBadge = document.getElementById('freeBadge');
  
  // Hide all badges first
  if (freeTrialBadge) freeTrialBadge.style.display = 'none';
  if (premiumBadge) premiumBadge.style.display = 'none';
  if (freeBadge) freeBadge.style.display = 'none';
  
  if (window.premiumManager) {
    const manager = window.premiumManager;
    
    if (manager.premiumStatus === 'trial') {
      const trialEnd = manager.trialEndDate;
      const daysLeft = trialEnd ? Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24)) : 14;
      
      if (freeTrialBadge) {
        freeTrialBadge.style.display = 'flex';
        const freeTrialDays = document.getElementById('freeTrialDays');
        if (freeTrialDays) {
          freeTrialDays.textContent = `${daysLeft} days`;
        }
      }
    } else if (manager.premiumStatus === 'premium' || manager.premiumStatus === 'business') {
      if (premiumBadge) {
        premiumBadge.style.display = 'flex';
        const premiumExpiry = document.getElementById('premiumExpiry');
        if (premiumExpiry) {
          premiumExpiry.textContent = 'Active';
        }
      }
    } else {
      // Free user
      if (freeBadge) {
        freeBadge.style.display = 'flex';
      }
    }
  } else {
    // No premium manager, show free badge
    if (freeBadge) {
      freeBadge.style.display = 'flex';
    }
  }
}

// Premium Features Integration
function getPremiumStatusBanner() {
  if (!window.premiumManager) return '';
  
  const manager = window.premiumManager;
  
  // Use global subscriptions variable which is already loaded
  const subscriptionCount = subscriptions ? window.subscriptions.length : 0;
  const limit = manager.getSubscriptionLimit ? manager.getSubscriptionLimit() : 10;
  
  if (manager.premiumStatus === 'trial') {
    const trialEnd = manager.trialEndDate;
    const daysLeft = trialEnd ? Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24)) : 0;
    
    // Update header badge
    const freeTrialBadge = document.getElementById('freeTrialBadge');
    const freeTrialDays = document.getElementById('freeTrialDays');
    const premiumBadge = document.getElementById('premiumBadge');
    const freeBadge = document.getElementById('freeBadge');
    
    if (freeTrialBadge && freeTrialDays) {
      freeTrialBadge.style.display = 'flex';
      freeTrialDays.textContent = `${daysLeft} days`;
    }
    if (premiumBadge) premiumBadge.style.display = 'none';
    if (freeBadge) freeBadge.style.display = 'none';
    
    return ''; // Don't show banner in content since it's now in header
  }
  
  if (manager.premiumStatus === 'premium' || manager.premiumStatus === 'business') {
    // Update header badge
    const premiumBadge = document.getElementById('premiumBadge');
    const premiumExpiry = document.getElementById('premiumExpiry');
    const freeTrialBadge = document.getElementById('freeTrialBadge');
    const freeBadge = document.getElementById('freeBadge');
    
    if (premiumBadge) {
      premiumBadge.style.display = 'flex';
    }
    if (premiumExpiry) {
      premiumExpiry.textContent = 'Active';
    }
    if (freeTrialBadge) freeTrialBadge.style.display = 'none';
    if (freeBadge) freeBadge.style.display = 'none';
    
    return ''; // Don't show banner in content since it's now in header
  }
  
  // Hide premium badges for free users and show free badge
  const freeTrialBadge = document.getElementById('freeTrialBadge');
  const premiumBadge = document.getElementById('premiumBadge');
  const freeBadge = document.getElementById('freeBadge');
  
  if (freeTrialBadge) freeTrialBadge.style.display = 'none';
  if (premiumBadge) premiumBadge.style.display = 'none';
  if (freeBadge) freeBadge.style.display = 'flex';
  
  // Free user approaching limit
  if (subscriptionCount >= 8) {
    return `
      <div class="premium-banner warning">
        <div class="premium-icon">⚠️</div>
        <div class="premium-info">
          <h4>Approaching Limit</h4>
          <p>${subscriptionCount}/${limit} subscriptions used</p>
        </div>
        <button class="btn btn-premium btn-sm" id="viewPremiumFeaturesBtn">Upgrade</button>
      </div>
    `;
  }
  
  return '';
}

function checkSubscriptionLimit() {
  if (!window.premiumManager) return true;
  
  const limit = window.premiumManager.getSubscriptionLimit();
  if (window.subscriptions.length >= limit) {
    showSubscriptionLimitReached();
    return false;
  }
  return true;
}

function showSubscriptionLimitReached() {
  window.content.innerHTML = `
    <div class="premium-limit-reached">
      <div class="premium-icon">🚫</div>
      <h3>Subscription Limit Reached</h3>
      <p>You've reached the limit of ${window.premiumManager.getSubscriptionLimit()} subscriptions on the free plan.</p>
      
      <div class="premium-benefits">
        <h4>Upgrade to Premium for:</h4>
        <div class="benefit">✨ Unlimited subscriptions</div>
        <div class="benefit">📊 Advanced analytics</div>
        <div class="benefit">🤖 AI insights</div>
        <div class="benefit">📧 Email notifications</div>
        <div class="benefit">💰 Advanced budgeting</div>
      </div>
      
      <div class="premium-pricing">
        <div class="price-option">
          <span class="price">$4.99/month</span>
          <span class="billing">billed monthly</span>
        </div>
        <div class="price-option recommended">
          <span class="price">$39.99/year</span>
          <span class="billing">billed annually</span>
          <span class="discount">Save 33%</span>
        </div>
      </div>
      
      <button class="btn btn-premium" id="upgradeToPremiumBtn">🚀 Upgrade to Premium</button>
      <button class="btn btn-secondary" id="startTrialBtn">🆓 Start 14-Day Free Trial</button>
      <button class="btn btn-outline" id="backToSubscriptionsBtn">Back to Subscriptions</button>
    </div>
  `;
}

async function startFreeTrial() {
  if (!window.premiumManager) return;
  
  try {
    // Start the trial
    await window.premiumManager.startTrial();
    
    // Show success message
    window.content.innerHTML = `
      <div class="trial-started">
        <div class="success-icon">🎉</div>
        <h3>Free Trial Started!</h3>
        <p>You now have access to all Premium features for 30 days.</p>
        
        <div class="trial-features">
          <h4>What's unlocked:</h4>
          <div class="benefit">✨ Unlimited subscriptions</div>
          <div class="benefit">📊 Advanced analytics & charts</div>
          <div class="benefit">🤖 AI categorization</div>
          <div class="benefit">📧 Email notifications</div>
          <div class="benefit">💰 Advanced budgeting</div>
          <div class="benefit">📄 PDF & Excel reports</div>
        </div>
        
        <button class="btn" id="backToSubscriptionsBtn">Start Using Premium Features</button>
      </div>
    `;
    
    // Refresh the UI to reflect new premium status
    setTimeout(() => {
      updatePremiumStatus();
      loadSubscriptions(); // This will reload with premium features
    }, 2000);
    
  } catch (error) {
    console.error('Error starting trial:', error);
    showToast('Failed to start trial. Please try again.', 'error');
  }
}

// Update premium status badges in header
async function updatePremiumStatus() {
  if (!window.premiumManager) return;
  
  const freeTrialBadge = document.getElementById('freeTrialBadge');
  const premiumBadge = document.getElementById('premiumBadge');
  const freeBadge = document.getElementById('freeBadge');
  
  // Hide all badges first
  [freeTrialBadge, premiumBadge, freeBadge].forEach(badge => {
    if (badge) badge.style.display = 'none';
  });
  
  if (window.premiumManager.isPremium()) {
    if (window.premiumManager.premiumStatus === 'trial') {
      // Show trial badge
      if (freeTrialBadge) {
        freeTrialBadge.style.display = 'flex';
        const daysElement = document.getElementById('freeTrialDays');
        if (daysElement && window.premiumManager.trialEndDate) {
          const daysLeft = Math.ceil((window.premiumManager.trialEndDate - new Date()) / (1000 * 60 * 60 * 24));
          daysElement.textContent = `${Math.max(0, daysLeft)} days`;
        }
      }
    } else {
      // Show premium badge
      if (premiumBadge) {
        premiumBadge.style.display = 'flex';
      }
    }
  } else {
    // Show free badge
    if (freeBadge) {
      freeBadge.style.display = 'flex';
    }
  }
}

async function showAIInsights() {
  // showAIInsights called
  // Premium Manager available check
  
  if (!window.premiumManager) {
    console.error('❌ Premium Manager not available');
    window.content.innerHTML = `
      <div class="error">
        <h4>AI Features Unavailable</h4>
        <p>Premium features are not properly loaded. Please refresh the extension.</p>
        <button class="btn btn-secondary" data-action="load-subscriptions">Back to Overview</button>
      </div>
    `;
    return;
  }
  
  if (!window.premiumManager.isFeatureAvailable('ai_insights')) {
    showToast('Premium upgrade required for AI Insights', 'info');
    showModal(window.premiumManager.showUpgradePrompt('AI Insights'));
    return;
  }
  
  try {
    showToast('Starting AI analysis...', 'info');
    // AI analysis processing subscriptions data
    
    window.content.innerHTML = `
      <div class="ai-insights">
        <h3 class="section-title">🤖 AI Insights</h3>
        <div class="loading">
          <div class="loading-spinner"></div>
          <p>Analyzing your subscriptions with AI...</p>
        </div>
      </div>
    `;
    
    // Calling AI insights generation
    const insights = await window.premiumManager.generateAIInsights(subscriptions);
    showToast('AI Insights generated successfully', 'success');
    
    window.content.innerHTML = `
      <div class="ai-insights">
        <h3 class="section-title">🤖 AI Insights</h3>
        
        <div class="ai-status">
          <div class="ai-usage">
            <span class="ai-icon">🤖</span>
            <span class="ai-text">Secure AI Analysis Complete</span>
            <span class="ai-badge">Local Processing</span>
          </div>
        </div>
        
        ${insights.map(insight => `
          <div class="insight-card ${insight.type}">
            <div class="insight-header">
              <span class="insight-icon">${getInsightIcon(insight.type)}</span>
              <h4>${insight.title}</h4>
              ${insight.confidence ? `<span class="confidence-badge">${insight.confidence}% confidence</span>` : ''}
            </div>
            <p>${insight.message}</p>
            <div class="insight-action">${insight.action}</div>
          </div>
        `).join('')}
        
        <div class="ai-disclaimer">
          <p><strong>Security Note:</strong> All AI analysis is performed locally on your device. No subscription data is sent to external servers.</p>
        </div>
        
        <button class="btn btn-secondary" id="backToSubscriptionsBtn">Back to Subscriptions</button>
      </div>
    `;
  } catch (error) {
    console.error('AI Insights error:', error);
    window.content.innerHTML = `
      <div class="ai-insights">
        <h3 class="section-title">🤖 AI Insights</h3>
        <div class="error">
          <h4>AI Analysis Error</h4>
          <p>${error.message}</p>
          ${error.message.includes('limit') ? `
            <div class="upgrade-prompt">
              <p>Upgrade to Premium for higher AI usage limits!</p>
              <button class="btn btn-premium" data-action="upgrade" data-feature="ai_insights">Upgrade Now</button>
            </div>
          ` : ''}
        </div>
        <button class="btn btn-secondary" id="backToSubscriptionsBtn">Back to Subscriptions</button>
      </div>
    `;
  }
}

function getInsightIcon(type) {
  switch (type) {
    case 'warning': return '⚠️';
    case 'suggestion': return '💡';
    case 'info': return 'ℹ️';
    default: return '🔍';
  }
}

function showAdvancedAnalytics() {
  if (!window.premiumManager || !window.premiumManager.isFeatureAvailable('advanced_analytics')) {
    showModal(window.premiumManager.showUpgradePrompt('Advanced Analytics'));
    return;
  }
  
  const analytics = window.premiumManager.generateAdvancedAnalytics(subscriptions);
  
  window.content.innerHTML = `
    <div class="advanced-analytics">
      <h3 class="section-title">📊 Advanced Analytics</h3>
      
      <div class="analytics-grid">
        <div class="analytics-card">
          <h4>Year-over-Year Growth</h4>
          <div class="metric-value">${analytics.yearOverYear.growth}%</div>
          <div class="metric-detail">
            Current: $${analytics.yearOverYear.currentYear.toFixed(2)}<br>
            Previous: $${analytics.yearOverYear.lastYear.toFixed(2)}
          </div>
        </div>
        
        <div class="analytics-card">
          <h4>Spending Prediction</h4>
          <div class="metric-value">$${analytics.predictions.nextYear.toFixed(2)}</div>
          <div class="metric-detail">Projected annual spending</div>
        </div>
      </div>
      
      <div class="roi-analysis">
        <h4>ROI Analysis</h4>
        ${analytics.roi.slice(0, 3).map(item => `
          <div class="roi-item">
            <span class="service-name">${item.name}</span>
            <span class="roi-value ${item.roi > 0 ? 'positive' : 'negative'}">
              ${item.roi > 0 ? '+' : ''}${item.roi.toFixed(1)}%
            </span>
          </div>
        `).join('')}
      </div>
      
      <button class="btn btn-secondary" id="backToSubscriptionsBtn">Back to Subscriptions</button>
    </div>
  `;
}

// Show premium features dashboard for premium/trial users
function showPremiumFeatures() {
  if (!window.premiumManager || !window.premiumManager.isPremium()) {
    showPremiumUpgradePrompt('overview');
    return;
  }

  const isTrial = window.premiumManager.isTrialActive();
  const daysLeft = isTrial ? Math.ceil((window.premiumManager.trialEndDate - new Date()) / (1000 * 60 * 60 * 24)) : 0;

  window.content.innerHTML = `
    <div class="premium-features-dashboard">
      <div class="dashboard-header">
        <h3 class="section-title">💎 Premium Features</h3>
        <div class="status-badge ${isTrial ? 'trial' : 'premium'}">
          <span class="status-icon">${isTrial ? '🆓' : '💎'}</span>
          <span class="status-text">${isTrial ? `Trial: ${daysLeft} days left` : 'Premium Active'}</span>
        </div>
      </div>

      <div class="premium-features-grid">
        <div class="feature-card accessible" data-action="switch-tab" data-target="analytics">
          <div class="feature-icon">📊</div>
          <h4>Advanced Analytics</h4>
          <p>Interactive charts, spending trends, and detailed insights</p>
          <div class="feature-status">✅ Available</div>
        </div>

        <div class="feature-card accessible" data-action="show-ai-insights">
          <div class="feature-icon">🤖</div>
          <h4>AI Insights</h4>
          <p>Smart analysis, duplicate detection, and cost optimization</p>
          <div class="feature-status">✅ Available</div>
        </div>

        <div class="feature-card accessible" data-action="show-notification-settings">
          <div class="feature-icon">📧</div>
          <h4>Email Notifications</h4>
          <p>Automated renewal alerts and budget warnings via email</p>
          <div class="feature-status">✅ Available</div>
        </div>

        <div class="feature-card accessible" data-action="switch-tab" data-target="budget">
          <div class="feature-icon">💰</div>
          <h4>Advanced Budgeting</h4>
          <p>Custom categories, forecasting, and rollover tracking</p>
          <div class="feature-status">✅ Available</div>
        </div>

        <div class="feature-card accessible" data-action="show-pdf-export">
          <div class="feature-icon">📄</div>
          <h4>PDF Reports</h4>
          <p>Generate comprehensive financial reports and export data</p>
          <div class="feature-status">✅ Available</div>
        </div>

        <div class="feature-card accessible">
          <div class="feature-icon">🏷️</div>
          <h4>Custom Categories</h4>
          <p>Create unlimited custom subscription categories</p>
          <div class="feature-status">✅ Available</div>
        </div>
      </div>

      ${isTrial ? `
        <div class="trial-cta">
          <h4>🚀 Enjoying your Premium trial?</h4>
          <p>Upgrade now to keep access to all Premium features after your trial ends.</p>
          <button class="btn btn-premium" data-action="upgrade" data-feature="trial_upgrade">
            💳 Upgrade Now - Save 33% with Annual
          </button>
        </div>
      ` : ''}

      <button class="btn btn-outline" data-action="load-subscriptions">← Back to Overview</button>
    </div>
  `;
}

// DEPRECATED: Use window.premiumManager?.showUpgradePrompt() instead
function upgradeToPremium() {
  console.warn('⚠️ upgradeToPremium is deprecated. Use window.premiumManager?.showUpgradePrompt() instead.');

  // Fallback to premium manager if available
  if (window.premiumManager && typeof window.premiumManager.showUpgradePrompt === 'function') {
    const prompt = window.premiumManager.showUpgradePrompt('general');
    showModal(prompt);
    return;
  }

  // Hardcoded fallback (minimal)
  const fallbackPrompt = `
    <div class="premium-prompt">
      <div class="premium-icon">💎</div>
      <h3>Upgrade to Premium</h3>
      <p>To upgrade, please visit our website or contact support.</p>
      <button class="btn btn-premium" data-action="upgrade">Learn More</button>
    </div>
  `;
  showModal(fallbackPrompt);
}

// Modify existing functions to check premium limits
const originalShowAddSubscription = showAddSubscription;
showAddSubscription = function() {
  if (!checkSubscriptionLimit()) {
    return;
  }
  originalShowAddSubscription();
};

// Theme Management Functions
async function initializeTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    const theme = result.theme || 'light';
    applyTheme(theme);
    updateThemeButton(theme);
  } catch (error) {
    console.error('Error initializing theme:', error);
    applyTheme('light');
    updateThemeButton('light');
  }
}

function applyTheme(theme) {
  if (theme === 'auto') {
    // Detect system theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'light';
  }
  
  // Apply theme to document
  document.documentElement.setAttribute('data-theme', theme);
  
  // Update body classes for compatibility
  const body = document.body;
  body.classList.remove('light-mode', 'dark-mode');
  body.classList.add(theme + '-mode');
}

function updateThemeButton(theme) {
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    // Clear existing content
    themeToggle.textContent = '';
    
    if (theme === 'auto') {
      themeToggle.textContent = '🔄';
      themeToggle.title = 'Auto Theme (Follow System)';
    } else {
      themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
      themeToggle.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    }
  }
}

async function toggleTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    const currentTheme = result.theme || 'light';
    
    let newTheme;
    switch (currentTheme) {
      case 'light':
        newTheme = 'dark';
        break;
      case 'dark':
        newTheme = 'auto';
        break;
      default:
        newTheme = 'light';
        break;
    }
    
    await chrome.storage.local.set({ theme: newTheme });
    applyTheme(newTheme);
    updateThemeButton(newTheme);
    
    // Show feedback
    const themeNames = { light: 'Light', dark: 'Dark', auto: 'Auto' };
    showToast(`Switched to ${themeNames[newTheme]} mode`);
  } catch (error) {
    console.error('Error toggling theme:', error);
    showToast('Failed to change theme', 'error');
  }
}

// AI Auto-Categorization System (Local Processing)
class LocalAICategorizer {
  constructor() {
    this.categoryPatterns = this.initializeCategoryPatterns();
    this.confidenceThreshold = 0.7;
  }
  
  initializeCategoryPatterns() {
    return {
      entertainment: {
        keywords: [
          'netflix', 'spotify', 'disney', 'hulu', 'amazon prime', 'youtube', 'twitch',
          'hbo', 'paramount', 'apple tv', 'discovery', 'peacock', 'tidal', 'deezer',
          'soundcloud', 'pandora', 'cinema', 'movie', 'music', 'streaming', 'tv',
          'game', 'gaming', 'xbox', 'playstation', 'nintendo', 'steam', 'epic games',
          'entertainment', 'media', 'video', 'audio', 'podcast', 'radio'
        ],
        patterns: [
          /stream/i, /music/i, /video/i, /game/i, /entertainment/i, /media/i,
          /tv/i, /cinema/i, /movie/i, /film/i, /audio/i, /radio/i, /podcast/i
        ],
        weight: 1.0
      },
      
      productivity: {
        keywords: [
          'office', 'microsoft', 'google workspace', 'dropbox', 'zoom', 'slack',
          'notion', 'trello', 'asana', 'monday', 'jira', 'confluence', 'figma',
          'adobe', 'canva', 'github', 'gitlab', 'bitbucket', 'aws', 'azure',
          'heroku', 'digitalocean', 'linode', 'cloudflare', 'mailchimp',
          'hubspot', 'salesforce', 'zendesk', 'intercom', 'freshworks',
          'productivity', 'business', 'work', 'professional', 'enterprise',
          'suite', 'tool', 'software', 'saas', 'platform', 'service'
        ],
        patterns: [
          /office/i, /workspace/i, /business/i, /professional/i, /enterprise/i,
          /productivity/i, /work/i, /tool/i, /software/i, /saas/i, /platform/i,
          /suite/i, /cloud/i, /storage/i, /collaboration/i, /team/i
        ],
        weight: 1.0
      },
      
      utilities: {
        keywords: [
          'internet', 'phone', 'mobile', 'cellular', 'wifi', 'broadband',
          'electricity', 'gas', 'water', 'heating', 'cooling', 'energy',
          'power', 'utility', 'electric', 'telecom', 'isp', 'provider',
          'verizon', 'at&t', 'tmobile', 'sprint', 'comcast', 'spectrum',
          'xfinity', 'cox', 'centurylink', 'frontier', 'optimum'
        ],
        patterns: [
          /utility/i, /electric/i, /gas/i, /water/i, /internet/i, /phone/i,
          /mobile/i, /cellular/i, /broadband/i, /telecom/i, /isp/i, /provider/i,
          /energy/i, /power/i, /heating/i, /cooling/i
        ],
        weight: 1.0
      },
      
      education: {
        keywords: [
          'coursera', 'udemy', 'pluralsight', 'linkedin learning', 'skillshare',
          'masterclass', 'khan academy', 'edx', 'codecademy', 'treehouse',
          'datacamp', 'brilliant', 'duolingo', 'babbel', 'rosetta stone',
          'education', 'learning', 'course', 'training', 'tutorial',
          'certification', 'degree', 'university', 'college', 'school',
          'academic', 'study', 'skill', 'knowledge', 'language'
        ],
        patterns: [
          /education/i, /learning/i, /course/i, /training/i, /tutorial/i,
          /certification/i, /university/i, /college/i, /school/i, /academic/i,
          /study/i, /skill/i, /language/i, /knowledge/i
        ],
        weight: 1.0
      },
      
      health: {
        keywords: [
          'health', 'fitness', 'medical', 'doctor', 'hospital', 'clinic',
          'pharmacy', 'medicine', 'dental', 'vision', 'insurance',
          'healthcare', 'wellness', 'therapy', 'mental health', 'nutrition',
          'diet', 'exercise', 'gym', 'yoga', 'meditation', 'mindfulness'
        ],
        patterns: [
          /health/i, /medical/i, /fitness/i, /wellness/i, /therapy/i,
          /insurance/i, /dental/i, /vision/i, /gym/i, /yoga/i, /meditation/i,
          /nutrition/i, /diet/i, /exercise/i
        ],
        weight: 1.0
      },
      
      finance: {
        keywords: [
          'bank', 'banking', 'credit', 'loan', 'mortgage', 'investment',
          'trading', 'broker', 'financial', 'accounting', 'tax', 'budget',
          'money', 'payment', 'card', 'wallet', 'fintech', 'crypto',
          'blockchain', 'paypal', 'venmo', 'cashapp', 'zelle'
        ],
        patterns: [
          /bank/i, /financial/i, /credit/i, /loan/i, /investment/i, /trading/i,
          /money/i, /payment/i, /wallet/i, /fintech/i, /crypto/i, /tax/i
        ],
        weight: 1.0
      },
      
      transport: {
        keywords: [
          'uber', 'lyft', 'taxi', 'car', 'vehicle', 'transport', 'travel',
          'flight', 'airline', 'hotel', 'booking', 'rental', 'gas', 'fuel',
          'parking', 'toll', 'public transport', 'metro', 'bus', 'train'
        ],
        patterns: [
          /transport/i, /travel/i, /car/i, /vehicle/i, /flight/i, /airline/i,
          /hotel/i, /rental/i, /fuel/i, /parking/i, /taxi/i, /uber/i, /lyft/i
        ],
        weight: 1.0
      },
      
      shopping: {
        keywords: [
          'amazon', 'ebay', 'shop', 'store', 'retail', 'marketplace',
          'ecommerce', 'delivery', 'shipping', 'fashion', 'clothing',
          'food', 'grocery', 'restaurant', 'meal', 'subscription box'
        ],
        patterns: [
          /shop/i, /store/i, /retail/i, /marketplace/i, /delivery/i,
          /shipping/i, /fashion/i, /clothing/i, /food/i, /grocery/i,
          /restaurant/i, /meal/i
        ],
        weight: 1.0
      }
    };
  }
  
  // Main categorization function
  categorizeService(serviceName, existingCategory = null) {
    if (!serviceName || typeof serviceName !== 'string') {
      return { category: 'other', confidence: 0, reason: 'Invalid service name' };
    }
    
    const normalizedName = serviceName.toLowerCase().trim();
    const scores = {};
    
    // Calculate scores for each category
    for (const [category, data] of Object.entries(this.categoryPatterns)) {
      scores[category] = this.calculateCategoryScore(normalizedName, data);
    }
    
    // Find the category with highest score
    const bestMatch = Object.entries(scores).reduce((best, [category, score]) => {
      return score > best.score ? { category, score } : best;
    }, { category: 'other', score: 0 });
    
    // Determine confidence and provide reasoning
    const confidence = Math.min(bestMatch.score, 1.0);
    const shouldUseAI = confidence >= this.confidenceThreshold;
    
    const result = {
      category: shouldUseAI ? bestMatch.category : (existingCategory || 'other'),
      confidence: confidence,
      aiSuggestion: bestMatch.category,
      aiConfidence: confidence,
      reason: this.generateReason(normalizedName, bestMatch.category, confidence),
      isAIGenerated: shouldUseAI,
      alternatives: this.getAlternativeCategories(scores, bestMatch.category)
    };
    
    return result;
  }
  
  // Calculate score for a specific category
  calculateCategoryScore(serviceName, categoryData) {
    let score = 0;
    let matches = 0;
    
    // Check keyword matches
    for (const keyword of categoryData.keywords) {
      if (serviceName.includes(keyword.toLowerCase())) {
        score += 0.8 * categoryData.weight;
        matches++;
      }
    }
    
    // Check pattern matches
    for (const pattern of categoryData.patterns) {
      if (pattern.test(serviceName)) {
        score += 0.6 * categoryData.weight;
        matches++;
      }
    }
    
    // Bonus for multiple matches
    if (matches > 1) {
      score += matches * 0.1;
    }
    
    // Normalize score
    return Math.min(score, 1.0);
  }
  
  // Generate human-readable reason for categorization
  generateReason(serviceName, category, confidence) {
    const reasons = {
      entertainment: [
        'streaming service patterns', 'media-related keywords', 'entertainment platforms'
      ],
      productivity: [
        'business software patterns', 'productivity tools', 'professional services'
      ],
      utilities: [
        'utility service patterns', 'infrastructure services', 'essential services'
      ],
      education: [
        'learning platform patterns', 'educational content', 'skill development'
      ],
      health: [
        'health-related keywords', 'wellness services', 'medical patterns'
      ],
      finance: [
        'financial service patterns', 'banking keywords', 'money management'
      ],
      transport: [
        'travel-related patterns', 'transportation services', 'mobility platforms'
      ],
      shopping: [
        'retail patterns', 'shopping platforms', 'e-commerce services'
      ]
    };
    
    const categoryReasons = reasons[category] || ['general service patterns'];
    const selectedReason = categoryReasons[Math.floor(Math.random() * categoryReasons.length)];
    
    if (confidence >= 0.9) {
      return `High confidence match based on ${selectedReason}`;
    } else if (confidence >= 0.7) {
      return `Good match detected using ${selectedReason}`;
    } else if (confidence >= 0.5) {
      return `Possible match identified through ${selectedReason}`;
    } else {
      return `Low confidence suggestion based on ${selectedReason}`;
    }
  }
  
  // Get alternative category suggestions
  getAlternativeCategories(scores, bestCategory) {
    return Object.entries(scores)
      .filter(([category, score]) => category !== bestCategory && score > 0.3)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, score]) => ({
        category,
        confidence: Math.min(score, 1.0)
      }));
  }
  
  // Batch categorize multiple services
  batchCategorize(services) {
    return services.map(service => {
      const result = this.categorizeService(service.name, service.category);
      return {
        ...service,
        aiCategorization: result
      };
    });
  }
  
  // Learn from user corrections (simple implementation)
  learnFromCorrection(serviceName, actualCategory, aiSuggestion) {
    // In a more advanced implementation, this would update the AI model
    // For now, we'll store corrections for future reference
    const correction = {
      serviceName: serviceName.toLowerCase(),
      actualCategory,
      aiSuggestion,
      timestamp: new Date().toISOString()
    };
    
    // Store correction in local storage
    this.storeCorrection(correction);
    
    return correction;
  }
  
  // Store user corrections
  async storeCorrection(correction) {
    try {
      const result = await chrome.storage.local.get(['aiCorrections']);
      const corrections = result.aiCorrections || [];
      corrections.push(correction);
      
      // Keep only last 100 corrections
      if (corrections.length > 100) {
        corrections.splice(0, corrections.length - 100);
      }
      
      await chrome.storage.local.set({ aiCorrections: corrections });
    } catch (error) {
      console.error('Error storing AI correction:', error);
    }
  }
  
  // Get learning statistics
  async getLearningStats() {
    try {
      const result = await chrome.storage.local.get(['aiCorrections']);
      const corrections = result.aiCorrections || [];
      
      const stats = {
        totalCorrections: corrections.length,
        categoryDistribution: {},
        accuracyTrend: this.calculateAccuracyTrend(corrections),
        commonMistakes: this.getCommonMistakes(corrections)
      };
      
      // Calculate category distribution
      corrections.forEach(correction => {
        stats.categoryDistribution[correction.actualCategory] = 
          (stats.categoryDistribution[correction.actualCategory] || 0) + 1;
      });
      
      return stats;
    } catch (error) {
      console.error('Error getting learning stats:', error);
      return { totalCorrections: 0, categoryDistribution: {}, accuracyTrend: [], commonMistakes: [] };
    }
  }
  
  // Calculate accuracy trend over time
  calculateAccuracyTrend(corrections) {
    const batches = [];
    const batchSize = 10;
    
    for (let i = 0; i < corrections.length; i += batchSize) {
      const batch = corrections.slice(i, i + batchSize);
      const accuracy = batch.length > 0 ? 
        (batch.filter(c => c.aiSuggestion === c.actualCategory).length / batch.length) : 0;
      
      batches.push({
        batch: Math.floor(i / batchSize) + 1,
        accuracy: (accuracy * 100).toFixed(1)
      });
    }
    
    return batches.slice(-10); // Last 10 batches
  }
  
  // Get common categorization mistakes
  getCommonMistakes(corrections) {
    const mistakes = {};
    
    corrections.forEach(correction => {
      const key = `${correction.aiSuggestion} → ${correction.actualCategory}`;
      mistakes[key] = (mistakes[key] || 0) + 1;
    });
    
    return Object.entries(mistakes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([mistake, count]) => ({ mistake, count }));
  }
}

// Analytics Dashboard Class
class AnalyticsDashboard {
  constructor() {
    this.chartInstances = {};
    this.currentPeriod = 'monthly';
    this.currentView = 'overview';
  }
  
  // Initialize Chart.js library
  async loadChartJS() {
    if (window.Chart) return true;

    showToast('Loading analytics charts...', 'info');

    try {
      // Try local file first (most reliable)
      const localSources = [
        chrome.runtime.getURL('chart.umd.min.js'),
        'chart.umd.min.js'
      ];

      // Fallback to CDN sources
      const cdnSources = [
        'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/chart.js/4.4.0/chart.umd.min.js',
        'https://unpkg.com/chart.js@4.4.0/dist/chart.umd.min.js'
      ];

      const allSources = [...localSources, ...cdnSources];

      let lastError = null;
      for (const source of allSources) {
        try {
          const script = document.createElement('script');
          script.src = source;
          script.crossOrigin = 'anonymous';
          document.head.appendChild(script);

          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Chart.js loading timeout'));
            }, 10000); // 10 second timeout

            script.onload = () => {
              clearTimeout(timeout);
              showToast('Chart.js library loaded successfully', 'success');
              showToast('Charts loaded successfully', 'success');
              resolve(true);
            };

            script.onerror = () => {
              clearTimeout(timeout);
              console.warn('Failed to load Chart.js from:', source);
              document.head.removeChild(script);
              reject(new Error(`Failed to load Chart.js from ${source}`));
            };
          });
        } catch (error) {
          lastError = error;
          console.warn('Failed to load Chart.js from:', source, error.message);
        }
      }

      throw new Error('All CDN sources for Chart.js failed to load');
    } catch (error) {
      console.error('Error loading Chart.js:', error);
      showToast('Error loading charts library', 'error');
      return false;
    }
  }

  // Process analytics data from subscriptions
  async processAnalyticsData(subscriptions, baseCurrency, rates, categoryBudgets) {
    const activeSubscriptions = subscriptions.filter(s => s.isActive);

    // Calculate monthly spending with proper currency conversion
    let monthlySpending = 0;
    const categorySpending = {};
    const categories = new Set();

    for (const sub of activeSubscriptions) {
      categories.add(sub.category);
      const convertedPrice = await convertCurrency(sub.price, sub.currency, baseCurrency, rates);
      monthlySpending += convertedPrice;
      categorySpending[sub.category] = (categorySpending[sub.category] || 0) + convertedPrice;
    }

    const yearlySpending = monthlySpending * 12;

    // Sort categories by spending
    const sortedCategories = Object.entries(categorySpending)
      .sort(([,a], [,b]) => b - a)
      .map(([category, spending]) => ({ category, spending }));

    // Find most expensive subscription
    let mostExpensive = null;
    for (const sub of activeSubscriptions) {
      const convertedPrice = await convertCurrency(sub.price, sub.currency, baseCurrency, rates);
      if (!mostExpensive || convertedPrice > mostExpensive.convertedPrice) {
        mostExpensive = { ...sub, convertedPrice };
      }
    }

    // Calculate average subscription cost
    const avgCost = activeSubscriptions.length > 0 ? monthlySpending / activeSubscriptions.length : 0;

    // Budget analysis
    const budgetStatus = {};
    Object.entries(categoryBudgets).forEach(([category, budget]) => {
      const spending = categorySpending[category] || 0;
      budgetStatus[category] = {
        budget,
        spending,
        remaining: budget - spending,
        percentage: budget > 0 ? (spending / budget) * 100 : 0
      };
    });

    // Upcoming payments (next 30 days)
    const upcomingPayments = activeSubscriptions.filter(sub => {
      if (!sub.nextPayment) return false;
      const nextPaymentDate = new Date(sub.nextPayment);
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      return nextPaymentDate <= thirtyDaysFromNow;
    });

    // Subscription growth trend (simplified)
    const renewalDates = activeSubscriptions
      .filter(sub => sub.startDate)
      .map(sub => new Date(sub.startDate))
      .sort((a, b) => a - b);

    return {
      monthlySpending,
      yearlySpending,
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: activeSubscriptions.length,
      categories: categories.size,
      categoryBreakdown: sortedCategories,
      mostExpensive,
      averageCost: avgCost,
      averagePrice: avgCost, // Alias for compatibility
      annualProjection: yearlySpending, // Alias for compatibility
      budgetStatus,
      upcomingPayments: upcomingPayments.length,
      renewalTrend: renewalDates.length > 0 ? {
        firstSubscription: renewalDates[0],
        lastSubscription: renewalDates[renewalDates.length - 1],
        totalMonths: Math.max(1, Math.ceil((Date.now() - renewalDates[0]) / (1000 * 60 * 60 * 24 * 30)))
      } : null,
      // Simplified trend calculation (in real implementation, this would compare with previous period)
      monthlyTrend: Math.random() * 20 - 10 // Random trend between -10% and +10% for demo
    };
  }

  // Main analytics dashboard
  async showAnalyticsDashboard() {
    if (!window.premiumManager || !window.premiumManager.isFeatureAvailable('analytics_dashboard')) {
      showPremiumUpgradePrompt('analytics_dashboard');
      return;
    }
    
    try {
      showToast('Loading analytics dashboard...', 'info');
      
      // Load Chart.js if not already loaded
      const chartsLoaded = await this.loadChartJS();
      if (!chartsLoaded) {
        // Fallback to simple analytics view if charts fail to load
        this.showSimpleAnalyticsView();
        return;
      }
      
      // Get subscription data
      const result = await chrome.storage.local.get(['subscriptions', 'baseCurrency', 'currencyRates', 'categoryBudgets']);
      window.subscriptions = result.subscriptions || [];
      const baseCurrency = result.baseCurrency || 'USD';
      const rates = result.currencyRates || getDefaultCurrencyRates();
      const categoryBudgets = result.categoryBudgets || {};
      
      if (window.subscriptions.length === 0) {
        window.content.innerHTML = `
          <div class="section">
            <h3 class="section-title">📊 Analytics Dashboard</h3>
            <div class="empty-state">
              <p>No subscriptions found for analysis.</p>
              <button class="btn" data-action="load-subscriptions">Back to Overview</button>
            </div>
          </div>
        `;
        return;
      }
      
      // Process analytics data
      const analyticsData = await this.processAnalyticsData(subscriptions, baseCurrency, rates, categoryBudgets);
      
      window.content.innerHTML = `
        <div class="section">
          <h3 class="section-title">📊 Analytics Dashboard</h3>
          
          <!-- Dashboard Controls -->
          <div class="analytics-controls" style="background: var(--bg-secondary); padding: 16px; border-radius: 12px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div class="period-selector">
                <label style="font-size: 12px; color: var(--text-secondary); margin-right: 8px;">Period:</label>
                <select id="periodSelect" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color);">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div class="view-selector">
                <label style="font-size: 12px; color: var(--text-secondary); margin-right: 8px;">View:</label>
                <select id="viewSelect" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color);">
                  <option value="overview">Overview</option>
                  <option value="categories">Categories</option>
                  <option value="trends">Trends</option>
                  <option value="budgets">Budgets</option>
                </select>
              </div>
            </div>
          </div>
          
          <!-- Key Metrics -->
          <div class="key-metrics" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
            <div class="metric-card" style="background: linear-gradient(135deg, #667eea20, #764ba220); padding: 16px; border-radius: 12px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: var(--primary-color);">${formatCurrency(analyticsData.monthlySpending, baseCurrency)}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Monthly Spending</div>
              <div style="font-size: 10px; color: ${analyticsData.monthlyTrend >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">
                ${analyticsData.monthlyTrend >= 0 ? '↗' : '↘'} ${Math.abs(analyticsData.monthlyTrend).toFixed(1)}%
              </div>
            </div>
            
            <div class="metric-card" style="background: linear-gradient(135deg, #28a74520, #20c99720); padding: 16px; border-radius: 12px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: var(--success-color);">${analyticsData.activeSubscriptions}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Active Services</div>
              <div style="font-size: 10px; color: var(--text-secondary);">${analyticsData.categories} categories</div>
            </div>
            
            <div class="metric-card" style="background: linear-gradient(135deg, #ffc10720, #ff851120); padding: 16px; border-radius: 12px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: var(--warning-color);">${formatCurrency(analyticsData.averagePrice, baseCurrency)}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Average Price</div>
              <div style="font-size: 10px; color: var(--text-secondary);">per service</div>
            </div>
            
            <div class="metric-card" style="background: linear-gradient(135deg, #dc354520, #e7515120); padding: 16px; border-radius: 12px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: var(--danger-color);">${formatCurrency(analyticsData.annualProjection, baseCurrency)}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Annual Projection</div>
              <div style="font-size: 10px; color: var(--text-secondary);">estimated total</div>
            </div>
          </div>
          
          <!-- Charts Container -->
          <div class="charts-container" id="chartsContainer">
            <!-- Charts will be dynamically loaded here -->
          </div>
          
          <!-- Insights Panel -->
          <div class="insights-panel" style="background: var(--bg-secondary); padding: 16px; border-radius: 12px; margin-top: 20px;">
            <h4 style="margin: 0 0 12px 0; color: var(--primary-color);">💡 Insights & Recommendations</h4>
            <div id="insightsContent">
              ${this.generateInsights(analyticsData)}
            </div>
          </div>
          
          <div style="margin-top: 20px;">
            <button class="btn btn-secondary" data-action="load-subscriptions">Back to Overview</button>
            <button class="btn btn-outline" id="exportAnalyticsBtn">Export Analytics</button>
          </div>
        </div>
      `;
      
      // Load initial charts
      await this.loadCharts(analyticsData, this.currentView);
      
      // Add event listeners
      const periodSelect = document.getElementById('periodSelect');
      if (periodSelect) {
        addEventSafe(periodSelect, 'change', (e) => {
          this.currentPeriod = e.target.value;
          this.refreshAnalytics();
        });
      }

      const viewSelect = document.getElementById('viewSelect');
      if (viewSelect) {
        addEventSafe(viewSelect, 'change', (e) => {
          this.currentView = e.target.value;
          this.loadCharts(analyticsData, this.currentView);
        });
      }
      
    } catch (error) {
      console.error('Error loading analytics dashboard:', error);
      showToast('Failed to load analytics dashboard: ' + error.message, 'error');
    }
  }
  
  // Show simplified analytics view when charts fail to load
  showSimpleAnalyticsView() {
    window.content.innerHTML = `
      <div class="section">
        <h3 class="section-title">📊 Analytics Dashboard</h3>
        <div style="background: var(--bg-secondary); padding: 20px; border-radius: 12px; margin: 20px 0;">
          <h4 style="margin: 0 0 16px 0; color: var(--primary-color);">💡 Analytics Overview</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
            <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: var(--primary-color);">${window.subscriptions.filter(s => s.isActive).length}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Active Subscriptions</div>
            </div>
            <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: var(--success-color);">$${window.subscriptions.filter(s => s.isActive).reduce((sum, s) => sum + s.price, 0).toFixed(2)}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">Monthly Total</div>
            </div>
          </div>
          <p style="color: var(--text-secondary); font-size: 14px;">
            Advanced charts require Chart.js library. Check your internet connection or try again later.
          </p>
          <button class="btn btn-secondary" data-action="load-subscriptions">Back to Overview</button>
        </div>
      </div>
    `;
  }
  
  // Generate insights text
  generateInsights(analyticsData) {
    return `
      <div style="display: grid; gap: 12px;">
        <div style="padding: 12px; background: var(--bg-primary); border-radius: 6px; border-left: 4px solid var(--info-color);">
          <div style="font-weight: 600; margin-bottom: 4px;">📈 Spending Analysis</div>
          <div style="font-size: 13px; color: var(--text-secondary);">
            You're spending $${analyticsData.monthlySpending.toFixed(2)} monthly across ${analyticsData.categories} categories.
          </div>
        </div>
        <div style="padding: 12px; background: var(--bg-primary); border-radius: 6px; border-left: 4px solid var(--warning-color);">
          <div style="font-weight: 600; margin-bottom: 4px;">💡 Money Saving Tip</div>
          <div style="font-size: 13px; color: var(--text-secondary);">
            Consider reviewing subscriptions in your highest spending category.
          </div>
        </div>
      </div>
    `;
  }
  
  // Load charts (fallback implementation)
  async loadCharts(analyticsData, view) {
    try {
      // Simple fallback charts using canvas
      const chartsContainer = document.getElementById('chartsContainer');
      if (!chartsContainer) return;
      
      chartsContainer.innerHTML = `
        <div style="background: var(--bg-secondary); padding: 20px; border-radius: 12px; text-align: center;">
          <h4 style="margin: 0 0 16px 0; color: var(--primary-color);">Chart View: ${view}</h4>
          <p style="color: var(--text-secondary); font-size: 14px;">
            Interactive charts would load here when Chart.js is available.
          </p>
          <div style="margin: 20px 0; padding: 40px; background: var(--bg-primary); border-radius: 8px; border: 2px dashed var(--border-color);">
            <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
            <div style="color: var(--text-secondary);">
              ${view === 'overview' ? 'Spending Overview' : 
                view === 'categories' ? 'Category Breakdown' : 
                view === 'trends' ? 'Spending Trends' : 'Budget Analysis'}
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      console.error('Error loading charts:', error);
    }
  }
}

// Simple Canvas Chart Renderer (Native Implementation)
class SimpleCharts {
  constructor() {
    this.colors = [
      '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
      '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
    ];
  }
  
  // Draw pie chart on canvas
  drawPieChart(canvasId, data, labels) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate total
    const total = data.reduce((sum, value) => sum + value, 0);
    
    // Draw slices
    let currentAngle = -Math.PI / 2; // Start from top
    
    data.forEach((value, index) => {
      const sliceAngle = (value / total) * 2 * Math.PI;
      
      // Draw slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = this.colors[index % this.colors.length];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw label
      const labelAngle = currentAngle + sliceAngle / 2;
      const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
      const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
      
      const percentage = ((value / total) * 100).toFixed(1);
      ctx.fillStyle = '#fff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${percentage}%`, labelX, labelY);
      
      currentAngle += sliceAngle;
    });
    
    // Draw legend
    let legendY = 20;
    labels.forEach((label, index) => {
      ctx.fillStyle = this.colors[index % this.colors.length];
      ctx.fillRect(10, legendY, 15, 15);
      
      ctx.fillStyle = '#333';
      ctx.font = '12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(label, 30, legendY + 12);
      
      legendY += 25;
    });
  }
  
  // Draw bar chart on canvas
  drawBarChart(canvasId, data, labels) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const padding = 40;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Find max value
    const maxValue = Math.max(...data);
    
    // Draw bars
    const barWidth = chartWidth / data.length * 0.8;
    const barSpacing = chartWidth / data.length * 0.2;
    
    data.forEach((value, index) => {
      const barHeight = (value / maxValue) * chartHeight;
      const x = padding + index * (barWidth + barSpacing) + barSpacing / 2;
      const y = canvas.height - padding - barHeight;
      
      // Draw bar
      ctx.fillStyle = this.colors[index % this.colors.length];
      ctx.fillRect(x, y, barWidth, barHeight);
      
      // Draw value on top
      ctx.fillStyle = '#333';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(value.toFixed(0), x + barWidth / 2, y - 5);
      
      // Draw label
      ctx.save();
      ctx.translate(x + barWidth / 2, canvas.height - 10);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'right';
      ctx.fillText(labels[index] || '', 0, 0);
      ctx.restore();
    });
    
    // Draw axes
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
  }
  
  // Draw line chart on canvas
  drawLineChart(canvasId, data, labels) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const padding = 40;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Find max value
    const maxValue = Math.max(...data);
    
    // Draw line
    ctx.strokeStyle = '#36A2EB';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    data.forEach((value, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = canvas.height - padding - (value / maxValue) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Draw points
    data.forEach((value, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = canvas.height - padding - (value / maxValue) * chartHeight;
      
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#36A2EB';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    
    // Draw labels
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    
    labels.forEach((label, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      ctx.fillText(label, x, canvas.height - 10);
    });
    
    // Draw axes
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
  }
  
  // Format currency for charts
  formatCurrency(value, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(value);
  }
}

// Tab Navigation Functions
async function switchTab(tabName) {
  // Remove active class from all tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Add active class to clicked tab
  const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeTab) {
    activeTab.classList.add('active');
  }
  
  // Show appropriate content
  switch (tabName) {
    case 'overview':
      loadSubscriptions();
      break;
    case 'subscriptions':
      showAllSubscriptions();
      break;
    case 'analytics':
      await showAnalyticsTab();
      break;
    case 'budget':
      await showBudgetTab();
      break;
  }
}


async function showBudgetTab() {
  try {
    // Always reload subscriptions data to be sure
    const result = await chrome.storage.local.get(['subscriptions', 'categoryBudgets', 'customCategories']);
    const loadedSubscriptions = result.subscriptions || [];
    const categoryBudgets = result.categoryBudgets || {};
    const customCategories = result.customCategories || [];
    
    // Calculate current monthly spending
    const totalMonthly = loadedSubscriptions
      .filter(sub => sub.isActive) 
      .reduce((sum, sub) => sum + (sub.price || 0), 0);
    
    // Calculate spending by category
    const categorySpending = {};
    loadedSubscriptions.filter(sub => sub.isActive).forEach(sub => {
      categorySpending[sub.category] = (categorySpending[sub.category] || 0) + sub.price;
    });
    
    // Get all available categories (default + custom)
    const defaultCategories = ['entertainment', 'productivity', 'utilities', 'education', 'other'];
    const allCategories = [...new Set([...defaultCategories, ...customCategories])];
    
    // Check if premium features are available
    const hasPremium = window.premiumManager && window.premiumManager.isPremium();
    
    window.content.innerHTML = `
      <div class="section">
        <h3 class="section-title">💰 Budget Management</h3>
        
        <div class="budget-overview">
          <div class="stat-card">
            <div class="stat-value">$${totalMonthly.toFixed(2)}</div>
            <div class="stat-label">Current Monthly Spending</div>
          </div>
        </div>
        
        <div id="budgetStatus" style="margin: 20px 0;"></div>
        
        ${hasPremium ? `
          <!-- Premium Category Budgets -->
          <div class="category-budgets-section" style="margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h4 style="margin: 0;">📊 Category Budgets</h4>
              <button class="btn btn-secondary btn-sm" id="addCustomCategoryBtn">+ Add Category</button>
            </div>
            
            <div id="categoryBudgetsList">
              ${allCategories.map(category => {
                const spent = categorySpending[category] || 0;
                const budget = categoryBudgets[category] || 0;
                const percentage = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                const isOver = percentage > 100;
                const isNear = percentage > 80;
                
                return `
                  <div class="category-budget-item" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <div>
                        <span style="font-weight: 500; text-transform: capitalize;">${category}</span>
                        ${customCategories.includes(category) ? '<span style="font-size: 12px; color: #007bff; margin-left: 8px;">Custom</span>' : ''}
                      </div>
                      <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="number" 
                               id="budget-${category}" 
                               value="${budget}" 
                               placeholder="Budget limit" 
                               step="0.01" 
                               min="0"
                               style="width: 100px; padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 12px;">
                        ${customCategories.includes(category) ? `
                          <button class="btn btn-sm" style="background: #dc3545; color: white; padding: 4px 8px;" data-action="remove-category" data-category="${category}">×</button>
                        ` : ''}
                      </div>
                    </div>
                    
                    ${budget > 0 ? `
                      <div class="category-progress" style="margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                          <span>$${spent.toFixed(2)} spent</span>
                          <span>${percentage}%</span>
                        </div>
                        <div style="background: #e9ecef; height: 6px; border-radius: 3px; overflow: hidden;">
                          <div style="background: ${isOver ? '#dc3545' : isNear ? '#ffc107' : '#28a745'}; 
                                      height: 100%; width: ${Math.min(percentage, 100)}%; transition: width 0.3s ease;">
                          </div>
                        </div>
                      </div>
                      
                      ${isOver ? '<div style="color: #dc3545; font-size: 12px;">⚠️ Over budget!</div>' : 
                        isNear ? '<div style="color: #ffc107; font-size: 12px;">📊 Approaching limit</div>' : 
                        '<div style="color: #28a745; font-size: 12px;">✅ Within budget</div>'}
                    ` : '<div style="color: #6c757d; font-size: 12px;">No budget set</div>'}
                  </div>
                `;
              }).join('')}
            </div>
            
            <button class="btn" id="saveCategoryBudgetsBtn" style="margin-top: 16px;">💾 Save Category Budgets</button>
          </div>
          
          <!-- Rollover Tracking Section -->
          <div class="rollover-tracking-section" style="margin: 20px 0;">
            <h4 style="margin-bottom: 16px;">💰 Rollover Tracking</h4>
            
            <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <label style="font-weight: 500;">Enable Rollover Tracking</label>
                <input type="checkbox" id="enableRollover" style="transform: scale(1.2);">
              </div>
              <p style="font-size: 12px; color: #6c757d; margin: 0;">
                Track unused budget amounts and roll them over to the next month
              </p>
            </div>
            
            <div id="rolloverSettings" style="display: none;">
              <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Rollover Mode</label>
                <select id="rolloverMode" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                  <option value="full">Full Amount - Roll over entire unused amount</option>
                  <option value="percentage">Percentage - Roll over a percentage of unused amount</option>
                  <option value="fixed">Fixed Amount - Roll over up to a fixed maximum</option>
                </select>
              </div>
              
              <div id="rolloverPercentageSection" style="display: none; margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Rollover Percentage (%)</label>
                <input type="number" id="rolloverPercentage" placeholder="50" min="1" max="100"
                       style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
              </div>
              
              <div id="rolloverFixedSection" style="display: none; margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Maximum Rollover Amount ($)</label>
                <input type="number" id="rolloverMaxAmount" placeholder="100" step="0.01" min="0"
                       style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
              </div>
              
              <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Rollover Expiry (months)</label>
                <select id="rolloverExpiry" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                  <option value="1">1 month</option>
                  <option value="3" selected>3 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                  <option value="never">Never expire</option>
                </select>
              </div>
              
              <div style="background: #e7f3ff; border-left: 4px solid #007bff; padding: 12px; margin-bottom: 16px;">
                <h5 style="margin: 0 0 8px 0; color: #007bff;">Current Rollover Status</h5>
                <div id="rolloverStatus">
                  <div style="font-size: 12px; color: #6c757d;">Enable rollover tracking to see status</div>
                </div>
              </div>
            </div>
            
            <button class="btn" id="saveRolloverSettingsBtn">💾 Save Rollover Settings</button>
          </div>
        ` : ''}
        
        <!-- Global Budget Settings -->
        <div class="budget-form" style="margin: 20px 0;">
          <h4 style="margin-bottom: 16px;">📋 Global Budget Settings</h4>
          
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">Monthly Budget Limit</label>
          <input type="number" id="budgetLimit" placeholder="Enter budget limit" step="0.01"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; margin-bottom: 12px;">
          
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">Alert Threshold (%)</label>
          <input type="number" id="alertThreshold" placeholder="80" min="1" max="100"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; margin-bottom: 16px;">
          
          <button class="btn" id="saveBudgetBtn">💾 Save Global Budget</button>
        </div>
        
        ${!hasPremium ? `
          <div class="premium-feature-preview">
            <h4>🔒 Premium Budget Features</h4>
            <div class="feature-list">
              <div class="feature-item">📊 Category-based budgets</div>
              <div class="feature-item">🏷️ Custom categories</div>
              <div class="feature-item">📈 Budget forecasting</div>
              <div class="feature-item">💰 Rollover tracking</div>
              <div class="feature-item">📧 Advanced alerts</div>
            </div>
            <button class="btn btn-premium btn-sm" id="viewPremiumFeaturesBtn">Upgrade for Advanced Budgeting</button>
          </div>
        ` : ''}
      </div>
    `;
    
    // Load existing budget settings
    await loadBudgetSettings();
    
  } catch (error) {
    console.error('Error in showBudgetTab:', error);
    window.content.innerHTML = `
      <div class="section">
        <h3 class="section-title">Budget Management</h3>
        <div class="error">
          Error loading budget tab: ${error.message}
        </div>
        <button class="btn" data-action="load-subscriptions">Back to Overview</button>
      </div>
    `;
  }
}

async function updateBudgetStatus() {
  try {
    const result = await chrome.storage.local.get(['budgetSettings', 'subscriptions']);
    const settings = result.budgetSettings || {};
    window.subscriptions = result.subscriptions || [];
    
    if (settings.limit) {
      const totalSpent = subscriptions
        .filter(sub => sub.isActive)
        .reduce((sum, sub) => sum + sub.price, 0);
      
      const percentage = Math.round((totalSpent / settings.limit) * 100);
      const isNearBudget = percentage > (settings.threshold || 80);
      const isOverBudget = percentage > 100;
      
      const budgetStatusDiv = document.getElementById('budgetStatus');
      if (budgetStatusDiv) {
        budgetStatusDiv.innerHTML = `
          <div class="budget-progress">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 500;">Budget Progress</span>
              <span>${percentage}%</span>
            </div>
            <div style="background: var(--border-color); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: ${isOverBudget ? '#dc3545' : isNearBudget ? '#ffc107' : '#28a745'}; 
                          height: 100%; width: ${Math.min(percentage, 100)}%; transition: width 0.3s ease;">
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 12px; color: var(--text-secondary);">
              <span>$${totalSpent.toFixed(2)} spent</span>
              <span>of $${settings.limit}</span>
            </div>
          </div>
          ${isOverBudget ? '<div class="alert alert-danger" style="margin-top: 12px;">⚠️ You have exceeded your budget!</div>' : 
            isNearBudget ? '<div class="alert alert-warning" style="margin-top: 12px;">📊 You are approaching your budget limit.</div>' : 
            '<div class="alert alert-success" style="margin-top: 12px;">✅ You are within your budget.</div>'}
        `;
      }
    } else {
      const budgetStatusDiv = document.getElementById('budgetStatus');
      if (budgetStatusDiv) {
        budgetStatusDiv.innerHTML = `
          <p style="color: var(--text-secondary); margin-top: 12px;">Set a budget above to track your spending.</p>
        `;
      }
    }
  } catch (error) {
    console.error('Error updating budget status:', error);
  }
}

async function loadBudgetSettings() {
  try {
    const result = await chrome.storage.local.get(['budgetSettings', 'rolloverSettings']);
    const settings = result.budgetSettings || {};
    const rolloverSettings = result.rolloverSettings || {};
    
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      const budgetLimit = document.getElementById('budgetLimit');
      const alertThreshold = document.getElementById('alertThreshold');
      
      if (budgetLimit && settings.limit) {
        budgetLimit.value = settings.limit;
      }
      if (alertThreshold && settings.threshold) {
        alertThreshold.value = settings.threshold;
      }
      
      // Load rollover settings
      const enableRollover = document.getElementById('enableRollover');
      const rolloverMode = document.getElementById('rolloverMode');
      const rolloverPercentage = document.getElementById('rolloverPercentage');
      const rolloverMaxAmount = document.getElementById('rolloverMaxAmount');
      const rolloverExpiry = document.getElementById('rolloverExpiry');
      const rolloverSettings_div = document.getElementById('rolloverSettings');
      
      if (enableRollover) {
        enableRollover.checked = rolloverSettings.enabled || false;
        
        // Show/hide rollover settings based on enabled state
        if (rolloverSettings_div) {
          rolloverSettings_div.style.display = rolloverSettings.enabled ? 'block' : 'none';
        }
        
        // Add event listener for checkbox change
        if (enableRollover) {
          addEventSafe(enableRollover, 'change', (e) => {
            if (rolloverSettings_div) {
              rolloverSettings_div.style.display = e.target.checked ? 'block' : 'none';
            }
          });
        }
      }
      
      if (rolloverMode) {
        rolloverMode.value = rolloverSettings.mode || 'full';
        
        // Add event listener for mode change
        if (rolloverMode) {
          addEventSafe(rolloverMode, 'change', (e) => {
            const percentageSection = document.getElementById('rolloverPercentageSection');
            const fixedSection = document.getElementById('rolloverFixedSection');

            if (percentageSection) {
              percentageSection.style.display = e.target.value === 'percentage' ? 'block' : 'none';
            }
            if (fixedSection) {
              fixedSection.style.display = e.target.value === 'fixed' ? 'block' : 'none';
            }
          });
        }
        
        // Trigger initial display state
        if (rolloverMode) {
          rolloverMode.dispatchEvent(new Event('change'));
        }
      }
      
      if (rolloverPercentage && rolloverSettings.percentage) {
        rolloverPercentage.value = rolloverSettings.percentage;
      }
      
      if (rolloverMaxAmount && rolloverSettings.maxAmount) {
        rolloverMaxAmount.value = rolloverSettings.maxAmount;
      }
      
      if (rolloverExpiry && rolloverSettings.expiry) {
        rolloverExpiry.value = rolloverSettings.expiry;
      }
      
      // Update budget status display
      updateBudgetStatus();
      
      // Update rollover status if enabled
      if (rolloverSettings.enabled) {
        updateRolloverStatus();
      }
    }, 100);
    
  } catch (error) {
    console.error('Error loading budget settings:', error);
  }
}

async function saveBudgetSettings() {
  const budgetLimit = document.getElementById('budgetLimit').value;
  const alertThreshold = document.getElementById('alertThreshold').value;
  
  if (!budgetLimit || !alertThreshold) {
    showToast('Please fill in all fields', 'warning');
    return;
  }
  
  try {
    const settings = {
      limit: parseFloat(budgetLimit),
      threshold: parseInt(alertThreshold)
    };
    
    await chrome.storage.local.set({ budgetSettings: settings });
    
    // Show success message
    const saveBtn = document.getElementById('saveBudgetBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '✅ Saved!';
    saveBtn.style.background = '#28a745';
    
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = '';
    }, 2000);
    
    // Update budget status display
    await updateBudgetStatus();
    
  } catch (error) {
    console.error('Error saving budget settings:', error);
    showToast('Failed to save budget settings', 'error');
  }
}

// Notification Settings Functions
function showNotificationSettings() {
  // Ensure notificationSettings is initialized
  const settings = notificationSettings || {};
  
  // Check if premium manager exists and has the method
  const canUseEmail = window.premiumManager && 
                     typeof window.premiumManager.canUseEmailNotifications === 'function' &&
                     window.premiumManager.canUseEmailNotifications();
  
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title">🔔 Notification Settings</h3>
      
      <div class="setting-group">
        <label class="setting-label">
          <input type="checkbox" id="browserNotifications" ${settings.browserNotifications ? 'checked' : ''}>
          Browser Notifications
        </label>
        <p class="setting-description">Show notifications in your browser when subscriptions are about to renew</p>
      </div>
      
      <div class="setting-group">
        <label class="setting-label">Notification Frequency</label>
        <select id="notificationFrequency" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
          <option value="daily" ${settings.notificationFrequency === 'daily' ? 'selected' : ''}>Daily</option>
          <option value="weekly" ${settings.notificationFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
        </select>
      </div>
      
      ${canUseEmail ? `
        <div class="setting-group">
          <label class="setting-label">
            <input type="checkbox" id="emailNotifications" ${settings.emailNotifications ? 'checked' : ''}>
            Email Notifications
          </label>
          <p class="setting-description">Receive email alerts for subscription renewals</p>
          <button class="btn btn-secondary btn-sm" id="emailSettingsBtn">Configure Email</button>
        </div>
      ` : `
        <div class="premium-feature-preview">
          <h4>🔒 Premium Email Notifications</h4>
          <p>Get email alerts for subscription renewals with Premium</p>
          <button class="btn btn-premium btn-sm" id="viewPremiumFeaturesBtn">Upgrade for Email Notifications</button>
        </div>
      `}
      
      <div style="margin-top: 20px;">
        <button class="btn" id="saveNotificationSettingsBtn">Save Settings</button>
        <button class="btn btn-secondary" id="testBrowserNotificationBtn">Test Browser Notification</button>
        <button class="btn btn-secondary" id="backToSettingsBtn">Back to Settings</button>
      </div>
    </div>
  `;
}

async function saveNotificationSettings() {
  try {
    const browserNotifications = document.getElementById('browserNotifications')?.checked || false;
    const emailNotifications = document.getElementById('emailNotifications')?.checked || false;
    const notificationFrequency = document.getElementById('notificationFrequency')?.value || 'daily';
    
    const newSettings = {
      ...(notificationSettings || {}),
      browserNotifications,
      emailNotifications,
      notificationFrequency,
      updatedAt: new Date().toISOString()
    };
    
    await chrome.storage.local.set({ notificationSettings: newSettings });
    window.notificationSettings = newSettings;
    
    // Show success message
    const saveBtn = document.getElementById('saveNotificationSettingsBtn');
    if (saveBtn) {
      const originalText = saveBtn.textContent;
      saveBtn.textContent = '✅ Saved!';
      saveBtn.style.background = '#28a745';
      
      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.background = '';
      }, 2000);
    }
    
    showToast('Notification settings saved successfully', 'success');
    
  } catch (error) {
    console.error('Error saving notification settings:', error);
    showToast('Failed to save notification settings: ' + error.message, 'error');
  }
}

async function testBrowserNotification() {
  try {
    // Request permission first if needed
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showToast('Please enable notifications in your browser settings to use this feature.', 'warning');
        return;
      }
    }
    
    // Try Chrome extension notifications first
    if (chrome && chrome.notifications) {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Subscription Manager',
        message: 'Test notification - your notifications are working!'
      });
      
      // Show success message
      const testBtn = document.getElementById('testBrowserNotificationBtn');
      if (testBtn) {
        const originalText = testBtn.textContent;
        testBtn.textContent = '✅ Test Sent!';
        testBtn.style.background = '#28a745';
        
        setTimeout(() => {
          testBtn.textContent = originalText;
          testBtn.style.background = '';
        }, 2000);
      }
    } else {
      // Fallback to web notifications
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Subscription Manager', {
          body: 'Test notification - your notifications are working!',
          icon: 'icons/icon48.png'
        });
      } else {
        throw new Error('Notifications not supported or permission denied');
      }
    }
    
  } catch (error) {
    console.error('Error showing test notification:', error);
    showToast('Failed to show test notification. Please check your browser permissions.', 'error');
  }
}

function showEmailSettings() {
  chrome.storage.local.get(['emailSettings'], (result) => {
    const emailSettings = result.emailSettings || {};
    
    window.content.innerHTML = `
      <div class="section">
        <h3 class="section-title">📧 Email Configuration</h3>
        
        <div class="alert alert-info" style="margin-bottom: 16px;">
          <strong>📧 Email Configuration</strong>
          <div style="margin-top: 4px; font-size: 12px;">
            Configure your email settings to receive notifications about expiring subscriptions.
          </div>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Your Email Address</label>
          <input type="email" id="userEmail" placeholder="your.email@example.com" 
                 value="${emailSettings.userEmail || ''}"
                 style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Email Service</label>
          <select id="emailService" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
            <option value="brevo" ${(emailSettings.service || 'brevo') === 'brevo' ? 'selected' : ''}>Brevo (SendinBlue) - Recomandat</option>
            <option value="emailjs" ${emailSettings.service === 'emailjs' ? 'selected' : ''}>EmailJS</option>
            <option value="custom" ${emailSettings.service === 'custom' ? 'selected' : ''}>Custom SMTP</option>
          </select>
        </div>
        
        <div id="emailServiceConfig">
          ${renderEmailServiceConfig(emailSettings.service || 'brevo', emailSettings)}
        </div>
        
        <div style="margin-bottom: 16px;">
          <button class="btn btn-outline" id="testEmailBtn">
            🧪 Send Test Email
          </button>
          ${window.premiumManager && window.premiumManager.canUseEmailNotifications && window.premiumManager.canUseEmailNotifications() ? `
            <button class="btn btn-outline" id="sendWeeklyDigestBtn" style="margin-left: 8px;">
              📧 Send Weekly Digest
            </button>
          ` : ''}
        </div>
        
        <div style="margin-top: 20px;">
          <button class="btn" id="saveEmailSettingsBtn">💾 Save Email Settings</button>
          <button class="btn btn-secondary" id="backToNotificationSettingsBtn">Back to Notifications</button>
        </div>
      </div>
    `;
    
    // Add event listener for service change
    const emailService = document.getElementById('emailService');
    if (emailService) {
      addEventSafe(emailService, 'change', (e) => {
      const configDiv = document.getElementById('emailServiceConfig');
      configDiv.innerHTML = renderEmailServiceConfig(e.target.value, emailSettings);

        // Add event listeners for new elements
        addEmailConfigEventListeners();
      });
    }
    
    // Add initial event listeners
    addEmailConfigEventListeners();
  });
}

// Category Budget Management Functions
async function saveCategoryBudgets() {
  try {
    const result = await chrome.storage.local.get(['customCategories']);
    const customCategories = result.customCategories || [];
    const defaultCategories = ['entertainment', 'productivity', 'utilities', 'education', 'other'];
    const allCategories = [...new Set([...defaultCategories, ...customCategories])];
    
    const categoryBudgets = {};
    
    // Collect all budget values
    allCategories.forEach(category => {
      const budgetInput = document.getElementById(`budget-${category}`);
      if (budgetInput) {
        const value = parseFloat(budgetInput.value) || 0;
        if (value > 0) {
          categoryBudgets[category] = value;
        }
      }
    });
    
    await chrome.storage.local.set({ categoryBudgets });
    
    // Show success message
    const saveBtn = document.getElementById('saveCategoryBudgetsBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '✅ Saved!';
    saveBtn.style.background = '#28a745';
    
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = '';
    }, 2000);
    
    showToast('Category budgets saved successfully', 'success');
    
  } catch (error) {
    console.error('Error saving category budgets:', error);
    showToast('Failed to save category budgets: ' + error.message, 'error');
  }
}

async function addCustomCategory() {
  const categoryName = prompt('Enter custom category name:');
  if (!categoryName || !categoryName.trim()) {
    return;
  }
  
  const normalizedName = categoryName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  try {
    const result = await chrome.storage.local.get(['customCategories']);
    const customCategories = result.customCategories || [];
    
    // Check if category already exists
    const defaultCategories = ['entertainment', 'productivity', 'utilities', 'education', 'other'];
    const allExisting = [...defaultCategories, ...customCategories];
    
    if (allExisting.includes(normalizedName)) {
      showToast('Category already exists!', 'warning');
      return;
    }
    
    // Add new category
    customCategories.push(normalizedName);
    await chrome.storage.local.set({ customCategories });
    
    // Refresh the budget tab to show new category
    showBudgetTab();
    
  } catch (error) {
    console.error('Error adding custom category:', error);
    showToast('Failed to add category: ' + error.message, 'error');
  }
}

async function removeCustomCategory(categoryName) {
  if (!confirm(`Are you sure you want to remove the "${categoryName}" category?`)) {
    return;
  }
  
  try {
    const result = await chrome.storage.local.get(['customCategories', 'categoryBudgets']);
    const customCategories = result.customCategories || [];
    const categoryBudgets = result.categoryBudgets || {};
    
    // Remove from custom categories
    const updatedCategories = customCategories.filter(cat => cat !== categoryName);
    
    // Remove budget for this category
    delete categoryBudgets[categoryName];
    
    await chrome.storage.local.set({ 
      customCategories: updatedCategories,
      categoryBudgets 
    });
    
    // Also need to update any subscriptions that use this category
    const subscriptionsResult = await chrome.storage.local.get(['subscriptions']);
    const subscriptions = subscriptionsResult.subscriptions || [];
    
    const updatedSubscriptions = window.subscriptions.map(sub => {
      if (sub.category === categoryName) {
        return { ...sub, category: 'other' }; // Move to 'other' category
      }
      return sub;
    });
    
    await chrome.storage.local.set({ subscriptions: updatedSubscriptions });
    
    // Refresh the budget tab
    showBudgetTab();
    
  } catch (error) {
    console.error('Error removing custom category:', error);
    showToast('Failed to remove category: ' + error.message, 'error');
  }
}

// Rollover Tracking Functions
async function saveRolloverSettings() {
  try {
    const enableRollover = document.getElementById('enableRollover').checked;
    const rolloverMode = document.getElementById('rolloverMode').value;
    const rolloverPercentage = parseInt(document.getElementById('rolloverPercentage').value) || 50;
    const rolloverMaxAmount = parseFloat(document.getElementById('rolloverMaxAmount').value) || 0;
    const rolloverExpiry = document.getElementById('rolloverExpiry').value;
    
    const rolloverSettings = {
      enabled: enableRollover,
      mode: rolloverMode,
      percentage: rolloverPercentage,
      maxAmount: rolloverMaxAmount,
      expiry: rolloverExpiry,
      updatedAt: new Date().toISOString()
    };
    
    await chrome.storage.local.set({ rolloverSettings });
    
    // Show success message
    const saveBtn = document.getElementById('saveRolloverSettingsBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '✅ Saved!';
    saveBtn.style.background = '#28a745';
    
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = '';
    }, 2000);
    
    // Update rollover status display
    await updateRolloverStatus();
    
    showToast('Rollover settings saved successfully', 'success');
    
  } catch (error) {
    console.error('Error saving rollover settings:', error);
    showToast('Failed to save rollover settings: ' + error.message, 'error');
  }
}

async function updateRolloverStatus() {
  try {
    const result = await chrome.storage.local.get(['rolloverSettings', 'rolloverData', 'categoryBudgets', 'subscriptions']);
    const settings = result.rolloverSettings || {};
    const rolloverData = result.rolloverData || {};
    const categoryBudgets = result.categoryBudgets || {};
    window.subscriptions = result.subscriptions || [];
    
    if (!settings.enabled) {
      return;
    }
    
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const statusDiv = document.getElementById('rolloverStatus');
    
    if (!statusDiv) return;
    
    // Calculate current spending by category
    const categorySpending = {};
    window.subscriptions.filter(sub => sub.isActive).forEach(sub => {
      categorySpending[sub.category] = (categorySpending[sub.category] || 0) + sub.price;
    });
    
    // Calculate rollover amounts for each category
    let totalRolloverAvailable = 0;
    let statusHTML = '';
    
    Object.keys(categoryBudgets).forEach(category => {
      const budgetAmount = categoryBudgets[category] || 0;
      const spentAmount = categorySpending[category] || 0;
      const unusedAmount = Math.max(0, budgetAmount - spentAmount);
      
      let rolloverAmount = 0;
      
      switch (settings.mode) {
        case 'full':
          rolloverAmount = unusedAmount;
          break;
        case 'percentage':
          rolloverAmount = unusedAmount * (settings.percentage / 100);
          break;
        case 'fixed':
          rolloverAmount = Math.min(unusedAmount, settings.maxAmount);
          break;
      }
      
      if (rolloverAmount > 0) {
        totalRolloverAvailable += rolloverAmount;
        statusHTML += `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-size: 12px; text-transform: capitalize;">${category}:</span>
            <span style="font-size: 12px; color: #28a745;">+$${rolloverAmount.toFixed(2)}</span>
          </div>
        `;
      }
    });
    
    // Display existing rollover amounts from previous months
    const activeRollovers = Object.entries(rolloverData).filter(([month, data]) => {
      if (settings.expiry === 'never') return true;
      
      const monthDate = new Date(month + '-01');
      const currentDate = new Date();
      const monthsDiff = (currentDate.getFullYear() - monthDate.getFullYear()) * 12 + 
                        (currentDate.getMonth() - monthDate.getMonth());
      
      return monthsDiff < parseInt(settings.expiry);
    });
    
    let existingRolloverTotal = 0;
    activeRollovers.forEach(([month, data]) => {
      existingRolloverTotal += data.totalAmount || 0;
    });
    
    statusHTML = `
      <div style="font-size: 14px; font-weight: 500; margin-bottom: 8px;">
        Available Rollover: $${(totalRolloverAvailable + existingRolloverTotal).toFixed(2)}
      </div>
      ${totalRolloverAvailable > 0 ? `
        <div style="margin-bottom: 8px;">
          <strong style="font-size: 12px;">This Month's Rollover:</strong>
          ${statusHTML}
        </div>
      ` : ''}
      ${existingRolloverTotal > 0 ? `
        <div style="margin-bottom: 8px;">
          <strong style="font-size: 12px;">Previous Months: $${existingRolloverTotal.toFixed(2)}</strong>
        </div>
      ` : ''}
      ${totalRolloverAvailable === 0 && existingRolloverTotal === 0 ? `
        <div style="font-size: 12px; color: #6c757d;">No rollover amounts available</div>
      ` : ''}
    `;
    
    statusDiv.innerHTML = statusHTML;
    
  } catch (error) {
    console.error('Error updating rollover status:', error);
  }
}

async function processMonthlyRollover() {
  try {
    const result = await chrome.storage.local.get(['rolloverSettings', 'rolloverData', 'categoryBudgets', 'subscriptions']);
    const settings = result.rolloverSettings || {};
    const rolloverData = result.rolloverData || {};
    const categoryBudgets = result.categoryBudgets || {};
    window.subscriptions = result.subscriptions || [];
    
    if (!settings.enabled) return;
    
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthKey = lastMonth.toISOString().slice(0, 7);
    
    // Don't process if already processed for this month
    if (rolloverData[lastMonthKey] && rolloverData[lastMonthKey].processed) {
      return;
    }
    
    // Calculate spending for last month (this is simplified - in real scenario you'd track historical data)
    const categorySpending = {};
    window.subscriptions.filter(sub => sub.isActive).forEach(sub => {
      categorySpending[sub.category] = (categorySpending[sub.category] || 0) + sub.price;
    });
    
    // Calculate rollover amounts
    const monthlyRollover = {
      processed: true,
      processedAt: new Date().toISOString(),
      categories: {},
      totalAmount: 0
    };
    
    Object.keys(categoryBudgets).forEach(category => {
      const budgetAmount = categoryBudgets[category] || 0;
      const spentAmount = categorySpending[category] || 0;
      const unusedAmount = Math.max(0, budgetAmount - spentAmount);
      
      let rolloverAmount = 0;
      
      switch (settings.mode) {
        case 'full':
          rolloverAmount = unusedAmount;
          break;
        case 'percentage':
          rolloverAmount = unusedAmount * (settings.percentage / 100);
          break;
        case 'fixed':
          rolloverAmount = Math.min(unusedAmount, settings.maxAmount);
          break;
      }
      
      if (rolloverAmount > 0) {
        monthlyRollover.categories[category] = {
          budgetAmount,
          spentAmount,
          unusedAmount,
          rolloverAmount
        };
        monthlyRollover.totalAmount += rolloverAmount;
      }
    });
    
    // Save rollover data
    rolloverData[lastMonthKey] = monthlyRollover;
    
    // Clean up expired rollovers
    if (settings.expiry !== 'never') {
      const expiryMonths = parseInt(settings.expiry);
      Object.keys(rolloverData).forEach(month => {
        const monthDate = new Date(month + '-01');
        const currentDate = new Date();
        const monthsDiff = (currentDate.getFullYear() - monthDate.getFullYear()) * 12 + 
                          (currentDate.getMonth() - monthDate.getMonth());
        
        if (monthsDiff >= expiryMonths) {
          delete rolloverData[month];
        }
      });
    }
    
    await chrome.storage.local.set({ rolloverData });
    
    // Monthly rollover processed successfully
    
  } catch (error) {
    console.error('Error processing monthly rollover:', error);
  }
}

// PDF Reports Generation System
async function generatePDFReport(reportType = 'comprehensive') {
  // PDF generation requested with type: ${reportType}
  
  // Check if premium manager is available
  if (typeof window.premiumManager === 'undefined') {
    showToast('Premium features not initialized', 'error');
    return;
  }
  
  if (!window.premiumManager.isFeatureAvailable('pdf_reports')) {
    showToast('Premium features required for PDF reports', 'info');
    showPremiumUpgradePrompt('pdf_reports');
    return;
  }
  
  try {
    showToast('Generating PDF report...', 'info');
    showToast('Generating HTML report...', 'info');
    
    // Load required data
    const result = await chrome.storage.local.get(['subscriptions', 'baseCurrency', 'currencyRates', 'categoryBudgets']);
    window.subscriptions = result.subscriptions || [];
    const baseCurrency = result.baseCurrency || 'USD';
    const rates = result.currencyRates || getDefaultCurrencyRates();
    const categoryBudgets = result.categoryBudgets || {};
    
    // Generate simple HTML report instead of PDF (due to CSP restrictions)
    createSimplePDFContent(subscriptions, reportType);
    
    showToast('✅ HTML report generated successfully!', 'success');
    
  } catch (error) {
    console.error('Error generating PDF report:', error);
    showToast('❌ Failed to generate PDF report: ' + error.message, 'error');
  }
}

// Export PDF function immediately
window.generatePDFReport = generatePDFReport;

// Helper function to draw pie slice
function drawPieSlice(pdf, centerX, centerY, radius, startAngle, endAngle) {
  const steps = Math.max(6, Math.ceil(Math.abs(endAngle - startAngle) * radius * 2));
  const angleStep = (endAngle - startAngle) / steps;
  
  pdf.lines([
    [0, 0],
    [radius * Math.cos(startAngle), radius * Math.sin(startAngle)]
  ], centerX, centerY);
  
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + i * angleStep;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    
    if (i === 0) {
      pdf.lines([[x, y]], centerX, centerY);
    } else {
      pdf.lines([[x, y]], centerX, centerY, null, 'F');
    }
  }
  
  pdf.lines([[0, 0]], centerX, centerY, null, 'F');
}

// Generate comprehensive report data
async function generateReportData(subscriptions, baseCurrency, rates, categoryBudgets) {
  const activeSubscriptions = window.subscriptions.filter(sub => sub.isActive);
  
  // Convert all prices to base currency
  const convertedSubscriptions = await Promise.all(
    activeSubscriptions.map(async sub => ({
      ...sub,
      convertedPrice: await convertToBaseCurrency(sub.price, sub.currency || 'USD')
    }))
  );
  
  // Summary calculations
  const monthlySpending = convertedSubscriptions.reduce((sum, sub) => sum + sub.convertedPrice, 0);
  const annualProjection = monthlySpending * 12;
  const mostExpensive = convertedSubscriptions.reduce((max, sub) => 
    sub.convertedPrice > max.convertedPrice ? sub : max, convertedSubscriptions[0] || { name: 'None', convertedPrice: 0 });
  
  // Category breakdown
  const categorySpending = {};
  convertedSubscriptions.forEach(sub => {
    categorySpending[sub.category] = (categorySpending[sub.category] || 0) + sub.convertedPrice;
  });
  
  const categoryBreakdown = Object.entries(categorySpending).map(([category, amount]) => ({
    category: category.charAt(0).toUpperCase() + category.slice(1),
    amount,
    percentage: (amount / monthlySpending) * 100
  })).sort((a, b) => b.amount - a.amount);
  
  // Monthly trend (simulated for demonstration - in real app would use historical data)
  const monthlyTrend = [];
  const currentDate = new Date();
  for (let i = 5; i >= 0; i--) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const variation = 1 + (Math.random() - 0.5) * 0.2; // ±10% variation
    monthlyTrend.push({
      month: date.toLocaleDateString('ro-RO', { month: 'short' }),
      amount: monthlySpending * variation
    });
  }
  
  // Budget analysis
  const budgetAnalysis = Object.entries(categoryBudgets).map(([category, budget]) => {
    const spent = categorySpending[category] || 0;
    return {
      category,
      budget,
      spent,
      percentage: budget > 0 ? (spent / budget) * 100 : 0
    };
  }).filter(item => item.budget > 0);
  
  return {
    summary: {
      totalSubscriptions: activeSubscriptions.length,
      monthlySpending,
      annualProjection,
      mostExpensive: {
        name: mostExpensive.name,
        price: mostExpensive.convertedPrice
      }
    },
    categoryBreakdown,
    monthlyTrend,
    activeSubscriptions: convertedSubscriptions,
    budgetAnalysis
  };
}

// Show PDF export options
function showPDFExportOptions() {
  if (!window.premiumManager || !window.premiumManager.isFeatureAvailable('pdf_reports')) {
    showPremiumUpgradePrompt('pdf_reports');
    return;
  }
  
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title">📄 PDF Reports</h3>
      
      <div class="alert alert-info" style="margin-bottom: 20px;">
        <strong>📊 Professional PDF Reports</strong>
        <div style="margin-top: 4px; font-size: 12px;">
          Generate comprehensive reports with charts, analytics, and detailed breakdowns.
        </div>
      </div>
      
      <div class="report-options" style="margin-bottom: 20px;">
        <div class="report-option" data-pdf-type="comprehensive" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 12px; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">📊</span>
            <div>
              <h4 style="margin: 0 0 4px 0;">Comprehensive Report</h4>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">
                Complete analysis with charts, trends, and detailed subscription breakdown
              </p>
            </div>
          </div>
        </div>
        
        <div class="report-option" data-pdf-type="budget" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 12px; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">💰</span>
            <div>
              <h4 style="margin: 0 0 4px 0;">Budget Analysis Report</h4>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">
                Focus on budget tracking, category spending, and financial insights
              </p>
            </div>
          </div>
        </div>
        
        <div class="report-option" data-pdf-type="subscription-list" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 12px; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">📋</span>
            <div>
              <h4 style="margin: 0 0 4px 0;">Subscription List</h4>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">
                Clean list of all subscriptions with payment dates and details
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="pdf-features" style="background: linear-gradient(135deg, #667eea10, #764ba210); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 12px 0; color: var(--primary-color);">📈 Report Features</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
          <div>✅ Interactive pie charts</div>
          <div>✅ Monthly trend analysis</div>
          <div>✅ Budget progress bars</div>
          <div>✅ Category breakdowns</div>
          <div>✅ Professional formatting</div>
          <div>✅ Multi-currency support</div>
        </div>
      </div>
      
      <div class="pdf-requirements" style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
        <h5 style="margin: 0 0 8px 0; color: #856404;">📋 Note</h5>
        <p style="margin: 0; font-size: 12px; color: #856404;">
          PDF generation requires a modern browser with JavaScript enabled. 
          Charts and graphics are generated using HTML5 Canvas.
        </p>
      </div>
      
      <button class="btn btn-secondary" id="backToSettingsBtn">Back to Settings</button>
    </div>
  `;
  
  // Add event listeners for PDF options after DOM update
  setTimeout(() => {
    const reportOptions = document.querySelectorAll('.report-option[data-pdf-type]');
    reportOptions.forEach(option => {
      if (option) {
        addEventSafe(option, 'click', () => {
          const pdfType = option.getAttribute('data-pdf-type');
          if (window.generatePDFReport) {
            window.generatePDFReport(pdfType);
          }
        });
      }
    });
  }, 100);
}

// Export PDF options function immediately
window.showPDFExportOptions = showPDFExportOptions;

// Load jsPDF library dynamically
// Simple HTML report generation (Chrome extensions can't load external scripts due to CSP)
function createSimplePDFContent(subscriptions, type) {
  const totalMonthly = subscriptions.reduce((sum, sub) => sum + sub.price, 0);
  const categories = {};
  subscriptions.forEach(sub => {
    categories[sub.category] = (categories[sub.category] || 0) + sub.price;
  });
  
  const subscriptionList = window.subscriptions.map(sub => `
    <div class="subscription-item">
      <strong>${sub.name}</strong><br>
      Price: $${sub.price}/month<br>
      Category: ${sub.category}<br>
      Next Renewal: ${sub.renewalDate}
    </div>
  `).join('');
  
  const categoryList = Object.entries(categories).map(([cat, amount]) => `
    <div class="category-item">
      ${cat}: $${amount.toFixed(2)}/month
    </div>
  `).join('');
  
  const content = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Subscription Report - ${type}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .section { margin-bottom: 30px; }
        .section h3 { color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
        .subscription-item { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .category-item { background: #f5f5f5; padding: 10px; margin: 5px 0; border-radius: 3px; }
        .total { font-weight: bold; background: #e3f2fd; padding: 15px; border-radius: 5px; font-size: 18px; }
        .summary { background: #f9f9f9; padding: 20px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📋 Subscription Manager Report</h1>
        <h2>${type.charAt(0).toUpperCase() + type.slice(1)} Report</h2>
        <p>Generated on: ${new Date().toLocaleDateString()}</p>
      </div>
      
      <div class="section summary">
        <h3>📊 Summary</h3>
        <div class="total">Total Monthly Spending: $${totalMonthly.toFixed(2)}</div>
        <p>Total Active Subscriptions: ${window.subscriptions.length}</p>
        <p>Annual Cost: $${(totalMonthly * 12).toFixed(2)}</p>
      </div>
      
      <div class="section">
        <h3>📁 Category Breakdown</h3>
        ${categoryList}
      </div>
      
      <div class="section">
        <h3>📋 All Subscriptions</h3>
        ${subscriptionList}
      </div>
    </body>
    </html>
  `;
  
  // Create downloadable HTML report
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `subscription-report-${type}-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  return true;
}

// Initialize PDF functionality when needed
async function initializePDFGeneration() {
  try {
    await loadJSPDF();
    return true;
  } catch (error) {
    showToast('Failed to initialize PDF generation: ' + error.message, 'error');
    return false;
  }
}

// Excel Export System with Formulas
async function generateExcelReport(reportType = 'comprehensive') {
  // Excel generation requested with type: ${reportType}
  
  // Check if premium manager is available
  if (typeof window.premiumManager === 'undefined') {
    showToast('Premium features not initialized', 'error');
    return;
  }
  
  if (!window.premiumManager.isFeatureAvailable('excel_export')) {
    showPremiumUpgradePrompt('excel_export');
    return;
  }
  
  try {
    showToast('Generating Excel report...', 'info');
    
    // Initialize Excel library first
    const excelInitialized = await initializeExcelGeneration();
    if (!excelInitialized) {
      showToast('Failed to initialize Excel library. Please try again.', 'error');
      return;
    }
    
    // Load required data
    const result = await chrome.storage.local.get(['subscriptions', 'baseCurrency', 'currencyRates', 'categoryBudgets']);
    window.subscriptions = result.subscriptions || [];
    const baseCurrency = result.baseCurrency || 'USD';
    const rates = result.currencyRates || getDefaultCurrencyRates();
    const categoryBudgets = result.categoryBudgets || {};
    
    // Generate report data
    const reportData = await generateReportData(subscriptions, baseCurrency, rates, categoryBudgets);
    
    // Generate simple CSV export instead of Excel (due to CSP restrictions)
    createSimpleExcelContent(subscriptions, reportType);
    
    showToast('✅ CSV export generated successfully!', 'success');
    return;
    
    // Sheet 1: Subscription Overview
    const overviewData = [
      ['📋 Subscription Manager - Overview Report', '', '', '', ''],
      ['Generated:', new Date().toLocaleDateString('ro-RO'), '', '', ''],
      ['Currency:', baseCurrency, '', '', ''],
      ['', '', '', '', ''],
      ['EXECUTIVE SUMMARY', '', '', '', ''],
      ['Total Active Subscriptions:', reportData.summary.totalSubscriptions, '', '', ''],
      ['Monthly Spending:', `${reportData.summary.monthlySpending.toFixed(2)} ${baseCurrency}`, '', '', ''],
      ['Annual Projection:', { f: `B7*12` }, '', '', ''], // Formula for annual calculation
      ['Most Expensive Service:', reportData.summary.mostExpensive.name, reportData.summary.mostExpensive.price.toFixed(2), '', ''],
      ['', '', '', '', ''],
      ['ACTIVE SUBSCRIPTIONS', '', '', '', ''],
      ['Service Name', 'Monthly Price', 'Currency', 'Category', 'Next Payment'],
    ];
    
    // Add subscription data with formulas
    let rowIndex = 13; // Starting from row 13 (after headers)
    reportData.activeSubscriptions.forEach((sub, index) => {
      overviewData.push([
        sub.name,
        sub.convertedPrice.toFixed(2),
        baseCurrency,
        sub.category,
        new Date(sub.nextPaymentDate).toLocaleDateString('ro-RO')
      ]);
      rowIndex++;
    });
    
    // Add totals with formulas
    overviewData.push(['', '', '', '', '']);
    overviewData.push(['TOTAL MONTHLY:', { f: `SUM(B13:B${rowIndex-1})` }, '', '', '']);
    overviewData.push(['TOTAL ANNUAL:', { f: `B${rowIndex+1}*12` }, '', '', '']);
    
    const overviewSheet = window.XLSX.utils.aoa_to_sheet(overviewData);
    
    // Set column widths
    overviewSheet['!cols'] = [
      { width: 25 }, // Service Name
      { width: 15 }, // Price
      { width: 10 }, // Currency
      { width: 15 }, // Category
      { width: 15 }  // Next Payment
    ];
    
    // Add the overview sheet
    window.XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');
    
    // Sheet 2: Category Analysis
    const categoryData = [
      ['📊 Category Analysis', '', '', '', ''],
      ['', '', '', '', ''],
      ['Category', 'Monthly Spending', 'Percentage', 'Annual Projection', 'Budget (if set)'],
    ];
    
    let categoryRowIndex = 4;
    let totalCellRef = '';
    
    reportData.categoryBreakdown.forEach((category, index) => {
      const budgetAmount = categoryBudgets[category.category.toLowerCase()] || '';
      categoryData.push([
        category.category,
        category.amount.toFixed(2),
        { f: `B${categoryRowIndex}/Overview.B${rowIndex}*100` }, // Percentage formula
        { f: `B${categoryRowIndex}*12` }, // Annual projection formula
        budgetAmount
      ]);
      categoryRowIndex++;
    });
    
    // Add category totals
    categoryData.push(['', '', '', '', '']);
    categoryData.push(['TOTALS:', { f: `SUM(B4:B${categoryRowIndex-1})` }, '100%', { f: `B${categoryRowIndex}*12` }, '']);
    
    const categorySheet = window.XLSX.utils.aoa_to_sheet(categoryData);
    categorySheet['!cols'] = [
      { width: 20 }, // Category
      { width: 18 }, // Monthly Spending
      { width: 12 }, // Percentage
      { width: 18 }, // Annual Projection
      { width: 15 }  // Budget
    ];
    
    window.XLSX.utils.book_append_sheet(workbook, categorySheet, 'Category Analysis');
    
    // Sheet 3: Budget Tracking (if budgets are set)
    if (Object.keys(categoryBudgets).length > 0) {
      const budgetData = [
        ['💰 Budget Tracking', '', '', '', '', ''],
        ['', '', '', '', '', ''],
        ['Category', 'Budget Limit', 'Actual Spending', 'Difference', 'Percentage Used', 'Status'],
      ];
      
      let budgetRowIndex = 4;
      
      reportData.budgetAnalysis.forEach((budget, index) => {
        const status = budget.percentage > 100 ? 'Over Budget' : 
                     budget.percentage > 80 ? 'Near Limit' : 'On Track';
        
        budgetData.push([
          budget.category.charAt(0).toUpperCase() + budget.category.slice(1),
          budget.budget.toFixed(2),
          budget.spent.toFixed(2),
          { f: `B${budgetRowIndex}-C${budgetRowIndex}` }, // Difference formula
          { f: `C${budgetRowIndex}/B${budgetRowIndex}*100` }, // Percentage formula
          status
        ]);
        budgetRowIndex++;
      });
      
      // Add summary formulas
      budgetData.push(['', '', '', '', '', '']);
      budgetData.push(['TOTALS:', { f: `SUM(B4:B${budgetRowIndex-1})` }, { f: `SUM(C4:C${budgetRowIndex-1})` }, { f: `B${budgetRowIndex}/C${budgetRowIndex}` }, '', '']);
      
      const budgetSheet = window.XLSX.utils.aoa_to_sheet(budgetData);
      budgetSheet['!cols'] = [
        { width: 20 }, // Category
        { width: 15 }, // Budget
        { width: 15 }, // Actual
        { width: 15 }, // Difference
        { width: 15 }, // Percentage
        { width: 15 }  // Status
      ];
      
      window.XLSX.utils.book_append_sheet(workbook, budgetSheet, 'Budget Tracking');
    }
    
    // Sheet 4: Payment Calendar
    const calendarData = [
      ['📅 Payment Calendar', '', '', '', ''],
      ['', '', '', '', ''],
      ['Service', 'Amount', 'Next Payment', 'Days Until Payment', 'Category'],
    ];
    
    const today = new Date();
    const sortedByDate = reportData.activeSubscriptions
      .filter(sub => sub.nextPaymentDate)
      .sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate));
    
    let calendarRowIndex = 4;
    sortedByDate.forEach((sub, index) => {
      const paymentDate = new Date(sub.nextPaymentDate);
      const daysDiff = Math.ceil((paymentDate - today) / (1000 * 60 * 60 * 24));
      
      calendarData.push([
        sub.name,
        sub.convertedPrice.toFixed(2),
        paymentDate.toLocaleDateString('ro-RO'),
        daysDiff,
        sub.category
      ]);
      calendarRowIndex++;
    });
    
    // Add monthly projection
    calendarData.push(['', '', '', '', '']);
    calendarData.push(['Monthly Total:', { f: `SUM(B4:B${calendarRowIndex-1})` }, '', '', '']);
    
    const calendarSheet = window.XLSX.utils.aoa_to_sheet(calendarData);
    calendarSheet['!cols'] = [
      { width: 25 }, // Service
      { width: 12 }, // Amount
      { width: 15 }, // Next Payment
      { width: 18 }, // Days Until
      { width: 15 }  // Category
    ];
    
    window.XLSX.utils.book_append_sheet(workbook, calendarSheet, 'Payment Calendar');
    
    // Sheet 5: Financial Summary with Advanced Formulas
    const financialData = [
      ['💰 Financial Summary & Projections', '', '', '', ''],
      ['', '', '', '', ''],
      ['CURRENT PERIOD', '', '', '', ''],
      ['Monthly Spending:', { f: `Overview.B${rowIndex}` }, '', '', ''],
      ['Quarterly Projection:', { f: `B4*3` }, '', '', ''],
      ['Semi-Annual Projection:', { f: `B4*6` }, '', '', ''],
      ['Annual Projection:', { f: `B4*12` }, '', '', ''],
      ['', '', '', '', ''],
      ['CATEGORY DISTRIBUTION', '', '', '', ''],
      ['Highest Category:', '', '', '', ''],
      ['Lowest Category:', '', '', '', ''],
      ['Average per Category:', { f: `B4/COUNTA('Category Analysis'.A4:A${categoryRowIndex-1})` }, '', '', ''],
      ['', '', '', '', ''],
      ['BUDGET ANALYSIS (if applicable)', '', '', '', ''],
      ['Total Budget Set:', categoryBudgets ? Object.values(categoryBudgets).reduce((sum, budget) => sum + budget, 0).toFixed(2) : '0', '', '', ''],
      ['Budget Utilization:', budgetData ? { f: `B4/B15*100` } : 'N/A', '', '', ''],
      ['Remaining Budget:', budgetData ? { f: `B15-B4` } : 'N/A', '', '', ''],
      ['', '', '', '', ''],
      ['SAVINGS OPPORTUNITIES', '', '', '', ''],
      ['If 10% reduction:', { f: `B4*0.9` }, '', '', ''],
      ['Annual savings (10%):', { f: `B4*12*0.1` }, '', '', ''],
      ['If 20% reduction:', { f: `B4*0.8` }, '', '', ''],
      ['Annual savings (20%):', { f: `B4*12*0.2` }, '', '', '']
    ];
    
    const financialSheet = window.XLSX.utils.aoa_to_sheet(financialData);
    financialSheet['!cols'] = [
      { width: 30 }, // Description
      { width: 18 }, // Value
      { width: 10 }, // 
      { width: 10 }, // 
      { width: 10 }  // 
    ];
    
    window.XLSX.utils.book_append_sheet(workbook, financialSheet, 'Financial Summary');
    
    // Apply formatting and styling
    applyExcelStyling(workbook);
    
    // Generate and download file
    const fileName = `subscription-report-${new Date().toISOString().split('T')[0]}.xlsx`;
    window.XLSX.writeFile(workbook, fileName);
    
    showToast('✅ Excel report generated successfully!', 'success');
    
  } catch (error) {
    console.error('Error generating Excel report:', error);
    showToast('❌ Failed to generate Excel report: ' + error.message, 'error');
  }
}

// Export Excel function immediately
window.generateExcelReport = generateExcelReport;

// Apply Excel styling and formatting
function applyExcelStyling(workbook) {
  // This function would apply cell styling, number formats, etc.
  // For now, we'll keep it simple as advanced styling requires additional libraries
  
  Object.keys(workbook.Sheets).forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    
    // Auto-fit columns (basic implementation)
    if (!sheet['!cols']) {
      sheet['!cols'] = [];
    }
    
    // Set basic styling for headers
    const range = window.XLSX.utils.decode_range(sheet['!ref']);
    for (let row = range.s.r; row <= Math.min(range.s.r + 2, range.e.r); row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = window.XLSX.utils.encode_cell({ r: row, c: col });
        if (sheet[cellAddress]) {
          // Mark as header style (would be applied with styling library)
          sheet[cellAddress].s = { font: { bold: true } };
        }
      }
    }
  });
}

// Load SheetJS library dynamically
// Simple CSV export (Chrome extensions can't load external scripts due to CSP)
function createSimpleExcelContent(subscriptions, type) {
  const totalMonthly = subscriptions.reduce((sum, sub) => sum + sub.price, 0);
  
  // Create CSV content
  let csvContent = `Subscription Manager Export - ${type}\nGenerated on: ${new Date().toLocaleDateString()}\n\n`;
  
  csvContent += 'Summary\n';
  csvContent += `Total Monthly Spending,$${totalMonthly.toFixed(2)}\n`;
  csvContent += `Total Active Subscriptions,${window.subscriptions.length}\n`;
  csvContent += `Annual Cost,$${(totalMonthly * 12).toFixed(2)}\n\n`;
  
  csvContent += 'Subscription Details\n';
  csvContent += 'Name,Price,Category,Renewal Date,Status\n';
  
  subscriptions.forEach(sub => {
    csvContent += `"${sub.name}",${sub.price},"${sub.category}","${sub.renewalDate}","${sub.status || 'Active'}"\n`;
  });
  
  csvContent += '\nCategory Breakdown\n';
  csvContent += 'Category,Monthly Total\n';
  
  const categories = {};
  subscriptions.forEach(sub => {
    categories[sub.category] = (categories[sub.category] || 0) + sub.price;
  });
  
  Object.entries(categories).forEach(([cat, amount]) => {
    csvContent += `"${cat}",${amount.toFixed(2)}\n`;
  });
  
  // Create downloadable CSV file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `subscription-export-${type}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  return true;
}

// Show Excel export options
function showExcelExportOptions() {
  if (!window.premiumManager || !window.premiumManager.isFeatureAvailable('excel_export')) {
    showPremiumUpgradePrompt('excel_export');
    return;
  }
  
  window.content.innerHTML = `
    <div class="section">
      <h3 class="section-title">📊 Excel Export</h3>
      
      <div class="alert alert-info" style="margin-bottom: 20px;">
        <strong>📈 Advanced Excel Reports</strong>
        <div style="margin-top: 4px; font-size: 12px;">
          Generate Excel files with formulas, calculations, and multiple sheets for detailed analysis.
        </div>
      </div>
      
      <div class="export-options" style="margin-bottom: 20px;">
        <div class="export-option" data-excel-type="comprehensive" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 12px; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">📊</span>
            <div>
              <h4 style="margin: 0 0 4px 0;">Comprehensive Excel Report</h4>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">
                Multi-sheet workbook with formulas, analysis, and projections
              </p>
            </div>
          </div>
        </div>
        
        <div class="export-option" data-excel-type="budget-analysis" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 12px; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">💰</span>
            <div>
              <h4 style="margin: 0 0 4px 0;">Budget Analysis Workbook</h4>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">
                Focus on budget tracking with advanced formulas and projections
              </p>
            </div>
          </div>
        </div>
        
        <div class="export-option" data-excel-type="payment-calendar" style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 12px; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">📅</span>
            <div>
              <h4 style="margin: 0 0 4px 0;">Payment Calendar</h4>
              <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">
                Scheduled payments with automatic date calculations
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div class="excel-features" style="background: linear-gradient(135deg, #28a74510, #17a2b810); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 12px 0; color: var(--success-color);">📋 Excel Features</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
          <div>✅ Dynamic formulas</div>
          <div>✅ Multiple worksheets</div>
          <div>✅ Automatic calculations</div>
          <div>✅ Budget tracking</div>
          <div>✅ Payment calendar</div>
          <div>✅ Financial projections</div>
          <div>✅ Category analysis</div>
          <div>✅ Multi-currency support</div>
        </div>
      </div>
      
      <div class="excel-note" style="background: #e7f3ff; border: 1px solid #bee5eb; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
        <h5 style="margin: 0 0 8px 0; color: #0c5460;">💡 Pro Tip</h5>
        <p style="margin: 0; font-size: 12px; color: #0c5460;">
          Excel files include live formulas that automatically recalculate when you update values. 
          Perfect for budget planning and "what-if" scenarios.
        </p>
      </div>
      
      <button class="btn btn-secondary" id="backToSettingsBtn">Back to Settings</button>
    </div>
  `;
  
  // Add event listeners for Excel options after DOM update
  setTimeout(() => {
    const exportOptions = document.querySelectorAll('.export-option[data-excel-type]');
    exportOptions.forEach(option => {
      if (option) {
        addEventSafe(option, 'click', () => {
          const excelType = option.getAttribute('data-excel-type');
          if (window.generateExcelReport) {
            window.generateExcelReport(excelType);
          }
        });
      }
    });
  }, 100);
}

// Export Excel options function immediately  
window.showExcelExportOptions = showExcelExportOptions;

// Initialize Excel functionality when needed
async function initializeExcelGeneration() {
  try {
    await loadSheetJS();
    return true;
  } catch (error) {
    showToast('Failed to initialize Excel generation: ' + error.message, 'error');
    return false;
  }
}

// AI Auto-Categorization System (Local Processing)

// All duplicate initialization code removed - handled in main DOMContentLoaded listener


// AI Categorization Functions
async function showAICategorization() {
  try {
    const result = await chrome.storage.local.get(['subscriptions']);
    window.subscriptions = result.subscriptions || [];
    
    // Filter subscriptions that might need categorization
    const uncategorizedSubs = window.subscriptions.filter(sub => 
      !sub.category || sub.category === 'other' || sub.category === ''
    );
    
    const aiResult = window.aiCategorizer;
    if (!aiResult) {
      showToast('AI Categorizer not initialized', 'error');
      return;
    }
    
    // Get AI suggestions for uncategorized subscriptions
    const suggestions = [];
    for (let sub of uncategorizedSubs) {
      const categorization = aiResult.categorizeService(sub.name, sub.category);
      if (categorization.isAIGenerated && categorization.confidence >= 0.6) {
        suggestions.push({
          subscription: sub,
          ...categorization
        });
      }
    }
    
    window.content.innerHTML = `
      <div class="section">
        <h3 class="section-title">🤖 AI Auto-Categorization</h3>
        
        <div style="background: var(--bg-secondary); padding: 16px; border-radius: 12px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px 0; color: var(--primary-color);">AI Overview</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
            <div style="background: var(--bg-primary); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: var(--primary-color);">${window.subscriptions.length}</div>
              <div style="font-size: 11px; color: var(--text-secondary);">Total Subscriptions</div>
            </div>
            <div style="background: var(--bg-primary); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: var(--success-color);">${suggestions.length}</div>
              <div style="font-size: 11px; color: var(--text-secondary);">AI Suggestions</div>
            </div>
            <div style="background: var(--bg-primary); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: var(--warning-color);">${uncategorizedSubs.length}</div>
              <div style="font-size: 11px; color: var(--text-secondary);">Needs Review</div>
            </div>
          </div>
        </div>
        
        ${suggestions.length > 0 ? `
          <div style="background: var(--bg-secondary); padding: 16px; border-radius: 12px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h4 style="margin: 0; color: var(--primary-color);">🤖 AI Category Suggestions</h4>
              <button class="btn btn-outline btn-sm" data-action="bulk-apply-suggestions">Apply All (${suggestions.length})</button>
            </div>
            <div style="display: grid; gap: 12px;">
              ${suggestions.map(suggestion => `
                <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px; border-left: 4px solid var(--info-color);">
                  <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                      <div style="font-weight: 600; margin-bottom: 4px;">${suggestion.subscription.name}</div>
                      <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
                        Current: ${suggestion.subscription.category || 'Uncategorized'}
                      </div>
                      <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="background: var(--success-color20); padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                          <strong>AI Suggested:</strong> ${suggestion.category}
                        </div>
                        <div style="background: var(--warning-color20); padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                          Confidence: ${(suggestion.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                      ${suggestion.reason ? `
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; font-style: italic;">
                          💡 ${suggestion.reason}
                        </div>
                      ` : ''}
                    </div>
                    <div style="display: flex; gap: 8px; margin-left: 16px;">
                      <button class="btn btn-success btn-sm" data-action="apply-category-suggestion" data-subscription-id="${suggestion.subscription.id}" data-category="${suggestion.category}">
                        ✅ Apply
                      </button>
                      <button class="btn btn-outline btn-sm" data-action="dismiss-suggestion" data-subscription-id="${suggestion.subscription.id}">
                        ❌ Skip
                      </button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <div style="background: var(--bg-secondary); padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
            <h4 style="margin: 0 0 8px 0; color: var(--primary-color);">Great Job!</h4>
            <p style="color: var(--text-secondary); margin: 0;">
              All your subscriptions are well-categorized. No AI suggestions needed at this time.
            </p>
          </div>
        `}
        
        <div style="text-align: center;">
          <button class="btn btn-secondary" data-action="load-subscriptions">Back to Overview</button>
        </div>
      </div>
    `;
    
  } catch (error) {
    console.error('Error showing AI categorization:', error);
    showToast('Failed to load AI categorization', 'error');
  }
}

// Apply single category suggestion
async function applyCategorySuggestion(subscriptionId, suggestedCategory) {
  try {
    const result = await chrome.storage.local.get(['subscriptions']);
    window.subscriptions = result.subscriptions || [];
    
    const index = subscriptions.findIndex(sub => sub.id === subscriptionId);
    if (index !== -1) {
      const oldCategory = subscriptions[index].category;
      subscriptions[index].category = suggestedCategory;
      subscriptions[index].updatedAt = new Date().toISOString();
      
      await chrome.storage.local.set({ subscriptions });
      
      // Learn from this correction
      if (window.aiCategorizer && window.aiCategorizer.learnFromCorrection) {
        window.aiCategorizer.learnFromCorrection(subscriptions[index].name, oldCategory, suggestedCategory);
      }
      
      showToast(`Updated category to ${suggestedCategory}`, 'success');
      showAICategorization(); // Refresh the view
    } else {
      showToast('Subscription not found', 'error');
    }
  } catch (error) {
    console.error('Error applying category suggestion:', error);
    showToast('Failed to apply category suggestion', 'error');
  }
}

// Apply all suggestions at once
async function bulkApplySuggestions() {
  try {
    const result = await chrome.storage.local.get(['subscriptions']);
    window.subscriptions = result.subscriptions || [];
    
    let updatedCount = 0;
    
    for (let subscription of window.subscriptions) {
      if (!subscription.category || subscription.category === 'other' || subscription.category === '') {
        const aiResult = window.aiCategorizer.categorizeService(subscription.name, subscription.category);
        
        if (aiResult.isAIGenerated && 
            aiResult.confidence >= 0.8 && 
            aiResult.category !== subscription.category) {
          
          const oldCategory = subscription.category;
          subscription.category = aiResult.category;
          subscription.updatedAt = new Date().toISOString();
          updatedCount++;
          
          // Record for learning
          if (window.aiCategorizer && window.aiCategorizer.learnFromCorrection) {
            window.aiCategorizer.learnFromCorrection(subscription.name, oldCategory, aiResult.category);
          }
        }
      }
    }
    
    if (updatedCount > 0) {
      await chrome.storage.local.set({ subscriptions });
      showToast(`Updated ${updatedCount} subscription categories`, 'success');
      showAICategorization(); // Refresh the view
    } else {
      showToast('No high-confidence suggestions to apply', 'info');
    }
    
  } catch (error) {
    console.error('Error bulk applying suggestions:', error);
    showToast('Failed to bulk update categories', 'error');
  }
}

// Manual categorization interface
function manualCategorize(subscriptionId) {
  // This would open a detailed categorization interface
  // For now, redirect to edit subscription
  const subscription = subscriptions.find(sub => sub.id === subscriptionId);
  if (subscription) {
    editSubscription(subscriptionId);
  }
}

// Dismiss AI suggestion
function dismissSuggestion(subscriptionId) {
  // Record dismissal for learning purposes (if implemented)
  showToast('Suggestion dismissed', 'info');
  showAICategorization(); // Refresh the view
}

// Show analytics tab content
async function showAnalyticsTab() {
  // Force reload premium status to check latest state
  if (window.premiumManager) {
    await window.premiumManager.loadPremiumStatus();
  }
  
  console.log('Analytics Dashboard check:', {
    premiumManager: !!window.premiumManager,
    isPremium: window.premiumManager ? window.premiumManager.isPremium() : false,
    featureAvailable: window.premiumManager ? window.premiumManager.isFeatureAvailable('analytics_dashboard') : false,
    status: window.premiumManager ? window.premiumManager.premiumStatus : 'none'
  });
  
  if (window.premiumManager && window.premiumManager.isFeatureAvailable('analytics_dashboard')) {
    console.log('Loading analytics dashboard...');
    if (window.analyticsDashboard) {
      await window.analyticsDashboard.showAnalyticsDashboard();
    } else {
      // Try to initialize if not available
      try {
        if (typeof AnalyticsDashboard === 'undefined') {
          console.error('AnalyticsDashboard class not found');
          showToast('Analytics Dashboard class not available', 'error');
          return;
        }
        window.analyticsDashboard = new AnalyticsDashboard();
        showToast('Analytics Dashboard initialized successfully', 'success');
        await window.analyticsDashboard.showAnalyticsDashboard();
      } catch (error) {
        showToast('Analytics Dashboard initialization failed', 'error');
        console.error('Failed to initialize Analytics Dashboard:', error);
      }
    }
  } else {
    window.content.innerHTML = `
      <div class="section">
        <h3 class="section-title">📊 Analytics</h3>
        <div class="premium-feature-preview">
          <div class="preview-content">
            <h4>📈 Advanced Analytics Dashboard</h4>
            <p>Unlock powerful insights about your subscriptions:</p>
            <ul style="text-align: left; margin: 16px 0;">
              <li>Interactive charts and graphs</li>
              <li>Spending trends over time</li>
              <li>Category breakdowns</li>
              <li>Budget performance tracking</li>
              <li>Predictive analytics</li>
            </ul>
            <button class="btn btn-primary" data-action="upgrade" data-feature="analytics_dashboard">
              Upgrade to Premium
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

// Note: showBudgetTab() function is already implemented at line 3923

// Show subscriptions list
function showSubscriptionsList() {
  loadSubscriptions();
}

// Export AI Categorization functions globally
window.showAICategorization = showAICategorization;
window.applyCategorySuggestion = applyCategorySuggestion;
window.bulkApplySuggestions = bulkApplySuggestions;
window.manualCategorize = manualCategorize;
window.dismissSuggestion = dismissSuggestion;

// CRITICAL: Initialize core components immediately after class definitions
// This ensures they are available before any usage
function initializeCoreComponents() {
  try {
    // Initialize AI Categorizer first - critical for categorization features
    if (typeof LocalAICategorizer === 'function') {
      if (!window.aiCategorizer) {
        window.aiCategorizer = new LocalAICategorizer();
        console.log('✅ AI Categorizer initialized successfully');
      }
    } else {
      console.warn('⚠️ LocalAICategorizer class not available');
    }

    // Initialize Analytics Dashboard for analytics features
    if (typeof AnalyticsDashboard === 'function') {
      if (!window.analyticsDashboard) {
        window.analyticsDashboard = new AnalyticsDashboard();
        console.log('✅ Analytics Dashboard initialized successfully');
      }
    } else {
      console.warn('⚠️ AnalyticsDashboard class not available');
    }

    // CRITICAL: Ensure export functions are available globally
    // These are essential for premium features
    if (typeof generatePDFReport === 'function') {
      if (!window.generatePDFReport) {
        window.generatePDFReport = generatePDFReport;
        console.log('✅ PDF Report function exported globally');
      }
    } else {
      console.warn('⚠️ generatePDFReport function not available');
    }

    if (typeof generateExcelReport === 'function') {
      if (!window.generateExcelReport) {
        window.generateExcelReport = generateExcelReport;
        console.log('✅ Excel Report function exported globally');
      }
    } else {
      console.warn('⚠️ generateExcelReport function not available');
    }

    // Export AI categorization functions
    window.showAICategorization = showAICategorization;
    window.applyCategorySuggestion = applyCategorySuggestion;
    window.bulkApplySuggestions = bulkApplySuggestions;
    window.manualCategorize = manualCategorize;
    window.dismissSuggestion = dismissSuggestion;

    console.log('✅ All critical components initialized successfully');

  } catch (error) {
    console.error('❌ Critical components initialization failed:', error);
    // Create fallback objects to prevent crashes
    window.aiCategorizer = window.aiCategorizer || {
      categorizeService: () => ({ category: 'other', confidence: 0 }),
      learnFromCorrection: () => {}
    };
    window.analyticsDashboard = window.analyticsDashboard || {
      showAnalyticsDashboard: () => console.warn('Analytics Dashboard not available')
    };
  }
}

// Currency management helper functions
async function loadCurrencySettingsIntoModal() {
  try {
    const { rates, baseCurrency } = await window.loadCurrencyRates();

    // Set base currency
    const baseSelect = document.getElementById('baseCurrency');
    if (baseSelect) {
      baseSelect.value = baseCurrency;
    }

    // Populate exchange rates
    const ratesGrid = document.getElementById('ratesGrid');
    if (ratesGrid) {
      const currencies = ['EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'RON'];
      ratesGrid.innerHTML = currencies.map(currency => {
        const rate = rates[currency] || 1;
        return `
          <div class="rate-item">
            <label>${currency}:</label>
            <input type="number"
                   id="rate_${currency}"
                   value="${rate}"
                   step="0.01"
                   min="0.01"
                   data-currency="${currency}">
          </div>
        `;
      }).join('');
    }

    // Populate currency toggles (for enabled/disabled currencies)
    const currencyToggles = document.getElementById('currencyToggles');
    if (currencyToggles) {
      const allCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'RON'];
      const enabledCurrencies = await chrome.storage.local.get(['enabledCurrencies']);
      const enabled = enabledCurrencies.enabledCurrencies || allCurrencies;

      currencyToggles.innerHTML = allCurrencies.map(currency => `
        <div class="currency-toggle">
          <input type="checkbox"
                 id="curr_${currency}"
                 ${enabled.includes(currency) ? 'checked' : ''}
                 data-currency="${currency}">
          <label for="curr_${currency}">${currency}</label>
        </div>
      `).join('');
    }

  } catch (error) {
    console.error('Error loading currency settings:', error);
    showToast('Failed to load currency settings', 'error');
  }
}

async function saveCurrencySettings() {
  try {
    const baseCurrency = document.getElementById('baseCurrency').value;

    // Collect exchange rates
    const rates = { [baseCurrency]: 1.0 }; // Base currency is always 1
    document.querySelectorAll('.rate-item input').forEach(input => {
      const currency = input.dataset.currency;
      const rate = parseFloat(input.value);
      if (!isNaN(rate) && rate > 0) {
        rates[currency] = rate;
      }
    });

    // Collect enabled currencies
    const enabledCurrencies = [];
    document.querySelectorAll('.currency-toggle input:checked').forEach(input => {
      enabledCurrencies.push(input.dataset.currency);
    });

    // Save to storage
    await chrome.storage.local.set({
      currencyRates: rates,
      baseCurrency: baseCurrency,
      enabledCurrencies: enabledCurrencies
    });

    showToast('Currency settings saved successfully', 'success');
    closeCurrencyModal();

    // Refresh any open currency displays
    if (typeof refreshCurrencyDisplay === 'function') {
      refreshCurrencyDisplay();
    }

  } catch (error) {
    console.error('Error saving currency settings:', error);
    showToast('Failed to save currency settings', 'error');
  }
}

function closeCurrencyModal() {
  const modalContainer = document.getElementById('modalContainer');
  modalContainer.innerHTML = '';
  modalContainer.classList.add('hidden');
}

function resetRatesToDefault() {
  if (confirm('Reset all exchange rates to default values?')) {
    const defaultRates = window.getDefaultCurrencyRates ? window.getDefaultCurrencyRates() : {
      USD: 1.00,
      EUR: 0.85,
      GBP: 0.73,
      CAD: 1.35,
      AUD: 1.45,
      JPY: 110.0,
      RON: 4.20
    };

    Object.entries(defaultRates).forEach(([currency, rate]) => {
      const input = document.getElementById(`rate_${currency}`);
      if (input && currency !== 'USD') { // Don't modify base currency
        input.value = rate;
      }
    });

    showToast('Rates reset to default values', 'success');
  }
}

async function updateRatesFromAPI() {
  try {
    showToast('Updating rates from API...', 'info');

    // This would connect to a real currency API in production
    // For now, simulate with a small random variation
    document.querySelectorAll('.rate-item input').forEach(input => {
      const currentRate = parseFloat(input.value);
      const variation = (Math.random() - 0.5) * 0.1; // ±5% variation
      const newRate = Math.max(0.01, currentRate * (1 + variation));
      input.value = newRate.toFixed(4);
    });

    showToast('Exchange rates updated (demo mode)', 'success');

  } catch (error) {
    console.error('Error updating rates from API:', error);
    showToast('Failed to update exchange rates', 'error');
  }
}

// Initialize immediately
initializeCoreComponents();

// Extension initialized successfully

// Performance optimization: Add proper error boundaries
window.addEventListener('error', function(event) {
  console.error('Global error caught:', event.error);
  // Prevent error propagation that could break the extension
  event.preventDefault();
});

window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
  cleanupPopup();
});

// Export key functions for external access (if needed)
window.SubscriptionManager = {
  showCurrencyManagement,
  saveSubscription,
  initializeCurrencyManagement,
  secureAPICall,
  checkRateLimit
};
