import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/auth";
import LoginScreen from "./LoginForm";

/**
 * Runs per-request in the Node runtime, so it sees the environment as it
 * actually is rather than as it was at build time.
 */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!isConfigured()) redirect("/setup");
  return <LoginScreen />;
}
