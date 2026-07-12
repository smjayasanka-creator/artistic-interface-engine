import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/health")({
  server: {
    handlers: {
      GET: async () => json({ status: "ok", service: "mzizi-api", version: "1.0.0", ts: new Date().toISOString() }),
    },
  },
});
