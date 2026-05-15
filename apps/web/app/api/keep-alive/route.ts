const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${apiBaseUrl}/api/status`, {
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    return Response.json({ ok: res.ok, status: res.status, ts: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message, ts: new Date().toISOString() }, { status: 502 });
  }
}
