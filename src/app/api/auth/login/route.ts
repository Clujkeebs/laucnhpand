import { NextResponse } from "next/server";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export async function POST(request: Request) {
  let password = "";
  try {
    ({ password } = (await request.json()) as { password: string });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    if (!(await checkPassword(password))) {
      return NextResponse.json({ error: "Wrong password." }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auth is not configured." },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
