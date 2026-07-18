import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function loginAction(formData: FormData) {
  "use server";
  const key = String(formData.get("key") ?? "");
  const expected = process.env.ADMIN_ACCESS_KEY;
  if (!expected || key !== expected) {
    redirect("/admin/login?bad=1");
  }
  const jar = await cookies();
  jar.set("fixbtn_admin", key, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/admin");
}

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ bad?: string }> }) {
  const { bad } = await searchParams;
  return (
    <div className="grid min-h-dvh place-items-center bg-field-950 px-6 text-white" style={{ colorScheme: "dark" }}>
      <form action={loginAction} className="w-full max-w-sm rounded-2xl border border-field-line bg-field-900 p-6">
        <p className="text-lg font-extrabold">
          <span className="text-hivis-400">■</span> Operator console
        </p>
        <p className="mt-1 text-xs text-white/40">The network's god-view. Operators only.</p>
        <input
          type="password"
          name="key"
          required
          placeholder="Access key"
          className="mt-4 w-full rounded-xl border border-field-line bg-field-950 px-4 py-3 text-sm text-white placeholder:text-white/30"
        />
        {bad && <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300">Wrong key.</p>}
        <button
          type="submit"
          className="mt-4 w-full rounded-xl bg-hivis-400 px-4 py-3 text-sm font-bold text-field-950 active:scale-[0.98]"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
