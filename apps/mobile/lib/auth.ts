import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { magicLinkClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
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
