/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: ['<rootDir>/tests/**/*.test.ts'],
    moduleNameMapper: {
        // Cocos Creator 的 'cc' 模組在測試中以空 stub 替代
        '^cc$': '<rootDir>/tests/__mocks__/cc.ts',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: '<rootDir>/tsconfig.test.json',
        }],
    },
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'assets/scripts/SlotEngine.ts',
        'assets/scripts/GameConfig.ts',
        'assets/scripts/WinChecker.ts',
    ],
    // 單元測試快，整合測試可能跑久一點
    testTimeout: 60000,
};
