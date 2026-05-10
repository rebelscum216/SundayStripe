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
