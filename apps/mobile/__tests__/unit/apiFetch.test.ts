import { apiFetch } from '../../lib/api';
import { authClient } from '../../lib/auth';

jest.mock('../../lib/auth', () => ({
  authClient: { getCookie: jest.fn(() => null) },
}));

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({})),
}));

beforeEach(() => {
  global.fetch = jest.fn() as jest.Mock;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('apiFetch error handling', () => {
  it('throws with parsed error message on non-ok JSON response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: 'Invalid email' }),
    });
    await expect(apiFetch('/api/test')).rejects.toThrow('Invalid email');
  });

  it('throws when body is not JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'not json',
    });
    await expect(apiFetch('/api/test')).rejects.toThrow();
  });

  it('returns parsed JSON on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: 'hello' }),
    });
    const result = await apiFetch<{ ok: boolean; data: string }>('/api/test');
    expect(result.ok).toBe(true);
    expect(result.data).toBe('hello');
  });

  it('attaches Cookie header when cookie is present', async () => {
    (authClient.getCookie as jest.Mock).mockReturnValueOnce('session=abc123');
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    await apiFetch('/api/test');
    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(options.headers['Cookie']).toBe('session=abc123');
  });

  it('omits Cookie header when no cookie', async () => {
    (authClient.getCookie as jest.Mock).mockReturnValueOnce(null);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    await apiFetch('/api/test');
    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(options.headers['Cookie']).toBeUndefined();
  });
});
