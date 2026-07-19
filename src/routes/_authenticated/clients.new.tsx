import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { createClient } from "@/lib/mzizi.functions";
import { getRiskScheme, saveClientRiskAssessment } from "@/lib/risk.functions";
import {
  RiskAssessmentForm,
  applicableFactors,
  type RiskAnswer,
} from "@/components/mzizi/RiskAssessmentForm";
import {
  screenCustomer,
  getScreeningConfig,
  classifyScreening,
  requestScreeningApproval,
  type ScreeningResult,
  type ScreeningMatch,
  type ScreeningTier,
} from "@/lib/screening.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/mzizi/Card";
import { cn } from "@/lib/utils";
import { Search, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  errorInputCls,
  btnPrimaryCls,
  btnSecondaryCls,
  btnGhostCls,
} from "@/components/mzizi/FormGrid";

export const Route = createFileRoute("/_authenticated/clients/new")({
  component: NewClientPage,
});

type Gender = "male" | "female" | "other";
type MaritalStatus = "" | "single" | "married" | "other";
type TabKey = "screening" | "application" | "risk" | "documents";

const TABS: { key: TabKey; label: string }[] = [
  { key: "screening", label: "Screening" },
  { key: "application", label: "KYC" },
  { key: "risk", label: "Risk profile" },
  { key: "documents", label: "Documents" },
];

type AddressBlock = { building_no: string; street1: string; street2: string; town: string };
const EMPTY_ADDR: AddressBlock = { building_no: "", street1: "", street2: "", town: "" };
const isAddrComplete = (a: AddressBlock) =>
  a.building_no.trim() !== "" && a.street1.trim() !== "" && a.town.trim() !== "";
const fmtAddr = (a: AddressBlock) =>
  [a.building_no, a.street1, a.street2, a.town]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");

const REQUIRED_DOCS: { key: "nic" | "billing"; label: string; hint: string }[] = [
  { key: "nic", label: "NIC copy", hint: "Front and back of national ID (JPG, PNG or PDF)" },
  {
    key: "billing",
    label: "Billing Proof",
    hint: "Recent utility bill or bank statement (JPG, PNG or PDF)",
  },
];

const MAX_DOC_BYTES = 10 * 1024 * 1024;

const COUNTRY_CODES: { code: string; label: string }[] = [
  { code: "+94", label: "🇱🇰 +94 Sri Lanka" },
  { code: "+91", label: "🇮🇳 +91 India" },
  { code: "+254", label: "🇰🇪 +254 Kenya" },
  { code: "+256", label: "🇺🇬 +256 Uganda" },
  { code: "+255", label: "🇹🇿 +255 Tanzania" },
  { code: "+250", label: "🇷🇼 +250 Rwanda" },
  { code: "+27", label: "🇿🇦 +27 South Africa" },
  { code: "+234", label: "🇳🇬 +234 Nigeria" },
  { code: "+971", label: "🇦🇪 +971 UAE" },
  { code: "+44", label: "🇬🇧 +44 UK" },
  { code: "+1", label: "🇺🇸 +1 USA" },
];

const clientSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(60),
  last_name: z.string().trim().min(1, "Last name is required").max(60),
  phone_country_code: z.string().min(1, "Select a country code"),
  phone: z
    .string()
    .trim()
    .min(6, "Phone must be at least 6 digits")
    .max(20)
    .regex(/^[0-9]+$/, "Digits only"),
  national_id: z.string().trim().min(4, "National ID must be at least 4 chars").max(30),
  email: z.union([z.literal(""), z.string().trim().email("Invalid email").max(255)]),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["male", "female", "other"], { message: "Select a gender" }),
  address: z.string().trim().min(3, "Address must be at least 3 chars").max(200),
  gn_division: z.string().trim().min(1, "GN Division is required").max(80),
  divisional_secretariat: z.string().trim().min(1, "Divisional Secretariat is required").max(80),
  district: z.string().trim().min(1, "District is required").max(80),
  province: z.string().trim().min(1, "Province is required").max(80),
});

