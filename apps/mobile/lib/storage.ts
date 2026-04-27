import * as SecureStore from 'expo-secure-store';

// expo-secure-store works in Expo Go and stores data securely on-device.
// All methods are async.
export const storage = {
  getString: (key: string) => SecureStore.getItemAsync(key),
  setString: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  getBoolean: async (key: string) => {
    const val = await SecureStore.getItemAsync(key);
    return val === 'true';
  },
  setBoolean: (key: string, value: boolean) =>
    SecureStore.setItemAsync(key, String(value)),
  delete: (key: string) => SecureStore.deleteItemAsync(key),
};
