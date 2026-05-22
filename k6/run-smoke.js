/**
 * Smoke test — 2 VUs, 1 minute.
 * Goal: confirm correctness before any real load. Zero errors expected.
 *
 * Usage:
 *   k6 run k6/run-smoke.js -e BASE_URL=http://localhost:3000
 */
export { default as promptFlow }    from './scenarios/01-prompt.js';
export { default as discoveryFlow } from './scenarios/02-discovery.js';
export { default as profileFlow }   from './scenarios/04-profile.js';
export { default as fullFlow }      from './scenarios/05-full-flow.js';

export const options = {
  scenarios: {
    prompt: {
      executor:  'constant-vus',
      vus:       1,
      duration:  '60s',
      exec:      'promptFlow',
    },
    discovery: {
      executor:  'constant-vus',
      vus:       1,
      duration:  '60s',
      exec:      'discoveryFlow',
    },
    profile: {
      executor:  'constant-vus',
      vus:       1,
      duration:  '60s',
      exec:      'profileFlow',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.001'],   // near-zero errors in smoke
    http_req_duration: ['p(95)<2000'],
  },
};
