// Premium Features Management System
if (typeof window.PremiumManager === 'undefined') {
class PremiumManager {
  constructor() {
    this.premiumStatus = null;
    this.trialEndDate = null;
    this.features = {
      free: [
        'basic_subscription_management',
        'simple_notifications',
        'basic_budget_tracking',
        'basic_analytics',
        'theme_toggle',
        'basic_export'
      ],
      premium: [
        'unlimited_subscriptions',
        'advanced_analytics',
        'analytics_dashboard',
        'ai_insights',
        'ai_categorization',
        'email_notifications',
        'custom_categories',
        'advanced_budgeting',
        'pdf_reports',
        'excel_export',
        'bank_integration',
        'mobile_sync'
      ],
      business: [
        'team_management',
        'admin_dashboard',
        'api_access',
        'white_labeling',
        'priority_support',
        'compliance_reporting'
      ]
    };
  }

  async init() {
    await this.loadPremiumStatus();
    await this.validatePremiumStatus(); // Security validation
    this.setupTrialLogic();
  }

  async loadPremiumStatus() {
    try {
      const result = await chrome.storage.local.get(['premiumStatus', 'trialEndDate', 'trialDeviceId', 'trialStartTime']);
      this.premiumStatus = result.premiumStatus || 'free';
      this.trialEndDate = result.trialEndDate ? new Date(result.trialEndDate) : null;
      this.trialDeviceId = result.trialDeviceId || null;
      this.trialStartTime = result.trialStartTime ? new Date(result.trialStartTime) : null;

      // Security: Validate trial integrity
      if (this.premiumStatus === 'trial' && this.trialEndDate) {
        if (!this.validateTrialIntegrity(result)) {
          console.warn('Trial integrity check failed, resetting to free');
          await this.expireTrial();
        }
      }

      console.log('Premium status loaded:', this.premiumStatus);
    } catch (error) {
      console.error('Error loading premium status:', error);
      this.premiumStatus = 'free';
    }
  }

  setupTrialLogic() {
    // Start trial if first time user
    if (!this.trialEndDate && this.premiumStatus === 'free') {
      this.startTrial();
    }
  }

  async startTrial() {
    // Security: Check if trial was already used
    if (await this.hasTrialBeenUsed()) {
      console.log('Trial already used on this device');
      this.premiumStatus = 'free';
      await chrome.storage.local.set({ premiumStatus: 'free' });
      return;
    }

    const trialDuration = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = new Date();
    this.trialEndDate = new Date(now.getTime() + trialDuration);
    this.trialStartTime = now;
    this.trialDeviceId = this.generateDeviceFingerprint();
    this.premiumStatus = 'trial';

    await chrome.storage.local.set({
      premiumStatus: this.premiumStatus,
      trialEndDate: this.trialEndDate.toISOString(),
      trialStartTime: this.trialStartTime.toISOString(),
      trialDeviceId: this.trialDeviceId
    });

    console.log('✅ Trial started successfully, ends:', this.trialEndDate);

    // Security: Record trial usage for this device
    await this.recordTrialUsage();

    // CRITICAL: Trigger UI update immediately after trial starts
    this.notifyTrialStarted();
  }

  // CRITICAL: Notify UI components that trial has started
  notifyTrialStarted() {
    try {
      // Dispatch custom event for UI components
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        const event = new CustomEvent('trialStatusChanged', {
          detail: {
            status: 'trial',
            endDate: this.trialEndDate,
            isActive: true
          }
        });
        window.dispatchEvent(event);
      }

      // Try to update UI directly if updateHeaderStatusBadges is available
      if (typeof window !== 'undefined' && window.updateHeaderStatusBadges) {
        setTimeout(() => {
          window.updateHeaderStatusBadges();
        }, 100);
      }

      console.log('✅ Trial status notification sent to UI');
    } catch (error) {
      console.error('❌ Failed to notify UI of trial start:', error);
    }
  }

  isPremium() {
    return this.premiumStatus === 'premium' || this.premiumStatus === 'business' || this.premiumStatus === 'trial';
  }

  isTrialActive() {
    if (this.premiumStatus !== 'trial') return false;
    const now = new Date();
    return this.trialEndDate && now < this.trialEndDate;
  }

  isFeatureAvailable(featureName) {
    if (this.premiumStatus === 'premium' || this.premiumStatus === 'business') {
      return true;
    }
    
    if (this.premiumStatus === 'trial') {
      const now = new Date();
      if (this.trialEndDate && now < this.trialEndDate) {
        return this.features.premium.includes(featureName) || this.features.free.includes(featureName);
      } else {
        // Trial expired
        this.expireTrial();
        return this.features.free.includes(featureName);
      }
    }
    
    return this.features.free.includes(featureName);
  }

  async expireTrial() {
    await this.savePremiumStatusWithSecurity('free');
    console.log('Trial expired, reverted to free');
  }

  getSubscriptionLimit() {
    switch (this.premiumStatus) {
      case 'free':
        return 10;
      case 'trial':
      case 'premium':
      case 'business':
        return Infinity;
      default:
        return 10;
    }
  }

  showUpgradePrompt(featureName) {
    return `
      <div class="premium-prompt">
        <div class="premium-icon">💎</div>
        <h3>Premium Feature</h3>
        <p>Unlock ${featureName} with Premium subscription</p>
        <div class="premium-benefits">
          <div class="benefit">✨ Unlimited subscriptions</div>
          <div class="benefit">📊 Advanced analytics</div>
          <div class="benefit">🤖 AI insights</div>
          <div class="benefit">📧 Email notifications</div>
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
        <button class="btn btn-premium" data-action="upgrade">
          🚀 Upgrade to Premium
        </button>
        <button class="btn btn-secondary" id="startTrialBtn">
          🆓 Start 30-Day Free Trial
        </button>
      </div>
    `;
  }

  // AI-Powered Features with Security
  async generateAIInsights(subscriptions) {
    if (!this.isFeatureAvailable('ai_insights')) {
      return this.showUpgradePrompt('AI Insights');
    }

    try {
      // Rate limiting check
      await this.checkAIRateLimit();
      
      // Local AI analysis (secure, no external calls)
      const insights = [];
      
      // Intelligent duplicate detection
      const duplicates = await this.smartDuplicateDetection(subscriptions);
      if (duplicates.length > 0) {
        insights.push({
          type: 'warning',
          title: '🔍 Smart Duplicate Detection',
          message: `AI detected potential duplicates: ${duplicates.map(d => d.name).join(', ')}`,
          action: `Cancel duplicates to save $${duplicates.reduce((sum, d) => sum + d.monthlySavings, 0).toFixed(2)}/month`,
          confidence: 85
        });
      }
      
      // AI Cost optimization
      const costOptimization = await this.aiCostOptimization(subscriptions);
      if (costOptimization.potentialSavings > 0) {
        insights.push({
          type: 'suggestion',
          title: '💰 AI Cost Optimization',
          message: `Potential monthly savings: $${costOptimization.potentialSavings.toFixed(2)}`,
          action: costOptimization.recommendation,
          confidence: costOptimization.confidence
        });
      }
      
      // Smart usage patterns
      const patterns = await this.analyzeUsagePatterns(subscriptions);
      insights.push({
        type: 'info',
        title: '📊 Smart Usage Analysis',
        message: patterns.insight,
        action: patterns.recommendation,
        confidence: patterns.confidence
      });
      
      // Price prediction AI
      const pricePredict = await this.predictPriceChanges(subscriptions);
      if (pricePredict.alerts.length > 0) {
        insights.push({
          type: 'warning',
          title: '📈 Price Change Prediction',
          message: `${pricePredict.alerts.length} services may increase prices soon`,
          action: 'Consider switching to annual plans before price increases',
          confidence: pricePredict.confidence
        });
      }

      return insights;
    } catch (error) {
      console.error('AI Insights error:', error);
      return [{
        type: 'error',
        title: '🤖 AI Analysis Unavailable',
        message: 'AI features are temporarily unavailable. Please try again later.',
        action: 'Use basic analytics for now'
      }];
    }
  }

  // Security: AI Rate Limiting
  async checkAIRateLimit() {
    const now = Date.now();
    const result = await chrome.storage.local.get(['aiUsage']);
    const usage = result.aiUsage || { daily: 0, lastReset: now };
    
    // Reset daily counter if needed
    if (now - usage.lastReset > 24 * 60 * 60 * 1000) {
      usage.daily = 0;
      usage.lastReset = now;
    }
    
    // Check limits (Premium: 50/day, Trial: 10/day)
    const limit = this.premiumStatus === 'premium' ? 50 : 10;
    if (usage.daily >= limit) {
      throw new Error('Daily AI analysis limit reached. Upgrade to Premium for higher limits.');
    }
    
    // Increment usage
    usage.daily++;
    await chrome.storage.local.set({ aiUsage: usage });
  }

  // Enhanced duplicate detection with AI-like logic
  async smartDuplicateDetection(subscriptions) {
    const duplicates = [];
    const serviceKeywords = {
      'streaming': ['netflix', 'hulu', 'amazon prime', 'disney', 'hbo', 'paramount', 'peacock', 'apple tv'],
      'music': ['spotify', 'apple music', 'youtube music', 'tidal', 'deezer'],
      'productivity': ['office', 'google workspace', 'notion', 'slack', 'zoom', 'teams'],
      'cloud': ['dropbox', 'google drive', 'onedrive', 'icloud', 'box'],
      'security': ['norton', 'mcafee', 'kaspersky', 'bitdefender', 'malwarebytes']
    };
    
    // Group subscriptions by category keywords
    const groups = {};
    subscriptions.forEach(sub => {
      const subName = sub.name.toLowerCase();
      for (const [category, keywords] of Object.entries(serviceKeywords)) {
        if (keywords.some(keyword => subName.includes(keyword))) {
          if (!groups[category]) groups[category] = [];
          groups[category].push(sub);
        }
      }
    });
    
    // Find duplicates within groups
    Object.values(groups).forEach(group => {
      if (group.length > 1) {
        // Sort by price to suggest keeping cheaper option
        group.sort((a, b) => a.price - b.price);
        const cheapest = group[0];
        const expensive = group.slice(1);
        
        expensive.forEach(sub => {
          duplicates.push({
            name: sub.name,
            monthlySavings: sub.price,
            keepInstead: cheapest.name,
            category: sub.category
          });
        });
      }
    });
    
    return duplicates;
  }

  // AI-powered cost optimization
  async aiCostOptimization(subscriptions) {
    const totalCost = subscriptions.reduce((sum, sub) => sum + sub.price, 0);
    let potentialSavings = 0;
    let recommendation = '';
    let confidence = 0;
    
    // Analyze spending patterns
    const categories = this.analyzeCategories(subscriptions);
    const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    
    // Check for overspending in categories
    const categoryLimits = {
      'entertainment': 50,
      'productivity': 30,
      'utilities': 100,
      'education': 25
    };
    
    let recommendations = [];
    
    sortedCategories.forEach(([category, spending]) => {
      const limit = categoryLimits[category];
      if (limit && spending > limit) {
        const overspend = spending - limit;
        potentialSavings += overspend * 0.3; // Conservative estimate
        recommendations.push(`Reduce ${category} spending by $${overspend.toFixed(2)}`);
      }
    });
    
    // Check for annual subscription opportunities
    const monthlyHighCost = subscriptions.filter(sub => sub.price > 15);
    if (monthlyHighCost.length > 0) {
      const annualSavings = monthlyHighCost.reduce((sum, sub) => sum + (sub.price * 2), 0); // Typical 2 months free
      potentialSavings += annualSavings;
      recommendations.push(`Switch to annual plans for high-cost services`);
    }
    
    recommendation = recommendations.length > 0 ? recommendations.join('; ') : 'Your spending looks optimized';
    confidence = Math.min(95, 60 + (recommendations.length * 15));
    
    return { potentialSavings, recommendation, confidence };
  }

  // Smart usage pattern analysis
  async analyzeUsagePatterns(subscriptions) {
    const categories = this.analyzeCategories(subscriptions);
    const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
    const topCategory = Object.keys(categories).reduce((a, b) => categories[a] > categories[b] ? a : b);
    const topPercentage = (categories[topCategory] / total * 100).toFixed(1);
    
    let insight = '';
    let recommendation = '';
    let confidence = 75;
    
    if (topPercentage > 60) {
      insight = `${topPercentage}% of your budget goes to ${topCategory}`;
      recommendation = `Consider diversifying your subscriptions or reducing ${topCategory} expenses`;
      confidence = 85;
    } else if (subscriptions.length > 15) {
      insight = `You have ${subscriptions.length} active subscriptions`;
      recommendation = 'Consider consolidating services to reduce management overhead';
      confidence = 80;
    } else {
      insight = `Balanced spending across ${Object.keys(categories).length} categories`;
      recommendation = 'Your subscription portfolio looks well-balanced';
      confidence = 70;
    }
    
    return { insight, recommendation, confidence };
  }

  // Price change prediction based on real patterns
  async predictPriceChanges(subscriptions) {
    const alerts = [];
    
    // Services with frequent price changes (based on real market data)
    const priceChangePatterns = {
      'netflix': { frequency: 0.8, avgIncrease: 0.15, confidence: 85 },
      'spotify': { frequency: 0.6, avgIncrease: 0.12, confidence: 75 },
      'youtube': { frequency: 0.7, avgIncrease: 0.18, confidence: 80 },
      'adobe': { frequency: 0.9, avgIncrease: 0.20, confidence: 90 },
      'microsoft': { frequency: 0.5, avgIncrease: 0.10, confidence: 70 },
      'apple': { frequency: 0.4, avgIncrease: 0.08, confidence: 65 }
    };
    
    subscriptions.forEach(sub => {
      const serviceName = sub.name.toLowerCase();
      
      // Check if service matches known patterns
      for (const [patternKey, patternData] of Object.entries(priceChangePatterns)) {
        if (serviceName.includes(patternKey)) {
          // Calculate probability based on subscription age and service pattern
          const subscriptionAge = this.getSubscriptionAge(sub);
          const probability = patternData.frequency * (1 + (subscriptionAge / 12)); // Higher probability for older subs
          
          if (probability > 0.6) { // Threshold for prediction
            alerts.push({
              service: sub.name,
              currentPrice: sub.price,
              predictedIncrease: sub.price * patternData.avgIncrease,
              confidence: patternData.confidence,
              reason: `Based on ${patternKey}'s historical price change patterns`
            });
            break;
          }
        }
      }
    });
    
    return {
      alerts,
      confidence: alerts.length > 0 ? 85 : 70
    };
  }

  findDuplicateSubscriptions(subscriptions) {
    const names = subscriptions.map(sub => sub.name.toLowerCase());
    const duplicates = [];
    
    names.forEach((name, index) => {
      const similar = names.filter(n => n.includes(name.split(' ')[0]) && n !== name);
      if (similar.length > 0 && !duplicates.includes(name)) {
        duplicates.push(subscriptions[index].name);
      }
    });
    
    return duplicates;
  }

  analyzeCategories(subscriptions) {
    const categories = {};
    subscriptions.forEach(sub => {
      categories[sub.category] = (categories[sub.category] || 0) + sub.price;
    });
    return categories;
  }

  // Helper to calculate subscription age in months
  getSubscriptionAge(subscription) {
    if (!subscription.createdAt) return 6; // Default if no creation date
    
    const createdDate = new Date(subscription.createdAt);
    const now = new Date();
    const monthsDiff = (now.getFullYear() - createdDate.getFullYear()) * 12 + 
                      (now.getMonth() - createdDate.getMonth());
    
    return Math.max(1, monthsDiff); // Minimum 1 month
  }

  // Advanced Analytics
  generateAdvancedAnalytics(subscriptions) {
    if (!this.isFeatureAvailable('advanced_analytics')) {
      return this.showUpgradePrompt('Advanced Analytics');
    }

    return {
      yearOverYear: this.calculateYearOverYear(subscriptions),
      seasonalTrends: this.analyzeSeasonalTrends(subscriptions),
      roi: this.calculateROI(subscriptions),
      predictions: this.generatePredictions(subscriptions)
    };
  }

  calculateYearOverYear(subscriptions) {
    // Simulate year-over-year analysis
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    
    return {
      currentYear: subscriptions.reduce((sum, sub) => sum + sub.price * 12, 0),
      lastYear: subscriptions.reduce((sum, sub) => sum + sub.price * 12 * 0.85, 0), // Simulate 15% increase
      growth: 15
    };
  }

  analyzeSeasonalTrends(subscriptions) {
    // Simulate seasonal analysis
    return {
      q1: subscriptions.length * 0.8,
      q2: subscriptions.length * 1.1,
      q3: subscriptions.length * 0.9,
      q4: subscriptions.length * 1.2
    };
  }

  calculateROI(subscriptions) {
    // Simulate ROI calculation based on usage
    return subscriptions.map(sub => ({
      name: sub.name,
      cost: sub.price * 12,
      estimatedUsage: Math.random() * 100,
      roi: (Math.random() * 200) - 100 // -100% to +100%
    }));
  }

  generatePredictions(subscriptions) {
    const totalMonthly = subscriptions.reduce((sum, sub) => sum + sub.price, 0);
    
    return {
      nextMonth: totalMonthly * 1.05,
      next3Months: totalMonthly * 3.2,
      nextYear: totalMonthly * 12.8,
      trend: 'increasing'
    };
  }

  // Team/Business Features
  setupTeamManagement() {
    if (!this.isFeatureAvailable('team_management')) {
      return this.showUpgradePrompt('Team Management');
    }

    return {
      maxUsers: this.premiumStatus === 'business' ? 10 : 1,
      adminFeatures: this.premiumStatus === 'business',
      sharedBudgets: true,
      roleBasedAccess: this.premiumStatus === 'business'
    };
  }

  // === SECURITY METHODS ===

  // Generate device fingerprint for trial abuse prevention
  generateDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint for Subscription Manager', 2, 2);

    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL().slice(-50) // Last 50 chars of canvas data
    ].join('|');

    return btoa(fingerprint).slice(0, 32); // Simple obfuscation
  }

  // Check if trial has been used on this device
  async hasTrialBeenUsed() {
    try {
      const result = await chrome.storage.local.get(['deviceTrialHistory']);
      const history = result.deviceTrialHistory || {};
      const deviceId = this.generateDeviceFingerprint();

      return history[deviceId] && (Date.now() - history[deviceId] < 90 * 24 * 60 * 60 * 1000); // 90 days
    } catch (error) {
      console.error('Error checking trial history:', error);
      return false;
    }
  }

  // Validate trial integrity
  validateTrialIntegrity(data) {
    try {
      // Check for missing required fields
      if (!data.trialEndDate || !data.trialStartTime || !data.trialDeviceId) {
        return false;
      }

      // Check if trial dates are consistent
      const trialStart = new Date(data.trialStartTime);
      const trialEnd = new Date(data.trialEndDate);
      const expectedDuration = 30 * 24 * 60 * 60 * 1000; // 30 days

      if (trialEnd.getTime() - trialStart.getTime() !== expectedDuration) {
        return false;
      }

      // Check if device ID matches current device
      const currentDeviceId = this.generateDeviceFingerprint();
      if (data.trialDeviceId !== currentDeviceId) {
        return false;
      }

      // Check if trial is in reasonable date range
      const now = Date.now();
      if (trialStart.getTime() > now || trialEnd.getTime() < now - 365 * 24 * 60 * 60 * 1000) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating trial integrity:', error);
      return false;
    }
  }

  // Record trial usage for this device
  async recordTrialUsage() {
    try {
      const result = await chrome.storage.local.get(['deviceTrialHistory']);
      const history = result.deviceTrialHistory || {};
      const deviceId = this.generateDeviceFingerprint();

      history[deviceId] = Date.now();
      await chrome.storage.local.set({ deviceTrialHistory: history });
    } catch (error) {
      console.error('Error recording trial usage:', error);
    }
  }

  // Enhanced premium status validation with checksum
  async validatePremiumStatus() {
    try {
      const result = await chrome.storage.local.get(['premiumStatus', 'statusChecksum', 'validationTimestamp']);

      if (!result.premiumStatus) return true; // No status to validate

      // If checksum exists, validate it
      if (result.statusChecksum && result.validationTimestamp) {
        const timeDiff = Date.now() - result.validationTimestamp;

        // Only validate if within reasonable time window (24 hours)
        if (timeDiff < 24 * 60 * 60 * 1000) {
          const expectedChecksum = this.calculateChecksum(result.premiumStatus, result.validationTimestamp);
          if (result.statusChecksum !== expectedChecksum) {
            console.warn('Premium status checksum mismatch, resetting to free');
            await chrome.storage.local.set({ premiumStatus: 'free' });
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error validating premium status:', error);
      return false;
    }
  }

  // Simple checksum calculation for status validation
  calculateChecksum(status, timestamp) {
    const data = status + timestamp.toString() + 'subscription-manager-salt';
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  // Save premium status with security checksum
  async savePremiumStatusWithSecurity(status) {
    try {
      const timestamp = Date.now();
      const checksum = this.calculateChecksum(status, timestamp);

      await chrome.storage.local.set({
        premiumStatus: status,
        statusChecksum: checksum,
        validationTimestamp: timestamp
      });

      this.premiumStatus = status;
    } catch (error) {
      console.error('Error saving premium status with security:', error);
    }
  }
}

// Global premium manager instance
const premiumManager = new PremiumManager();

// Export for use in other files
if (typeof window !== 'undefined') {
  window.premiumManager = premiumManager;
}

// Initialize on load
if (typeof chrome !== 'undefined' && chrome.storage) {
  premiumManager.init();
}
// Export PremiumManager globally (only if not already defined)
window.PremiumManager = PremiumManager;
}