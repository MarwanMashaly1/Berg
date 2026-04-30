import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { rateLimiter, PLACES_LIMITS } from '../lib/rate-limiter.js';
import {
  placesCache, NEARBY_TTL_MS, AUTOCOMPLETE_TTL_MS, DETAIL_TTL_MS, roundCoord,
} from '../lib/places-cache.js';
import type { auth } from '../auth.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

// ── Category → Places API (New) type mapping ──────────────────────────────────

const CATEGORY_TYPE_MAP: Record<string, string | null> = {
  food:     'restaurant',
  outdoors: 'park',
  catchup:  'cafe',
  movies:   'movie_theater',
  active:   'gym',
  party:    'cafe',
  gaming:   'amusement_center',
  travel:   null,
  creative: 'art_gallery',
};

// ── Haversine distance ────────────────────────────────────────────────────────

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

// ── Validate lat/lng ──────────────────────────────────────────────────────────

function parseCoords(lat?: string, lng?: string): { lat: number; lng: number } | null {
  const latN = parseFloat(lat ?? '');
  const lngN = parseFloat(lng ?? '');
  if (!isFinite(latN) || !isFinite(lngN)) return null;
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) return null;
  return { lat: latN, lng: lngN };
}

// ── Shared fetch helper with API key header ───────────────────────────────────

function placesRequest(url: string, key: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
    },
    body: JSON.stringify(body),
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

export const placesRoutes = new Hono<{ Variables: Variables }>();
placesRoutes.use('*', requireAuth);

// ─── GET /api/places/nearby ───────────────────────────────────────────────────
//
// Uses Places API (New) — searchNearby endpoint.
// Cached per (category, lat±0.01°, lng±0.01°) for 30 minutes.
// Rate limited: 30 calls per user per hour.
//
placesRoutes.get('/nearby', async (c) => {
  const me = c.get('user')!;

  const rl = rateLimiter.check(`${me.id}:places/nearby`, PLACES_LIMITS.nearby.limit, PLACES_LIMITS.nearby.windowMs);
  if (!rl.allowed) {
    c.header('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return c.json({ places: [] });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  const category = c.req.query('category') ?? '';
  const coords = parseCoords(c.req.query('lat'), c.req.query('lng'));

  console.log('[places/nearby]', { hasKey: !!key, category, coords });

  if (!key || !coords) return c.json({ places: [] });

  const type = CATEGORY_TYPE_MAP[category];
  console.log('[places/nearby] type:', type);
  if (!type) return c.json({ places: [] });

  const cacheKey = `nearby:${category}:${roundCoord(coords.lat)}:${roundCoord(coords.lng)}`;
  const cached = placesCache.get(cacheKey);
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json({ places: cached });
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.shortFormattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours',
      },
      body: JSON.stringify({
        includedTypes: [type],
        maxResultCount: 5,
        rankPreference: 'POPULARITY',
        locationRestriction: {
          circle: {
            center: { latitude: coords.lat, longitude: coords.lng },
            radius: 2000.0,
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string; status?: string } };
      console.error('[places/nearby] Google API error:', res.status, err?.error?.message);
      return c.json({ places: [] });
    }

    const data = await res.json() as {
      places?: Array<{
        id: string;
        displayName?: { text: string };
        shortFormattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
        location: { latitude: number; longitude: number };
        currentOpeningHours?: { openNow?: boolean };
      }>;
    };

    const places = (data.places ?? []).map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? '',
      address: p.shortFormattedAddress ?? '',
      lat: p.location.latitude,
      lng: p.location.longitude,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      distanceKm: distanceKm(coords.lat, coords.lng, p.location.latitude, p.location.longitude),
      isOpen: p.currentOpeningHours?.openNow ?? null,
    }));

    placesCache.set(cacheKey, places, NEARBY_TTL_MS);
    c.header('X-Cache', 'MISS');
    return c.json({ places });
  } catch (e) {
    console.error('[places/nearby] fetch failed:', e);
    return c.json({ places: [] });
  }
});

