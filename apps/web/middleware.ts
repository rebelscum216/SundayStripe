import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "hub_session";
const SUFFIX = "sunday-stripe-hub-2026";

async function makeToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "|" + SUFFIX);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  if (pathname === "/api/keep-alive") {
    return NextResponse.next();
  }

  const expectedPassword = process.env.DASHBOARD_PASSWORD;

  if (!expectedPassword) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Dashboard auth is not configured", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
  const expectedToken = await makeToken(expectedPassword);

  if (sessionCookie !== expectedToken) {
    if (pathname.startsWith("/api-proxy/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
