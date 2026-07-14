// Force-load the server-route module augmentation from
// @tanstack/start-client-core so `createFileRoute({ server: { handlers } })`
// typechecks in server route files. The package re-exports serverRoute
// with `export type *`, which does not always propagate ambient
// module augmentation, so we import it directly here.
import "@tanstack/start-client-core/dist/esm/serverRoute.js";
