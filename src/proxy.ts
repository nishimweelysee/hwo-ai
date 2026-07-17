import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and all API/asset routes
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Auth is handled client-side via localStorage JWT.
  // Middleware just passes all requests through — RouteGuard in the
  // (app) layout handles redirecting unauthenticated users to /login.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
