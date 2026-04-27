import * as better_auth0 from "better-auth";
import * as zod from "zod";
import * as better_call0 from "better-call";
import * as zod_v4_core0 from "zod/v4/core";

//#region src/index.d.ts
interface ExpoOptions {
  /**
   * Disable origin override for expo API routes
   * When set to true, the origin header will not be overridden for expo API routes
   */
  disableOriginOverride?: boolean | undefined;
}
declare module "@better-auth/core" {
  interface BetterAuthPluginRegistry<AuthOptions, Options> {
    expo: {
      creator: typeof expo;
    };
  }
}
declare const expo: (options?: ExpoOptions | undefined) => {
  id: "expo";
  version: string;
  init: (ctx: better_auth0.AuthContext) => {
    options: {
      trustedOrigins: string[];
    };
  };
  onRequest(request: Request, ctx: better_auth0.AuthContext): Promise<{
    request: Request;
  } | undefined>;
  hooks: {
    after: {
      matcher(context: better_auth0.HookEndpointContext): boolean;
      handler: (inputContext: better_call0.MiddlewareInputContext<better_call0.MiddlewareOptions>) => Promise<void>;
    }[];
  };
  endpoints: {
    expoAuthorizationProxy: better_call0.StrictEndpoint<"/expo-authorization-proxy", {
      method: "GET";
      query: zod.ZodObject<{
        authorizationURL: zod.ZodString;
        oauthState: zod.ZodOptional<zod.ZodString>;
      }, zod_v4_core0.$strip>;
      metadata: {
        readonly scope: "server";
      };
    }, {
      status: ("OK" | "CREATED" | "ACCEPTED" | "NO_CONTENT" | "MULTIPLE_CHOICES" | "MOVED_PERMANENTLY" | "FOUND" | "SEE_OTHER" | "NOT_MODIFIED" | "TEMPORARY_REDIRECT" | "BAD_REQUEST" | "UNAUTHORIZED" | "PAYMENT_REQUIRED" | "FORBIDDEN" | "NOT_FOUND" | "METHOD_NOT_ALLOWED" | "NOT_ACCEPTABLE" | "PROXY_AUTHENTICATION_REQUIRED" | "REQUEST_TIMEOUT" | "CONFLICT" | "GONE" | "LENGTH_REQUIRED" | "PRECONDITION_FAILED" | "PAYLOAD_TOO_LARGE" | "URI_TOO_LONG" | "UNSUPPORTED_MEDIA_TYPE" | "RANGE_NOT_SATISFIABLE" | "EXPECTATION_FAILED" | "I'M_A_TEAPOT" | "MISDIRECTED_REQUEST" | "UNPROCESSABLE_ENTITY" | "LOCKED" | "FAILED_DEPENDENCY" | "TOO_EARLY" | "UPGRADE_REQUIRED" | "PRECONDITION_REQUIRED" | "TOO_MANY_REQUESTS" | "REQUEST_HEADER_FIELDS_TOO_LARGE" | "UNAVAILABLE_FOR_LEGAL_REASONS" | "INTERNAL_SERVER_ERROR" | "NOT_IMPLEMENTED" | "BAD_GATEWAY" | "SERVICE_UNAVAILABLE" | "GATEWAY_TIMEOUT" | "HTTP_VERSION_NOT_SUPPORTED" | "VARIANT_ALSO_NEGOTIATES" | "INSUFFICIENT_STORAGE" | "LOOP_DETECTED" | "NOT_EXTENDED" | "NETWORK_AUTHENTICATION_REQUIRED") | better_call0.Status;
      body: ({
        message?: string;
        code?: string;
        cause?: unknown;
      } & Record<string, any>) | undefined;
      headers: HeadersInit;
      statusCode: number;
      name: string;
      message: string;
      stack?: string;
      cause?: unknown;
    }>;
  };
  options: ExpoOptions | undefined;
};
//#endregion
export { ExpoOptions, expo };