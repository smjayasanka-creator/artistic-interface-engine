import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const fieldDef = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "number", "date"]),
});

const inputSchema = z.object({
  image_base64: z.string().min(20),
  mime: z.string().min(3),
  document_kind: z.string().min(1).max(60).default("Vehicle Certificate of Registration (CR)"),
  fields: z.array(fieldDef).min(1).max(40),
});

export const extractSecurityFieldsFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI service not configured");

    const fieldList = data.fields.map((f) => `- ${f.key} (${f.type}) — "${f.label}"`).join("\n");

    const system = `You extract structured data from scanned identity/registration documents.
Return ONLY valid JSON matching the requested schema. Use the exact keys given.
For date fields use ISO format YYYY-MM-DD. For number fields return numeric strings without units or commas.
If a field is not clearly visible on the document, return an empty string for it — never guess.`;

    const userText = `Document type: ${data.document_kind}
Extract the following fields from the attached image and return a single JSON object with EXACTLY these keys:
${fieldList}

Respond with JSON only, no prose. Example shape: { "${data.fields[0].key}": "..." }`;

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: { url: `data:${data.mime};base64,${data.image_base64}` },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) throw new Error("AI rate limit reached. Please retry shortly.");
    if (res.status === 402)
      throw new Error("AI credits exhausted. Add credits in workspace billing.");
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`AI extraction failed (${res.status}): ${t.slice(0, 200)}`);
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try to salvage a JSON block
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          throw new Error("AI returned invalid JSON");
        }
      } else {
        throw new Error("AI returned invalid JSON");
      }
    }

    // Only return keys we asked for
    const out: Record<string, string> = {};
    for (const f of data.fields) {
      const v = parsed[f.key];
      out[f.key] = v == null ? "" : String(v);
    }
    return { values: out };
  });
