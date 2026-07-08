import type { Metadata } from "next";
import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase";
import "./globals.css";

export const metadata: Metadata = {
  title: "1Pacent — Rental compliance & maintenance, sorted",
  description:
    "Compliance-first maintenance orchestration for Victorian rental properties. Traffic-light compliance, tenant QR intake, tradie dispatch, audit-grade evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const live = supabaseConfigured();
  return (
    <html lang="en-AU">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight text-emerald-700">
              1Pacent
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              <Link href="/dashboard" className="hover:text-slate-900">
                Dashboard
              </Link>
              <Link
                href={live ? "/dashboard" : "/r/demo-intake"}
                className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700"
              >
                {live ? "Test as a persona" : "Report an issue"}
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-slate-400">
          {live
            ? "Live — connected to Supabase. Data created here is real, not seeded demo data."
            : "Demo build — running on seeded data until Supabase credentials are configured."}
        </footer>
      </body>
    </html>
  );
}
