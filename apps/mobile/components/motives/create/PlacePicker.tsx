import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { C, Fonts } from '../../../constants/theme';
import {
  getNearbyPlaces,
  autocompletePlaces,
  getPlaceDetail,
  PlaceSuggestion,
  PlaceDetail,
} from '../../../lib/api';
import { trackPlaceSelected } from '../../../lib/analytics';
import { CATEGORY_MAP, CategoryKey } from '../../../constants/motives';
import * as Location from 'expo-location';

type CatKey = CategoryKey;

function getCat(key: string) {
  return CATEGORY_MAP[key as CatKey] ?? { label: key, color: C.textTertiary, emoji: '•', tint: 'rgba(150,150,150,0.08)' };
}

// ─── Distance formatting (client-side) ───────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// ─── PlacePicker — location search with Google Places ────────────────────────
//
// State machine:
//  idle      → no input, showing nearby suggestions (or empty if no location)
//  searching → user is typing, showing autocomplete results
//  selected  → a place has been chosen, show confirmation card
//
export function PlacePicker({
  category,
  value,
  onChange,
}: {
  category: CatKey | null;
  value: PlaceDetail | null;
  onChange: (place: PlaceDetail | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null); // null = asking
  const [nearby, setNearby] = useState<PlaceSuggestion[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null); // placeId being fetched
  // Session token groups all keystrokes + 1 detail call into one $17 billing event.
  // Generated on first keystroke of each search session, reset after selection.
  const sessionTokenRef = useRef<string>('');
  function getOrCreateSessionToken(): string {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    return sessionTokenRef.current;
  }

  // Request location permission and load nearby on mount.
  // getLastKnownPositionAsync is instant (cached GPS) — seeds nearby immediately.
  // getCurrentPositionAsync then refreshes with a live fix in the background.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setLocationGranted(granted);
      if (!granted) return;

      // Instant: use last cached position to show nearby right away
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
      if (last) {
        setUserLat(last.coords.latitude);
        setUserLng(last.coords.longitude);
      }

      // Background: freshen with a live fix (updates nearby silently if moved)
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLat(pos.coords.latitude);
      setUserLng(pos.coords.longitude);
    })();
  }, []);

  // Load nearby when location becomes available and category is known
  useEffect(() => {
    if (userLat === null || userLng === null || !category) return;
    setNearbyLoading(true);
    getNearbyPlaces(category, userLat, userLng)
      .then(({ places }) => setNearby(places))
      .catch(() => setNearby([]))
      .finally(() => setNearbyLoading(false));
  }, [userLat, userLng, category]);

  // Debounced autocomplete — fires after 350ms, minimum 2 characters
  // Uses Google Places Autocomplete API (11× cheaper than Text Search)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      setSearchLoading(true);
      autocompletePlaces(q, userLat ?? undefined, userLng ?? undefined, getOrCreateSessionToken())
        .then(({ places }) => setSearchResults(places))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query, userLat, userLng]);

  async function handleSelect(suggestion: PlaceSuggestion) {
    setSelectingId(suggestion.placeId);
    try {
      // If the suggestion already has lat/lng (nearby results), use it directly —
      // no Detail API call needed. Only autocomplete results have null lat/lng.
      if (suggestion.lat !== null && suggestion.lng !== null) {
        trackPlaceSelected({ source: 'nearby', category: category ?? '' });
        onChange({
          placeId: suggestion.placeId,
          name: suggestion.name,
          address: suggestion.address ?? '',
          lat: suggestion.lat,
          lng: suggestion.lng,
          rating: suggestion.rating ?? null,
        });
      } else {
        // Autocomplete selection — fetch Detail to get coordinates.
        // Passing sessionToken closes the billing session (one flat fee covers all prior keystrokes).
        const token = sessionTokenRef.current;
        sessionTokenRef.current = ''; // reset so next search gets a new token
        const detail = await getPlaceDetail(suggestion.placeId, token || undefined);
        trackPlaceSelected({ source: 'search', category: category ?? '' });
        onChange(detail);
      }
      setQuery('');
      setSearchResults([]);
    } catch {
      // Fallback: use what we have, lat/lng will be 0 (stored but not critical)
      onChange({
        placeId: suggestion.placeId,
        name: suggestion.name,
        address: suggestion.address ?? '',
        lat: suggestion.lat ?? 0,
        lng: suggestion.lng ?? 0,
        rating: suggestion.rating ?? null,
      });
      setQuery('');
    } finally {
      setSelectingId(null);
    }
  }

  function handleClear() {
    onChange(null);
    setQuery('');
    setSearchResults([]);
  }

  // ── Selected state — show place card ──
  if (value) {
    const selectedDist =
      userLat !== null && userLng !== null && value.lat && value.lng
        ? formatDist(haversineKm(userLat, userLng, value.lat, value.lng))
        : null;

    return (
      <View style={ppStyles.selectedCard}>
        <View style={ppStyles.selectedInfo}>
          <Text style={ppStyles.selectedName} numberOfLines={1}>{value.name}</Text>
          {value.address ? (
            <Text style={ppStyles.selectedAddr} numberOfLines={1}>{value.address}</Text>
          ) : null}
          <View style={ppStyles.selectedMeta}>
            {value.rating ? (
              <View style={ppStyles.ratingRow}>
                <Text style={ppStyles.ratingStars}>{'★'.repeat(Math.round(value.rating))}{'☆'.repeat(5 - Math.round(value.rating))}</Text>
                <Text style={ppStyles.ratingNum}>{value.rating.toFixed(1)}</Text>
              </View>
            ) : null}
            {selectedDist && (
              <Text style={ppStyles.selectedDistText}>{selectedDist} away</Text>
            )}
          </View>
        </View>
        <View style={ppStyles.checkBadge}>
          <View style={ppStyles.checkmark} />
        </View>
        <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={ppStyles.clearX} />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Searching / idle state ──
  const showResults = query.trim().length > 0;
  const listToShow = showResults ? searchResults : nearby;
  const isLoading = showResults ? searchLoading : nearbyLoading;

  const cat = category ? getCat(category) : null;
  const sectionLabel = showResults
    ? 'SEARCH RESULTS'
    : locationGranted && cat
      ? `${cat.label.toUpperCase()} NEAR YOU`
      : 'SEARCH A PLACE';

  return (
    <View>
      {/* Search input */}
      <View style={ppStyles.searchBox}>
        {/* Magnifier icon */}
        <View style={ppStyles.searchIconWrap}>
          <View style={ppStyles.searchCircle} />
          <View style={ppStyles.searchHandle} />
        </View>
        <TextInput
          style={ppStyles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={
            locationGranted === false
              ? 'Search for a place…'
              : cat
                ? `Search ${cat.label.toLowerCase()} venues…`
                : 'Search a place…'
          }
          placeholderTextColor={C.textTertiary}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={ppStyles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Location denied hint */}
      {locationGranted === false && !showResults && (
        <Text style={ppStyles.noLocHint}>
          Enable location for nearby suggestions, or type to search.
        </Text>
      )}

      {/* Suggestions / results */}
      {(isLoading) ? (
        <ActivityIndicator color={C.primary} size="small" style={{ marginTop: 14 }} />
      ) : listToShow.length > 0 ? (
        <View style={ppStyles.listWrap}>
          <Text style={ppStyles.listLabel}>{sectionLabel}</Text>
          {listToShow.map((place) => (
            <TouchableOpacity
              key={place.placeId}
              style={ppStyles.placeRow}
              onPress={() => handleSelect(place)}
              disabled={selectingId === place.placeId}
              activeOpacity={0.75}
            >
              {/* Category color circle */}
              <View style={[ppStyles.placeIcon, { backgroundColor: cat?.tint ?? C.surfaceAlt }]}>
                <Text style={{ fontSize: 16 }}>{cat?.emoji ?? '📍'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ppStyles.placeName} numberOfLines={1}>{place.name}</Text>
                <Text style={ppStyles.placeAddr} numberOfLines={1}>{place.address}</Text>
              </View>
              <View style={ppStyles.placeMeta}>
                {place.distanceKm != null && (
                  <Text style={ppStyles.placeDist}>{formatDist(place.distanceKm)}</Text>
                )}
                {place.isOpen != null && (
                  <Text style={[ppStyles.placeOpen, !place.isOpen && ppStyles.placeClosed]}>
                    {place.isOpen ? 'Open' : 'Closed'}
                  </Text>
                )}
              </View>
              {selectingId === place.placeId && (
                <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 6 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : showResults && !searchLoading ? (
        <Text style={ppStyles.noResults}>No places found — try a different search</Text>
      ) : null}
    </View>
  );
}

const ppStyles = StyleSheet.create({
  // Search input
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 4,
  },
  searchIconWrap: { width: 15, height: 15, position: 'relative', flexShrink: 0 },
  searchCircle: {
    width: 11, height: 11, borderRadius: 6,
    borderWidth: 2, borderColor: C.textTertiary,
    position: 'absolute', top: 0, left: 0,
  },
  searchHandle: {
    width: 5, height: 2, backgroundColor: C.textTertiary,
    borderRadius: 1, position: 'absolute', bottom: 0, right: 0,
    transform: [{ rotate: '-45deg' }],
  },
  searchInput: {
    flex: 1, fontFamily: Fonts.body,
    fontSize: 13, color: C.text, padding: 0,
  },
  clearText: { fontFamily: Fonts.body, fontSize: 13, color: C.textTertiary },
  noLocHint: {
    fontFamily: Fonts.body, fontSize: 12,
    color: C.textTertiary, marginTop: 6, marginBottom: 4,
  },
  // Suggestions list
  listWrap: { marginTop: 8 },
  listLabel: {
    fontFamily: Fonts.bodySemiBold, fontSize: 11,
    color: C.textTertiary, letterSpacing: 0.6,
    marginBottom: 6, marginLeft: 2,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  placeIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  placeName: {
    fontFamily: Fonts.bodySemiBold, fontSize: 13,
    color: C.text, marginBottom: 2,
  },
  placeAddr: { fontFamily: Fonts.body, fontSize: 11, color: C.textSecondary },
  placeMeta: { alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  placeDist: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary },
  placeOpen: {
    fontFamily: Fonts.bodySemiBold, fontSize: 10,
    color: '#2D6A4F',
    backgroundColor: 'rgba(45,106,79,0.1)',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  placeClosed: {
    color: '#C53030', backgroundColor: 'rgba(197,48,48,0.08)',
  },
  noResults: {
    fontFamily: Fonts.body, fontSize: 13,
    color: C.textTertiary, textAlign: 'center', marginTop: 16,
  },
  // Selected card
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2D6A4F',
    padding: 13,
    shadowColor: '#2D6A4F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  selectedInfo: { flex: 1 },
  selectedName: {
    fontFamily: Fonts.bodySemiBold, fontSize: 13,
    color: C.text, marginBottom: 2,
  },
  selectedAddr: { fontFamily: Fonts.body, fontSize: 11, color: C.textSecondary },
  selectedMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
  selectedDistText: { fontFamily: Fonts.body, fontSize: 11, color: C.primary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingStars: { fontSize: 11, color: '#F5A623', letterSpacing: 1 },
  ratingNum: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary },
  // Green check badge
  checkBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#2D6A4F',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  checkmark: {
    width: 6, height: 10,
    borderRightWidth: 2, borderBottomWidth: 2,
    borderColor: '#fff',
    transform: [{ rotate: '45deg' }, { translateY: -1 }],
  },
  // × to deselect
  clearX: {
    width: 14, height: 14,
    backgroundColor: C.textTertiary,
    borderRadius: 7,
    opacity: 0.5,
  },
});
