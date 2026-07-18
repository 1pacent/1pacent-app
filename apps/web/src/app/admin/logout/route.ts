import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/admin/login", request.url));
  res.cookies.set("fixbtn_admin", "", { maxAge: 0, path: "/" });
  return res;
}
