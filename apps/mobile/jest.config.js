/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/react-native/extend-expect'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: [
    'node_modules/(?!(' + [
      'react-native',
      '@react-native(-community)?',
      'expo(nent)?',
      '@expo(nent)?/.*',
      '@expo-google-fonts/.*',
      'react-navigation',
      '@react-navigation/.*',
      '@unimodules/.*',
      'unimodules',
      '@sentry/.*',
      'sentry-expo',
      'native-base',
      'react-native-svg',
      'react-native-reanimated',
      'react-native-gesture-handler',
      'posthog-react-native',
    ].join('|') + '))',
  ],
  moduleNameMapper: {
    '^@berg/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    // Mock native modules that can't run in Node
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.ts',
    '^@sentry/react-native$': '<rootDir>/__mocks__/@sentry/react-native.ts',
    '^posthog-react-native$': '<rootDir>/__mocks__/posthog-react-native.ts',
  },
  coveragePathIgnorePatterns: ['/node_modules/', '/__mocks__/'],
};
