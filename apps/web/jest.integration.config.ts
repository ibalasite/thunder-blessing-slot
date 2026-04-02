import type { Config } from 'jest';
import * as path from 'path';
import * as fs from 'fs';

// Auto-load env: prefer .env.local (dev secrets), fall back to .env.example (CI defaults).
// Parses KEY=VALUE lines so no dotenv dependency is needed.
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const envLocal = path.resolve(__dirname, '.env.local');
const envExample = path.resolve(__dirname, '.env.example');
loadEnvFile(fs.existsSync(envLocal) ? envLocal : envExample);

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/tests/integration/**/*.integration.test.ts'],
  testTimeout: 30000,
};

export default config;
