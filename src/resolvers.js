const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Decimal = require('decimal.js');
const { pool } = require('./db');

const resolvers = {
  register: async ({ input }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { email, password } = input;
      
      // Check if user exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      
      if (existingUser.rows.length) {
        throw new Error('Email already exists');
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (id, email, password_hash, auth_provider)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, auth_provider, created_at, updated_at`,
        [uuidv4(), email, hashedPassword, 'email']
      );
      
      const user = userResult.rows[0];

      // Create default settings
      await client.query(
        `INSERT INTO settings (user_id)
         VALUES ($1)`,
        [user.id]
      );

      await client.query('COMMIT');

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

      return {
        token,
        user
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  login: async ({ input }) => {
    const { email, password } = input;
    
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    const user = result.rows[0];
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

    return {
      token,
      user: {
        ...user,
        password_hash: undefined
      }
    };
  },

  createTransaction: async ({ input }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO transactions 
         (id, user_id, type, amount, category_id, sub_category_id, date, notes, attachment_url, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          uuidv4(),
          context.userId,
          input.type,
          input.amount,
          input.categoryId,
          input.subCategoryId,
          input.date,
          input.notes,
          input.attachmentUrl,
          input.source
        ]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  },

  updateTransaction: async ({ id, input }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE transactions 
         SET type = $1, amount = $2, category_id = $3, sub_category_id = $4,
             date = $5, notes = $6, attachment_url = $7, source = $8,
             updated_at = CURRENT_TIMESTAMP, version = CURRENT_TIMESTAMP
         WHERE id = $9 AND user_id = $10
         RETURNING *`,
        [
          input.type,
          input.amount,
          input.categoryId,
          input.subCategoryId,
          input.date,
          input.notes,
          input.attachmentUrl,
          input.source,
          id,
          context.userId
        ]
      );

      if (!result.rows[0]) {
        throw new Error('Transaction not found or not authorized');
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  },

  deleteTransaction: async ({ id }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const client = await pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, context.userId]
      );

      if (!result.rows[0]) {
        throw new Error('Transaction not found or not authorized');
      }

      return true;
    } finally {
      client.release();
    }
  },

  dashboard: async (args, context) => {
    if (!context.userId) throw new Error('Not authenticated');
    
    const client = await pool.connect();
    try {
      const incomeResult = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM transactions
         WHERE user_id = $1 AND type = 'INCOME'`,
        [context.userId]
      );

      const expensesResult = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM transactions
         WHERE user_id = $1 AND type = 'EXPENSE'`,
        [context.userId]
      );

      const budgetsResult = await client.query(
        `SELECT b.*, c.name as category_name
         FROM budgets b
         JOIN categories c ON b.category_id = c.id
         WHERE b.user_id = $1`,
        [context.userId]
      );

      const recentTransactionsResult = await client.query(
        `SELECT t.*, c.name as category_name
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = $1
         ORDER BY t.date DESC
         LIMIT 5`,
        [context.userId]
      );

      return {
        totalIncome: new Decimal(incomeResult.rows[0].total),
        totalExpenses: new Decimal(expensesResult.rows[0].total),
        budgets: budgetsResult.rows,
        recentTransactions: recentTransactionsResult.rows
      };
    } finally {
      client.release();
    }
  },

  transactions: async ({ filter }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const client = await pool.connect();
    try {
      let query = `
        SELECT t.*, c.name as category_name
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1
      `;
      
      const params = [context.userId];
      let paramCount = 1;

      if (filter) {
        if (filter.fromDate) {
          paramCount++;
          query += ` AND t.date >= $${paramCount}`;
          params.push(filter.fromDate);
        }
        if (filter.toDate) {
          paramCount++;
          query += ` AND t.date <= $${paramCount}`;
          params.push(filter.toDate);
        }
        if (filter.categoryIds) {
          paramCount++;
          query += ` AND t.category_id = ANY($${paramCount}::uuid[])`;
          params.push(filter.categoryIds);
        }
        if (filter.type) {
          paramCount++;
          query += ` AND t.type = $${paramCount}`;
          params.push(filter.type);
        }
      }

      query += ' ORDER BY t.date DESC';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  },

  syncData: async ({ input }, context) => {
    if (!context.userId) throw new Error('Not authenticated');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const conflicts = [];
      const { lastSyncTimestamp, transactions: newTransactions, budgets: newBudgets } = input;

      // Process transactions
      const syncedTransactions = [];
      if (newTransactions) {
        for (const transaction of newTransactions) {
          const existing = await client.query(
            'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
            [transaction.id, context.userId]
          );

          if (existing.rows[0] && new Date(existing.rows[0].version) > new Date(lastSyncTimestamp)) {
            conflicts.push({
              id: existing.rows[0].id,
              field: 'transaction',
              serverValue: JSON.stringify(existing.rows[0]),
              clientValue: JSON.stringify(transaction)
            });
            syncedTransactions.push(existing.rows[0]);
          } else {
            const result = await client.query(
              `INSERT INTO transactions 
               (id, user_id, type, amount, category_id, sub_category_id, date, notes, attachment_url, source)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               ON CONFLICT (id) DO UPDATE
               SET type = EXCLUDED.type, amount = EXCLUDED.amount,
                   category_id = EXCLUDED.category_id, sub_category_id = EXCLUDED.sub_category_id,
                   date = EXCLUDED.date, notes = EXCLUDED.notes,
                   attachment_url = EXCLUDED.attachment_url, source = EXCLUDED.source,
                   version = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
               RETURNING *`,
              [
                transaction.id,
                context.userId,
                transaction.type,
                transaction.amount,
                transaction.categoryId,
                transaction.subCategoryId,
                transaction.date,
                transaction.notes,
                transaction.attachmentUrl,
                transaction.source
              ]
            );
            syncedTransactions.push(result.rows[0]);
          }
        }
      }

      // Process budgets
      const syncedBudgets = [];
      if (newBudgets) {
        for (const budget of newBudgets) {
          const existing = await client.query(
            'SELECT * FROM budgets WHERE id = $1 AND user_id = $2',
            [budget.id, context.userId]
          );

          if (existing.rows[0] && new Date(existing.rows[0].version) > new Date(lastSyncTimestamp)) {
            conflicts.push({
              id: existing.rows[0].id,
              field: 'budget',
              serverValue: JSON.stringify(existing.rows[0]),
              clientValue: JSON.stringify(budget)
            });
            syncedBudgets.push(existing.rows[0]);
          } else {
            const result = await client.query(
              `INSERT INTO budgets 
               (id, user_id, category_id, monthly_limit, start_date, end_date)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO UPDATE
               SET category_id = EXCLUDED.category_id,
                   monthly_limit = EXCLUDED.monthly_limit,
                   start_date = EXCLUDED.start_date,
                   end_date = EXCLUDED.end_date,
                   version = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               RETURNING *`,
              [
                budget.id,
                context.userId,
                budget.categoryId,
                budget.monthlyLimit,
                budget.startDate,
                budget.endDate
              ]
            );
            syncedBudgets.push(result.rows[0]);
          }
        }
      }

      // Log sync attempt
      await client.query(
        `INSERT INTO sync_logs 
         (id, user_id, data_type, local_id, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          uuidv4(),
          context.userId,
          'ALL',
          uuidv4(),
          conflicts.length > 0 ? 'CONFLICT' : 'SYNCED'
        ]
      );

      await client.query('COMMIT');

      return {
        transactions: syncedTransactions,
        budgets: syncedBudgets,
        conflicts
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
};

module.exports = resolvers;