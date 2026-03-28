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
    // Supabase adapters require real DB
    '!src/adapters/repositories/Supabase*.ts',
    // Upstash requires live Redis
    '!src/adapters/cache/UpstashCacheAdapter.ts',
    // Cocos engine bridge
    '!src/shared/engine/slotEngine.ts',
    // Entry point only calls listen()
    '!src/infrastructure/fastify/server.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
};

export default config;
