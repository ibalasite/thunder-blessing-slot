import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/app/layout.tsx',
    // Supabase adapters require real DB — covered in integration tests (2A-11)
    '!src/adapters/supabase/**',
    // UpstashCacheAdapter requires live Redis — covered in integration tests
    '!src/adapters/cache/UpstashCacheAdapter.ts',
    // Worker files covered separately
    '!src/worker/**',
    // Cocos engine bridge — requires real Cocos runtime (not available in Jest)
    '!src/shared/engine/slotEngine.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 90,    // Remaining misses are unreachable ?? fallback branches
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
};

export default config;
