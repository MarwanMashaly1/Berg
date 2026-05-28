import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import { magicLinkClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';
import { Config } from './config';

if (__DEV__) console.log('[auth] baseURL:', Config.apiUrl);

export const authClient = createAuthClient({
  baseURL: Config.apiUrl,
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
