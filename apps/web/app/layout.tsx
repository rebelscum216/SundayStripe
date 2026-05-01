import type { Metadata } from "next";
import "./globals.css";
import { DrawerProvider } from "./components/drawer-context";
import { SidebarNav } from "./components/sidebar-nav";
import { AiDrawer } from "./components/ai-drawer";

export const metadata: Metadata = {
  title: "Sunday Stripe Hub",
  description: "Commerce operations hub"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <DrawerProvider>
          <SidebarNav />
          {/* Offset for fixed sidebar (desktop) and fixed top bar (mobile) */}
          <div className="pt-12 lg:pl-56 lg:pt-0">
            <main className="min-h-dvh px-4 py-5 lg:px-6 lg:py-6">
              {children}
            </main>
          </div>
          <AiDrawer />
        </DrawerProvider>
      </body>
    </html>
  );
}
