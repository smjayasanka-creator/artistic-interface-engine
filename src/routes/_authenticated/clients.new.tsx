import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { createClient } from "@/lib/mzizi.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/mzizi/Card";
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

function NewClientPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createClient);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

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

  const post = useMutation({
    mutationFn: createFn,
    onSuccess: (c: any) => {
      toast.success("Client registered · pending KYC");
      qc.invalidateQueries();
      navigate({ to: "/clients/$id", params: { id: c.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends FieldKey>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
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

  async function uploadPhoto(): Promise<string | null> {
    if (!photoFile) return null;
    setUploading(true);
    try {
      const ext = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("client-photos")
        .upload(path, photoFile, { upsert: false, contentType: photoFile.type });
      if (error) throw error;
      const { data } = supabase.storage.from("client-photos").getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!isValid) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    let photo_url: string | null = null;
    try {
      photo_url = await uploadPhoto();
    } catch (err: any) {
      toast.error(`Photo upload failed: ${err.message}`);
      return;
    }
    post.mutate({
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
        photo_url,
        geo_lat: geo?.lat ?? null,
        geo_lng: geo?.lng ?? null,
      },
    });
  }

  const cls = (k: FieldKey) => (showError(k) ? errorInputCls : inputCls);

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/clients" className="text-xs text-primary hover:underline">← Back to clients</Link>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-secondary-foreground uppercase tracking-wider">Personal details</h2>
          <FormGrid>
            <FormField label="First name" required span={4} error={showError("first_name") ? errors.first_name : undefined}>
              <input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} onBlur={() => blur("first_name")} className={cls("first_name")} maxLength={60} />
            </FormField>
            <FormField label="Last name" required span={4} error={showError("last_name") ? errors.last_name : undefined}>
              <input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} onBlur={() => blur("last_name")} className={cls("last_name")} maxLength={60} />
            </FormField>
            <FormField label="National ID" required span={4} error={showError("national_id") ? errors.national_id : undefined}>
              <input value={form.national_id} onChange={(e) => set("national_id", e.target.value)} onBlur={() => blur("national_id")} className={`${cls("national_id")} font-mono`} maxLength={30} />
            </FormField>

            <FormField label="Date of birth" required span={3} error={showError("date_of_birth") ? errors.date_of_birth : undefined}>
              <input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} onBlur={() => blur("date_of_birth")} className={cls("date_of_birth")} />
            </FormField>
            <FormField label="Gender" required span={2} error={showError("gender") ? errors.gender : undefined}>
              <select value={form.gender} onChange={(e) => set("gender", e.target.value as "" | Gender)} onBlur={() => blur("gender")} className={cls("gender")}>
                <option value="">Select…</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </FormField>

            <FormField label="Country code" required span={3} error={showError("phone_country_code") ? errors.phone_country_code : undefined}>
              <select
                value={form.phone_country_code}
                onChange={(e) => set("phone_country_code", e.target.value)}
                onBlur={() => blur("phone_country_code")}
                className={cls("phone_country_code")}
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Phone" required span={4} error={showError("phone") ? errors.phone : undefined}>
              <input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value.replace(/[^\d]/g, ""))}
                onBlur={() => blur("phone")}
                placeholder="7XXXXXXXX"
                className={`${cls("phone")} font-mono`}
                maxLength={15}
              />
            </FormField>

            <FormField label="Email" span={12} error={showError("email") ? errors.email : undefined}>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} onBlur={() => blur("email")} className={cls("email")} maxLength={255} />
            </FormField>
          </FormGrid>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-secondary-foreground uppercase tracking-wider">Address</h2>
          <FormGrid>
            <FormField label="Residential address" required span={12} error={showError("address") ? errors.address : undefined}>
              <textarea value={form.address} onChange={(e) => set("address", e.target.value)} onBlur={() => blur("address")} rows={2} maxLength={200} className={cls("address")} />
            </FormField>
            <FormField label="GN Division" required span={6} error={showError("gn_division") ? errors.gn_division : undefined}>
              <input value={form.gn_division} onChange={(e) => set("gn_division", e.target.value)} onBlur={() => blur("gn_division")} className={cls("gn_division")} maxLength={80} />
            </FormField>
            <FormField label="Divisional Secretariat" required span={6} error={showError("divisional_secretariat") ? errors.divisional_secretariat : undefined}>
              <input value={form.divisional_secretariat} onChange={(e) => set("divisional_secretariat", e.target.value)} onBlur={() => blur("divisional_secretariat")} className={cls("divisional_secretariat")} maxLength={80} />
            </FormField>
            <FormField label="District" required span={6} error={showError("district") ? errors.district : undefined}>
              <input value={form.district} onChange={(e) => set("district", e.target.value)} onBlur={() => blur("district")} className={cls("district")} maxLength={80} />
            </FormField>
            <FormField label="Province" required span={6} error={showError("province") ? errors.province : undefined}>
              <input value={form.province} onChange={(e) => set("province", e.target.value)} onBlur={() => blur("province")} className={cls("province")} maxLength={80} />
            </FormField>
          </FormGrid>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-secondary-foreground uppercase tracking-wider">Customer photo</h2>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center text-xs text-muted-foreground">
              {photoPreview ? (
                <img src={photoPreview} alt="Customer preview" className="w-full h-full object-cover" />
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
                <button type="button" className={btnSecondaryCls} onClick={() => fileRef.current?.click()}>
                  {photoFile ? "Change photo" : "Choose photo"}
                </button>
                {photoFile && (
                  <button type="button" className={btnGhostCls} onClick={() => onPickPhoto(null)}>
                    Remove
                  </button>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">JPG or PNG, up to 5MB.</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-secondary-foreground uppercase tracking-wider">Customer geo location</h2>
          <div className="flex items-center gap-4 flex-wrap">
            <button type="button" className={btnSecondaryCls} onClick={captureGeo} disabled={geoBusy}>
              {geoBusy ? "Locating…" : geo ? "Recapture location" : "Capture current location"}
            </button>
            {geo && (
              <span className="text-sm font-mono text-secondary-foreground">
                {geo.lat}, {geo.lng}
              </span>
            )}
            {geoError && <span className="text-xs text-destructive">{geoError}</span>}
            {!geo && !geoError && (
              <span className="text-xs text-muted-foreground">Optional. Uses your device location.</span>
            )}
          </div>
        </Card>

        <FormActions>
          {submitted && !isValid && (
            <span className="text-xs text-destructive mr-auto">Fix {Object.keys(errors).length} field(s) above</span>
          )}
          <Link to="/clients" className={btnSecondaryCls}>Cancel</Link>
          <button
            type="submit"
            disabled={post.isPending || uploading || (submitted && !isValid)}
            className={btnPrimaryCls}
          >
            {uploading ? "Uploading photo…" : post.isPending ? "Saving…" : "Register client"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}
