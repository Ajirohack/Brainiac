module.exports = {
  verbose: true,
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/tests/**',
    '!**/migrations/**',
    '!**/seeders/**',
    '!**/config/**',
  ],
  setupFilesAfterEnv: ['./tests/setupTests.js'],
  testTimeout: 30000, // 30 second timeout
  forceExit: true,
  detectOpenHandles: true,
  logHeapUsage: true,
}
