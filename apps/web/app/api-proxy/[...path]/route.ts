const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

// Strip hop-by-hop headers — content-length is re-added manually after buffering
const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// Vercel hobby functions time out at 10s — abort upstream at 9s to return a proper error
const UPSTREAM_TIMEOUT_MS = 9_000;

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    path: string[];
  };
};

function cleanHeaders(headers: Headers) {
  const cleaned = new Headers(headers);
  for (const header of hopByHopHeaders) {
    cleaned.delete(header);
  }
  return cleaned;
}

async function proxy(request: Request, context: RouteContext) {
  try {
    const requestUrl = new URL(request.url);
    const targetUrl = new URL(`/api/${context.params.path.join("/")}`, apiBaseUrl);
    targetUrl.search = requestUrl.search;

    const outHeaders = cleanHeaders(request.headers);
    let body: ArrayBuffer | undefined;

    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.arrayBuffer();
      outHeaders.set("content-length", String(body.byteLength));
    }

    let upstream: Response;
    try {
      upstream = await fetch(targetUrl, {
        method: request.method,
        headers: outHeaders,
        body,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (error) {
      const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const message = isTimeout
        ? `API did not respond within ${UPSTREAM_TIMEOUT_MS / 1000}s — it may be starting up, try again`
        : (error instanceof Error ? error.message : String(error));
      return Response.json(
        { error: "API proxy request failed", detail: message, target: targetUrl.origin },
        { status: isTimeout ? 504 : 502 },
      );
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: cleanHeaders(upstream.headers),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: "Proxy error", detail: message }, { status: 500 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
