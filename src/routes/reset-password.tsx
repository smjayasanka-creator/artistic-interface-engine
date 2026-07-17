import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Mzizi Core" },
      { name: "description", content: "Set a new password for your Mzizi workspace account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase places a recovery session in the URL hash and hydrates it via detectSessionInUrl.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated · signing you in");
      nav({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Could not update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-7">
        <h1 className="text-lg font-semibold text-foreground">Set a new password</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ready
            ? "Choose a new password for your account."
            : "Validating your reset link…"}
        </p>
        {ready && (
          <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              />
            </div>
            <button
              disabled={loading}
              className="mt-2 bg-primary text-primary-foreground font-semibold text-sm py-2.5 rounded-md hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "…" : "Update password"}
            </button>
          </form>
        )}
        <button
          onClick={() => nav({ to: "/auth" })}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}
