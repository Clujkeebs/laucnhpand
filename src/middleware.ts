import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Session gate only.
 *
 * Deliberately does NOT decide whether the app is configured. This runs in the
 * Edge runtime, where Next can inline process.env at build time — so a variable
 * set after the build can still read as missing here, which would strand you on
 * the setup screen while the setup screen itself reports everything as set.
 * That decision lives in the login page, which runs in Node and reads the real
 * runtime environment.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /login owns the unconfigured case; /setup explains it; /t/<mint> is public
  // by design; /api/auth issues and clears the session itself.
  if (
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/t/")
  ) {
    return NextResponse.next();
  }

  let valid = false;
  try {
    valid = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    // A missing or malformed secret must not 500 the whole site; treat it as
    // "not signed in" and let /login explain why.
    valid = false;
  }
  if (valid) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything is gated except Next's own assets and the files served from
  // public/ — the login page needs its fonts and icon before you are let in.
  matcher: ["/((?!_next/|fonts/|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"],
};
