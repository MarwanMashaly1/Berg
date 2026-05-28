import { QueryClient } from '@tanstack/react-query';
import { authClient } from './auth';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Config } from './config';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60, // 1 hour
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Authenticated fetch wrapper.
 * Attaches the BetterAuth session cookie/bearer token automatically.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit & { phoneSessionId?: string; signal?: AbortSignal } = {}
): Promise<T> {
  const { phoneSessionId, ...fetchOptions } = options;

  const cookies = authClient.getCookie();

  // Build headers as a plain object — React Native on Android can drop requests
  // when a Headers instance is passed, even with the same values.
  const existingHeaders = fetchOptions.headers
    ? Object.fromEntries(new Headers(fetchOptions.headers).entries())
    : {};
  const headers: Record<string, string> = { ...existingHeaders };

  if (cookies) headers['Cookie'] = cookies;
  if (phoneSessionId) headers['x-phone-session-id'] = phoneSessionId;
  if (!headers['Content-Type'] && fetchOptions.body) headers['Content-Type'] = 'application/json';

  if (__DEV__) {
    const rawStored = SecureStore.getItem('berg_cookie');
    console.log(
      '[apiFetch]',
      fetchOptions.method ?? 'GET',
      `${Config.apiUrl}${path}`,
      'cookie:',
      cookies ? cookies.slice(0, 60) : 'none',
      '| raw:',
      rawStored ? rawStored.slice(0, 60) : 'NULL'
    );
  }

  const response = await fetch(`${Config.apiUrl}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (__DEV__) console.error('[apiFetch] non-ok', response.status, JSON.stringify(body).slice(0, 200));

    if (response.status === 401) {
      // Session expired — sign out and send user back to the root/login screen
      await authClient.signOut().catch(() => {});
      router.replace('/');
      throw new Error('Session expired. Please sign in again.');
    }

    let message: string;
    try {
      const json = JSON.parse(body);
      message = String(json.error || json.message || body || response.statusText || `API error ${response.status}`);
    } catch {
      message = body || response.statusText || `API error ${response.status}`;
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

// ─── Notification inbox ──────────────────────────────────────────────────────��[...]

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  data: string | null; // JSON string — parse to get { screen, motiveId, etc. }
  readAt: string | null; // null = unread
  createdAt: string;
};

export function getNotifications() {
  return apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
}

export function getUnreadCount() {
  return apiFetch<{ count: number }>('/api/notifications/unread-count');
}

export function markAllRead() {
  return apiFetch<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' });
}

export function markNotificationRead(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' });
}

// ─── Push token ─────────────────────────────────────────────────────────�[...]

export function getUserMe() {
  return apiFetch<{
    user: {
      id: string;
      name: string | null;
      email: string | null;
      displayName: string | null;
      username: string | null;
      bio: string | null;
      image: string | null;
      availabilityStatus: string;
      onboardingStep: string | null;
      onboardingCompleted: boolean | null;
      notifyPromptMatches: boolean | null;
      notifyCircleRequests: boolean | null;
      notifyMotiveInvites: boolean | null;
      showInDiscovery: boolean | null;
    } | null;
  }>('/api/users/me');
}

export function getPublicUser(userId: string) {
  return apiFetch<{
    user: {
      id: string;
      name: string | null;
      image: string | null;
      username: string | null;
      availabilityStatus: string;
      vibeTags: Array<{ emoji: string; label: string }>;
      connectionStatus: 'pending' | 'confirmed' | null;
    };
  }>(`/api/users/${userId}/public`);
}

export async function savePushToken(token: string) {
  return apiFetch<{ ok: boolean }>('/api/users/me/push-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function patchUser(fields: Record<string, unknown>) {
  return apiFetch<{ user: Record<string, unknown> }>('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export function deleteAccount() {
  return apiFetch<{ ok: boolean }>('/api/users/me', { method: 'DELETE' });
}

export async function checkUsername(username: string) {
  return apiFetch<{ available: boolean; reason?: string }>(
    `/api/users/check-username?username=${encodeURIComponent(username)}`
  );
}

export type UserSearchResult = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  connectionStatus: 'pending' | 'confirmed' | null;
};

export async function searchUsers(q: string) {
  return apiFetch<{ users: UserSearchResult[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
}

export async function syncContacts(phones: string[]) {
  return apiFetch<{ users: UserSearchResult[] }>('/api/discovery/contacts/sync', {
    method: 'POST',
    body: JSON.stringify({ phones }),
  });
}

export async function getVibeTags() {
  return apiFetch<{ tags: Array<{ id: string; label: string; emoji: string; category: string }> }>(
    '/api/vibe-tags'
  );
}

export async function getUserVibeTags() {
  return apiFetch<{ tagIds: string[] }>('/api/users/me/vibe-tags');
}

export async function postUserVibeTags(tagIds: string[]) {
  return apiFetch<{ ok: boolean; count: number }>('/api/users/me/vibe-tags', {
    method: 'POST',
    body: JSON.stringify({ tagIds }),
  });
}

// ─── Discovery ─────────────────────────────────────────────────────────�[...]

export type PromptOption = { key: string; emoji: string; text: string; index: number };

export type TodayPromptResponse = {
  prompt: {
    id: string;
    question: string;
    type: 'pick_your_camp' | 'spectrum' | 'this_or_that' | 'for_you' | 'have_you_ever';
    options: PromptOption[];
    tags: string[];
    isUniversal: boolean;
    activeDate: string;
  };
  userResponse: {
    optionKey: string;
    optionIndex: number;
    storyText: string | null;
    respondedAt: string;
  } | null;
};

export function getTodayPrompt() {
  return apiFetch<TodayPromptResponse>('/api/prompts/today');
}

export function respondToPrompt(
  promptId: string,
  body: {
    optionKey: string;
    optionIndex: number;
    storyText?: string;
  }
) {
  return apiFetch<{ ok: boolean }>(`/api/prompts/${promptId}/respond`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type MatchResult = {
  state: 'matches' | 'first_in_circle' | 'first_in_network' | 'not_answered';
  matches: Array<{
    userId: string;
    name: string | null;
    avatarUrl: string | null;
    optionKey: string | null;
    storyText: string | null;
  }>;
  adjacentMatches: Array<{
    userId: string;
    name: string | null;
    avatarUrl: string | null;
    optionKey: string | null;
    storyText: string | null;
  }>;
  totalCount: number;
};

export function getPromptMatches(promptId: string) {
  return apiFetch<MatchResult>(`/api/prompts/${promptId}/matches`);
}

// [align-2] First-class match objects
export type OpenMatch = {
  id: string;
  promptId: string;
  optionKey: string;
  status: 'pending' | 'viewed' | 'acted' | 'dismissed' | 'expired';
  expiresAt: string;
  createdAt: string;
  prompt: { question: string; options: Array<{ key: string; emoji: string; text: string }> };
  myAnswer: { key: string; emoji: string; text: string } | null;
  theirAnswer: { key: string; emoji: string; text: string } | null;
  friend: { id: string; name: string | null; avatarUrl: string | null };
};

export function getOpenMatches() {
  return apiFetch<{ matches: OpenMatch[] }>('/api/matches');
}

export function dismissMatch(matchId: string) {
  return apiFetch<{ ok: boolean }>(`/api/matches/${matchId}/dismiss`, { method: 'POST' });
}

export function viewMatch(matchId: string) {
  return apiFetch<{ ok: boolean }>(`/api/matches/${matchId}/view`, { method: 'POST' });
}

export type PersonSuggestion = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  mutualFriendName: string | null;
  sharedVibeTags: Array<{ emoji: string; label: string }>;
};

export function getDiscoveryPeople() {
  return apiFetch<{ people: PersonSuggestion[]; lastComputedAt: string | null }>('/api/discovery/people');
}

export function triggerFofRecompute() {
  return apiFetch<{ queued: boolean }>('/api/discovery/people/recompute', { method: 'POST' });
}

export type CircleSuggestion = {
  id: string;
  name: string;
  description?: string | null;
  categoryEmoji: string;
  categoryColor: string;
  coverImage: string | null;
  memberCount: number;
  friendsInsideCount: number;
  requiresApproval: boolean;
  photoUrls: string[];
};

export function getDiscoveryCircles() {
  return apiFetch<{ circles: CircleSuggestion[] }>('/api/discovery/circles');
}

export function joinCircle(circleId: string) {
  return apiFetch<{ ok: boolean; status: 'active' | 'pending'; memberCount: number; chatId: string | null }>(
    `/api/circles/${circleId}/join`,
    { method: 'POST' }
  );
}

export type PulseCard = {
  type: 'prompt_participation' | 'open_motive' | 'new_circle_member' | 'memory';
  text: string;
  emoji: string;
  actionLabel: string;
  actionTarget: { type: string; id: string };
};

export function getDiscoveryPulse() {
  return apiFetch<{ cards: PulseCard[] }>('/api/discovery/pulse');
}

// ─── Profile ──────────────────────────────────────────────────────────[...]

export type ProfileStats = { connections: number; circles: number; motives: number };
export type ProfileConnection = {
  id: string;
  name: string | null;
  image: string | null;
  availabilityStatus: string;
  sharedVibeTags: Array<{ emoji: string; label: string }>;
};
export type PendingConnection = { id: string; name: string | null; image: string | null };
export type SentConnection = { id: string; name: string | null; image: string | null };
export type ProfileCircle = {
  id: string;
  name: string;
  categoryEmoji: string;
  categoryColor: string;
  coverImage: string | null;
  memberCount: number;
  friendsInsideCount: number;
  memberPreviews: Array<{ id: string; name: string | null; image: string | null }>;
};
export type InviteLink = { code: string; url: string };

export function getProfileStats() {
  return apiFetch<ProfileStats>('/api/profile/stats');
}

export function getProfileConnections() {
  return apiFetch<{ confirmed: ProfileConnection[]; pending: PendingConnection[]; sent: SentConnection[] }>(
    '/api/profile/connections'
  );
}

export function getProfileCircles() {
  return apiFetch<{ joined: ProfileCircle[] }>('/api/profile/circles');
}

export function getInviteLink() {
  return apiFetch<InviteLink>('/api/users/me/invite-link');
}

export function requestConnection(userId: string) {
  return apiFetch<{ ok: boolean }>(`/api/circles/request/${userId}`, { method: 'POST' });
}

export function acceptConnection(userId: string) {
  return apiFetch<{ ok: boolean }>(`/api/circles/accept/${userId}`, { method: 'POST' });
}

export function declineConnection(userId: string) {
  return apiFetch<{ ok: boolean }>(`/api/circles/decline/${userId}`, { method: 'DELETE' });
}

export function cancelConnection(userId: string) {
  return apiFetch<{ ok: boolean }>(`/api/circles/cancel/${userId}`, { method: 'DELETE' });
}

export function getCircleByCode(code: string) {
  return apiFetch<{ id: string; name: string; memberCount: number; requiresApproval: boolean }>(
    `/api/circles/by-code/${encodeURIComponent(code)}`
  );
}

export type CircleDetail = {
  id: string;
  name: string;
  description: string | null;
  categoryEmoji: string;
  categoryColor: string;
  coverImage: string | null;
  requiresApproval: boolean;
  isPublic: boolean;
  joinCode: string | null;
  adminUserId: string;
  createdAt: string;
};

export type CircleMember = {
  id: string;
  name: string | null;
  image: string | null;
  status: string;
  joinedAt: string;
};

export function getCircleDetail(circleId: string) {
  return apiFetch<{
    circle: CircleDetail;
    members: CircleMember[];
    pendingMembers: CircleMember[];
    memberCount: number;
    isAdmin: boolean;
    myStatus: string | null;
  }>(`/api/circles/${circleId}`);
}

export function createCircle(body: {
  name: string;
  description?: string;
  categoryEmoji?: string;
  categoryColor?: string;
  requiresApproval?: boolean;
  isPublic?: boolean;
}) {
  return apiFetch<{ id: string; joinCode: string }>('/api/circles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateCircle(
  circleId: string,
  body: {
    name?: string;
    description?: string;
    categoryEmoji?: string;
    categoryColor?: string;
    requiresApproval?: boolean;
    isPublic?: boolean;
  }
) {
  return apiFetch<{ ok: boolean }>(`/api/circles/${circleId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function uploadCircleImage(circleId: string, localUri: string, mimeType: string) {
  const cookies = authClient.getCookie();
  const formData = new FormData();
  formData.append('image', { uri: localUri, type: mimeType, name: 'cover.jpg' } as any);
  const res = await fetch(`${Config.apiUrl}/api/circles/${circleId}/image`, {
    method: 'POST',
    headers: cookies ? { Cookie: cookies } : undefined,
    body: formData,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json() as Promise<{ ok: boolean; imageUrl: string }>;
}

export function approveMember(circleId: string, userId: string) {
  return apiFetch<{ ok: boolean }>(`/api/circles/${circleId}/approve/${userId}`, { method: 'POST' });
}

export function removeMember(circleId: string, userId: string) {
  return apiFetch<{ ok: boolean }>(`/api/circles/${circleId}/members/${userId}`, { method: 'DELETE' });
}

// ─── Motives ──────────────────────────────────────────────────────────[...]

export type MotiveAttendee = {
  userId: string;
  name: string | null;
  image: string | null;
  role: string;
  rsvpStatus: string; // 'invited' | 'going' | 'maybe' | 'declined' (mapped from DB)
};

export type Motive = {
  id: string;
  title: string;
  category: string;
  status: string;
  scheduledAt: string | null;
  placeName: string | null;
  placeAddress: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  creatorId: string;
  attendees: MotiveAttendee[];
  createdAt: string;
};

export type MotiveMemory = {
  id: string;
  motiveId: string;
  userId: string;
  vibeTags: string[];
  rating: number | null;
  venueRating: number | null;
  photoUrls: string[];
  cardUrl: string | null;
  createdAt: string;
};

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  address: string;
  // Nearby results include lat/lng — can select without a Detail call.
  // Autocomplete results have null here — Detail call required on selection.
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount?: number | null;
  distanceKm?: number | null;
  isOpen?: boolean | null;
};

export function getMotives(filter?: 'active' | 'past' | 'all') {
  return apiFetch<{ motives: Motive[] }>(`/api/motives${filter ? `?filter=${filter}` : ''}`);
}

export function getMotive(id: string) {
  return apiFetch<{ motive: Motive; activity: Array<{ text: string; timestamp: string; type: string }> }>(
    `/api/motives/${id}`
  );
}

export function createMotive(body: {
  title: string;
  category: string;
  status: 'planning' | 'draft' | 'confirmed';
  scheduledAt: string | null;
  placeName: string | null;
  placeAddress: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  invitedUserIds: string[];
  invitedCircleIds?: string[];
}) {
  return apiFetch<{ id: string }>('/api/motives', { method: 'POST', body: JSON.stringify(body) });
}

export type MyCircle = { id: string; name: string; categoryEmoji: string; categoryColor: string };

export function getMyCircles() {
  return apiFetch<{ joined: MyCircle[] }>('/api/profile/circles');
}

export type CirclePhoto = { url: string; userId: string; userName: string | null; userImage: string | null };

export function getCircleMemories(circleId: string) {
  return apiFetch<{ photos: CirclePhoto[] }>(`/api/circles/${circleId}/memories`);
}

export function confirmMotive(id: string, happened: boolean) {
  return apiFetch<{ ok: boolean; status: string }>(`/api/motives/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ happened }),
  });
}

export function rsvpMotive(id: string, status: 'going' | 'maybe' | 'declined') {
  return apiFetch<{ ok: boolean }>(`/api/motives/${id}/rsvp`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export function saveMemory(
  id: string,
  body: { vibeTags: string[]; rating: number; venueRating?: number; photoUrls?: string[] }
) {
  return apiFetch<{ ok: boolean }>(`/api/motives/${id}/memory`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getMemory(id: string) {
  return apiFetch<{ memory: MotiveMemory | null }>(`/api/motives/${id}/memory`);
}

export function getNearbyPlaces(category: string, lat: number, lng: number) {
  return apiFetch<{ places: PlaceSuggestion[] }>(
    `/api/places/nearby?category=${encodeURIComponent(category)}&lat=${lat}&lng=${lng}`
  );
}

/**
 * Autocomplete search — uses Google Places Autocomplete API.
 * 11× cheaper than the old Text Search ($2.83 vs $32 per 1,000 calls).
 * Minimum 2 characters — server enforces this too.
 * Results have lat/lng = null; call getPlaceDetail() only on selection.
 *
 * sessionToken: pass a UUID for the full search session (all keystrokes + detail call).
 * Groups billing into one $17 flat event instead of per-keystroke charges.
 */
export function autocompletePlaces(q: string, lat?: number, lng?: number, sessionToken?: string) {
  if (q.trim().length < 2) return Promise.resolve({ places: [] as PlaceSuggestion[] });
  const params = new URLSearchParams({ q });
  if (lat !== undefined) params.set('lat', String(lat));
  if (lng !== undefined) params.set('lng', String(lng));
  if (sessionToken) params.set('sessionToken', sessionToken);
  return apiFetch<{ places: PlaceSuggestion[] }>(`/api/places/autocomplete?${params}`);
}

export type PlaceDetail = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
};

export function getPlaceDetail(placeId: string, sessionToken?: string) {
  const params = new URLSearchParams({ placeId });
  if (sessionToken) params.set('sessionToken', sessionToken);
  return apiFetch<PlaceDetail>(`/api/places/detail?${params}`);
}

// ─── Chat ───────────────────────────────────────────────────────────[...]

export type ChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string | null;
  senderImage: string | null;
  content: string;
  type: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ChatMemberPreview = { id: string; name: string | null; image: string | null };

export type ChatListItem = {
  id: string;
  type: 'motive_thread' | 'group';
  name: string | null;
  motiveId: string | null;
  groupCircleId: string | null;
  createdAt: string;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    senderName: string | null;
    createdAt: string;
  } | null;
  unreadCount: number;
  memberPreviews: ChatMemberPreview[];
};

export function getChats() {
  return apiFetch<{ chats: ChatListItem[] }>('/api/chats');
}

export function getChatMessages(chatId: string, before?: string) {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  return apiFetch<{ messages: ChatMessage[]; hasMore: boolean }>(
    `/api/chats/${chatId}/messages${params.size ? `?${params}` : ''}`
  );
}

export function sendMessage(chatId: string, content: string, type: 'text' | 'image' | 'gif' = 'text') {
  return apiFetch<{ message: ChatMessage }>(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, type }),
  });
}

export function createGroupChat(name: string, memberIds: string[]) {
  return apiFetch<{ id: string }>('/api/chats/groups', {
    method: 'POST',
    body: JSON.stringify({ name, memberIds }),
  });
}

export function addChatMembers(chatId: string, userIds: string[]) {
  return apiFetch<{ ok: boolean }>(`/api/chats/${chatId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
}

export function renameGroupChat(chatId: string, name: string) {
  return apiFetch<{ ok: boolean; name: string }>(`/api/chats/${chatId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function getChatImageUploadUrl(chatId: string, contentType: string, ext: string) {
  return apiFetch<{ uploadUrl: string; token: string; path: string; publicUrl: string }>(
    `/api/chats/${chatId}/upload-url`,
    { method: 'POST', body: JSON.stringify({ contentType, ext }) }
  );
}

export function getOrCreateDirectChat(userId: string) {
  return apiFetch<{ id: string; isNew: boolean }>('/api/chats/direct', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function removeConnection(userId: string) {
  return apiFetch<{ ok: boolean }>(`/api/circles/disconnect/${userId}`, { method: 'DELETE' });
}

// ─── Memories ─────────────────────────────────────────────────────────��[...]

export type MemoryContributor = {
  userId: string;
  userName: string | null;
  userImage: string | null;
  photos: string[]; // signed URLs, expire in 1h
  vibeTags: string[];
  rating: number | null;
  venueRating: number | null;
  createdAt: string;
  isMe: boolean;
};

export function getMotiveMemories(motiveId: string) {
  return apiFetch<{ memories: MemoryContributor[] }>(`/api/motives/${motiveId}/memories`);
}

export type MyMemory = {
  vibeTags: string[];
  rating: number | null;
  venueRating: number | null;
  photos: { path: string; signedUrl: string }[];
};

export function getMyMemory(motiveId: string) {
  return apiFetch<{ memory: MyMemory | null }>(`/api/motives/${motiveId}/memories/mine`);
}

export function getMemoryUploadUrl(motiveId: string, contentType: string, ext: string) {
  return apiFetch<{ uploadUrl: string; path: string; token: string }>(
    `/api/motives/${motiveId}/memories/upload-url`,
    { method: 'POST', body: JSON.stringify({ contentType, ext }) }
  );
}

export function confirmMemoryUpload(motiveId: string, path: string) {
  return apiFetch<{ ok: boolean; path: string }>(`/api/motives/${motiveId}/memories/confirm`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export function saveMemoryMeta(
  motiveId: string,
  body: {
    vibeTags?: string[];
    rating?: number;
    venueRating?: number;
  }
) {
  return apiFetch<{ ok: boolean }>(`/api/motives/${motiveId}/memories`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteMemoryPhoto(motiveId: string, path: string) {
  return apiFetch<{ ok: boolean }>(
    `/api/motives/${motiveId}/memories/${encodeURIComponent(path)}`,
    { method: 'DELETE' }
  );
}
