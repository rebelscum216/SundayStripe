"use client";

import { useEffect } from "react";

export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  useEffect(() => {
    const id = setInterval(() => window.location.reload(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return null;
}
