import { createFileRoute } from "@tanstack/react-router";
import { HealthResponse, validateAndSend } from "@/lib/api-schemas.server";

export const Route = createFileRoute("/api/public/v1/health")({
  server: {
    handlers: {
      GET: async () => validateAndSend(HealthResponse, { status: "ok", time: new Date().toISOString(), version: "v1" }, 200),
    },
  },
});
