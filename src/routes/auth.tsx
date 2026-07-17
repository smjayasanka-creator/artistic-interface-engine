import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Mzizi Core" },
      { name: "description", content: "Sign in to the Mzizi microfinance operations console." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return toast.error("Enter your email first");
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Check your inbox for the reset link");
      setMode("in");
    } catch (err: any) {
      toast.error(err.message ?? "Could not send reset email");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Revalidate with the server so a stale cached token doesn't loop us back into a protected route.
    supabase.auth.getUser().then(({ data, error }) => {
      if (!error && data.user) nav({ to: redirect ?? "/dashboard", replace: true });
      else supabase.auth.signOut().catch(() => {});
    });
  }, [nav, redirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name, company_name: companyName.trim() },
          },
        });
        if (error) throw error;
        toast.success("Workspace created · signing you in");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      nav({ to: redirect ?? "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error(result.error.message);
    if (!result.redirected && !result.error) nav({ to: redirect ?? "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div
            className="w-11 h-11 rounded-[12px] flex items-center justify-center font-bold text-white text-[20px]"
            style={{ background: "linear-gradient(140deg,#14b8a6,#0f766e)" }}
          >
            M
          </div>
          <div>
            <div className="font-bold text-foreground text-lg tracking-tight">Mzizi</div>
            <div className="text-[10.5px] text-muted-foreground uppercase tracking-wider">Core Banking</div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-7">
          <h1 className="text-lg font-semibold text-foreground">
            {mode === "in" ? "Sign in" : "Create an account"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "in" ? "Access your Mzizi workspace." : "Create your workspace — you'll be the owner."}
          </p>
          <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
            {mode === "up" && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Full name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Company / workspace name</label>
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="Acme Microfinance" className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background" />
                  <p className="text-[10.5px] text-muted-foreground mt-1">If you were invited by email, leave your invited email address and this becomes your existing workspace.</p>
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background" />
            </div>
            <button
              disabled={loading}
              className="mt-2 bg-primary text-primary-foreground font-semibold text-sm py-2.5 rounded-md hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "…" : mode === "in" ? "Sign in" : "Create account"}
            </button>
          </form>
          <div className="my-4 flex items-center gap-3 text-[11px] text-faint">
            <div className="flex-1 border-t border-border" /> OR <div className="flex-1 border-t border-border" />
          </div>
          <button
            onClick={google}
            className="w-full border border-input rounded-md py-2.5 text-sm font-medium hover:bg-row-hover flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <button
            onClick={() => setMode(mode === "in" ? "up" : "in")}
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "in" ? "No account? Create one" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
