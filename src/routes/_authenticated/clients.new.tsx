import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/mzizi.functions";
import { Card } from "@/components/mzizi/Card";

export const Route = createFileRoute("/_authenticated/clients/new")({
  component: NewClientPage,
});

type Gender = "male" | "female" | "other";

function NewClientPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createClient);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    national_id: "",
    email: "",
    date_of_birth: "",
    gender: "" as "" | Gender,
    address: "",
    occupation: "",
    monthly_income: "",
    next_of_kin_name: "",
    next_of_kin_phone: "",
  });

  const post = useMutation({
    mutationFn: createFn,
    onSuccess: (c: any) => {
      toast.success("Client registered · pending KYC");
      qc.invalidateQueries();
      navigate({ to: "/clients/$id", params: { id: c.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const missing: string[] = [];
    if (!form.full_name.trim()) missing.push("Full name");
    if (!form.phone.trim()) missing.push("Phone");
    if (!form.national_id.trim()) missing.push("National ID");
    if (!form.date_of_birth) missing.push("Date of birth");
    if (!form.gender) missing.push("Gender");
    if (!form.address.trim()) missing.push("Residential address");
    if (!form.occupation.trim()) missing.push("Occupation");
    if (form.monthly_income === "") missing.push("Monthly income");
    if (!form.next_of_kin_name.trim()) missing.push("Next of kin name");
    if (!form.next_of_kin_phone.trim()) missing.push("Next of kin phone");
    if (missing.length) {
      toast.error(`Missing required: ${missing.join(", ")}`);
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


  return (
    <div className="animate-fadein max-w-4xl mx-auto flex flex-col gap-4">
      <Link to="/clients" className="text-xs text-primary hover:underline">← Back to clients</Link>
      <div>
        <h1 className="text-xl font-semibold">New client · KYC</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Capture full KYC details. All fields marked with <span className="text-destructive">*</span> are required.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-secondary-foreground uppercase tracking-wider">Personal details</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name" required>
              <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className={inputCls} maxLength={120} />
            </Field>
            <Field label="National ID" required>
              <input value={form.national_id} onChange={(e) => set("national_id", e.target.value)} className={`${inputCls} font-mono`} maxLength={30} />
            </Field>
            <Field label="Phone" required>
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+254…" className={inputCls} maxLength={20} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} maxLength={255} />
            </Field>
            <Field label="Date of birth" required>
              <input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Gender" required>
              <select value={form.gender} onChange={(e) => set("gender", e.target.value as Gender | "")} className={inputCls}>
                <option value="">Select…</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Residential address" required className="col-span-2">
              <textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} maxLength={200} className={inputCls} />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-secondary-foreground uppercase tracking-wider">Livelihood</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Occupation / business" required>
              <input value={form.occupation} onChange={(e) => set("occupation", e.target.value)} className={inputCls} maxLength={80} />
            </Field>
            <Field label="Monthly income (KES)" required>
              <input
                inputMode="numeric"
                value={form.monthly_income}
                onChange={(e) => set("monthly_income", e.target.value.replace(/[^\d.]/g, ""))}
                className={`${inputCls} font-mono`}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold mb-4 text-secondary-foreground uppercase tracking-wider">Next of kin</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name" required>
              <input value={form.next_of_kin_name} onChange={(e) => set("next_of_kin_name", e.target.value)} className={inputCls} maxLength={120} />
            </Field>
            <Field label="Phone" required>
              <input value={form.next_of_kin_phone} onChange={(e) => set("next_of_kin_phone", e.target.value)} placeholder="+254…" className={inputCls} maxLength={20} />
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link to="/clients" className="text-sm px-4 py-2 border border-input rounded-md hover:bg-muted">Cancel</Link>
          <button
            type="submit"
            disabled={post.isPending}
            className="text-sm px-5 py-2 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary-hover disabled:opacity-50"
          >
            {post.isPending ? "Saving…" : "Register client"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls = "mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30";

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
