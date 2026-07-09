import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { createClient } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";
import { FormGrid, FormField, FormActions, inputCls, errorInputCls, btnPrimaryCls, btnSecondaryCls } from "@/components/mzizi/FormGrid";

export const Route = createFileRoute("/_authenticated/clients/new")({
  component: NewClientPage,
});

type Gender = "male" | "female" | "other";

const clientSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required (min 2 chars)").max(120),
  phone: z.string().trim().min(7, "Phone must be at least 7 digits").max(20),
  national_id: z.string().trim().min(4, "National ID must be at least 4 chars").max(30),
  email: z.union([z.literal(""), z.string().trim().email("Invalid email").max(255)]),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["male", "female", "other"], { message: "Select a gender" }),
  address: z.string().trim().min(3, "Address must be at least 3 chars").max(200),
  occupation: z.string().trim().min(2, "Occupation is required").max(80),
  monthly_income: z
    .string()
    .min(1, "Monthly income is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, "Must be 0 or more"),
  next_of_kin_name: z.string().trim().min(1, "Next of kin name is required").max(120),
  next_of_kin_phone: z.string().trim().min(7, "Next of kin phone must be at least 7 digits").max(20),
});

type FormState = Omit<z.input<typeof clientSchema>, "gender"> & { gender: "" | Gender };
type FieldKey = keyof FormState;

function NewClientPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createClient);

  const [form, setForm] = useState<FormState>({
    full_name: "",
    phone: "",
    national_id: "",
    email: "",
    date_of_birth: "",
    gender: "",
    address: "",
    occupation: "",
    monthly_income: "",
    next_of_kin_name: "",
    next_of_kin_phone: "",
  });
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!isValid) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    post.mutate({
      data: {
        full_name: form.full_name,
        phone: form.phone,
        national_id: form.national_id,
        email: form.email || undefined,
        date_of_birth: form.date_of_birth,
        gender: form.gender as Gender,
        address: form.address,
        occupation: form.occupation,
        monthly_income: Number(form.monthly_income),
        next_of_kin_name: form.next_of_kin_name,
        next_of_kin_phone: form.next_of_kin_phone,
      },
    });
  }

  const cls = (k: FieldKey) => (showError(k) ? errorInputCls : inputCls);

  return (
    <div className="animate-fadein flex flex-col gap-4">
      <Link to="/clients" className="text-xs text-primary hover:underline">← Back to clients</Link>
      <div>
        <h1 className="text-xl font-semibold">New client · KYC</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Capture full KYC details. All fields marked with <span className="text-destructive">*</span> are required.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-secondary-foreground uppercase tracking-wider">Personal details</h2>
          <FormGrid>
            <FormField label="Full name" required span={5} error={showError("full_name") ? errors.full_name : undefined}>
              <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} onBlur={() => blur("full_name")} className={cls("full_name")} maxLength={120} />
            </FormField>
            <FormField label="National ID" required span={3} error={showError("national_id") ? errors.national_id : undefined}>
              <input value={form.national_id} onChange={(e) => set("national_id", e.target.value)} onBlur={() => blur("national_id")} className={`${cls("national_id")} font-mono`} maxLength={30} />
            </FormField>
            <FormField label="Date of birth" required span={2} error={showError("date_of_birth") ? errors.date_of_birth : undefined}>
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
            <FormField label="Phone" required span={3} error={showError("phone") ? errors.phone : undefined}>
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} onBlur={() => blur("phone")} placeholder="+254…" className={`${cls("phone")} font-mono`} maxLength={20} />
            </FormField>
            <FormField label="Email" span={5} error={showError("email") ? errors.email : undefined}>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} onBlur={() => blur("email")} className={cls("email")} maxLength={255} />
            </FormField>
            <FormField label="Residential address" required span={12} error={showError("address") ? errors.address : undefined}>
              <textarea value={form.address} onChange={(e) => set("address", e.target.value)} onBlur={() => blur("address")} rows={2} maxLength={200} className={cls("address")} />
            </FormField>
          </FormGrid>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-secondary-foreground uppercase tracking-wider">Livelihood</h2>
          <FormGrid>
            <FormField label="Occupation / business" required span={8} error={showError("occupation") ? errors.occupation : undefined}>
              <input value={form.occupation} onChange={(e) => set("occupation", e.target.value)} onBlur={() => blur("occupation")} className={cls("occupation")} maxLength={80} />
            </FormField>
            <FormField label="Monthly income (KES)" required span={4} error={showError("monthly_income") ? errors.monthly_income : undefined}>
              <input
                inputMode="numeric"
                value={form.monthly_income}
                onChange={(e) => set("monthly_income", e.target.value.replace(/[^\d.]/g, ""))}
                onBlur={() => blur("monthly_income")}
                className={`${cls("monthly_income")} font-mono`}
              />
            </FormField>
          </FormGrid>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-secondary-foreground uppercase tracking-wider">Next of kin</h2>
          <FormGrid>
            <FormField label="Full name" required span={8} error={showError("next_of_kin_name") ? errors.next_of_kin_name : undefined}>
              <input value={form.next_of_kin_name} onChange={(e) => set("next_of_kin_name", e.target.value)} onBlur={() => blur("next_of_kin_name")} className={cls("next_of_kin_name")} maxLength={120} />
            </FormField>
            <FormField label="Phone" required span={4} error={showError("next_of_kin_phone") ? errors.next_of_kin_phone : undefined}>
              <input value={form.next_of_kin_phone} onChange={(e) => set("next_of_kin_phone", e.target.value)} onBlur={() => blur("next_of_kin_phone")} placeholder="+254…" className={`${cls("next_of_kin_phone")} font-mono`} maxLength={20} />
            </FormField>
          </FormGrid>
        </Card>

        <FormActions className="border-t-0 pt-0 mt-0">
          {submitted && !isValid && (
            <span className="text-xs text-destructive mr-auto">Fix {Object.keys(errors).length} field(s) above</span>
          )}
          <Link to="/clients" className="text-sm px-4 py-2 border border-input rounded-md hover:bg-muted">Cancel</Link>
          <button
            type="submit"
            disabled={post.isPending || (submitted && !isValid)}
            className="text-sm px-5 py-2 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary-hover disabled:opacity-50"
          >
            {post.isPending ? "Saving…" : "Register client"}
          </button>
        </FormActions>
      </form>
    </div>
  );
}

