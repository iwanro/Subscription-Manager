// Common utilities for Subscription Manager extension

// Security and encryption utilities
const ENCRYPTION_KEY_NAME = 'subscription-manager-encryption-key';
const ENCRYPTION_NONCE_LENGTH = 12;
const ENCRYPTION_TAG_LENGTH = 16;
const MAX_KEY_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds

// ENHANCED: Generate or get encryption key with rotation support
async function getEncryptionKey() {
  try {
    let key = await chrome.storage.local.get([ENCRYPTION_KEY_NAME, 'encryptionKeyTimestamp']);

    // Generate new key if doesn't exist or is too old
    if (!key[ENCRYPTION_KEY_NAME] || !key.encryptionKeyTimestamp ||
        (Date.now() - new Date(key.encryptionKeyTimestamp).getTime() > MAX_KEY_AGE)) {

      console.log('🔐 Generating new encryption key...');

      // Generate new encryption key
      const keyMaterial = await window.crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256,
        },
        true,
        ['encrypt', 'decrypt']
      );

      // Export key for storage
      const exportedKey = await window.crypto.subtle.exportKey('raw', keyMaterial);
      const keyArray = new Uint8Array(exportedKey);
      const base64Key = btoa(String.fromCharCode.apply(null, keyArray));

      // Store key with timestamp
      await chrome.storage.local.set({
        [ENCRYPTION_KEY_NAME]: base64Key,
        encryptionKeyTimestamp: new Date().toISOString()
      });

      key = { [ENCRYPTION_KEY_NAME]: base64Key };
      console.log('✅ New encryption key generated and stored');
    }

    return key[ENCRYPTION_KEY_NAME];
  } catch (error) {
    console.error('❌ Error getting encryption key:', error);
    throw new Error('Failed to initialize encryption');
  }
}


// Decrypt sensitive data
async function decryptData(encryptedData) {
  try {
    if (!encryptedData) return null;

    const keyBase64 = await getEncryptionKey();
    const keyBytes = new Uint8Array(
      atob(keyBase64).split('').map(c => c.charCodeAt(0))
    );

    // Parse encrypted data
    const encryptedBytes = new Uint8Array(
      atob(encryptedData).split('').map(c => c.charCodeAt(0))
    );

    // Extract nonce and encrypted content
    const nonce = encryptedBytes.slice(0, ENCRYPTION_NONCE_LENGTH);
    const content = encryptedBytes.slice(ENCRYPTION_NONCE_LENGTH);

    // Decrypt
    const decryptedBytes = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
      },
      await window.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']),
      content
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decryptedBytes));
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

// Secure storage functions
async function setSecureData(key, data) {
  try {
    const encrypted = await encryptData(data);
    await chrome.storage.local.set({ [`secure_${key}`]: encrypted });
  } catch (error) {
    console.error('Error storing secure data:', error);
    throw error;
  }
}

async function getSecureData(key) {
  try {
    const result = await chrome.storage.local.get([`secure_${key}`]);
    const encrypted = result[`secure_${key}`];
    return encrypted ? await decryptData(encrypted) : null;
  } catch (error) {
    console.error('Error retrieving secure data:', error);
    throw error;
  }
}

async function removeSecureData(key) {
  await chrome.storage.local.remove([`secure_${key}`]);
}

// Check if encryption is available
function isEncryptionAvailable() {
  return window.crypto && window.crypto.subtle && typeof window.crypto.subtle.generateKey === 'function';
}

// ENHANCED: Input validation and sanitization functions
function sanitizeInput(input, maxLength = 1000) {
  if (typeof input !== 'string') {
    return String(input);
  }

  // Remove potentially dangerous characters
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .substring(0, maxLength);
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Enhanced email validation with better security
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return emailRegex.test(email) &&
         email.length <= 254 && // RFC 5321 limit
         !email.startsWith('.') &&
         !email.endsWith('.') &&
         !email.includes('..');
}

function validateNumericInput(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = parseFloat(value);
  return !isNaN(num) && num >= min && num <= max && Number.isFinite(num);
}

