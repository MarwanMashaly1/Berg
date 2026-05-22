/**
 * Shared helpers: base URL, check wrappers, tag builders.
 */
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const cacheHitRate  = new Rate('cache_hit_rate');
export const errorRate     = new Rate('error_rate');
export const p95Latency    = new Trend('p95_latency', true);

/**
 * Wrap a k6 Response with standard checks.
 * Records cache-hit and error metrics automatically.
 */
export function assertOk(res, label) {
  const ok = check(res, {
    [`${label} status 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
  errorRate.add(!ok);

  const cacheHeader = res.headers['X-Cache'];
  if (cacheHeader !== undefined) {
    cacheHitRate.add(cacheHeader === 'HIT');
  }

  return ok;
}

/** Standard thresholds used across all run scripts. */
export const THRESHOLDS = {
  http_req_duration:         ['p(95)<500', 'p(99)<1000'],
  http_req_failed:           ['rate<0.005'],
  cache_hit_rate:            ['rate>0.6'],
  error_rate:                ['rate<0.005'],
};

/** Thresholds for write-heavy tests (relaxed latency). */
export const WRITE_THRESHOLDS = {
  http_req_duration:  ['p(95)<1000', 'p(99)<2000'],
  http_req_failed:    ['rate<0.01'],
  error_rate:         ['rate<0.01'],
};
