console.log('=== Test Setup ===');
console.log('Setting up test environment...');

// Set test environment if not already set
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Load environment variables
require('dotenv').config({ path: '.env.test' });

// Configure test database
const { sequelize } = require('../src/models');

// Global test setup
beforeAll(async () => {
  console.log('Running global test setup...');
  try {
    // Sync database
    await sequelize.sync({ force: true });
    console.log('Test database synced');
  } catch (error) {
    console.error('Test setup error:', error);
    throw error;
  }
});

afterAll(async () => {
  console.log('Running global test teardown...');
  try {
    await sequelize.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Test teardown error:', error);
  }
});

console.log('Test setup complete');
