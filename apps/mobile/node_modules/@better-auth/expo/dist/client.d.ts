import { parseSetCookieHeader } from "better-auth/cookies";
import { FocusManager, OnlineManager } from "better-auth/client";
import * as expo_web_browser0 from "expo-web-browser";
import * as _better_fetch_fetch0 from "@better-fetch/fetch";
import { ClientFetchOption, ClientStore } from "@better-auth/core";

//#region src/focus-manager.d.ts
declare function setupExpoFocusManager(): FocusManager;
//#endregion
//#region src/online-manager.d.ts
declare function setupExpoOnlineManager(): OnlineManager;
//#endregion
//#region src/client.d.ts
interface ExpoClientOptions {
  scheme?: string | undefined;
  storage: {
    setItem: (key: string, value: string) => any;
    getItem: (key: string) => string | null;
  };
  /**
   * Prefix for local storage keys (e.g., "my-app_cookie", "my-app_session_data")
   * @default "better-auth"
   */
  storagePrefix?: string | undefined;
  /**
   * Prefix(es) for server cookie names to filter (e.g., "better-auth.session_token")
   * This is used to identify which cookies belong to better-auth to prevent
   * infinite refetching when third-party cookies are set.
   * Can be a single string or an array of strings to match multiple prefixes.
   * @default "better-auth"
   * @example "better-auth"
   * @example ["better-auth", "my-app"]
   */
  cookiePrefix?: string | string[] | undefined;
  disableCache?: boolean | undefined;
  /**
   * Options to customize the Expo web browser behavior when opening authentication
   * sessions. These are passed directly to `expo-web-browser`'s
   * `Browser.openBrowserAsync`.
   *
   * For example, on iOS you can use `{ preferEphemeralSession: true }` to prevent
   * the authentication session from sharing cookies with the user's default
   * browser session:
   *
   * ```ts
   * const client = createClient({
   *   expo: {
   *     webBrowserOptions: {
   *       preferEphemeralSession: true,
   *     },
   *   },
   * });
   * ```
   */
  webBrowserOptions?: expo_web_browser0.AuthSessionOpenOptions;
}
declare function getSetCookie(header: string, prevCookie?: string | undefined): string;
declare function getCookie(cookie: string): string;
/**
 * Check if the Set-Cookie header contains better-auth cookies.
 * This prevents infinite refetching when non-better-auth cookies (like third-party cookies) change.
 *
 * Supports multiple cookie naming patterns:
 * - Default: "better-auth.session_token", "better-auth-passkey", "__Secure-better-auth.session_token"
 * - Custom prefix: "myapp.session_token", "myapp-passkey", "__Secure-myapp.session_token"
 * - Custom full names: "my_custom_session_token", "custom_session_data"
 * - No prefix (cookiePrefix=""): matches any cookie with known suffixes
 * - Multiple prefixes: ["better-auth", "my-app"] matches cookies starting with any of the prefixes
 *
 * @param setCookieHeader - The Set-Cookie header value
 * @param cookiePrefix - The cookie prefix(es) to check for. Can be a string, array of strings, or empty string.
 * @returns true if the header contains better-auth cookies, false otherwise
 */
declare function hasBetterAuthCookies(setCookieHeader: string, cookiePrefix: string | string[]): boolean;
/**
 * Expo secure store does not support colons in the keys.
 * This function replaces colons with underscores.
 *
 * @see https://github.com/better-auth/better-auth/issues/5426
 *
 * @param name cookie name to be saved in the storage
 * @returns normalized cookie name
 */