// ─── GET /api/places/autocomplete ────────────────────────────────────────────
//
// Uses Places API (New) — autocomplete endpoint.
// Session tokens group all keystrokes + 1 detail call into one billing event.
// Cached per (query, lat±0.01°, lng±0.01°) for 10 minutes.
// Rate limited: 120 calls per user per 10 minutes.
//
placesRoutes.get('/autocomplete', async (c) => {
  const me = c.get('user')!;

  const rl = rateLimiter.check(`${me.id}:places/search`, PLACES_LIMITS.search.limit, PLACES_LIMITS.search.windowMs);
  if (!rl.allowed) {
    c.header('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return c.json({ places: [] });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  const q = (c.req.query('q') ?? '').trim();
  const coords = parseCoords(c.req.query('lat'), c.req.query('lng'));
  const sessionToken = c.req.query('sessionToken') ?? '';

  console.log('[places/autocomplete]', { hasKey: !!key, q, coords });

  if (!key || q.length < 2) return c.json({ places: [] });

  const latKey = coords ? roundCoord(coords.lat) : 'x';
  const lngKey = coords ? roundCoord(coords.lng) : 'x';
  const cacheKey = `autocomplete:${q.toLowerCase()}:${latKey}:${lngKey}`;
  const cached = placesCache.get(cacheKey);
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json({ places: cached });
  }

  try {
    const body: Record<string, unknown> = {
      input: q,
      includedPrimaryTypes: ['establishment'],
    };
    if (sessionToken) body.sessionToken = sessionToken;
    if (coords) {
      body.locationBias = {
        circle: {
          center: { latitude: coords.lat, longitude: coords.lng },
          radius: 50000.0,
        },
      };
    }

    const res = await placesRequest(
      'https://places.googleapis.com/v1/places:autocomplete',
      key,
      body,
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      console.error('[places/autocomplete] Google API error:', res.status, err?.error?.message);
      return c.json({ places: [] });
    }

    const data = await res.json() as {
      suggestions?: Array<{
        placePrediction?: {
          placeId: string;
          structuredFormat?: {
            mainText?: { text: string };
            secondaryText?: { text: string };
          };
          text?: { text: string };
          distanceMeters?: number;
        };
      }>;
    };

    const places = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .slice(0, 5)
      .map((p) => ({
        placeId: p.placeId,
        name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        address: p.structuredFormat?.secondaryText?.text ?? '',
        lat: null,
        lng: null,
        rating: null,
        distanceKm: p.distanceMeters != null ? Math.round(p.distanceMeters / 100) / 10 : null,
        isOpen: null,
      }));

    placesCache.set(cacheKey, places, AUTOCOMPLETE_TTL_MS);
    c.header('X-Cache', 'MISS');
    return c.json({ places });
  } catch (e) {
    console.error('[places/autocomplete] fetch failed:', e);
    return c.json({ places: [] });
  }
});

// ─── GET /api/places/detail ───────────────────────────────────────────────────
//
// Uses Places API (New) — place details endpoint.
// Cached per placeId for 1 hour.
// Rate limited: 50 calls per user per hour.
//
placesRoutes.get('/detail', async (c) => {
  const me = c.get('user')!;

  const rl = rateLimiter.check(`${me.id}:places/detail`, PLACES_LIMITS.detail.limit, PLACES_LIMITS.detail.windowMs);
  if (!rl.allowed) {
    c.header('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return c.json({ error: 'Too many requests' }, 429);
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = c.req.query('placeId') ?? '';
  const sessionToken = c.req.query('sessionToken') ?? '';

  if (!key || !placeId) return c.json({ error: 'Missing placeId' }, 400);

  const cacheKey = `detail:${placeId}`;
  const cached = placesCache.get(cacheKey);
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json(cached);
  }

  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken);

    const res = await fetch(url.toString(), {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,rating',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      console.error('[places/detail] Google API error:', res.status, err?.error?.message);
      return c.json({ error: 'Place not found' }, 404);
    }

    const data = await res.json() as {
      id: string;
      displayName?: { text: string };
      formattedAddress?: string;
      location: { latitude: number; longitude: number };
      rating?: number;
    };

    const detail = {
      placeId: data.id,
      name: data.displayName?.text ?? '',
      address: data.formattedAddress ?? '',
      lat: data.location.latitude,
      lng: data.location.longitude,
      rating: data.rating ?? null,
    };

    placesCache.set(cacheKey, detail, DETAIL_TTL_MS);
    c.header('X-Cache', 'MISS');
    return c.json(detail);
  } catch (e) {
    console.error('[places/detail] fetch failed:', e);
    return c.json({ error: 'Failed to fetch place details' }, 500);
  }
});

// ─── GET /api/places/cache-stats ─────────────────────────────────────────────
placesRoutes.get('/cache-stats', (c) => {
  return c.json(placesCache.stats());
});