function validateURL(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    // Only allow https and http protocols
    return ['https:', 'http:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function sanitizeHTML(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Basic HTML sanitization
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

// ENHANCED: Encryption with data validation
async function encryptData(data) {
  try {
    // Validate input data
    if (data === null || data === undefined) {
      throw new Error('Cannot encrypt null or undefined data');
    }

    const sanitizedData = sanitizeInput(JSON.stringify(data), 10000); // 10KB limit
    const keyBase64 = await getEncryptionKey();

    // Validate key format
    if (!keyBase64 || typeof keyBase64 !== 'string' || keyBase64.length < 10) {
      throw new Error('Invalid encryption key format');
    }

    const keyBytes = new Uint8Array(
      atob(keyBase64).split('').map(c => c.charCodeAt(0))
    );

    // Generate nonce
    const nonce = window.crypto.getRandomValues(new Uint8Array(ENCRYPTION_NONCE_LENGTH));

    // Encrypt data
    const dataBytes = new TextEncoder().encode(sanitizedData);
    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
      },
      await window.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']),
      dataBytes
    );

    // Combine nonce and encrypted data
    const result = new Uint8Array(ENCRYPTION_NONCE_LENGTH + encryptedData.byteLength);
    result.set(nonce);
    result.set(new Uint8Array(encryptedData), ENCRYPTION_NONCE_LENGTH);

    return btoa(String.fromCharCode.apply(null, result));
  } catch (error) {
    console.error('❌ Encryption error:', error);
    throw new Error('Failed to encrypt data: ' + error.message);
  }
}

