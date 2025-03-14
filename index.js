const express = require('express');
const { createHandler } = require('graphql-http/lib/use/express');
const schema = require('./src/schema');
const resolvers = require('./src/resolvers');
const auth = require('./src/auth');
const { initDb } = require('./src/db');

const app = express();
const port = process.env.PORT || 4000;

// Initialize database
initDb().catch(console.error);

app.use(
  '/graphql',
  createHandler({
    schema,
    rootValue: resolvers,
    context: async (req) => {
      return auth(req.raw);
    }
  })
);

app.listen(port, () =>
  console.log(`Running a GraphQL API server at http://localhost:${port}/`)
);