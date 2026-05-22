/**
 * Spike test — 0 → 150 VUs in 10 seconds, hold 2 min, back to 0.
 * Simulates: push notification sent to all users → everyone opens the app.
 *
 * Key metrics to watch:
 *   - Time-to-first-response during the spike (pre-cached vs cold)
 *   - DB connection pool saturation (connections queued or rejected)
 *   - Memory spike on the Fly.io VM
 *
 * Usage:
 *   k6 run k6/run-spike.js -e BASE_URL=https://icebreaker-api-staging.fly.dev
 */
export { default as discoveryFlow } from './scenarios/02-discovery.js';
export { default as profileFlow }   from './scenarios/04-profile.js';

export const options = {
  scenarios: {
    // Discovery tab is what opens after a match notification
    discovery_spike: {
      executor: 'ramping-vus',
      exec:     'discoveryFlow',
      stages: [
        { duration: '10s', target: 150 },  // instant spike
        { duration: '2m',  target: 150 },  // hold
        { duration: '30s', target: 0   },  // drain
      ],
    },
    // Profile reads fire simultaneously
    profile_spike: {
      executor: 'ramping-vus',
      exec:     'profileFlow',
      stages: [
        { duration: '10s', target: 50  },
        { duration: '2m',  target: 50  },
        { duration: '30s', target: 0   },
      ],
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.05'],   // 5% error tolerance for spikes
    http_req_duration: ['p(95)<2000'],
  },
};
