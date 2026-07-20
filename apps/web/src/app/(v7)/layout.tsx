import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase";

/** The v7 workspace chrome — the ops layer beneath the pulse app. */
export default function V7Layout({ children }: { children: React.ReactNode }) {
  const live = supabaseConfigured();
  return (
    <>
      <header className="bg-brand-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gold-400 font-serif text-xs font-bold text-gold-300">
              1P
            </span>
            <span className="font-serif text-lg font-semibold tracking-tight text-white">
              Zaivo <span className="text-gold-300">Passport</span>
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-brand-100">
            <Link href="/p" className="hover:text-white">
              Pulse
            </Link>
            <Link href="/dashboard" className="hover:text-white">
              Dashboard
            </Link>
            <Link
              href={live ? "/dashboard" : "/r/demo-intake"}
              className="rounded-md bg-gold-400 px-3 py-1.5 font-medium text-brand-900 hover:bg-gold-300"
            >
              {live ? "Test as a persona" : "Report an issue"}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-slate-400">
          {live
            ? "Live — connected to Supabase. Data created here is real, not seeded demo data."
            : "Demo build — running on seeded data until Supabase credentials are configured."}
        </div>
      </footer>
    </>
  );
}
