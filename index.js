const express = require('express');
const { createHandler } = require('graphql-http/lib/use/express');
const schema = require('./src/schema');
const resolvers = require('./src/resolvers');
const auth = require('./src/auth');

const app = express();

app.use(
  '/',
  createHandler({
    schema,
    rootValue: resolvers,
    context: async (req) => {
      return auth(req.raw);
    }
  })
);

app.listen(4000, () =>
  console.log('Running a GraphQL API server at http://localhost:4000/')
);