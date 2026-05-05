import { NextResponse, type NextRequest } from "next/server";

// HTTP basic auth gate. Single shared credential for the wife
// (APP_USERNAME + APP_PASSWORD).

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
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
  const u = process.env.APP_USERNAME ?? "zena";
  const p = process.env.APP_PASSWORD;
  if (!p) return new NextResponse("APP_PASSWORD not configured", { status: 500 });
  if (!checkBasic(req, u, p)) return unauthorized("rohlik-wishlist");
  return NextResponse.next();
}
