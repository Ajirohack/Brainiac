const { User } = require('../src/models');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

/**
 * Create a test user with admin privileges
 * @param {Object} [overrides] - Override default user properties
 * @returns {Promise<User>} Created user instance
 */
async function createTestUser(overrides = {}) {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('testpassword123', salt);
  
  const defaultUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    username: 'testuser',
    password: hashedPassword,
    isActive: true,
    isAdmin: true,
    emailVerified: true,
    ...overrides,
  };

  // Create or update the test user
  const [user] = await User.upsert(defaultUser, {
    returning: true,
  });

  return user;
}

/**
 * Generate a JWT token for a test user
 * @param {Object} user - User object with id and email
 * @returns {string} JWT token
 */
function generateTestToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email,
      role: user.isAdmin ? 'admin' : 'user',
    },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

/**
 * Get an auth token for a test user
 * @param {Object} [user] - Optional user object, will create one if not provided
 * @returns {Promise<string>} JWT token
 */
async function getAuthToken(user = null) {
  let testUser = user;
  if (!testUser) {
    testUser = await createTestUser();
  }
  return generateTestToken(testUser);
}

/**
 * Clean up test data
 */
async function cleanTestData() {
  // Truncate all tables except migrations
  const models = Object.values(require('../src/models'));
  
  for (const model of models) {
    if (model.destroy) { // Only for models that have the destroy method
      await model.destroy({ where: {}, force: true });
    }
  }
}

module.exports = {
  createTestUser,
  generateTestToken,
  getAuthToken,
  cleanTestData,
};
