import { AuthScreen } from "@/components/auth-screen";
import { PersonalOpsApp } from "@/components/personal-ops-app";
import { getAuthorizedUser } from "@/lib/server/auth";

export default async function Home() {
  const auth = await getAuthorizedUser();

  if (auth.kind === "config-missing") {
    return <AuthScreen mode="setup" />;
  }

  if (auth.kind === "forbidden") {
    return <AuthScreen mode="forbidden" />;
  }

  if (auth.kind === "unauthenticated") {
    return <AuthScreen mode="login" />;
  }

  return <PersonalOpsApp userEmail={auth.email} />;
}
