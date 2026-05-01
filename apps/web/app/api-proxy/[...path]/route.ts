const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

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
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(`/api/${context.params.path.join("/")}`, apiBaseUrl);
  targetUrl.search = requestUrl.search;

  const init: RequestInit = {
    method: request.method,
    headers: cleanHeaders(request.headers),
    cache: "no-store",
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: cleanHeaders(upstream.headers),
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
