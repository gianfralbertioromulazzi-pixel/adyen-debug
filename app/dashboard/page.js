// app/dashboard/page.js
// Pagina protetta — raggiungibile solo con sessione valida (middleware la protegge).
// Esempio di come usare getServerSession in un Server Component.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  // Double-check lato server (il middleware è il vero guardiano,
  // questo è un ulteriore layer di sicurezza)
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin?callbackUrl=/dashboard");
  }

  return <DashboardClient session={session} />;
}
