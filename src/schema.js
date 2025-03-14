const { buildSchema } = require('graphql');

const schema = buildSchema(`
  scalar Date
  scalar Decimal

  type User {
    id: ID!
    email: String!
    authProvider: String!
    createdAt: Date!
    updatedAt: Date!
    settings: Settings
  }

  type Settings {
    id: ID!
    userId: ID!
    theme: Theme!
    notificationPreferences: String
    syncOptions: String
    createdAt: Date!
    updatedAt: Date!
  }

  enum Theme {
    LIGHT
    DARK
  }

  type Transaction {
    id: ID!
    userId: ID!
    type: TransactionType!
    amount: Decimal!
    categoryId: ID!
    subCategoryId: ID
    date: Date!
    notes: String
    attachmentUrl: String
    source: TransactionSource!
    smsId: ID
    version: Date!
    createdAt: Date!
    updatedAt: Date!
    category: Category!
  }

  enum TransactionType {
    INCOME
    EXPENSE
  }

  enum TransactionSource {
    MANUAL
    SMS_IMPORT
  }

  type Category {
    id: ID!
    userId: ID
    name: String!
    description: String
    orderIndex: Int!
  }

  type Budget {
    id: ID!
    userId: ID!
    categoryId: ID!
    monthlyLimit: Decimal!
    startDate: Date!
    endDate: Date
    version: Date!
    createdAt: Date!
    updatedAt: Date!
    category: Category!
  }

  type SyncLog {
    id: ID!
    userId: ID!
    dataType: String!
    localId: ID!
    serverId: ID
    sequence: Date!
    status: SyncStatus!
    lastAttempt: Date!
  }

  enum SyncStatus {
    PENDING
    SYNCED
    CONFLICT
  }

  type SMSLog {
    id: ID!
    userId: ID!
    sender: String!
    message: String!
    receivedAt: Date!
    parsedStatus: ParseStatus!
    linkedTransactionId: ID
  }

  enum ParseStatus {
    PENDING
    PARSED
    REJECTED
  }

  type Notification {
    id: ID!
    userId: ID!
    type: NotificationType!
    message: String!
    readFlag: Boolean!
    createdAt: Date!
  }

  enum NotificationType {
    SYNC
    REMINDER
    ALERT
  }

  input TransactionFilterInput {
    fromDate: Date
    toDate: Date
    categoryIds: [ID!]
    sources: [TransactionSource!]
    type: TransactionType
  }

  type DashboardOverview {
    totalIncome: Decimal!
    totalExpenses: Decimal!
    budgets: [Budget!]!
    recentTransactions: [Transaction!]!
  }

  type Query {
    me: User
    dashboard(userId: ID!): DashboardOverview!
    transactions(filter: TransactionFilterInput): [Transaction!]!
    transaction(id: ID!): Transaction
    budgets: [Budget!]!
    budget(id: ID!): Budget
    categories: [Category!]!
  }

  input RegisterInput {
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input TransactionInput {
    type: TransactionType!
    amount: Decimal!
    categoryId: ID!
    subCategoryId: ID
    date: Date!
    notes: String
    attachmentUrl: String
    source: TransactionSource!
  }

  input BudgetInput {
    categoryId: ID!
    monthlyLimit: Decimal!
    startDate: Date!
    endDate: Date
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Mutation {
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    createTransaction(input: TransactionInput!): Transaction!
    updateTransaction(id: ID!, input: TransactionInput!): Transaction!
    deleteTransaction(id: ID!): Boolean!
    createBudget(input: BudgetInput!): Budget!
    updateBudget(id: ID!, input: BudgetInput!): Budget!
    deleteBudget(id: ID!): Boolean!
    syncData(input: SyncInput!): SyncResponse!
  }

  input SyncInput {
    lastSyncTimestamp: Date!
    transactions: [TransactionInput!]
    budgets: [BudgetInput!]
  }

  type SyncResponse {
    transactions: [Transaction!]!
    budgets: [Budget!]!
    conflicts: [Conflict!]!
  }

  type Conflict {
    id: ID!
    field: String!
    serverValue: String!
    clientValue: String!
  }
`);

module.exports = schema;