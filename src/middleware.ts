import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isConfigured, verifySessionToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  // A fresh deploy with no secrets set should explain itself rather than 500.
  if (!isConfigured()) {
    if (request.nextUrl.pathname === "/setup") return NextResponse.next();
    const setup = request.nextUrl.clone();
    setup.pathname = "/setup";
    setup.search = "";
    return NextResponse.redirect(setup);
  }

  if (request.nextUrl.pathname === "/setup") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    return NextResponse.redirect(home);
  }

  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything is gated except Next's own assets and the files served from
  // public/ — the login page needs its fonts and icon before you are let in.
  matcher: ["/((?!_next/|fonts/|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"],
};
