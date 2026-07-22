// GET    /api/public/v1/clients/{id}/attachments/{attachmentId}
// DELETE /api/public/v1/clients/{id}/attachments/{attachmentId}
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  ClientAttachmentDetailResponse,
  ClientAttachmentDeleteResponse,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedClient } from "@/lib/api-client.server";

const CHANNEL = "clients";
const SIGNED_URL_TTL_SECONDS = 300;

function rowToApi(r: any) {
  return {
    id: r.id,
    client_id: r.client_id,
    document_type: r.document_type,
    file_name: r.file_name,
    mime_type: r.mime_type ?? null,
    size_bytes: r.size_bytes ?? null,
    version: r.version,
    uploaded_at: new Date(r.uploaded_at).toISOString(),
  };
}

async function loadOwnedAttachment(clientId: string, attachmentId: string) {
  const { data } = await supabaseAdmin
    .from("client_attachment" as any)
    .select("*")
    .eq("id", attachmentId)
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as any) ?? null;
}

export const Route = createFileRoute(
  "/api/public/v1/clients/$id/attachments/$attachmentId",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/clients/${params.id}/attachments/${params.attachmentId}`;
        const auth = await authenticateApiKey(request, "clients.read");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "outbound",
          });
        const client = await loadOwnedClient(params.id, auth.key.company_id);
        if (!client)
          return errJson({ code: 404, error: "not_found", message: "Attachment not found." });
        const att = await loadOwnedAttachment(client.id, params.attachmentId);
        if (!att)
          return errJson({ code: 404, error: "not_found", message: "Attachment not found." });

        const { data: signed, error } = await supabaseAdmin.storage
          .from(att.storage_bucket)
          .createSignedUrl(att.storage_path, SIGNED_URL_TTL_SECONDS);
        if (error || !signed?.signedUrl)
          return errJson({
            code: 500,
            error: "sign_failed",
            message: error?.message ?? "Could not sign download URL.",
          });

        const body = {
          ...rowToApi(att),
          download_url: signed.signedUrl,
          download_url_expires_at: new Date(
            Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
          ).toISOString(),
        };
        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint,
          method: "GET",
          reference: att.id,
          status_code: 200,
        });
        return validateAndSend(ClientAttachmentDetailResponse, body, 200);
      },

      DELETE: async ({ request, params }) => {
        const endpoint = `/api/public/v1/clients/${params.id}/attachments/${params.attachmentId}`;
        const auth = await authenticateApiKey(request, "clients.write");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "inbound",
          });
        const client = await loadOwnedClient(params.id, auth.key.company_id);
        if (!client)
          return errJson({ code: 404, error: "not_found", message: "Attachment not found." });
        const att = await loadOwnedAttachment(client.id, params.attachmentId);
        if (!att)
          return errJson({ code: 404, error: "not_found", message: "Attachment not found." });

        const removed = await supabaseAdmin.storage
          .from(att.storage_bucket)
          .remove([att.storage_path]);
        if (removed.error)
          return errJson({
            code: 500,
            error: "delete_failed",
            message: removed.error.message,
          });

        const { error: delErr } = await supabaseAdmin
          .from("client_attachment" as any)
          .delete()
          .eq("id", att.id);
        if (delErr)
          return errJson({
            code: 500,
            error: "delete_failed",
            message: delErr.message,
          });

        const body = {
          status: "deleted" as const,
          id: att.id,
          client_id: att.client_id,
        };
        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "inbound",
          endpoint,
          method: "DELETE",
          reference: att.id,
          status_code: 200,
        });
        return validateAndSend(ClientAttachmentDeleteResponse, body, 200);
      },
    },
  },
});
