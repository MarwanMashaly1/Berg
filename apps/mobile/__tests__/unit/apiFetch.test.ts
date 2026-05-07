import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock auth client before importing api
jest.mock('../../lib/auth', () => ({
  authClient: { getCookie: jest.fn(() => null) },
}));

// Mock QueryClient
jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({})),
}));

const API_URL = 'http://localhost:3000';

describe('apiFetch error handling', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as any;
    process.env.EXPO_PUBLIC_API_URL = API_URL;
  });

  it('throws with parsed error message on non-ok JSON response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: 'Invalid email' }),
    });

    const { apiFetch } = await import('../../lib/api');
    await expect(apiFetch('/api/test')).rejects.toThrow('Invalid email');
  });

  it('throws with status text when body is not JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'not json',
    });

    const { apiFetch } = await import('../../lib/api');
    await expect(apiFetch('/api/test')).rejects.toThrow();
  });

  it('returns parsed JSON on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: 'hello' }),
    });

    const { apiFetch } = await import('../../lib/api');
    const result = await apiFetch<{ ok: boolean; data: string }>('/api/test');
    expect(result.ok).toBe(true);
    expect(result.data).toBe('hello');
  });

  it('attaches cookie header when cookie is present', async () => {
    const { authClient } = await import('../../lib/auth');
    (authClient.getCookie as jest.Mock).mockReturnValueOnce('session=abc123');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const { apiFetch } = await import('../../lib/api');
    await apiFetch('/api/test');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as any[];
    expect(options.headers['Cookie']).toBe('session=abc123');
  });
});
