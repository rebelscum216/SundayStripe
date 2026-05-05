"use server";

import { revalidatePath } from "next/cache";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function assertOk(response: Response, action: string) {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${action} failed (${response.status}): ${detail || response.statusText}`);
  }
}

export async function clearFailedJobs() {
  await assertOk(
    await fetch(`${apiBaseUrl}/api/jobs/failed`, { method: "DELETE" }),
    "Clear failed jobs",
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
