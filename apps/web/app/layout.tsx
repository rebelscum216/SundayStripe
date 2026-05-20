import type { Metadata } from "next";
import "./globals.css";
import { DrawerProvider } from "./components/drawer-context";
import { SidebarNav } from "./components/sidebar-nav";
import { AiDrawer } from "./components/ai-drawer";

export const metadata: Metadata = {
  title: "Sunday Stripe Hub",
  description: "Commerce operations hub",
};

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function getOpenAlertCount() {
  try {
    const response = await fetch(`${apiBaseUrl}/api/alerts`, { cache: "no-store" });
    if (!response.ok) return 0;
    const data = (await response.json()) as Array<{ status?: string }>;
    return data.filter((alert) => alert.status === undefined || alert.status === "open").length;
  } catch {
    return 0;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const alertCount = await getOpenAlertCount();

  return (
    <html lang="en">
      <body>
        <DrawerProvider>
          {/* Shell: dark sidebar (220px) + light main */}
          <div className="flex h-dvh overflow-hidden">
            <SidebarNav alertCount={alertCount} />
            {/* Main content — light, grid bg, scrollable */}
            <main className="ss-main-bg ss-app-shell-main flex-1 overflow-y-auto lg:block">
              {children}
            </main>
          </div>
          <AiDrawer />
        </DrawerProvider>
      </body>
    </html>
  );
}
