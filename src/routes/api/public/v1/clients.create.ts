import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiKey, logApiCall } from "@/lib/api-auth.server";
import {
  ClientCreateRequest, ClientCreateResponse,
  parseJsonBody, validateAndSend, logAndReturnAuthError,
  checkIdempotency, withIdempotencyEnvelope, errJson, ERRORS,
} from "@/lib/api-schemas.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT = "/api/public/v1/clients/create";
const CHANNEL = "clients";

const AVATAR_COLORS = ["#0f766e", "#0369a1", "#7c3aed", "#c2410c", "#b45309", "#065f46", "#9333ea", "#be185d"];

export const Route = createFileRoute("/api/public/v1/clients/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiKey(request, "clients.create");
        if (!auth.ok) {
          return logAndReturnAuthError({
            status: auth.status, error: auth.error, channel: CHANNEL, endpoint: ENDPOINT, direction: "inbound",
          });
        }

        const parsed = await parseJsonBody(request, ClientCreateRequest);
        if (!parsed.ok) {
          await logApiCall({
            company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "inbound",
            endpoint: ENDPOINT, method: "POST", status_code: 400, request: parsed.raw, error: "validation_failed",
          });
          return parsed.response;
        }

        const idem = request.headers.get("Idempotency-Key");
        if (idem) {
          const hit = await checkIdempotency({
            company_id: auth.key.company_id, endpoint: ENDPOINT, key: idem, body: parsed.data,
          });
          if (hit.kind === "conflict") return errJson(ERRORS.idempotency_conflict);
          if (hit.kind === "replay") return validateAndSend(ClientCreateResponse, hit.response as any, hit.status);
        }

        // Resolve branch: explicit branch_id (must belong to company) or the earliest branch of the company.
        let branchId = parsed.data.branch_id ?? null;
        if (branchId) {
          const { data: b } = await supabaseAdmin
            .from("branch").select("id").eq("id", branchId).eq("company_id", auth.key.company_id).maybeSingle();
          if (!b) {
            const resp = errJson({ code: 400, error: "invalid_branch", message: "branch_id does not belong to this company." });
            await logApiCall({
              company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "inbound",
              endpoint: ENDPOINT, method: "POST", status_code: 400, request: parsed.data, error: "invalid_branch",
            });
            return resp;
          }
        } else {
          const { data: b } = await supabaseAdmin
            .from("branch").select("id").eq("company_id", auth.key.company_id)
            .order("created_at", { ascending: true }).limit(1).maybeSingle();
          branchId = b?.id ?? null;
        }
        if (!branchId) {
          return errJson({ code: 400, error: "no_branch", message: "Company has no branch configured." });
        }

        // Duplicate national_id guard within the company's branches
        const { data: dup } = await supabaseAdmin
          .from("client").select("id, branch:branch_id(company_id)")
          .eq("national_id", parsed.data.national_id).maybeSingle();
        if (dup && (dup as any).branch?.company_id === auth.key.company_id) {
          return errJson({ code: 409, error: "duplicate_national_id", message: "A client with this national ID already exists." });
        }

        // Best-effort officer: the API key creator's staff record, if any, within this company
        let officerId: string | null = null;
        if (auth.key.company_id && (auth as any).key) {
          const { data: creator } = await supabaseAdmin
            .from("api_key").select("created_by").eq("id", auth.key.id).maybeSingle();
          if (creator?.created_by) {
            const { data: s } = await supabaseAdmin
              .from("staff").select("id, branch:branch_id(company_id)")
              .eq("user_id", creator.created_by).maybeSingle();
            if (s && (s as any).branch?.company_id === auth.key.company_id) officerId = s.id;
          }
        }

        const fullName = `${parsed.data.first_name} ${parsed.data.last_name}`.trim();
        const fullPhone = `${parsed.data.phone_country_code}${parsed.data.phone}`;
        const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

        const { data: created, error } = await supabaseAdmin
          .from("client")
          .insert({
            branch_id: branchId,
            officer_id: officerId,
            first_name: parsed.data.first_name,
            last_name: parsed.data.last_name,
            full_name: fullName,
            phone_country_code: parsed.data.phone_country_code,
            phone: fullPhone,
            national_id: parsed.data.national_id,
            email: parsed.data.email ?? null,
            date_of_birth: parsed.data.date_of_birth,
            gender: parsed.data.gender,
            address: parsed.data.address,
            gn_division: parsed.data.gn_division,
            divisional_secretariat: parsed.data.divisional_secretariat,
            district: parsed.data.district,
            province: parsed.data.province,
            photo_url: parsed.data.photo_url ?? null,
            geo_lat: parsed.data.geo_lat ?? null,
            geo_lng: parsed.data.geo_lng ?? null,
            group_id: parsed.data.group_id ?? null,
            status: "active",
            avatar_color: color,
            is_introducer: parsed.data.is_introducer ?? false,
            default_commission_pct: parsed.data.default_commission_pct ?? null,
            default_commission_amount: parsed.data.default_commission_amount ?? null,
          })
          .select("id, full_name, phone, national_id, branch_id, status, created_at")
          .single();

        if (error || !created) {
          await logApiCall({
            company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "inbound",
            endpoint: ENDPOINT, method: "POST", status_code: 500, request: parsed.data, error: error?.message ?? "insert_failed",
          });
          return errJson({ code: 500, error: "insert_failed", message: error?.message ?? "Failed to create client." });
        }

        if (parsed.data.bank_accounts && parsed.data.bank_accounts.length > 0) {
          const rows = parsed.data.bank_accounts.map((b, i) => ({
            client_id: created.id,
            bank_name: b.bank_name,
            branch_name: b.branch_name ?? null,
            account_no: b.account_no,
            account_name: b.account_name,
            swift_code: b.swift_code ?? null,
            is_primary: b.is_primary ?? i === 0,
          }));
          await supabaseAdmin.from("client_bank_account").insert(rows);
        }

        const response = {
          status: "created" as const,
          client_id: created.id,
          full_name: created.full_name,
          phone: created.phone,
          national_id: created.national_id,
          branch_id: created.branch_id,
          status_code: created.status,
          created_at: new Date(created.created_at as any).toISOString(),
        };

        await logApiCall({
          company_id: auth.key.company_id, api_key_id: auth.key.id, channel: CHANNEL, direction: "inbound",
          endpoint: ENDPOINT, method: "POST", reference: created.id, status_code: 201,
          request: withIdempotencyEnvelope(parsed.data, idem), response,
        });

        return validateAndSend(ClientCreateResponse, response, 201);
      },
    },
  },
});
