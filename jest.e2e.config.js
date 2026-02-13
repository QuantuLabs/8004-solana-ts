export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  roots: ['<rootDir>/tests/e2e-solana'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        types: ['jest', 'node'],
        isolatedModules: true,
      },
      useESM: true,
      diagnostics: {
        ignoreCodes: [151002],
      },
    }],
  },
  setupFiles: ['<rootDir>/tests/e2e-solana/setup-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 180000, // 3 minutes for e2e tests
  maxWorkers: 1,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage/e2e',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(ipfs-http-client)/)',
  ],
};
