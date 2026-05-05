import { NextResponse, type NextRequest } from "next/server";

// HTTP basic auth gate. Single shared credential for the wife (APP_USERNAME +
// APP_PASSWORD). The /admin/* path requires a separate ADMIN_USERNAME +
// ADMIN_PASSWORD pair so the husband can keep that page off the wife's path.
//
// /api/cron-webhook/* is exempt — those routes authenticate via Bearer
// CRON_SECRET, which is checked inside the route handler.

export const config = {
  matcher: [
    // Run on every path except Next internals and static assets.
    "/((?!_next/|favicon.ico|api/cron-webhook).*)",
  ],
};

function unauthorized(realm: string) {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${realm}"` },
  });
}

function checkBasic(req: NextRequest, user: string, pass: string): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return false;
  const [u, p] = atob(auth.slice(6)).split(":");
  return u === user && p === pass;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin")) {
    const u = process.env.ADMIN_USERNAME ?? "admin";
    const p = process.env.ADMIN_PASSWORD;
    if (!p) return new NextResponse("ADMIN_PASSWORD not configured", { status: 500 });
    if (!checkBasic(req, u, p)) return unauthorized("admin");
    return NextResponse.next();
  }
  const u = process.env.APP_USERNAME ?? "zena";
  const p = process.env.APP_PASSWORD;
  if (!p) return new NextResponse("APP_PASSWORD not configured", { status: 500 });
  if (!checkBasic(req, u, p)) return unauthorized("rohlik-wishlist");
  return NextResponse.next();
}
