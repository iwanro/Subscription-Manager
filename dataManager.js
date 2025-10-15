// Enhanced data management utilities for Subscription Manager
class DataManager {
  constructor() {
    this.subscriptions = [];
    this.settings = {};
    this.categories = ['entertainment', 'productivity', 'utilities', 'education', 'other'];
    this.billingCycles = ['monthly', 'quarterly', 'yearly', 'custom'];
    this.init();
  }

  async init() {
    await this.loadAllData();
    return this; // Return the instance when initialized
  }

  async loadAllData() {
    try {
      const result = await chrome.storage.local.get([
        'subscriptions', 
        'settings', 
        'categories',
        'paymentHistory',
        'budgetSettings'
      ]);
      console.log('Loaded data from storage:', result);

      this.subscriptions = result.subscriptions || [];
      this.settings = result.settings || this.getDefaultSettings();
      this.categories = result.categories || this.categories;
      this.paymentHistory = result.paymentHistory || [];
      this.budgetSettings = result.budgetSettings || this.getDefaultBudgetSettings();

      console.log('Processed data:', {
        subscriptions: this.subscriptions,
        settings: this.settings,
        categories: this.categories,
        paymentHistory: this.paymentHistory,
        budgetSettings: this.budgetSettings
      });

    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  getDefaultSettings() {
    return {
      notifications: {
        browser: true,
        email: false,
        frequency: 'daily',
        beforeExpiry: 3,
        priceChanges: true
      },
      currency: 'USD',
      dateFormat: 'MM/DD/YYYY',
      theme: 'light',
      backup: {
        autoBackup: false,
        backupFrequency: 'weekly'
      }
    };
  }

  getDefaultBudgetSettings() {
    return {
      monthlyBudget: 0,
      categoryBudgets: {},
      alertThreshold: 80
    };
  }

  async saveAllData() {
    try {
      await chrome.storage.local.set({
        subscriptions: this.subscriptions,
        settings: this.settings,
        categories: this.categories,
        paymentHistory: this.paymentHistory,
        budgetSettings: this.budgetSettings
      });
    } catch (error) {
      console.error('Error saving data:', error);
      throw error;
    }
  }

  // Subscription management
  async addSubscription(subscriptionData) {
    if (!subscriptionData || typeof subscriptionData !== 'object') {
      throw new Error('Invalid subscription data: must be an object');
    }

    const subscription = {
      id: this.generateId(),
      name: subscriptionData.name ? subscriptionData.name.trim() : '',
      price: subscriptionData.price ? parseFloat(subscriptionData.price) : 0,
      category: subscriptionData.category || 'other',
      billingCycle: subscriptionData.billingCycle || 'monthly',
      startDate: subscriptionData.startDate || new Date().toISOString(),
      nextPaymentDate: subscriptionData.nextPaymentDate,
      isActive: subscriptionData.isActive !== undefined ? subscriptionData.isActive : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: subscriptionData.notes || '',
      website: subscriptionData.website || '',
      trialPeriod: subscriptionData.trialPeriod || 0
    };

    if (!subscription.name) {
      throw new Error('Subscription name is required');
    }

    this.subscriptions.push(subscription);
    await this.saveAllData();
    return subscription;
  }

  async updateSubscription(id, updates) {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid subscription ID: must be a string');
    }

    if (!updates || typeof updates !== 'object') {
      throw new Error('Invalid updates: must be an object');
    }

    const index = this.subscriptions.findIndex(sub => sub.id === id);
    if (index !== -1) {
      const updatedSubscription = {
        ...this.subscriptions[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // Validate required fields
      if (!updatedSubscription.name) {
        throw new Error('Subscription name is required');
      }

      this.subscriptions[index] = updatedSubscription;
      await this.saveAllData();
      return updatedSubscription;
    }

    throw new Error(`Subscription with ID ${id} not found`);
  }

  async deleteSubscription(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid subscription ID: must be a string');
    }

    const index = this.subscriptions.findIndex(sub => sub.id === id);
    if (index !== -1) {
      this.subscriptions.splice(index, 1);
      await this.saveAllData();
      return true;
    }

    throw new Error(`Subscription with ID ${id} not found`);
  }

  // Advanced Subscription Management
  async pauseSubscription(id) {
    const subscription = this.subscriptions.find(sub => sub.id === id);
    if (subscription && subscription.isActive) {
      return await this.updateSubscription(id, { 
        isActive: false,
        pausedAt: new Date().toISOString()
      });
    }
    return null;
  }

  async resumeSubscription(id) {
    const subscription = this.subscriptions.find(sub => sub.id === id);
    if (subscription && !subscription.isActive) {
      const updates = { isActive: true };
      
      // Calculate new next payment date if subscription was paused
      if (subscription.pausedAt && subscription.nextPaymentDate) {
        const pausedDate = new Date(subscription.pausedAt);
        const nextPaymentDate = new Date(subscription.nextPaymentDate);
        const daysPaused = Math.floor((Date.now() - pausedDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysPaused > 0) {
          const newNextPayment = new Date(nextPaymentDate.getTime() + daysPaused * 24 * 60 * 60 * 1000);
          updates.nextPaymentDate = newNextPayment.toISOString();
        }
      }
      
      return await this.updateSubscription(id, updates);
    }
    return null;
  }

  async skipNextPayment(id) {
    const subscription = this.subscriptions.find(sub => sub.id === id);
    if (subscription && subscription.isActive && subscription.nextPaymentDate) {
      const nextPayment = new Date(subscription.nextPaymentDate);
      let newNextPayment;
      
      switch (subscription.billingCycle) {
        case 'monthly':
          newNextPayment = new Date(nextPayment.setMonth(nextPayment.getMonth() + 1));
          break;
        case 'quarterly':
          newNextPayment = new Date(nextPayment.setMonth(nextPayment.getMonth() + 3));
          break;
        case 'yearly':
          newNextPayment = new Date(nextPayment.setFullYear(nextPayment.getFullYear() + 1));
          break;
        default:
          newNextPayment = new Date(nextPayment.setMonth(nextPayment.getMonth() + 1));
      }
      
      return await this.updateSubscription(id, {
        nextPaymentDate: newNextPayment.toISOString(),
        skippedPayments: (subscription.skippedPayments || 0) + 1
      });
    }
    return null;
  }

  getSubscriptionHistory(id) {
    const subscription = this.subscriptions.find(sub => sub.id === id);
    if (!subscription) return [];
    
    return [{
      date: subscription.createdAt,
      type: 'created',
      amount: subscription.price,
      description: 'Subscription created'
    }];
  }

  // Category management
  async addCategory(categoryName) {
    if (!this.categories.includes(categoryName)) {
      this.categories.push(categoryName);
      await this.saveAllData();
    }
  }

  async removeCategory(categoryName) {
    const index = this.categories.indexOf(categoryName);
    if (index !== -1 && this.categories.length > 1) {
      this.categories.splice(index, 1);
      
      // Move subscriptions from removed category to 'other'
      this.subscriptions = this.subscriptions.map(sub => 
        sub.category === categoryName ? { ...sub, category: 'other' } : sub
      );
      
      await this.saveAllData();
    }
  }

  // Analytics and reporting
  getMonthlySpending() {
    const monthlySpending = {};
    const now = new Date();
    
    this.subscriptions.forEach(sub => {
      if (sub.isActive) {
        const monthlyRate = this.calculateMonthlyRate(sub);
        const monthYear = now.toISOString().slice(0, 7);
        
        monthlySpending[monthYear] = (monthlySpending[monthYear] || 0) + monthlyRate;
      }
    });

    return monthlySpending;
  }

  getSpendingByCategory() {
    const spendingByCategory = {};
    
    this.subscriptions.forEach(sub => {
      if (sub.isActive) {
        const monthlyRate = this.calculateMonthlyRate(sub);
        spendingByCategory[sub.category] = (spendingByCategory[sub.category] || 0) + monthlyRate;
      }
    });

    return spendingByCategory;
  }

  calculateMonthlyRate(subscription) {
    switch (subscription.billingCycle) {
      case 'monthly':
        return subscription.price;
      case 'quarterly':
        return subscription.price / 3;
      case 'yearly':
        return subscription.price / 12;
      case 'custom':
        return subscription.price; // Assume monthly for custom
      default:
        return subscription.price;
    }
  }

  getAnnualProjection() {
    const monthlyTotal = Object.values(this.getMonthlySpending()).reduce((sum, amount) => sum + amount, 0);
    return monthlyTotal * 12;
  }

  // Advanced Analytics
  getSpendingTrends() {
    const monthlyData = this.getMonthlySpending();
    const months = Object.keys(monthlyData).sort();
    
    if (months.length < 2) return { trend: 'stable', percentage: 0 };
    
    const currentMonth = months[months.length - 1];
    const previousMonth = months[months.length - 2];
    const currentAmount = monthlyData[currentMonth];
    const previousAmount = monthlyData[previousMonth];
    
    if (previousAmount === 0) return { trend: 'up', percentage: 100 };
    
    const percentageChange = ((currentAmount - previousAmount) / previousAmount) * 100;
    
    return {
      trend: percentageChange > 0 ? 'up' : percentageChange < 0 ? 'down' : 'stable',
      percentage: Math.abs(Math.round(percentageChange))
    };
  }

  getTopExpenses(limit = 5) {
    return this.subscriptions
      .filter(sub => sub.isActive)
      .map(sub => ({
        name: sub.name,
        amount: this.calculateMonthlyRate(sub),
        category: sub.category
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }

  getCategoryBreakdown() {
    const spending = this.getSpendingByCategory();
    const total = Object.values(spending).reduce((sum, amount) => sum + amount, 0);
    
    return Object.entries(spending).map(([category, amount]) => ({
      category,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0
    })).sort((a, b) => b.amount - a.amount);
  }

  getYearlySpending() {
    const monthlyData = this.getMonthlySpending();
    const yearlyData = {};
    
    Object.entries(monthlyData).forEach(([monthYear, amount]) => {
      const year = monthYear.split('-')[0];
      yearlyData[year] = (yearlyData[year] || 0) + amount;
    });
    
    return yearlyData;
  }

  // Budget checking
  checkBudget() {
    const monthlySpending = this.getMonthlySpending();
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentSpending = monthlySpending[currentMonth] || 0;
    
    if (this.budgetSettings.monthlyBudget > 0) {
      const percentage = (currentSpending / this.budgetSettings.monthlyBudget) * 100;
      return {
        currentSpending,
        monthlyBudget: this.budgetSettings.monthlyBudget,
        percentage: Math.round(percentage),
        isOverBudget: percentage > 100,
        isNearBudget: percentage > this.budgetSettings.alertThreshold
      };
    }
    
    return null;
  }

  // Utility methods
  generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  formatDate(dateString, format = 'MM/DD/YYYY') {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US');
  }

  // Export/Import utilities
  exportData(format = 'json') {
    const data = {
      subscriptions: this.subscriptions,
      settings: this.settings,
      categories: this.categories,
      paymentHistory: this.paymentHistory,
      budgetSettings: this.budgetSettings,
      exportedAt: new Date().toISOString(),
      version: '2.0',
      totalSubscriptions: this.subscriptions.length,
      activeSubscriptions: this.subscriptions.filter(s => s.isActive).length,
      totalMonthlySpending: Object.values(this.getMonthlySpending()).reduce((sum, amount) => sum + amount, 0)
    };

    switch (format) {
      case 'csv':
        return this.convertToCSV(data);
      case 'json-min':
        return JSON.stringify(data);
      case 'xml':
        return this.convertToXML(data);
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  convertToCSV(data) {
    let csv = 'Name,Price,Currency,Category,Billing Cycle,Next Payment,Status,Website,Notes\n';
    
    data.subscriptions.forEach(sub => {
      const name = sub.name.replace(/"/g, '""');
      const website = (sub.website || '').replace(/"/g, '""');
      const notes = (sub.notes || '').replace(/"/g, '""');
      csv += `"${name}",${sub.price},${data.settings.currency || 'USD'},${sub.category},${sub.billingCycle},${sub.nextPaymentDate},${sub.isActive ? 'Active' : 'Inactive'},"${website}","${notes}"\n`;
    });
    
    // Add summary section
    csv += '\nSUMMARY\n';
    csv += `Total Subscriptions,${data.totalSubscriptions}\n`;
    csv += `Active Subscriptions,${data.activeSubscriptions}\n`;
    csv += `Total Monthly Spending,${data.totalMonthlySpending}\n`;
    csv += `Export Date,${data.exportedAt}\n`;
    
    return csv;
  }

  convertToXML(data) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<subscriptionManager exportDate="' + data.exportedAt + '" version="' + data.version + '">\n';
    
    // Subscriptions
    xml += '  <subscriptions>\n';
    data.subscriptions.forEach(sub => {
      xml += '    <subscription>\n';
      xml += '      <name>' + this.escapeXML(sub.name) + '</name>\n';
      xml += '      <price>' + sub.price + '</price>\n';
      xml += '      <category>' + sub.category + '</category>\n';
      xml += '      <billingCycle>' + sub.billingCycle + '</billingCycle>\n';
      xml += '      <nextPayment>' + (sub.nextPaymentDate || '') + '</nextPayment>\n';
      xml += '      <status>' + (sub.isActive ? 'active' : 'inactive') + '</status>\n';
      xml += '      <website>' + this.escapeXML(sub.website || '') + '</website>\n';
      xml += '      <notes>' + this.escapeXML(sub.notes || '') + '</notes>\n';
      xml += '    </subscription>\n';
    });
    xml += '  </subscriptions>\n';
    
    // Summary
    xml += '  <summary>\n';
    xml += '    <totalSubscriptions>' + data.totalSubscriptions + '</totalSubscriptions>\n';
    xml += '    <activeSubscriptions>' + data.activeSubscriptions + '</activeSubscriptions>\n';
    xml += '    <totalMonthlySpending>' + data.totalMonthlySpending + '</totalMonthlySpending>\n';
    xml += '  </summary>\n';
    
    xml += '</subscriptionManager>';
    return xml;
  }

  escapeXML(str) {
    return str.replace(/[<>&"']/g, function (match) {
      switch (match) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '"': return '&quot;';
        case "'": return '&apos;';
        default: return match;
      }
    });
  }

  async importData(jsonData, merge = false) {
    try {
      // Validate input
      if (!jsonData || typeof jsonData !== 'string') {
        throw new Error('Invalid import data: must be a JSON string');
      }
      
      const data = JSON.parse(jsonData);
      
      // Validate data structure
      if (!data.version) {
        throw new Error('Invalid import data: missing version information');
      }
      
      if (merge) {
        // Merge strategy with validation
        const newSubscriptions = data.subscriptions || [];
        const validSubscriptions = newSubscriptions.filter(sub => 
          sub && typeof sub === 'object' && sub.name && sub.price !== undefined
        );
        
        this.subscriptions = [...this.subscriptions, ...validSubscriptions];
        this.settings = { ...this.settings, ...(data.settings || {}) };
        this.categories = [...new Set([...this.categories, ...(data.categories || [])])];
        
        if (data.paymentHistory) {
          this.paymentHistory = [...this.paymentHistory, ...data.paymentHistory];
        }
        
        if (data.budgetSettings) {
          this.budgetSettings = { ...this.budgetSettings, ...data.budgetSettings };
        }
        
        console.log(`Imported ${validSubscriptions.length} subscriptions (merge mode)`);
        
      } else {
        // Replace strategy with validation
        this.subscriptions = this.validateSubscriptions(data.subscriptions || []);
        this.settings = { ...this.getDefaultSettings(), ...(data.settings || {}) };
        this.categories = data.categories && Array.isArray(data.categories) 
          ? data.categories 
          : this.categories;
        this.paymentHistory = data.paymentHistory && Array.isArray(data.paymentHistory)
          ? data.paymentHistory
          : [];
        this.budgetSettings = data.budgetSettings && typeof data.budgetSettings === 'object'
          ? { ...this.getDefaultBudgetSettings(), ...data.budgetSettings }
          : this.getDefaultBudgetSettings();
        
        console.log(`Imported ${this.subscriptions.length} subscriptions (replace mode)`);
      }

      // Clean up any duplicate IDs
      this.deduplicateSubscriptionIds();
      
      await this.saveAllData();
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  validateSubscriptions(subscriptions) {
    if (!Array.isArray(subscriptions)) return [];
    
    return subscriptions.filter(sub => {
      return sub && 
             typeof sub === 'object' &&
             sub.name && typeof sub.name === 'string' &&
             sub.price !== undefined && typeof sub.price === 'number' &&
             sub.category && typeof sub.category === 'string';
    }).map(sub => ({
      ...sub,
      id: sub.id || this.generateId(),
      isActive: sub.isActive !== undefined ? sub.isActive : true,
      createdAt: sub.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  deduplicateSubscriptionIds() {
    const idMap = new Map();
    
    this.subscriptions = this.subscriptions.map(sub => {
      if (idMap.has(sub.id)) {
        // Duplicate ID found, generate a new one
        return { ...sub, id: this.generateId() };
      }
      idMap.set(sub.id, true);
      return sub;
    });
  }
}

// Create global instance
var dataManager = new DataManager();

if (typeof window !== 'undefined') {
  window.dataManager = dataManager;
}