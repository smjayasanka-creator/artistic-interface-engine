## Goal

Wire the "Register client" button on `/clients/new` to call Instafin's `/submit/instafin.CreatePerson` (role `IndividualClient`) **first**. Only if Instafin returns 200 do we persist the client locally and store Instafin's returned ID.

## Secrets

Request three backend secrets (Basic-auth flow):
- `INSTAFIN_BASE_URL` — tenant URL (e.g. `https://demo.instafin.net`)
- `INSTAFIN_USERNAME`
- `INSTAFIN_PASSWORD`

## Payload mapping (form → Instafin)

Only send truly-required fields **plus** any of our form fields that map cleanly. Everything tenant-specific (numeric config IDs) is omitted for now.

Required by Instafin:
- `roles`: `["IndividualClient"]`
- `name`: `""` (server derives from personal.firstName/lastName)
- `beneficiaries`: `[]`
- `tagsID`: `[]`
- `personal.firstName` ← form `first_name`
- `personal.lastName` ← form `last_name`
- `personal.sourceOfIncomeIDs`: `[]`
- `personal.dependants`: `[]`
- `personal.ownedBusinessesIDs`: `[]`

Optional fields we already collect and will send:
- `personal.dateOfBirth` ← `date_of_birth` (YYYY-MM-DD)
- `personal.placeOfBirth` — skipped (not in form)
- `email` ← `email`
- `mobile`: `{ regionCode: phone_country_code stripped to ISO2 fallback "LK", number: phone }`
- `address`: `{ street1: address, city: divisional_secretariat, state: province, country: "LK" }` plus `village: gn_division`
- `taxNumber` — skipped

Gender/marital/occupation/etc. are numeric IDs → omitted (per your "only required + matching form fields" choice).

## Files to create / edit

1. **`src/lib/instafin.server.ts`** (new)
   - `instafinCreatePerson(payload)` — server-only fetch helper. Reads `INSTAFIN_BASE_URL/USERNAME/PASSWORD` inside the function, sends `Authorization: Basic <base64(user:pass)>`, POSTs JSON to `${BASE}/submit/instafin.CreatePerson`, returns `{ ok, status, body }`. Throws a typed `InstafinError` with the Instafin `FieldErrors` body on non-2xx.
   - `buildCreatePersonPayload(form)` — pure mapper from our form shape to the Instafin request body described above.

2. **`src/lib/mzizi.functions.ts`** (edit `createClient` server fn)
   - Before the Supabase insert, call `instafinCreatePerson(buildCreatePersonPayload(data))`.
   - On failure: throw a user-visible error `"Instafin rejected the client: <message>"` and **do not** insert locally.
   - On success: capture returned `ID` (person UUID) and, if present, `clientID`. Pass into insert as new columns `external_person_id` / `external_client_id`.
   - Wrap the whole thing so the mutation is atomic from the UI's POV (Instafin call → insert → bank accounts). If the local insert fails after Instafin succeeded, surface a clear "Created in Instafin but local save failed — contact admin" error (no auto-rollback to Instafin; they have no delete-person endpoint we're wiring yet).

3. **`supabase/migrations/<ts>_client_external_ids.sql`** (new)
   - `ALTER TABLE public.client ADD COLUMN external_person_id text, ADD COLUMN external_client_id text;`
   - Index on `external_person_id`.

4. **`src/routes/_authenticated/clients.new.tsx`** — no structural change; existing submit flow already calls `createClient`. Only tweak: show the Instafin error message from the server-fn error when present (toast already does this generically — confirm and leave alone if so).

5. **Public API endpoint (`src/routes/api/public/v1/clients.create.ts`)** — same treatment: call Instafin first, then insert. Same helper reused.

## Error handling contract

- 400 from Instafin (`FieldErrors`) → surface field messages to the toast.
- 401/403 → "Instafin credentials rejected — check backend secrets."
- 409/429 → "Instafin is busy, please retry."
- Network / 5xx → "Could not reach Instafin."
- All Instafin request/response pairs logged into `api_transaction_log` with `channel="instafin"`, `direction="outbound"`, `endpoint="/submit/instafin.CreatePerson"`.

## Out of scope (call out for later)

- Config-ID resolution (gender, ID doc type, tags, branch external ID) — will add once you provide the fixed IDs or ask us to fetch from `/query/config.*`.
- Uploading NIC + billing docs to Instafin (`profileImageID`/`primaryIdentification`) — not wired.
- Update / delete-person sync.
- The 6 other endpoints in the spec (loans, savings, transactions, etc.).

## Verification

After build:
1. Curl the new endpoint via `stack_modern--invoke-server-function` with a fake payload to confirm shape-mapping produces the expected JSON (dry-run log path).
2. Once the user pastes real Instafin credentials into the secret form, submit a real client from `/clients/new` and confirm the returned `ID` lands in `client.external_person_id`.