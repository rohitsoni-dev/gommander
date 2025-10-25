module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.d.ts',
    '!src/index.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // testTimeout: 30000, // Moved to project-specific configs
  verbose: true,
  // Run tests in the same process to avoid circular JSON serialization issues
  maxWorkers: 1,
  // Separate test configurations for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/*.test.js'],
      testTimeout: 10000,
      maxWorkers: 1
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/*.test.js'],
      testTimeout: 60000, // Longer timeout for integration tests
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      maxWorkers: 1
    }
  ]
};