type FormState = Omit<z.input<typeof clientSchema>, "gender"> & { gender: "" | Gender };
type FieldKey = keyof FormState;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function NewClientPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createClient);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<TabKey>("screening");

  // New profile fields (UI-only for now; not persisted to backend)
  const [permanentAddr, setPermanentAddr] = useState<AddressBlock>({ ...EMPTY_ADDR });
  const [mailingAddr, setMailingAddr] = useState<AddressBlock>({ ...EMPTY_ADDR });
  const [mailingSameAsPermanent, setMailingSameAsPermanent] = useState(true);
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus>("");
  const [spouseName, setSpouseName] = useState("");
  const [spouseEmployer, setSpouseEmployer] = useState("");
  const [dependents, setDependents] = useState<number | "">("");
  const [nationality, setNationality] = useState("Sri Lankan");

  const [form, setForm] = useState<FormState>({
    first_name: "",
    last_name: "",
    phone_country_code: "+94",
    phone: "",
    national_id: "",
    email: "",
    date_of_birth: "",
    gender: "",
    address: "",
    gn_division: "",
    divisional_secretariat: "",
    district: "",
    province: "",
  });
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const [isIntroducer, setIsIntroducer] = useState(false);
  const [commissionPct, setCommissionPct] = useState<number | "">("");
  const [commissionAmount, setCommissionAmount] = useState<number | "">("");

  type BankAcct = {
    bank_name: string;
    branch_name: string;
    account_no: string;
    account_name: string;
    swift_code: string;
    is_primary: boolean;
  };
  const [banks, setBanks] = useState<BankAcct[]>([]);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Onboarding documents (NIC / Billing Proof)
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({});

  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Risk profile
  const fetchScheme = useServerFn(getRiskScheme);
  const { data: riskScheme } = useQuery({
    queryKey: ["risk-scheme"],
    queryFn: () => fetchScheme(),
  });
  const [riskAnswers, setRiskAnswers] = useState<RiskAnswer[]>([]);
  const saveRiskFn = useServerFn(saveClientRiskAssessment);

  // Customer screening (inline on Application tab)
  const [screening, setScreening] = useState<ScreeningResult | null>(null);
  const [approvalInstance, setApprovalInstance] = useState<{
    id: string;
    tier: ScreeningTier;
  } | null>(null);
  const screenFn = useServerFn(screenCustomer);
  const fetchScreeningCfg = useServerFn(getScreeningConfig);
  const requestApprovalFn = useServerFn(requestScreeningApproval);
  const { data: screeningCfg } = useQuery({
    queryKey: ["screening-config"],
    queryFn: () => fetchScreeningCfg(),
  });
  const canScreen =
    form.first_name.trim().length > 0 &&
    form.last_name.trim().length > 0 &&
    form.national_id.trim().length > 0;

  const screenMut = useMutation({
    mutationFn: () =>
      screenFn({
        data: {
          name: `${form.first_name} ${form.last_name}`.trim(),
          customer_id: form.national_id.trim(),
        },
      }),
    onSuccess: (r) => {
      setScreening(r);
      setApprovalInstance(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const classification = useMemo(
    () => (screening && screeningCfg ? classifyScreening(screening, screeningCfg) : null),
    [screening, screeningCfg],
  );

  const approvalMut = useMutation({
    mutationFn: (tier: "tier1" | "tier2") =>
      requestApprovalFn({
        data: {
          tier,
          customer_name: `${form.first_name} ${form.last_name}`.trim(),
          national_id: form.national_id.trim(),
          max_score: classification?.maxScore ?? 0,
          has_direct: classification?.hasDirect ?? false,
        },
      }),
    onSuccess: (r, tier) => {
      setApprovalInstance({ id: r.instance_id, tier });
      toast.success(`Approval request created (${tier === "tier2" ? "Tier 2" : "Tier 1"})`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const errors = useMemo(() => {
    const r = clientSchema.safeParse(form);
    if (r.success) return {} as Partial<Record<FieldKey, string>>;
    const out: Partial<Record<FieldKey, string>> = {};
    for (const iss of r.error.issues) {
      const k = iss.path[0] as FieldKey;
      if (k && !out[k]) out[k] = iss.message;
    }
    return out;
  }, [form]);

  const showError = (k: FieldKey) => (submitted || touched[k]) && errors[k];
  const isValid = Object.keys(errors).length === 0;
  const missingDocs = REQUIRED_DOCS.filter((d) => !docFiles[d.key]);
  const docsSatisfied = missingDocs.length === 0;

  const applicableRiskFactors = useMemo(
    () => (riskScheme ? applicableFactors(riskScheme, null) : []),
    [riskScheme],
  );
  const riskMissing = applicableRiskFactors.filter(
    (f) => !riskAnswers.find((a) => a.factor_id === f.id && a.option_ids.length > 0),
  );
  const riskSatisfied = riskScheme != null && riskMissing.length === 0;

  const post = useMutation({
    mutationFn: createFn,
    onSuccess: async (c: any) => {
      try {
        await saveRiskFn({ data: { client_id: c.id, answers: riskAnswers } });
      } catch (e: any) {
        toast.error(`Client saved but risk profile failed: ${e.message}`);
      }
      toast.success("Client registered · pending KYC");
      qc.invalidateQueries();
      navigate({ to: "/clients/$id", params: { id: c.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends FieldKey>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const blur = (k: FieldKey) => setTouched((t) => ({ ...t, [k]: true }));

  function onPickPhoto(f: File | null) {
    if (!f) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  function onPickDoc(key: string, f: File | null) {
    if (!f) {
      setDocFiles((prev) => ({ ...prev, [key]: null }));
      return;
    }
    if (f.size > MAX_DOC_BYTES) {
      toast.error(`${f.name} exceeds 10 MB limit`);
      return;
    }
    const okTypes = ["image/", "application/pdf"];
    if (!okTypes.some((t) => f.type.startsWith(t) || f.type === t.replace(/\/$/, ""))) {
      toast.error("Only images or PDF are allowed");
      return;
    }
    setDocFiles((prev) => ({ ...prev, [key]: f }));
  }

  function captureGeo() {
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation not supported in this browser");
      return;
    }
    setGeoBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setGeoBusy(false);
      },
      (err) => {
        setGeoError(err.message || "Could not fetch location");
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function uploadPhoto(clientId: string): Promise<string | null> {
    if (!photoFile) return null;
    setUploading(true);
    try {
      const ext = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${clientId}/photo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("client-photos")
        .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
      if (error) throw error;
      const { data } = supabase.storage.from("client-photos").getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  }

  async function uploadDocs(clientId: string) {
    for (const doc of REQUIRED_DOCS) {
      const file = docFiles[doc.key];
      if (!file) continue;
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${clientId}/${doc.key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw new Error(`${doc.label}: ${error.message}`);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    // Core zod fields (Personal details) live on the Screening tab
    const screeningFields: FieldKey[] = [
      "first_name",
      "last_name",
      "national_id",
      "phone_country_code",
      "phone",
    ];
    const appFields: FieldKey[] = [
      "date_of_birth",
      "gender",
      "email",
      "address",
      "gn_division",
      "divisional_secretariat",
      "district",
      "province",
    ];
    const hasScreeningErr = screeningFields.some((k) => errors[k]);
    const hasAppErr = appFields.some((k) => errors[k]);
    if (!isValid) {
      toast.error("Please fix the highlighted fields");
      setTab(hasScreeningErr ? "screening" : hasAppErr ? "application" : "screening");
      return;
    }
    if (!isAddrComplete(permanentAddr)) {
      toast.error("Permanent address is required");
      setTab("application");
      return;
    }
    if (!mailingSameAsPermanent && !isAddrComplete(mailingAddr)) {
      toast.error("Mailing address is required");
      setTab("application");
      return;
    }
    if (!maritalStatus) {
      toast.error("Marital status is required");
      setTab("application");
      return;
    }
    if (maritalStatus === "married" && !spouseName.trim()) {
      toast.error("Spouse name is required");
      setTab("application");
      return;
    }
    if (!nationality.trim()) {
      toast.error("Nationality is required");
      setTab("application");
      return;
    }
    if (!docsSatisfied) {
      toast.error(`Missing document(s): ${missingDocs.map((d) => d.label).join(", ")}`);
      setTab("documents");
      return;
    }
    if (!riskSatisfied) {
      toast.error(`Risk profile incomplete: ${riskMissing.length} factor(s) pending`);
      setTab("risk");
      return;
    }
    post.mutate(
      {
        data: {
          first_name: form.first_name,
          last_name: form.last_name,
          phone_country_code: form.phone_country_code,
          phone: form.phone,
          national_id: form.national_id,
          email: form.email || undefined,
          date_of_birth: form.date_of_birth,
          gender: form.gender as Gender,
          address: form.address,
          gn_division: form.gn_division,
          divisional_secretariat: form.divisional_secretariat,
          district: form.district,
          province: form.province,
          photo_url: null,
          geo_lat: geo?.lat ?? null,
          geo_lng: geo?.lng ?? null,
          is_introducer: isIntroducer,
          default_commission_pct:
            isIntroducer && commissionPct !== "" ? Number(commissionPct) : null,
          default_commission_amount:
            isIntroducer && commissionAmount !== "" ? Number(commissionAmount) : null,
          bank_accounts: banks
            .filter((b) => b.bank_name.trim() && b.account_no.trim() && b.account_name.trim())
            .map((b) => ({
              bank_name: b.bank_name.trim(),
              branch_name: b.branch_name.trim() || null,
              account_no: b.account_no.trim(),
              account_name: b.account_name.trim(),
              swift_code: b.swift_code.trim() || null,
              is_primary: b.is_primary,
            })),
        },
      },
      {
        onSuccess: async (c: any) => {
          try {
            const photoUrl = await uploadPhoto(c.id);
            if (photoUrl) {
              await supabase.from("client").update({ photo_url: photoUrl }).eq("id", c.id);
            }
          } catch (err: any) {
            toast.error(`Client saved but photo upload failed: ${err.message}`);
          }
          try {
            await uploadDocs(c.id);
          } catch (err: any) {
            toast.error(`Client saved but a document upload failed: ${err.message}`);
          }
        },
      },
    );
  }

  const cls = (k: FieldKey) => (showError(k) ? errorInputCls : inputCls);

  return (
    <div className="animate-fadein flex flex-col gap-4 text-[12.5px]">
      <Link
        to="/clients"
        className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 self-start"
      >
        ← Back to clients
      </Link>

      <div className="flex items-center gap-1 border-b border-border -mx-1 px-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = tab === t.key;
          const showDocBadge = t.key === "documents" && !docsSatisfied;
          const showRiskBadge = t.key === "risk" && !riskSatisfied;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-2 text-[12.5px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-2",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {showDocBadge && (
                <span className="text-[10px] rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5">
                  {missingDocs.length} pending
                </span>
              )}
              {t.key === "documents" && docsSatisfied && (
                <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5">
                  ready
                </span>
              )}
              {showRiskBadge && (
                <span className="text-[10px] rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5">
                  {riskMissing.length || "…"} pending
                </span>
              )}
              {t.key === "risk" && riskSatisfied && (
                <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5">
                  ready
                </span>
              )}
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {tab === "screening" && (
          <>
            <Card className="p-6">
              <h2 className="text-[11px] font-semibold mb-4 text-faint uppercase tracking-wider">
                Personal details
              </h2>
              <FormGrid>
                <FormField
                  label="First name"
                  required
                  span={4}
                  error={showError("first_name") ? errors.first_name : undefined}
                >
                  <input
                    value={form.first_name}
                    onChange={(e) => set("first_name", e.target.value)}
                    onBlur={() => blur("first_name")}
                    className={cls("first_name")}
                    maxLength={60}
                  />
                </FormField>
                <FormField
                  label="Last name"
                  required
                  span={4}
                  error={showError("last_name") ? errors.last_name : undefined}
                >
                  <input
                    value={form.last_name}
                    onChange={(e) => set("last_name", e.target.value)}
                    onBlur={() => blur("last_name")}
                    className={cls("last_name")}
                    maxLength={60}
                  />
                </FormField>
                <FormField
                  label="National ID"
                  required
                  span={4}
                  error={showError("national_id") ? errors.national_id : undefined}
                >
                  <input
                    value={form.national_id}
                    onChange={(e) => set("national_id", e.target.value)}
                    onBlur={() => blur("national_id")}
                    className={`${cls("national_id")} font-mono`}
                    maxLength={30}
                  />
                </FormField>

                <FormField
                  label="Country code"
                  required
                  span={3}
                  error={showError("phone_country_code") ? errors.phone_country_code : undefined}
                >
                  <select
                    value={form.phone_country_code}
                    onChange={(e) => set("phone_country_code", e.target.value)}
                    onBlur={() => blur("phone_country_code")}
                    className={cls("phone_country_code")}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label="Phone"
                  required
                  span={9}
                  error={showError("phone") ? errors.phone : undefined}
                >
                  <input
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value.replace(/[^\d]/g, ""))}
                    onBlur={() => blur("phone")}
                    placeholder="7XXXXXXXX"
                    className={`${cls("phone")} font-mono`}
                    maxLength={15}
                  />
                </FormField>
              </FormGrid>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                <div className="text-[11.5px] text-muted-foreground">
                  Screen this customer against FIU sanction & watch lists.
                  {!canScreen && " Fill first name, last name and national ID first."}
                </div>
                <button
                  type="button"
                  onClick={() => screenMut.mutate()}
                  disabled={!canScreen || screenMut.isPending}
                  className={btnSecondaryCls}
                >
                  <Search size={13} className="mr-1" />
                  {screenMut.isPending
                    ? "Screening…"
                    : screening
                      ? "Re-run screening"
                      : "Screen customer"}
                </button>
              </div>

              {screening && (
                <ScreeningResultCard
                  result={screening}
                  classification={classification}
                  config={screeningCfg ?? null}
                  onRequestApproval={(tier) => approvalMut.mutate(tier)}
                  requesting={approvalMut.isPending}
                  approvalInstance={approvalInstance}
                />
              )}
            </Card>
          </>
        )}

        {tab === "application" && (
          <>
            <Card className="p-6">
              <h2 className="text-[11px] font-semibold mb-4 text-faint uppercase tracking-wider">
                Personal profile
              </h2>
              <FormGrid>
                <FormField
                  label="Date of birth"
                  required
                  span={4}
                  error={showError("date_of_birth") ? errors.date_of_birth : undefined}
                >
                  <input
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => set("date_of_birth", e.target.value)}
                    onBlur={() => blur("date_of_birth")}
                    className={cls("date_of_birth")}
                  />
                </FormField>
                <FormField
                  label="Gender"
                  required
                  span={4}
                  error={showError("gender") ? errors.gender : undefined}
                >
                  <select
                    value={form.gender}
                    onChange={(e) => set("gender", e.target.value as "" | Gender)}
                    onBlur={() => blur("gender")}
                    className={cls("gender")}
                  >
                    <option value="">Select…</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </FormField>
                <FormField
                  label="Email"
                  span={4}
                  error={showError("email") ? errors.email : undefined}
                >
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    onBlur={() => blur("email")}
                    className={cls("email")}
                    maxLength={255}
                  />
                </FormField>
                <FormField label="Nationality" required span={4}>
                  <input
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    className={inputCls}
                    maxLength={60}
                  />
                </FormField>
                <FormField label="Marital status" required span={4}>
                  <select
                    value={maritalStatus}
                    onChange={(e) => setMaritalStatus(e.target.value as MaritalStatus)}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="other">Other</option>
                  </select>
                </FormField>
                <FormField label="No. of dependents" span={4}>
                  <input
                    type="number"
                    min={0}
                    className={inputCls + " font-mono"}
                    value={dependents}
                    onChange={(e) =>
                      setDependents(
                        e.target.value === "" ? "" : Math.max(0, Number(e.target.value)),
                      )
                    }
                  />
                </FormField>
                {maritalStatus === "married" && (
                  <>
                    <FormField label="Name of spouse" required span={6}>
                      <input
                        value={spouseName}
                        onChange={(e) => setSpouseName(e.target.value)}
                        className={inputCls}
                        maxLength={120}
                      />
                    </FormField>
                    <FormField label="Spouse employer" span={6}>
                      <input
                        value={spouseEmployer}
                        onChange={(e) => setSpouseEmployer(e.target.value)}
                        className={inputCls}
                        maxLength={120}
                      />
                    </FormField>
                  </>
                )}
              </FormGrid>
            </Card>

            <Card className="p-6">
              <h2 className="text-[11px] font-semibold mb-4 text-faint uppercase tracking-wider">
                Permanent address
              </h2>
              <FormGrid>
                <FormField label="Building number" required span={3}>
                  <input
                    value={permanentAddr.building_no}
                    onChange={(e) =>
                      setPermanentAddr({ ...permanentAddr, building_no: e.target.value })
                    }
                    className={inputCls}
                    maxLength={40}
                  />
                </FormField>
                <FormField label="Street 1" required span={4}>
                  <input
                    value={permanentAddr.street1}
                    onChange={(e) =>
                      setPermanentAddr({ ...permanentAddr, street1: e.target.value })
                    }
                    className={inputCls}
                    maxLength={80}
                  />
                </FormField>
                <FormField label="Street 2" span={4}>
                  <input
                    value={permanentAddr.street2}
                    onChange={(e) =>
                      setPermanentAddr({ ...permanentAddr, street2: e.target.value })
                    }
                    className={inputCls}
                    maxLength={80}
                  />
                </FormField>
                <FormField label="Town" required span={3}>
                  <input
                    value={permanentAddr.town}
                    onChange={(e) => setPermanentAddr({ ...permanentAddr, town: e.target.value })}
                    className={inputCls}
                    maxLength={80}
                  />
                </FormField>
              </FormGrid>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[11px] font-semibold text-faint uppercase tracking-wider">
                  Mailing address
                </h2>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={mailingSameAsPermanent}
                    onChange={(e) => setMailingSameAsPermanent(e.target.checked)}
                  />
                  Same as permanent address
                </label>
              </div>
              {!mailingSameAsPermanent && (
                <FormGrid>
                  <FormField label="Building number" required span={3}>
                    <input
                      value={mailingAddr.building_no}
                      onChange={(e) =>
                        setMailingAddr({ ...mailingAddr, building_no: e.target.value })
                      }
                      className={inputCls}
                      maxLength={40}
                    />
                  </FormField>
                  <FormField label="Street 1" required span={4}>
                    <input
                      value={mailingAddr.street1}
                      onChange={(e) => setMailingAddr({ ...mailingAddr, street1: e.target.value })}
                      className={inputCls}
                      maxLength={80}
                    />
                  </FormField>
                  <FormField label="Street 2" span={4}>
                    <input
                      value={mailingAddr.street2}
                      onChange={(e) => setMailingAddr({ ...mailingAddr, street2: e.target.value })}
                      className={inputCls}
                      maxLength={80}
                    />
                  </FormField>
                  <FormField label="Town" required span={3}>
                    <input
                      value={mailingAddr.town}
                      onChange={(e) => setMailingAddr({ ...mailingAddr, town: e.target.value })}
                      className={inputCls}
                      maxLength={80}
                    />
                  </FormField>
                </FormGrid>
              )}
            </Card>

            <Card className="p-6">
              <h2 className="text-[11px] font-semibold mb-4 text-faint uppercase tracking-wider">
                Address (administrative)
              </h2>
              <FormGrid>
                <FormField
                  label="Residential address"
                  required
                  span={12}
                  error={showError("address") ? errors.address : undefined}
                >
                  <textarea
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    onBlur={() => blur("address")}
                    rows={2}
                    maxLength={200}
                    className={cls("address")}
                  />
                </FormField>
                <FormField
                  label="GN Division"
                  required
                  span={6}
                  error={showError("gn_division") ? errors.gn_division : undefined}
                >
                  <input
                    value={form.gn_division}
                    onChange={(e) => set("gn_division", e.target.value)}
                    onBlur={() => blur("gn_division")}
                    className={cls("gn_division")}
                    maxLength={80}
                  />
                </FormField>
                <FormField
                  label="Divisional Secretariat"
                  required
                  span={6}
                  error={
                    showError("divisional_secretariat") ? errors.divisional_secretariat : undefined
                  }
                >
                  <input
                    value={form.divisional_secretariat}
                    onChange={(e) => set("divisional_secretariat", e.target.value)}
                    onBlur={() => blur("divisional_secretariat")}
                    className={cls("divisional_secretariat")}
                    maxLength={80}
                  />
                </FormField>
                <FormField
                  label="District"
                  required
                  span={6}
                  error={showError("district") ? errors.district : undefined}
                >
                  <input
                    value={form.district}
                    onChange={(e) => set("district", e.target.value)}
                    onBlur={() => blur("district")}
                    className={cls("district")}
                    maxLength={80}
                  />
                </FormField>
                <FormField
                  label="Province"
                  required
                  span={6}
                  error={showError("province") ? errors.province : undefined}
                >
                  <input
                    value={form.province}
                    onChange={(e) => set("province", e.target.value)}
                    onBlur={() => blur("province")}
                    className={cls("province")}
                    maxLength={80}
                  />
                </FormField>
              </FormGrid>
            </Card>

            <Card className="p-6">
              <h2 className="text-[11px] font-semibold mb-4 text-faint uppercase tracking-wider">
                Customer photo
              </h2>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Customer preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    "No photo"
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={btnSecondaryCls}
                      onClick={() => fileRef.current?.click()}
                    >
                      {photoFile ? "Change photo" : "Choose photo"}
                    </button>
                    {photoFile && (
                      <button
                        type="button"
                        className={btnGhostCls}
                        onClick={() => onPickPhoto(null)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">JPG or PNG, up to 5MB.</span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-[11px] font-semibold mb-4 text-faint uppercase tracking-wider">
                Customer geo location
              </h2>
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  type="button"
                  className={btnSecondaryCls}
                  onClick={captureGeo}
                  disabled={geoBusy}
                >
                  {geoBusy ? "Locating…" : geo ? "Recapture location" : "Capture current location"}
                </button>
                {geo && (
                  <span className="text-sm font-mono text-secondary-foreground">
                    {geo.lat}, {geo.lng}
                  </span>
                )}
                {geoError && <span className="text-xs text-destructive">{geoError}</span>}
                {!geo && !geoError && (
                  <span className="text-xs text-muted-foreground">
                    Optional. Uses your device location.
                  </span>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-[11px] font-semibold mb-4 text-faint uppercase tracking-wider">
                Bank accounts
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                Add bank accounts used for FD pay-out or interest transfer. Mark one as primary.
              </p>
              <div className="flex flex-col gap-2">
                {banks.map((b, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      placeholder="Bank name"
                      className={inputCls + " col-span-3"}
                      value={b.bank_name}
                      onChange={(e) =>
                        setBanks(
                          banks.map((x, j) => (j === i ? { ...x, bank_name: e.target.value } : x)),
                        )
                      }
                    />
                    <input
                      placeholder="Branch"
                      className={inputCls + " col-span-2"}
                      value={b.branch_name}
                      onChange={(e) =>
                        setBanks(
                          banks.map((x, j) =>
                            j === i ? { ...x, branch_name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <input
                      placeholder="Account no"
                      className={inputCls + " col-span-2 font-mono"}
                      value={b.account_no}
                      onChange={(e) =>
                        setBanks(
                          banks.map((x, j) => (j === i ? { ...x, account_no: e.target.value } : x)),
                        )
                      }
                    />
                    <input
                      placeholder="Account name"
                      className={inputCls + " col-span-3"}
                      value={b.account_name}
                      onChange={(e) =>
                        setBanks(
                          banks.map((x, j) =>
                            j === i ? { ...x, account_name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <label className="col-span-1 flex items-center gap-1 text-[11px]">
                      <input
                        type="radio"
                        name="primary_bank"
                        checked={b.is_primary}
                        onChange={() =>
                          setBanks(banks.map((x, j) => ({ ...x, is_primary: j === i })))
                        }
                      />
                      Primary
                    </label>
                    <button
                      type="button"
                      className="col-span-1 text-destructive hover:text-destructive/80 flex justify-center"
                      onClick={() => setBanks(banks.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={btnSecondaryCls + " self-start"}
                  onClick={() =>
                    setBanks([
                      ...banks,
                      {
                        bank_name: "",
                        branch_name: "",
                        account_no: "",
                        account_name: "",
                        swift_code: "",
                        is_primary: banks.length === 0,
                      },
                    ])
                  }
                >
                  + Add bank account
                </button>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-[11px] font-semibold mb-4 text-faint uppercase tracking-wider">
                Introducer settings
              </h2>
              <label className="flex items-center gap-2 text-sm mb-3">
                <input
                  type="checkbox"
                  checked={isIntroducer}
                  onChange={(e) => setIsIntroducer(e.target.checked)}
                />
                This customer can be selected as an introducer on FD / loan bookings
              </label>
              {isIntroducer && (
                <FormGrid>
                  <FormField label="Default commission %" span={3}>
                    <input
                      type="number"
                      step="0.001"
                      className={inputCls + " font-mono"}
                      value={commissionPct}
                      onChange={(e) =>
                        setCommissionPct(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </FormField>
                  <FormField label="Default commission amount" span={3}>
                    <input
                      type="number"
                      step="0.01"
                      className={inputCls + " font-mono"}
                      value={commissionAmount}
                      onChange={(e) =>
                        setCommissionAmount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </FormField>
                  <FormField label="" span={6}>
                    <span className="text-[11px] text-muted-foreground">
                      Amount takes precedence over percentage when both are set. Either can be
                      overridden per booking.
                    </span>
                  </FormField>
                </FormGrid>
              )}
            </Card>
          </>
        )}

        {tab === "risk" && (
          <Card className="p-6">
            <h2 className="text-[11px] font-semibold mb-1 text-faint uppercase tracking-wider">
              Initial risk profile
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Complete the risk assessment. All applicable factors must be answered before the
              client can be registered. Scoring scheme is maintained in Administration → Risk
              profiling.
            </p>
            {!riskScheme ? (
              <div className="text-sm text-muted-foreground">Loading risk scheme…</div>
            ) : (
              <RiskAssessmentForm
                scheme={riskScheme}
                answers={riskAnswers}
                onChange={setRiskAnswers}
              />
            )}
          </Card>
        )}

        {tab === "documents" && (
          <Card className="p-6">
            <h2 className="text-[11px] font-semibold mb-1 text-faint uppercase tracking-wider">
              Onboarding documents
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Attach the required KYC documents below. Each file must be an image or PDF, up to 10
              MB.
            </p>
            <div className="flex flex-col gap-3">
              {REQUIRED_DOCS.map((d) => {
                const file = docFiles[d.key];
                return (
                  <div
                    key={d.key}
                    className="border border-border rounded-md p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{d.label}</span>
                        <span className="text-[10px] uppercase tracking-wider rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5">
                          Required
                        </span>
                        {file && (
                          <span className="text-[10px] uppercase tracking-wider rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5">
                            Attached
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground mt-0.5">{d.hint}</div>
                      {file && (
                        <div className="text-[11.5px] font-mono text-secondary-foreground mt-1 truncate">
                          {file.name} · {formatBytes(file.size)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className={btnSecondaryCls + " cursor-pointer"}>
                        {file ? "Replace" : "Choose file"}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(e) => onPickDoc(d.key, e.target.files?.[0] ?? null)}
                        />
                      </label>
                      {file && (
                        <button
                          type="button"
                          className={btnGhostCls}
                          onClick={() => onPickDoc(d.key, null)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {!docsSatisfied && (
              <div className="text-[11.5px] rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2 mt-4">
                Still missing: {missingDocs.map((d) => d.label).join(", ")}
              </div>
            )}
          </Card>
        )}

        <FormActions>
          {submitted && !isValid && (
            <span className="text-xs text-destructive mr-auto">
              Fix {Object.keys(errors).length} field(s) above
            </span>
          )}
          {submitted && isValid && !docsSatisfied && (
            <span className="text-xs text-destructive mr-auto">Attach the required documents</span>
          )}
          {submitted && isValid && docsSatisfied && !riskSatisfied && (
            <span className="text-xs text-destructive mr-auto">
              Complete the risk profile ({riskMissing.length} pending)
            </span>
          )}
          <Link to="/clients" className={btnSecondaryCls}>
            Cancel
          </Link>
          <button
            type="submit"
            disabled={
              post.isPending ||
              uploading ||
              (submitted && (!isValid || !docsSatisfied || !riskSatisfied))
            }
            className={btnPrimaryCls}
          >
            {uploading ? "Uploading photo…" : post.isPending ? "Saving…" : "Register client"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}

/* ─────────── Screening result card (inline on Application tab) ─────────── */

type Classification = { tier: ScreeningTier; maxScore: number; hasDirect: boolean } | null;

function ScreeningResultCard({
  result,
  classification,
  config,
  onRequestApproval,
  requesting,
  approvalInstance,
}: {
  result: ScreeningResult;
  classification: Classification;
  config: {
    tier1_min_score: number;
    tier2_min_score: number;
    auto_escalate_direct: boolean;
  } | null;
  onRequestApproval: (tier: "tier1" | "tier2") => void;
  requesting: boolean;
  approvalInstance: { id: string; tier: ScreeningTier } | null;
}) {
  const tier = classification?.tier ?? "clear";
  const tierMeta =
    tier === "tier2"
      ? {
          Icon: ShieldAlert,
          text: "Tier 2 escalation required",
          cls: "border-destructive/40 bg-destructive/10 text-destructive",
        }
      : tier === "tier1"
        ? {
            Icon: AlertTriangle,
            text: "Tier 1 review required",
            cls: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
          }
        : {
            Icon: CheckCircle2,
            text: "No approval required — customer is clear",
            cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
          };
  const Icon = tierMeta.Icon;

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[11px] font-semibold text-faint uppercase tracking-wider">
            Screening result
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {classification
              ? `Highest fuzzy score ${classification.maxScore.toFixed(1)}${classification.hasDirect ? " · direct match on watch list" : ""}.`
              : "Loading routing config…"}
            {config && (
              <>
                {" "}
                Thresholds: Tier 1 ≥ {config.tier1_min_score}, Tier 2 ≥ {config.tier2_min_score}.
              </>
            )}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] mb-4",
          tierMeta.cls,
        )}
      >
        <Icon size={14} />
        {tierMeta.text}
      </div>

      {tier !== "clear" && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
          <div className="text-[12px] text-muted-foreground">
            {approvalInstance
              ? `Approval request submitted (${approvalInstance.tier === "tier2" ? "Tier 2" : "Tier 1"}). Track it under Approvals.`
              : `Route this hit to the ${tier === "tier2" ? "Tier 2 escalation" : "Tier 1 review"} workflow.`}
          </div>
          {!approvalInstance && (
            <button
              type="button"
              className={btnPrimaryCls}
              disabled={requesting}
              onClick={() => onRequestApproval(tier === "tier2" ? "tier2" : "tier1")}
            >
              {requesting ? "Requesting…" : "Request approval"}
            </button>
          )}
        </div>
      )}

      <MatchesSection
        title="Direct matches"
        emptyLabel="No direct matches found."
        matches={result.direct_matches}
        variant="direct"
      />
      <div className="h-3" />
      <MatchesSection
        title="Fuzzy matches"
        emptyLabel="No fuzzy matches found."
        matches={result.fuzzy_matches}
        variant="fuzzy"
      />
    </div>
  );
}

function MatchesSection({
  title,
  emptyLabel,
  matches,
  variant,
}: {
  title: string;
  emptyLabel: string;
  matches: ScreeningMatch[];
  variant: "direct" | "fuzzy";
}) {
  return (
    <div className="rounded-md border border-border">
      <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
        <span className="text-[12.5px] font-semibold">{title}</span>
        <span className="text-[11px] text-muted-foreground">
          {matches.length} result{matches.length === 1 ? "" : "s"}
        </span>
      </div>
      {matches.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-muted-foreground">{emptyLabel}</div>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left font-medium px-3 py-2">List type</th>
              <th className="text-left font-medium px-3 py-2">Reference</th>
              {variant === "fuzzy" && <th className="text-right font-medium px-3 py-2">Score</th>}
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                    {m.list_type}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono">{m.ref}</td>
                {variant === "fuzzy" && (
                  <td className="px-3 py-2 text-right font-mono">
                    {typeof m.score === "number" ? `${m.score.toFixed(1)}%` : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
