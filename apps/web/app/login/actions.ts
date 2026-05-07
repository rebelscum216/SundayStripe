"use server";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const COOKIE_NAME = "hub_session";
const SUFFIX = "sunday-stripe-hub-2026";

export function makeToken(password: string): string {
  return createHash("sha256").update(password + "|" + SUFFIX).digest("hex");
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const input = (formData.get("password") as string) ?? "";
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || input !== expected) {
    return { error: "Incorrect password" };
  }

  const store = await cookies();
  store.set(COOKIE_NAME, makeToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/");
}
