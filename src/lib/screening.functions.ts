import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  name: z.string().trim().min(1),
  customer_id: z.string().trim().min(1),
});

export type ScreeningMatch = {
  list_type: string;
  ref: string;
  score?: number;
};

export type ScreeningResult = {
  direct_matches: ScreeningMatch[];
  fuzzy_matches: ScreeningMatch[];
};

export const screenCustomer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<ScreeningResult> => {
    const token = process.env.FIUSL_SCREENING_TOKEN;
    if (!token) {
      throw new Error("FIUSL_SCREENING_TOKEN is not configured");
    }
    const res = await fetch("https://fiusl-screening.web.lk/api/screen", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Screening failed [${res.status}]: ${body}`);
    }
    const json = (await res.json()) as ScreeningResult;
    return {
      direct_matches: Array.isArray(json.direct_matches) ? json.direct_matches : [],
      fuzzy_matches: Array.isArray(json.fuzzy_matches) ? json.fuzzy_matches : [],
    };
  });
