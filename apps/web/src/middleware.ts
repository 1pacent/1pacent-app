import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isValidAdminCookie } from "@/lib/admin-session";

/**
 * Host routing + the admin gate.
 * - admin.<any-domain> serves the /admin namespace at its root.
 * - MARKETING_HOST (e.g. zaivo.com.au) serves the customer site at /;
 *   SITE_COMING_SOON=1 shutters that host with /soon instead.
 * - /admin/* (however reached) requires a valid admin cookie — either the
 *   legacy ADMIN_ACCESS_KEY or the WEBSITE_ADMIN_LOGIN_* username/password
 *   session (lib/admin-session.ts). Login page is the only exception.
 *   Nothing configured → admin is closed.
 */

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0]!;
  const { pathname } = request.nextUrl;
  const onAdminHost = host.startsWith("admin.");

  // Effective path: on the admin host, everything lives under /admin.
  const effectivePath = onAdminHost && !pathname.startsWith("/admin") ? `/admin${pathname === "/" ? "" : pathname}` : pathname;

  if (effectivePath.startsWith("/admin") && effectivePath !== "/admin/login") {
    const ok = await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE)?.value);
    if (!ok) {
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
  const onMarketingHost = marketingHost && (host === marketingHost || host === `www.${marketingHost}`);
  const comingSoon = process.env.SITE_COMING_SOON === "1" || process.env.SITE_COMING_SOON === "true";
  if (onMarketingHost && comingSoon && (pathname === "/" || pathname.startsWith("/site"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/soon";
    return NextResponse.rewrite(url);
  }
  if (onMarketingHost && pathname === "/") {
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
