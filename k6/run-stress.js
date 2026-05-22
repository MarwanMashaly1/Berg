/**
 * Stress test — ramp 10 → 200 VUs over 15 minutes.
 * Goal: find where the system breaks (DB pool, memory, CPU).
 *
 * Expect:
 *   - p95 latency to climb gradually
 *   - Error rate to spike around the saturation point
 *   - Note the VU count where errors start (that's your current limit)
 *
 * Usage:
 *   k6 run k6/run-stress.js -e BASE_URL=https://icebreaker-api-staging.fly.dev
 */
export { default as fullFlow } from './scenarios/05-full-flow.js';

export const options = {
  scenarios: {
    stress_ramp: {
      executor: 'ramping-vus',
      exec:     'fullFlow',
      stages: [
        { duration: '2m',  target: 10  },  // warm up
        { duration: '3m',  target: 50  },  // normal load
        { duration: '3m',  target: 100 },  // heavy load
        { duration: '3m',  target: 150 },  // stress
        { duration: '2m',  target: 200 },  // peak stress
        { duration: '2m',  target: 0   },  // cool down
      ],
    },
  },
  // Intentionally relaxed — we're looking for where it breaks, not enforcing pass/fail
  thresholds: {
    http_req_failed:   ['rate<0.1'],    // alert at 10% errors (not 0.5%)
    http_req_duration: ['p(95)<3000'],  // alert at 3s (not 500ms)
  },
};
