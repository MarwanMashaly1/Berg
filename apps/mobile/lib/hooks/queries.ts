import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMotives, getMotive, getProfileConnections, getProfileCircles,
  getProfileStats, getUserMe, getDiscoveryPeople, getDiscoveryCircles,
  getChats, getOpenMatches,
  rsvpMotive, apiFetch,
} from '../api';

// ── Query keys ────────────────────────────────────────────────────────────────

export const QK = {
  motives:     (filter?: string)  => ['motives', filter ?? 'all'] as const,
  motive:      (id: string)       => ['motives', id] as const,
  profile:     ()                 => ['profile', 'me'] as const,
  profileStats:()                 => ['profile', 'stats'] as const,
  connections: ()                 => ['profile', 'connections'] as const,
  circles:     ()                 => ['profile', 'circles'] as const,
  discovery:   ()                 => ['discovery', 'people'] as const,
  discCircles: ()                 => ['discovery', 'circles'] as const,
  chatList:    ()                 => ['chats'] as const,
  chat:        (id: string)       => ['chats', id] as const,
  matches:     ()                 => ['matches'] as const,
} as const;

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useMotives(filter?: 'active' | 'past' | 'all') {
  return useQuery({
    queryKey: QK.motives(filter),
    queryFn: () => getMotives(filter),
  });
}

export function useMotive(id: string) {
  return useQuery({
    queryKey: QK.motive(id),
    queryFn: () => getMotive(id),
    enabled: !!id,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: QK.profile(),
    queryFn: () => getUserMe(),
    staleTime: 2 * 60 * 1000,
  });
}

export function useProfileStats() {
  return useQuery({
    queryKey: QK.profileStats(),
    queryFn: () => getProfileStats(),
  });
}

export function useConnections() {
  return useQuery({
    queryKey: QK.connections(),
    queryFn: () => getProfileConnections(),
  });
}

export function useProfileCircles() {
  return useQuery({
    queryKey: QK.circles(),
    queryFn: () => getProfileCircles(),
  });
}

export function useDiscoveryPeople() {
  return useQuery({
    queryKey: QK.discovery(),
    queryFn: () => getDiscoveryPeople(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDiscoveryCircles() {
  return useQuery({
    queryKey: QK.discCircles(),
    queryFn: () => getDiscoveryCircles(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useChatList() {
  return useQuery({
    queryKey: QK.chatList(),
    queryFn: () => getChats(),
    staleTime: 30 * 1000,
  });
}

export function useMatches() {
  return useQuery({
    queryKey: QK.matches(),
    queryFn: () => getOpenMatches(),
    staleTime: 60 * 1000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useRsvpMutation(motiveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: 'going' | 'maybe' | 'declined') => rsvpMotive(motiveId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.motive(motiveId) });
      qc.invalidateQueries({ queryKey: QK.motives() });
    },
  });
}

export function useConfirmMotiveMutation(motiveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (happened: boolean) =>
      apiFetch<{ ok: boolean; status: string }>(`/api/motives/${motiveId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ happened }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.motive(motiveId) }),
  });
}

export function useAcceptConnectionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ ok: boolean }>(`/api/circles/accept/${userId}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.connections() }),
  });
}

export function useDeclineConnectionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ ok: boolean }>(`/api/circles/decline/${userId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.connections() }),
  });
}

export function useRemoveConnectionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ ok: boolean }>(`/api/circles/disconnect/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.connections() });
      qc.invalidateQueries({ queryKey: QK.profileStats() });
    },
  });
}
