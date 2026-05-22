/**
 * Soak test — 30 VUs, 1 hour.
 * Goal: detect memory leaks, connection pool exhaustion over time,
 *       cache GC correctness, and pg-boss job queue growth.
 *
 * Check mid-run:
 *   SELECT count(*) FROM pgboss.job WHERE state = 'created';
 *   -- Should stay near 0 (jobs draining fast)
 *
 * Check after:
 *   -- Memory trend on Fly.io should be flat, not growing
 *   -- Supabase active connections should stay stable
 *
 * Usage:
 *   k6 run k6/run-soak.js -e BASE_URL=https://icebreaker-api-staging.fly.dev
 */
export { default as fullFlow } from './scenarios/05-full-flow.js';

export const options = {
  scenarios: {
    soak: {
      executor:  'constant-vus',
      vus:       30,
      duration:  '1h',
      exec:      'fullFlow',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.005'],
    cache_hit_rate:    ['rate>0.65'],
  },
};
