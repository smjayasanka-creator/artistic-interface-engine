// GET  /api/public/v1/clients/{id}/attachments — list attachments
// POST /api/public/v1/clients/{id}/attachments — upload an attachment
// Files are stored in the private `client-attachments` bucket.
// Metadata rows live in public.client_attachment.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  ClientAttachmentUploadRequest,
  ClientAttachmentUploadResponse,
  ClientAttachmentListResponse,
  parseJsonBody,
  validateAndSend,
  logAndReturnAuthError,
  errJson,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadOwnedClient } from "@/lib/api-client.server";

const CHANNEL = "clients";
const BUCKET = "client-attachments";
const MAX_DECODED_BYTES = 8 * 1024 * 1024; // 8 MB

function decodeBase64(input: string): Uint8Array | null {
  try {
    const clean = input.replace(/\s+/g, "");
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

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

export const Route = createFileRoute("/api/public/v1/clients/$id/attachments")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const endpoint = `/api/public/v1/clients/${params.id}/attachments`;
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
          return errJson({ code: 404, error: "not_found", message: "Client not found." });

        const { data, error } = await supabaseAdmin
          .from("client_attachment" as any)
          .select("*")
          .eq("client_id", client.id)
          .order("uploaded_at", { ascending: false });
        if (error)
          return errJson({ code: 500, error: "read_failed", message: error.message });

        const body = { data: (data ?? []).map(rowToApi) };
        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "outbound",
          endpoint,
          method: "GET",
          reference: client.id,
          status_code: 200,
        });
        return validateAndSend(ClientAttachmentListResponse, body, 200);
      },

      POST: async ({ request, params }) => {
        const endpoint = `/api/public/v1/clients/${params.id}/attachments`;
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
          return errJson({ code: 404, error: "not_found", message: "Client not found." });

        const parsed = await parseJsonBody(request, ClientAttachmentUploadRequest);
        if (!parsed.ok) return parsed.response;

        const bytes = decodeBase64(parsed.data.content_base64);
        if (!bytes)
          return errJson({
            code: 422,
            error: "invalid_base64",
            message: "content_base64 is not valid base64.",
          });
        if (bytes.byteLength > MAX_DECODED_BYTES)
          return errJson({
            code: 413,
            error: "payload_too_large",
            message: `Decoded file exceeds ${MAX_DECODED_BYTES} bytes.`,
          });

        const { data: existing } = await supabaseAdmin
          .from("client_attachment" as any)
          .select("version")
          .eq("client_id", client.id)
          .eq("document_type", parsed.data.document_type)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextVersion = ((existing as any)?.version ?? 0) + 1;

        const safeName = parsed.data.file_name.replace(/[^\w.\-]+/g, "_");
        const storagePath = `${auth.key.company_id}/${client.id}/${parsed.data.document_type}/v${nextVersion}-${Date.now()}-${safeName}`;
        const contentType = parsed.data.mime_type || "application/octet-stream";

        const upload = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(storagePath, bytes, { contentType, upsert: false });
        if (upload.error)
          return errJson({
            code: 500,
            error: "upload_failed",
            message: upload.error.message,
          });

        const { data: row, error: insErr } = await supabaseAdmin
          .from("client_attachment" as any)
          .insert({
            client_id: client.id,
            document_type: parsed.data.document_type,
            file_name: parsed.data.file_name,
            mime_type: parsed.data.mime_type ?? null,
            size_bytes: bytes.byteLength,
            storage_bucket: BUCKET,
            storage_path: storagePath,
            version: nextVersion,
          } as any)
          .select("*")
          .single();
        if (insErr || !row) {
          await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
          return errJson({
            code: 500,
            error: "insert_failed",
            message: insErr?.message ?? "Insert failed.",
          });
        }

        const body = { status: "created" as const, ...rowToApi(row) };
        await logApiCall({
          company_id: auth.key.company_id,
          api_key_id: auth.key.id,
          channel: CHANNEL,
          direction: "inbound",
          endpoint,
          method: "POST",
          reference: client.id,
          status_code: 201,
          request: {
            document_type: parsed.data.document_type,
            file_name: parsed.data.file_name,
            mime_type: parsed.data.mime_type ?? null,
            size_bytes: bytes.byteLength,
          },
          response: { id: body.id, version: body.version },
        });
        return validateAndSend(ClientAttachmentUploadResponse, body, 201);
      },
    },
  },
});