declare function normalizeCookieName(name: string): string;
declare function storageAdapter(storage: {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
}): {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
};
declare const expoClient: (opts: ExpoClientOptions) => {
  id: "expo";
  version: string;
  getActions(_: _better_fetch_fetch0.BetterFetch, $store: ClientStore): {
    /**
     * Get the stored cookie.
     *
     * You can use this to get the cookie stored in the device and use it in your fetch
     * requests.
     *
     * @example
     * ```ts
     * const cookie = client.getCookie();
     * fetch("https://api.example.com", {
     * 	headers: {
     * 		cookie,
     * 	},
     * });
     */
    getCookie: () => string;
  };
  fetchPlugins: {
    id: string;
    name: string;
    hooks: {
      onSuccess(context: _better_fetch_fetch0.SuccessContext<any>): Promise<void>;
    };
    init(url: string, options: ({
      priority?: RequestPriority | undefined;
      method?: string | undefined;
      headers?: (HeadersInit & (HeadersInit | {
        accept: "application/json" | "text/plain" | "application/octet-stream";
        "content-type": "application/json" | "text/plain" | "application/x-www-form-urlencoded" | "multipart/form-data" | "application/octet-stream";
        authorization: "Bearer" | "Basic";
      })) | undefined;
      redirect?: RequestRedirect | undefined;
      window?: null | undefined;
      cache?: RequestCache | undefined;
      credentials?: RequestCredentials | undefined;
      integrity?: string | undefined;
      keepalive?: boolean | undefined;
      mode?: RequestMode | undefined;
      referrer?: string | undefined;
      referrerPolicy?: ReferrerPolicy | undefined;
      signal?: (AbortSignal | null) | undefined;
      onRequest?: (<T extends Record<string, any>>(context: _better_fetch_fetch0.RequestContext<T>) => Promise<_better_fetch_fetch0.RequestContext | void> | _better_fetch_fetch0.RequestContext | void) | undefined;
      onResponse?: ((context: _better_fetch_fetch0.ResponseContext) => Promise<Response | void | _better_fetch_fetch0.ResponseContext> | Response | _better_fetch_fetch0.ResponseContext | void) | undefined;
      onSuccess?: ((context: _better_fetch_fetch0.SuccessContext<any>) => Promise<void> | void) | undefined;
      onError?: ((context: _better_fetch_fetch0.ErrorContext) => Promise<void> | void) | undefined;
      onRetry?: ((response: _better_fetch_fetch0.ResponseContext) => Promise<void> | void) | undefined;
      hookOptions?: {
        cloneResponse?: boolean;
      } | undefined;
      timeout?: number | undefined;
      customFetchImpl?: _better_fetch_fetch0.FetchEsque | undefined;
      plugins?: _better_fetch_fetch0.BetterFetchPlugin[] | undefined;
      baseURL?: string | undefined;
      throw?: boolean | undefined;
      auth?: ({
        type: "Bearer";
        token: string | Promise<string | undefined> | (() => string | Promise<string | undefined> | undefined) | undefined;
      } | {
        type: "Basic";
        username: string | (() => string | undefined) | undefined;
        password: string | (() => string | undefined) | undefined;
      } | {
        type: "Custom";
        prefix: string | (() => string | undefined) | undefined;
        value: string | (() => string | undefined) | undefined;
      }) | undefined;
      body?: any;
      query?: any;
      params?: any;
      duplex?: "full" | "half" | undefined;
      jsonParser?: ((text: string) => Promise<any> | any) | undefined;
      retry?: _better_fetch_fetch0.RetryOptions | undefined;
      retryAttempt?: number | undefined;
      output?: (_better_fetch_fetch0.StandardSchemaV1 | typeof Blob | typeof File) | undefined;
      errorSchema?: _better_fetch_fetch0.StandardSchemaV1 | undefined;
      disableValidation?: boolean | undefined;
    } & Record<string, any>) | undefined): Promise<{
      url: string;
      options: ClientFetchOption;
    }>;
  }[];
};
//#endregion
export { expoClient, getCookie, getSetCookie, hasBetterAuthCookies, normalizeCookieName, parseSetCookieHeader, setupExpoFocusManager, setupExpoOnlineManager, storageAdapter };