// Toast notification system
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type}`;
  toast.innerHTML = sanitizeHTML(message);
  toast.style.position = 'fixed';
  toast.style.top = '60px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.zIndex = '1000';
  toast.style.maxWidth = '90%';
  toast.style.fontSize = '12px';
  toast.style.padding = '8px 12px';

  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  }, 2000);
}

// Currency conversion utilities
async function loadCurrencyRates() {
  try {
    const result = await chrome.storage.local.get(['currencyRates', 'baseCurrency']);
    const rates = result.currencyRates || getDefaultCurrencyRates();
    const baseCurrency = result.baseCurrency || 'USD';

    // Store if not exists
    if (!result.currencyRates) {
      await chrome.storage.local.set({ currencyRates: rates, baseCurrency });
    }

    return { rates, baseCurrency };
  } catch (error) {
    console.error('Error loading currency rates:', error);
    return { rates: getDefaultCurrencyRates(), baseCurrency: 'USD' };
  }
}

function getDefaultCurrencyRates() {
  // Default rates relative to USD (manual rates that users can modify)
  return {
    USD: 1.00,
    EUR: 0.85,
    GBP: 0.73,
    CAD: 1.35,
    AUD: 1.45,
    JPY: 110.0,
    RON: 4.20
  };
}

async function convertToBaseCurrency(price, fromCurrency) {
  try {
    const { rates, baseCurrency } = await loadCurrencyRates();

    if (fromCurrency === baseCurrency) {
      return price;
    }

    const rateFrom = rates[fromCurrency] || 1;
    const rateBase = rates[baseCurrency] || 1;

    return (price / rateFrom) * rateBase;
  } catch (error) {
    console.error('Error converting currency:', error);
    return price; // Return original price as fallback
  }
}

// Generic currency conversion function
async function convertCurrency(price, fromCurrency, toCurrency, rates = null) {
  try {
    // If no rates provided, load them
    if (!rates) {
      const result = await loadCurrencyRates();
      rates = result.rates;
    }

    // If currencies are the same, return original price
    if (fromCurrency === toCurrency) {
      return price;
    }

    // Convert via USD as base
    const rateFrom = rates[fromCurrency] || 1;
    const rateTo = rates[toCurrency] || 1;

    // Convert from source currency to USD, then to target currency
    const usdAmount = price / rateFrom;
    return usdAmount * rateTo;
  } catch (error) {
    console.error('Error converting currency:', error);
    return price; // Return original price as fallback
  }
}

// Get formatted price with currency symbol
function formatCurrency(amount, currency = 'USD') {
  const symbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: 'C$',
    AUD: 'A$',
    RON: 'lei'
  };

  const symbol = symbols[currency] || currency;

  if (currency === 'JPY') {
    return `${symbol}${Math.round(amount)}`;
  }

  return `${symbol}${amount.toFixed(2)}`;
}

// Email utilities
async function sendBrevoEmail(emailData, emailSettings) {
  try {
    const payload = {
      sender: {
        email: emailSettings.brevoSenderEmail,
        name: emailSettings.brevoSenderName || 'Subscription Manager'
      },
      to: [{
        email: emailSettings.userEmail,
        name: emailSettings.userEmail.split('@')[0]
      }],
      subject: emailData.subject,
      htmlContent: emailData.htmlContent,
      textContent: emailData.textContent || emailData.htmlContent.replace(/<[^>]*>/g, '')
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
      console.log('✅ Email sent successfully via Brevo:', result);
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

// ENHANCED: API key validation with better security
async function validateBrevoApi(apiKey) {
  try {
    // Input validation
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, error: 'Vă rugăm să introduceți cheia API' };
    }

    const sanitizedKey = sanitizeInput(apiKey.trim(), 100);

    if (!sanitizedKey.startsWith('xkeysib-')) {
      return { valid: false, error: 'Formatul cheii API este incorect (trebuie să înceapă cu "xkeysib-")' };
    }

    if (sanitizedKey.length < 10 || sanitizedKey.length > 100) {
      return { valid: false, error: 'Lungimea cheii API este invalidă' };
    }

    // Use timeout for security
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch('https://api.brevo.com/v3/account', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'api-key': sanitizedKey
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const accountInfo = await response.json();
      return {
        valid: true,
        accountInfo: {
          email: sanitizeInput(accountInfo.email || 'N/A', 100),
          plan: sanitizeInput(accountInfo.plan?.type || 'N/A', 50)
        }
      };
    } else if (response.status === 401) {
      return { valid: false, error: 'Cheia API este invalidă sau expirată' };
    } else {
      return { valid: false, error: 'Nu s-a putut valida cheia API. Verificați conexiunea la internet.' };
    }
  } catch (error) {
    console.error('Brevo API validation error:', error);
    if (error.name === 'AbortError') {
      return { valid: false, error: 'Timeout la validarea API. Încercați din nou.' };
    }
    return { valid: false, error: 'Eroare la validarea API: Nu s-a putut conecta la Brevo' };
  }
}

// DEPRECATED: Use validateEmail instead for enhanced security
function isValidEmail(email) {
  console.warn('⚠️ isValidEmail is deprecated. Use validateEmail instead for better security.');
  return validateEmail(email);
}

// Generate unique ID
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// Format date consistently
function formatDate(dateString, format = 'MM/DD/YYYY') {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US');
}

// Export utilities globally
if (typeof window !== 'undefined') {
  window.showToast = showToast;
  window.loadCurrencyRates = loadCurrencyRates;
  window.convertToBaseCurrency = convertToBaseCurrency;
  window.convertCurrency = convertCurrency;
  window.formatCurrency = formatCurrency;
  window.getDefaultCurrencyRates = getDefaultCurrencyRates;
  window.sendBrevoEmail = sendBrevoEmail;
  window.validateBrevoApi = validateBrevoApi;
  window.isValidEmail = isValidEmail;
  window.generateId = generateId;
  window.formatDate = formatDate;

  // Security utilities
  window.getEncryptionKey = getEncryptionKey;
  window.encryptData = encryptData;
  window.decryptData = decryptData;
  window.setSecureData = setSecureData;
  window.getSecureData = getSecureData;
  window.removeSecureData = removeSecureData;
  window.isEncryptionAvailable = isEncryptionAvailable;

  // Enhanced validation utilities
  window.sanitizeInput = sanitizeInput;
  window.validateEmail = validateEmail;
  window.validateNumericInput = validateNumericInput;
  window.validateURL = validateURL;
  window.sanitizeHTML = sanitizeHTML;
}
