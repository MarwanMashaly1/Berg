import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { magicLinkClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
console.log('[auth] baseURL:', BASE_URL);

export const authClient = createAuthClient({
  baseURL: BASE_URL,
  plugins: [
    expoClient({
      scheme: 'berg',
      storagePrefix: 'berg',
      storage: SecureStore,
    }),
    magicLinkClient(),
  ],
});

export type Session = typeof authClient.$Infer.Session;
