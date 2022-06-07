module.exports = {
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testMatch: [
    '<rootDir>/src/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/test/**/*.test.{js,jsx,ts,tsx}'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  clearMocks: true,
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 88,
      functions: 100,
      lines: 95,
      statements: 95,
    },
    './src/APIBasedAuth.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  }
};
