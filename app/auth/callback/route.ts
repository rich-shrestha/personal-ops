import { NextResponse } from "next/server";
import { getAuthorizedUser, getSupabaseServerAuthClient } from "@/lib/server/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const supabase = await getSupabaseServerAuthClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const auth = await getAuthorizedUser();
  if (auth.kind !== "authorized") {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const destination = next && next.startsWith("/") ? next : "/";
  return NextResponse.redirect(new URL(destination, url.origin));
}
