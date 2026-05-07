export const PostHogProvider = ({ children }: any) => children;
export const usePostHog = jest.fn(() => ({
  capture: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
  screen: jest.fn(),
}));
export const PostHog = jest.fn().mockImplementation(() => ({
  capture: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
  screen: jest.fn(),
  shutdown: jest.fn(),
}));
