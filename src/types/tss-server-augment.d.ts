// Mirror of module augmentation from
// @tanstack/start-client-core/dist/esm/serverRoute.d.ts. That package
// re-exports it via `export type *`, which TypeScript doesn't always
// process for ambient module augmentation, so `server:` is not visible
// on `createFileRoute` options in server route files. Re-declaring it
// here forces the augmentation to be seen.
import type { RouteServerOptions } from "@tanstack/start-client-core";
import type { AnyRoute, AnyContext } from "@tanstack/router-core";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
declare module "@tanstack/router-core" {
  interface FilebaseRouteOptionsInterface<
    TRegister,
    TParentRoute extends AnyRoute = AnyRoute,
    TId extends string = string,
    TPath extends string = string,
    TSearchValidator = undefined,
    TParams = {},
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TRouterContext = {},
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TRemountDepsFn = AnyContext,
    TSSR = unknown,
    TServerMiddlewares = unknown,
    THandlers = undefined,
  > {
    server?: RouteServerOptions<
      TRegister,
      TParentRoute,
      TPath,
      TParams,
      TLoaderDeps,
      TLoaderFn,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TServerMiddlewares,
      THandlers
    >;
  }
}
