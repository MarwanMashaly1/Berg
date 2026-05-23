import { captureError } from './analytics';

export const log = {
  info(msg: string, context?: Record<string, unknown>) {
    if (__DEV__) console.log(`[info] ${msg}`, context);
  },
  warn(msg: string, context?: Record<string, unknown>) {
    if (__DEV__) console.warn(`[warn] ${msg}`, context);
  },
  error(msg: string, err?: unknown, context?: Record<string, unknown>) {
    if (__DEV__) console.error(`[error] ${msg}`, err, context);
    if (!__DEV__) captureError(err ?? new Error(msg), { msg, ...context });
  },
};
