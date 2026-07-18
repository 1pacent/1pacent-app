import { NextResponse, type NextRequest } from "next/server";

/**
 * Host routing + the admin gate.
 * - admin.<any-domain> serves the /admin namespace at its root.
 * - MARKETING_HOST (e.g. thefixbutton.com) serves the customer site at /.
 * - /admin/* (however reached) requires the ADMIN_ACCESS_KEY cookie; the
 *   login page is the only exception. No key configured → admin is closed.
 */

const ADMIN_COOKIE = "fixbtn_admin";

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0]!;
  const { pathname } = request.nextUrl;
  const onAdminHost = host.startsWith("admin.");

  // Effective path: on the admin host, everything lives under /admin.
  const effectivePath = onAdminHost && !pathname.startsWith("/admin") ? `/admin${pathname === "/" ? "" : pathname}` : pathname;

  if (effectivePath.startsWith("/admin") && effectivePath !== "/admin/login") {
    const key = request.cookies.get(ADMIN_COOKIE)?.value;
    const expected = process.env.ADMIN_ACCESS_KEY;
    if (!expected || key !== expected) {
      const login = request.nextUrl.clone();
      login.pathname = onAdminHost ? "/login" : "/admin/login";
      return NextResponse.redirect(login);
    }
  }

  if (onAdminHost && !pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = effectivePath;
    return NextResponse.rewrite(url);
  }

  const marketingHost = (process.env.MARKETING_HOST ?? "").toLowerCase();
  if (marketingHost && (host === marketingHost || host === `www.${marketingHost}`) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/site";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and Next internals; API keeps its own auth.
  matcher: ["/((?!_next/|api/|icon-|manifest.json|sw.js|favicon).*)"],
};
