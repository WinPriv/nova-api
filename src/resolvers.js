const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Decimal = require('decimal.js');

// In-memory storage (replace with your database)
const users = new Map();
const transactions = new Map();
const categories = new Map();
const budgets = new Map();
const syncLogs = new Map();
const smsLogs = new Map();
const notifications = new Map();
const settings = new Map();

const resolvers = {
  register: async ({ input }, context) => {
    const { email, password } = input;

    if (Array.from(users.values()).some(user => user.email === email)) {
      throw new Error('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      email,
      passwordHash: hashedPassword,
      authProvider: 'email',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    users.set(user.id, user);

    // Create default settings for the user
    const userSettings = {
      id: uuidv4(),
      userId: user.id,
      theme: 'LIGHT',
      notificationPreferences: JSON.stringify({ emails: true, push: true }),
      syncOptions: JSON.stringify({ autoSync: true, syncInterval: 300 }),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    settings.set(userSettings.id, userSettings);

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

    return {
      token,
      user: {
        ...user,
        passwordHash: undefined
      }
    };
  },

  login: async ({ input }) => {
    const { email, password } = input;
    
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

    return {
      token,
      user: {
        ...user,
        passwordHash: undefined
      }
    };
  },

  createTransaction: ({ input }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const transaction = {
      id: uuidv4(),
      userId: context.userId,
      ...input,
      version: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    transactions.set(transaction.id, transaction);
    return transaction;
  },

  updateTransaction: ({ id, input }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const transaction = transactions.get(id);
    if (!transaction) throw new Error('Transaction not found');
    if (transaction.userId !== context.userId) throw new Error('Not authorized');

    const updatedTransaction = {
      ...transaction,
      ...input,
      version: new Date(),
      updatedAt: new Date()
    };

    transactions.set(id, updatedTransaction);
    return updatedTransaction;
  },

  deleteTransaction: ({ id }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const transaction = transactions.get(id);
    if (!transaction) throw new Error('Transaction not found');
    if (transaction.userId !== context.userId) throw new Error('Not authorized');

    transactions.delete(id);
    return true;
  },

  createBudget: ({ input }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const budget = {
      id: uuidv4(),
      userId: context.userId,
      ...input,
      version: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    budgets.set(budget.id, budget);
    return budget;
  },

  updateBudget: ({ id, input }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const budget = budgets.get(id);
    if (!budget) throw new Error('Budget not found');
    if (budget.userId !== context.userId) throw new Error('Not authorized');

    const updatedBudget = {
      ...budget,
      ...input,
      version: new Date(),
      updatedAt: new Date()
    };

    budgets.set(id, updatedBudget);
    return updatedBudget;
  },

  deleteBudget: ({ id }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const budget = budgets.get(id);
    if (!budget) throw new Error('Budget not found');
    if (budget.userId !== context.userId) throw new Error('Not authorized');

    budgets.delete(id);
    return true;
  },

  dashboard: (args, context) => {
    if (!context.userId) throw new Error('Not authenticated');
    
    const userTransactions = Array.from(transactions.values())
      .filter(t => t.userId === context.userId);

    const totalIncome = userTransactions
      .filter(t => t.type === 'INCOME')
      .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));

    const totalExpenses = userTransactions
      .filter(t => t.type === 'EXPENSE')
      .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));

    const userBudgets = Array.from(budgets.values())
      .filter(b => b.userId === context.userId);

    return {
      totalIncome,
      totalExpenses,
      budgets: userBudgets,
      recentTransactions: userTransactions.slice(-5)
    };
  },

  transactions: ({ filter }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    let filtered = Array.from(transactions.values())
      .filter(t => t.userId === context.userId);

    if (filter) {
      if (filter.fromDate) {
        filtered = filtered.filter(t => new Date(t.date) >= new Date(filter.fromDate));
      }
      if (filter.toDate) {
        filtered = filtered.filter(t => new Date(t.date) <= new Date(filter.toDate));
      }
      if (filter.categoryIds) {
        filtered = filtered.filter(t => filter.categoryIds.includes(t.categoryId));
      }
      if (filter.type) {
        filtered = filtered.filter(t => t.type === filter.type);
      }
    }

    return filtered;
  },

  syncData: ({ input }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const { lastSyncTimestamp, transactions: newTransactions, budgets: newBudgets } = input;
    const conflicts = [];

    // Process transactions
    const syncedTransactions = newTransactions?.map(transaction => {
      const existing = Array.from(transactions.values())
        .find(t => t.id === transaction.id && t.userId === context.userId);

      if (existing && new Date(existing.version) > new Date(lastSyncTimestamp)) {
        conflicts.push({
          id: existing.id,
          field: 'transaction',
          serverValue: existing,
          clientValue: transaction
        });
        return existing;
      }

      const newTransaction = {
        ...transaction,
        userId: context.userId,
        version: new Date(),
        updatedAt: new Date()
      };
      transactions.set(newTransaction.id, newTransaction);
      return newTransaction;
    }) || [];

    // Process budgets
    const syncedBudgets = newBudgets?.map(budget => {
      const existing = Array.from(budgets.values())
        .find(b => b.id === budget.id && b.userId === context.userId);

      if (existing && new Date(existing.version) > new Date(lastSyncTimestamp)) {
        conflicts.push({
          id: existing.id,
          field: 'budget',
          serverValue: existing,
          clientValue: budget
        });
        return existing;
      }

      const newBudget = {
        ...budget,
        userId: context.userId,
        version: new Date(),
        updatedAt: new Date()
      };
      budgets.set(newBudget.id, newBudget);
      return newBudget;
    }) || [];

    // Log sync attempt
    const syncLog = {
      id: uuidv4(),
      userId: context.userId,
      dataType: 'ALL',
      sequence: new Date(),
      status: conflicts.length > 0 ? 'CONFLICT' : 'SYNCED',
      lastAttempt: new Date()
    };
    syncLogs.set(syncLog.id, syncLog);

    return {
      transactions: syncedTransactions,
      budgets: syncedBudgets,
      conflicts
    };
  }
};

module.exports = resolvers;