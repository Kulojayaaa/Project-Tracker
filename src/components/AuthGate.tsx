import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { WithChildren } from "../types/domain";

export function AuthGate({ children }: WithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function ensureProfile(currentSession: Session, displayName: string) {
    const user = currentSession.user;
    const { data: existingProfile } = await supabase.from("users").select("id").eq("id", user.id).maybeSingle();

    if (!existingProfile) {
      await supabase.from("users").insert({
        id: user.id,
        name: displayName || user.email || "IPI User",
        email: user.email ?? email,
        role: "project_admin",
        department: "Irrigation",
        active: true
      });
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "sign-up") {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

        if (signUpError) {
          throw signUpError;
        }

        if (data.session) {
          await ensureProfile(data.session, name);
          setSession(data.session);
        } else {
          setMessage("Account created. Please confirm your email if Supabase email confirmation is enabled, then sign in.");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

        if (signInError) {
          throw signInError;
        }

        if (data.session) {
          await ensureProfile(data.session, name);
          setSession(data.session);
        }
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed. Please check your details.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="auth-shell"><div className="auth-card">Checking session...</div></div>;
  }

  if (session) {
    return <>{children}</>;
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">IPI</div>
          <div>
            <strong>IPI Billing & Sales</strong>
            <span>Irrigation Department</span>
          </div>
        </div>
        <h1>{mode === "sign-in" ? "Sign in" : "Create account"}</h1>
        <p>Use your Supabase user account to access secured project billing data.</p>
        {message ? <div className="alert success-alert">{message}</div> : null}
        {error ? <div className="alert error-alert">{error}</div> : null}
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          {mode === "sign-up" ? (
            <label className="form-field">
              <span>Name</span>
              <input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          ) : null}
          <label className="form-field">
            <span>Email</span>
            <input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Please wait..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button className="link-button" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")} type="button">
          {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </section>
    </div>
  );
}

