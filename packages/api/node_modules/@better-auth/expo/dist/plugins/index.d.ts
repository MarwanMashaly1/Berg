import * as _better_fetch_fetch0 from "@better-fetch/fetch";
import { Awaitable } from "@better-auth/core";

//#region src/plugins/last-login-method.d.ts
interface LastLoginMethodClientConfig {
  storage: {
    setItem: (key: string, value: string) => any;
    getItem: (key: string) => string | null;
    deleteItemAsync: (key: string) => Awaitable<void>;
  };
  /**
   * Prefix for local storage keys (e.g., "my-app_last_login_method")
   * @default "better-auth"
   */
  storagePrefix?: string | undefined;
  /**
   * Custom resolve method for retrieving the last login method
   */
  customResolveMethod?: ((url: string | URL) => Awaitable<string | undefined | null>) | undefined;
}
declare const lastLoginMethodClient: (config: LastLoginMethodClientConfig) => {
  id: "last-login-method-expo";
  version: string;
  fetchPlugins: {
    id: string;
    name: string;
    hooks: {
      onResponse: (ctx: _better_fetch_fetch0.ResponseContext) => Promise<void>;
    };
  }[];
  getActions(): {
    /**
     * Get the last used login method from storage
     *
     * @returns The last used login method or null if not found
     */
    getLastUsedLoginMethod: () => string | null;
    /**
     * Clear the last used login method from storage
     */
    clearLastUsedLoginMethod: () => Promise<void>;
    /**
     * Check if a specific login method was the last used
     * @param method The method to check
     * @returns True if the method was the last used, false otherwise
     */
    isLastUsedLoginMethod: (method: string) => boolean;
  };
};
//#endregion
export { LastLoginMethodClientConfig, lastLoginMethodClient };