import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { getClient, updateClient } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import {
  FormGrid,
  FormField,
  FormActions,
  inputCls,
  selectCls,
  errorInputCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "@/components/mzizi/FormGrid";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clients/$id/edit")({
  component: EditClientPage,
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

const schema = z.object({
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
type FormState = Omit<z.input<typeof schema>, "gender"> & { gender: "" | Gender };
type FieldKey = keyof FormState;

function splitPhone(stored: string | null | undefined, cc: string | null | undefined) {
  const code = (cc ?? "+94").trim();
  const digits = (stored ?? "").toString();
  if (code && digits.startsWith(code))
    return { code, local: digits.slice(code.length).replace(/\D/g, "") };
  return { code, local: digits.replace(/\D/g, "") };
}

function EditClientPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getClient);
  const updateFn = useServerFn(updateClient);

  const { data, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const initial = useMemo<FormState | null>(() => {
    if (!data) return null;
    const c = data.client;
    const { code, local } = splitPhone(c.phone, c.phone_country_code);
    return {
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      phone_country_code: code || "+94",
      phone: local,
      national_id: c.national_id ?? "",
      email: c.email ?? "",
      date_of_birth: c.date_of_birth ? String(c.date_of_birth).slice(0, 10) : "",
      gender: (c.gender as Gender) ?? "",
      address: c.address ?? "",
      gn_division: c.gn_division ?? "",
      divisional_secretariat: c.divisional_secretariat ?? "",
      district: c.district ?? "",
      province: c.province ?? "",
    };
  }, [data]);

  const [form, setForm] = useState<FormState | null>(null);
  const [occupation, setOccupation] = useState<string>("");
  const [monthlyIncome, setMonthlyIncome] = useState<number | "">("");
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (initial && !form) {
      setForm(initial);
      setOccupation(data?.client?.occupation ?? "");
      setMonthlyIncome(
        data?.client?.monthly_income != null ? Number(data.client.monthly_income) : "",
      );
    }
  }, [initial, form, data]);

  const errors = useMemo(() => {
    if (!form) return {} as Partial<Record<FieldKey, string>>;
    const r = schema.safeParse(form);
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

  const set = <K extends FieldKey>(k: K, v: FormState[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));
  const blur = (k: FieldKey) => setTouched((t) => ({ ...t, [k]: true }));
  const cls = (k: FieldKey) => (showError(k) ? errorInputCls : inputCls);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id,
          first_name: form!.first_name,
          last_name: form!.last_name,
          phone_country_code: form!.phone_country_code,
          phone: form!.phone,
          national_id: form!.national_id,
          email: form!.email || null,
          date_of_birth: form!.date_of_birth,
          gender: form!.gender as Gender,
          address: form!.address,
          gn_division: form!.gn_division,
          divisional_secretariat: form!.divisional_secretariat,
          district: form!.district,
          province: form!.province,
          occupation: occupation.trim() || null,
          monthly_income: monthlyIncome === "" ? null : Number(monthlyIncome),
        },
      }),
    onSuccess: async () => {
      toast.success("Customer updated");
      await qc.invalidateQueries({ queryKey: ["client", id] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      navigate({ to: "/clients/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!form) return;
    if (!isValid) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    save.mutate();
  }

  if (isLoading || !form) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-8 w-40 rounded-md bg-muted/60" />
        <div className="h-64 rounded-xl bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="animate-fadein flex flex-col gap-4 text-[12.5px]">
      <Link
        to="/clients/$id"
        params={{ id }}
        className="text-[12px] text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 self-start"
      >
        ← Back to customer
      </Link>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
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
                className={cn(cls("national_id"), "font-mono")}
                maxLength={30}
              />
            </FormField>

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
                onChange={(e) => set("gender", e.target.value as Gender)}
                onBlur={() => blur("gender")}
                className={showError("gender") ? errorInputCls : selectCls}
              >
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </FormField>
            <FormField label="Occupation" span={4}>
              <input
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                className={inputCls}
                maxLength={120}
              />
            </FormField>
            <FormField label="Monthly income" span={4}>
              <input
                type="number"
                min={0}
                value={monthlyIncome}
                onChange={(e) =>
                  setMonthlyIncome(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={cn(inputCls, "font-mono")}
              />
            </FormField>
          </FormGrid>
        </Card>

        <Card className="p-6">
          <h2 className="text-[11px] font-semibold mb-4 text-faint uppercase tracking-wider">
            Contact
          </h2>
          <FormGrid>
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
                className={showError("phone_country_code") ? errorInputCls : selectCls}
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
              span={5}
              error={showError("phone") ? errors.phone : undefined}
            >
              <input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value.replace(/[^\d]/g, ""))}
                onBlur={() => blur("phone")}
                placeholder="7XXXXXXXX"
                className={cn(cls("phone"), "font-mono")}
                maxLength={15}
              />
            </FormField>
            <FormField label="Email" span={4} error={showError("email") ? errors.email : undefined}>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => blur("email")}
                className={cls("email")}
                maxLength={255}
              />
            </FormField>
          </FormGrid>
        </Card>

        <Card className="p-6">
          <h2 className="text-[11px] font-semibold mb-4 text-faint uppercase tracking-wider">
            Address
          </h2>
          <FormGrid>
            <FormField
              label="Address"
              required
              span={12}
              error={showError("address") ? errors.address : undefined}
            >
              <input
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                onBlur={() => blur("address")}
                className={cls("address")}
                maxLength={200}
              />
            </FormField>
            <FormField
              label="GN Division"
              required
              span={3}
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
              span={3}
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
              span={3}
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
              span={3}
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

          <FormActions align="between">
            <button
              type="button"
              className={btnSecondaryCls}
              onClick={() => navigate({ to: "/clients/$id", params: { id } })}
            >
              Cancel
            </button>
            <button type="submit" className={btnPrimaryCls} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </FormActions>
        </Card>
      </form>
    </div>
  );
}
