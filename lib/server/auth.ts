import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export type AuthorizedUserResult =
  | { kind: "authorized"; user: User; email: string; allowedEmail: string }
  | { kind: "config-missing"; allowedEmail: null }
  | { kind: "unauthenticated"; allowedEmail: string }
  | { kind: "forbidden"; allowedEmail: string; email: string | null };

function getAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowedEmail = process.env.PERSONAL_OPS_ALLOWED_EMAIL?.trim().toLowerCase() ?? "";

  if (!url || !anonKey || !allowedEmail) {
    return null;
  }

  return { url, anonKey, allowedEmail };
}

export function hasSupabaseAuth() {
  return Boolean(getAuthConfig());
}

export async function getSupabaseServerAuthClient() {
  const config = getAuthConfig();
  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as CookieOptions);
          });
        } catch {
          // Cookie writes during page render are best-effort only.
        }
      },
    },
  });
}

export async function getAuthorizedUser(): Promise<AuthorizedUserResult> {
  const config = getAuthConfig();
  if (!config) {
    return { kind: "config-missing", allowedEmail: null };
  }

  const supabase = await getSupabaseServerAuthClient();
  if (!supabase) {
    return { kind: "config-missing", allowedEmail: null };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { kind: "unauthenticated", allowedEmail: config.allowedEmail };
  }

  const email = user.email?.trim().toLowerCase() ?? null;
  if (!email || email !== config.allowedEmail) {
    await supabase.auth.signOut();
    return { kind: "forbidden", allowedEmail: config.allowedEmail, email };
  }

  return { kind: "authorized", user, email, allowedEmail: config.allowedEmail };
}

export async function requireAuthorizedUser() {
  const result = await getAuthorizedUser();

  if (result.kind === "authorized") {
    return result;
  }

  if (result.kind === "config-missing") {
    return NextResponse.json(
      { error: "Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and PERSONAL_OPS_ALLOWED_EMAIL." },
      { status: 503 },
    );
  }

  if (result.kind === "forbidden") {
    return NextResponse.json(
      { error: `Signed in as ${result.email ?? "an unknown account"}, but this app only allows ${result.allowedEmail}.` },
      { status: 403 },
    );
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
