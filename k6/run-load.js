/**
 * Load test — 50 VUs, 10 minutes.
 * Represents normal production traffic across all core scenarios.
 *
 * Usage:
 *   k6 run k6/run-load.js -e BASE_URL=https://icebreaker-api-staging.fly.dev
 *
 * Watch during run:
 *   - Supabase: active connections (stay < 20)
 *   - Fly.io: memory (stay < 200 MB), CPU (stay < 70%)
 *   - X-Cache: HIT rate logged in k6 output (goal > 60%)
 */
export { default as fullFlow }      from './scenarios/05-full-flow.js';
export { default as profileFlow }   from './scenarios/04-profile.js';
export { default as discoveryFlow } from './scenarios/02-discovery.js';
export { default as chatFlow }      from './scenarios/03-chat.js';

export const options = {
  scenarios: {
    // Full journey: 30 VUs — primary load
    full_journey: {
      executor:  'constant-vus',
      vus:       30,
      duration:  '10m',
      exec:      'fullFlow',
    },
    // Profile reads: 10 VUs — heavy read path
    profile_reads: {
      executor:  'constant-vus',
      vus:       10,
      duration:  '10m',
      exec:      'profileFlow',
    },
    // Discovery reads: 5 VUs
    discovery_reads: {
      executor:  'constant-vus',
      vus:       5,
      duration:  '10m',
      exec:      'discoveryFlow',
    },
    // Chat: 5 VUs
    chat: {
      executor:  'constant-vus',
      vus:       5,
      duration:  '10m',
      exec:      'chatFlow',
    },
  },
  thresholds: {
    http_req_duration:               ['p(95)<500', 'p(99)<1000'],
    http_req_failed:                 ['rate<0.005'],
    cache_hit_rate:                  ['rate>0.6'],
    'http_req_duration{exec:fullFlow}':      ['p(95)<800'],
    'http_req_duration{exec:profileFlow}':   ['p(95)<300'],
    'http_req_duration{exec:discoveryFlow}': ['p(95)<600'],
  },
};
