"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface AuthScreenProps {
  mode: "login" | "setup" | "forbidden";
}

export function AuthScreen({ mode }: AuthScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase browser auth is not configured.");
      return;
    }

    setBusy(true);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (signInError) {
      setError(signInError.message);
      setBusy(false);
    }
  }

  async function signOutWrongAccount() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      window.location.reload();
      return;
    }

    setBusy(true);
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <main className="shell">
      <section className="action-zone">
        <article className="action-card">
          <div className="action-label">Personal Ops Access</div>
          <h1 style={{ margin: "0 0 12px", fontSize: "1.6rem" }}>This app is private.</h1>
          {mode === "setup" ? (
            <p className="action-hint">
              Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `PERSONAL_OPS_ALLOWED_EMAIL`
              before using Google auth.
            </p>
          ) : mode === "forbidden" ? (
            <p className="action-hint">
              You don&apos;t have access to this app.
            </p>
          ) : (
            <p className="action-hint">
              Sign in with Google to continue.
            </p>
          )}

          {error && <div className="workflow-session-status">{error}</div>}

          <div className="capture-row" style={{ marginTop: 16 }}>
            {mode === "forbidden" ? (
              <button className="ghost-button sm" disabled={busy} onClick={() => void signOutWrongAccount()}>
                {busy ? "Signing out..." : "Use a different Google account"}
              </button>
            ) : mode === "login" ? (
              <button className="button" disabled={busy} onClick={() => void signInWithGoogle()}>
                {busy ? "Redirecting..." : "Continue with Google"}
              </button>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}
