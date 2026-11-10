import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { readSession } from "@/lib/auth";
import { MARK } from "@/lib/mark";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: `Private · ${MARK}`,
  robots: { index: false, follow: false },
};

export default async function PrivatePage() {
  const session = await readSession();
  if (session) redirect("/library");

  return (
    <main className="gate">
      <div className="gate-card">
        <p className="brand-footer">{MARK}</p>
        <h1>A private door</h1>
        <p className="lede">The library is where photographs and films are kept. One sign-in.</p>
        <LoginForm />
      </div>
    </main>
  );
}
