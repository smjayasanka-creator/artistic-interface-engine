import type { ComponentType } from "react";
import { InviteEmail } from "./invite";

export interface TemplateEntry {
  component: ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  displayName?: string;
  previewData?: Record<string, any>;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  "staff-invite": {
    component: InviteEmail,
    subject: (d) => `You've been invited to join ${d.siteName ?? "the workspace"}`,
    displayName: "Staff invitation",
    previewData: {
      siteName: "Acme Microfinance",
      siteUrl: "https://example.com",
      confirmationUrl: "https://example.com/auth?invited=1&email=teammate%40example.com",
    },
  },
};
