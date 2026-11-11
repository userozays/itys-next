import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/cookies";

const PUBLIC_PATHS = new Set(["/login", "/setup", "/api/health"]);

// Optimistic check only: visitors without a session cookie go straight to the
// sign-in page. The real check (is the session valid?) happens in requireActor().
export function proxy(request: NextRequest) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname) || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  const login = new URL("/login", request.url);
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== "/") login.searchParams.set("next", target);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
