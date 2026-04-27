// Shared TypeScript types for Icebreaker
// These will be expanded as features are built

export type AvailabilityStatus = 'down_to_hang' | 'busy' | 'ask_me';
export type CircleStatus = 'pending' | 'confirmed';
export type MotiveStatus = 'open' | 'locked' | 'completed' | 'cancelled' | 'unconfirmed';
export type RsvpStatus = 'invited' | 'joined' | 'passed';
export type MotiveRole = 'organiser' | 'co_organiser' | 'attendee';
export type ChatType = 'motive_thread' | 'group';
export type MessageType = 'text' | 'prompt_bubble' | 'poll' | 'system';
export type CollisionStatus = 'pending' | 'resolved_merged' | 'resolved_separate' | 'resolved_one_joined' | 'expired';
export type Tab = 'discovery' | 'motives' | 'chat' | 'profile';
