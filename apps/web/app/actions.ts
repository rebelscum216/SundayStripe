"use server";

import { revalidatePath } from "next/cache";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function assertOk(response: Response, action: string) {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${action} failed (${response.status}): ${detail || response.statusText}`);
  }
}

async function jsonOrThrow<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${action} failed (${response.status}): ${detail || response.statusText}`);
  }
  return (await response.json()) as T;
}

export type OptimizePageResult = {
  seoTitle: string;
  metaDescription: string;
  reasoning: string;
  productId: string | null;
  productTitle: string | null;
  recommendationId: string | null;
  cached: boolean;
};

export type AiProductCopyResult = {
  description: string;
  seoTitle: string;
  seoMetaDescription: string;
};

export type ProductFixPlan = {
  summary: string;
  priority: "high" | "medium" | "low";
  fixes: Array<{
    title: string;
    why: string;
    action: string;
    channel: string;
    impact: string;
  }>;
};

export type AmazonListingRewriteResult = {
  summary: string;
  title: string;
  bullets: string[];
  description: string;
  searchTerms: string[];
  qualityFixes: Array<{ field: string; issue: string; recommendation: string }>;
};

export type AlertAiAction = {
  id: string;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
};

export type AlertLiveContext = {
  product: { title: string | null; sku: string } | null;
  shopifyVariant: {
    price: string | null;
    compareAtPrice: string | null;
    currencyCode: string | null;
    sku: string | null;
    productTitle: string | null;
    error?: string;
  } | null;
  merchantProduct: {
    price: string | null;
    currencyCode: string | null;
    lastUpdateDate: string | null;
    error?: string;
  } | null;
  priceComparison: { status: string; message: string; delta?: string } | null;
  actions: AlertAiAction[];
};

export type AlertExplanation = {
  summary: string;
  fixes: string[];
  links: Array<{ label: string; href: string; description: string }>;
  live?: AlertLiveContext | null;
};

export type AlertTriageResult = {
  summary: string;
  groups: Array<{
    id: string;
    title: string;
    platform: string;
    priority: "critical" | "high" | "medium" | "low";
    alertIds: string[];
    rootCause: string;
    recommendedAction: string;
    estimatedImpact: string;
  }>;
  cached: boolean;
};

export type CrossChannelOpportunityExplanation = {
  summary: string;
  likelyCause: string;
  nextBestAction: string;
  expectedUpside: string;
  fixes: Array<{ action: string; channel: string; reason: string }>;
};

export async function optimizePageSeo(input: {
  url: string;
  position: number;
  impressions: number;
  topQueries: string[];
}) {
  return jsonOrThrow<OptimizePageResult>(
    await fetch(`${apiBaseUrl}/api/ai/optimize-page`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Optimize page",
  );
}

export async function generateProductCopy(productId: string) {
  return jsonOrThrow<AiProductCopyResult>(
    await fetch(`${apiBaseUrl}/api/ai/describe-product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    }),
    "Generate product copy",
  );
}

export async function generateProductFixPlan(productId: string) {
  return jsonOrThrow<ProductFixPlan>(
    await fetch(`${apiBaseUrl}/api/ai/product-fix-assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    }),
    "Generate product fix plan",
  );
}

export async function generateAmazonListingRewrite(productId: string) {
  return jsonOrThrow<AmazonListingRewriteResult>(
    await fetch(`${apiBaseUrl}/api/ai/amazon-listing-rewrite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    }),
    "Generate Amazon listing rewrite",
  );
}

export async function explainAlert(alertId: string) {
  return jsonOrThrow<AlertExplanation>(
    await fetch(`${apiBaseUrl}/api/ai/explain-alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId }),
    }),
    "Explain alert",
  );
}

export async function applyAlertAction(input: { alertId: string; actionId: string }) {
  return jsonOrThrow<{ message?: string; live?: AlertLiveContext | null }>(
    await fetch(`${apiBaseUrl}/api/ai/apply-alert-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Apply alert action",
  );
}

export async function triageAlerts() {
  return jsonOrThrow<AlertTriageResult>(
    await fetch(`${apiBaseUrl}/api/ai/triage-alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    "Triage alerts",
  );
}

export async function explainCrossChannelOpportunity(productId: string) {
  return jsonOrThrow<CrossChannelOpportunityExplanation>(
    await fetch(`${apiBaseUrl}/api/ai/cross-channel-opportunity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    }),
    "Explain cross-channel opportunity",
  );
}

export async function applyProductSeo(input: {
  productId: string;
  seoTitle: string;
  seoDescription: string;
  recommendationId?: string | null;
}) {
  await assertOk(
    await fetch(`${apiBaseUrl}/api/products/${input.productId}/seo`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
      }),
    }),
    "Apply SEO",
  );

  if (input.recommendationId) {
    await fetch(`${apiBaseUrl}/api/ai/recommendations/${input.recommendationId}/accept`, { method: "PATCH" });
  }

  revalidatePath("/search-console");
  revalidatePath(`/products/${input.productId}`);
}

export async function clearFailedJobs() {
  await assertOk(
    await fetch(`${apiBaseUrl}/api/jobs/failed`, { method: "DELETE" }),
    "Clear failed jobs",
  );
  revalidatePath("/");
  revalidatePath("/operations");
}

export async function clearPendingJobs() {
  await assertOk(
    await fetch(`${apiBaseUrl}/api/jobs/pending`, { method: "DELETE" }),
    "Clear pending jobs",
  );
  revalidatePath("/");
  revalidatePath("/operations");
}

export async function triggerSync(integrationId: string) {
  await assertOk(
    await fetch(`${apiBaseUrl}/api/integrations/${integrationId}/sync`, { method: "POST" }),
    "Trigger sync",
  );
  revalidatePath("/");
  revalidatePath("/operations");
  revalidatePath("/settings");
}

export async function triggerSyncMany(integrationIds: string[]) {
  const uniqueIds = Array.from(new Set(integrationIds.filter(Boolean)));
  await Promise.all(
    uniqueIds.map(async (integrationId) => {
      await assertOk(
        await fetch(`${apiBaseUrl}/api/integrations/${integrationId}/sync`, { method: "POST" }),
        "Trigger sync",
      );
    }),
  );
  revalidatePath("/");
  revalidatePath("/operations");
  revalidatePath("/settings");
}

export async function resolveAlert(alertId: string) {
  await assertOk(
    await fetch(`${apiBaseUrl}/api/alerts/${alertId}/resolve`, { method: "PATCH" }),
    "Resolve alert",
  );
  revalidatePath("/alerts");
  revalidatePath("/products/[id]", "page");
}

export async function importAmazonListing(listing: {
  sku: string;
  asin: string | null;
  title: string | null;
  status: string;
  productType: string | null;
  imageUrl: string | null;
}) {
  await assertOk(
    await fetch(`${apiBaseUrl}/api/amazon/import-listing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listing),
    }),
    "Import Amazon listing",
  );
  revalidatePath("/");
  revalidatePath("/amazon");
  revalidatePath("/products");
}
