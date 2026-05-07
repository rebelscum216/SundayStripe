import type { Metadata } from "next";
import "./globals.css";
import { DrawerProvider } from "./components/drawer-context";
import { SidebarNav } from "./components/sidebar-nav";
import { AiDrawer } from "./components/ai-drawer";

export const metadata: Metadata = {
  title: "Sunday Stripe Hub",
  description: "Commerce operations hub",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <DrawerProvider>
          {/* Shell: dark sidebar (220px) + light main */}
          <div className="flex h-dvh overflow-hidden">
            <SidebarNav />
            {/* Main content — light, grid bg, scrollable */}
            <main className="ss-main-bg flex-1 overflow-y-auto lg:block">
              {children}
            </main>
          </div>
          <AiDrawer />
        </DrawerProvider>
      </body>
    </html>
  );
}
