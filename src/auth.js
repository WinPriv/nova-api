const jwt = require('jsonwebtoken');

const auth = async (req) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    try {
      const { userId } = jwt.verify(token, process.env.JWT_SECRET);
      return { userId };
    } catch (error) {
      return { userId: null };
    }
  }

  return { userId: null };
};

module.exports = auth;