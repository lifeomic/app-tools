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
      branches: 80,
      statements: 80,
      functions: 80,
      lines: 80
    }
  }
};
