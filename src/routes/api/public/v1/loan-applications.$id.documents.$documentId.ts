// GET    /api/public/v1/loan-applications/{id}/documents/{documentId}
// DELETE /api/public/v1/loan-applications/{id}/documents/{documentId}
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  LoanApplicationDocumentDetailResponse,
  LoanApplicationDocumentDeleteResponse,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedApplication } from "@/lib/api-loan-app.server";

const CHANNEL = "loan_applications";
const SIGNED_URL_TTL_SECONDS = 300;

function rowToApi(r: any) {
  return {
    id: r.id,
    application_id: r.application_id,
    application_no: r.application_no,
    document_type: r.document_type,
    file_name: r.file_name,
    mime_type: r.mime_type ?? null,
    size_bytes: r.size_bytes ?? null,
    version: r.version,
    uploaded_at: new Date(r.uploaded_at).toISOString(),
  };
}

async function loadOwnedDoc(applicationId: string, documentId: string) {
  const { data } = await supabaseAdmin
    .from("loan_application_document" as any)
    .select("*")
    .eq("id", documentId)
    .eq("application_id", applicationId)
    .maybeSingle();
  return (data as any) ?? null;
}

export const Route = createFileRoute(
  "/api/public/v1/loan-applications/$id/documents/$documentId",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/loan-applications/${params.id}/documents/${params.documentId}`;
        const auth = await authenticateApiKey(request, "loan_applications.read");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "outbound",
          });
        const app = await loadOwnedApplication(params.id, auth.key.company_id);
        if (!app)
          return errJson({ code: 404, error: "not_found", message: "Document not found." });
        const doc = await loadOwnedDoc(app.id, params.documentId);
        if (!doc)
          return errJson({ code: 404, error: "not_found", message: "Document not found." });

        const { data: signed, error } = await supabaseAdmin.storage
          .from(doc.storage_bucket)
          .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
        if (error || !signed?.signedUrl)
          return errJson({
            code: 500,
            error: "sign_failed",
            message: error?.message ?? "Could not sign download URL.",
          });

        const body = {
          ...rowToApi(doc),
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
          reference: doc.id,
          status_code: 200,
        });
        return validateAndSend(LoanApplicationDocumentDetailResponse, body, 200);
      },

      DELETE: async ({ request, params }) => {
        const endpoint = `/api/public/v1/loan-applications/${params.id}/documents/${params.documentId}`;
        const auth = await authenticateApiKey(request, "loan_applications.write");
        if (!auth.ok)
          return logAndReturnAuthError({
            status: auth.status,
            error: auth.error,
            channel: CHANNEL,
            endpoint,
            direction: "inbound",
          });
        const app = await loadOwnedApplication(params.id, auth.key.company_id);
        if (!app)
          return errJson({ code: 404, error: "not_found", message: "Document not found." });
        const doc = await loadOwnedDoc(app.id, params.documentId);
        if (!doc)
          return errJson({ code: 404, error: "not_found", message: "Document not found." });

        // Remove storage object first; if it fails, keep the metadata row so
        // the caller can retry. If it succeeds, delete the row.
        const removed = await supabaseAdmin.storage
          .from(doc.storage_bucket)
          .remove([doc.storage_path]);
        if (removed.error)
          return errJson({
            code: 500,
            error: "delete_failed",
            message: removed.error.message,
          });

        const { error: delErr } = await supabaseAdmin
          .from("loan_application_document" as any)
          .delete()
          .eq("id", doc.id);
        if (delErr)
          return errJson({
            code: 500,
            error: "delete_failed",
            message: delErr.message,
          });

        const body = {
          status: "deleted" as const,
          id: doc.id,
          application_id: doc.application_id,
        };
        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "inbound",
          endpoint,
          method: "DELETE",
          reference: doc.id,
          status_code: 200,
        });
        return validateAndSend(LoanApplicationDocumentDeleteResponse, body, 200);
      },
    },
  },
});
