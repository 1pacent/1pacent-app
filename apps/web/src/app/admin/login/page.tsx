import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, checkAdminLogin, passwordSessionValue } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

async function loginAction(formData: FormData) {
  "use server";
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // Two ways in: username+password (WEBSITE_ADMIN_LOGIN_*), or the legacy
  // access key pasted into the password field with the username left blank.
  let cookieValue: string | null = null;
  if (checkAdminLogin(username, password)) {
    cookieValue = await passwordSessionValue();
  } else if (!username && process.env.ADMIN_ACCESS_KEY && password === process.env.ADMIN_ACCESS_KEY) {
    cookieValue = password;
  }
  if (!cookieValue) redirect("/admin/login?bad=1");

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, cookieValue, {
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
        <p className="mt-1 text-xs text-white/40">The network&apos;s god-view. Operators only.</p>
        <input
          type="text"
          name="username"
          autoComplete="username"
          placeholder="Username"
          className="mt-4 w-full rounded-xl border border-field-line bg-field-950 px-4 py-3 text-sm text-white placeholder:text-white/30"
        />
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          className="mt-2 w-full rounded-xl border border-field-line bg-field-950 px-4 py-3 text-sm text-white placeholder:text-white/30"
        />
        {bad && <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300">Wrong login.</p>}
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
