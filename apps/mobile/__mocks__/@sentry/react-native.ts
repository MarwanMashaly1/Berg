export const init = jest.fn();
export const wrap = jest.fn((c: any) => c);
export const captureException = jest.fn();
export const captureMessage = jest.fn();
export const setUser = jest.fn();
export const withScope = jest.fn();
export const reactNavigationIntegration = jest.fn(() => ({ registerNavigationContainer: jest.fn() }));
