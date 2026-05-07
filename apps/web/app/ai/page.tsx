import Link from "next/link";
import { PageHeader } from "../components/page-header";

const workflows = [
  {
    title: "Alert triage",
    detail: "Explain open alerts, inspect live channel context, and apply supported fixes.",
    href: "/alerts",
    action: "Open alerts",
  },
  {
    title: "Product fix assistant",
    detail: "Generate product copy, SEO fields, and listing repair suggestions from a product workspace.",
    href: "/products",
    action: "Open products",
  },
  {
    title: "Amazon listing rewrite",
    detail: "Use product and search context to improve Amazon titles, bullets, and descriptions.",
    href: "/amazon",
    action: "Open Amazon",
  },
  {
    title: "Cross-channel opportunity",
    detail: "Find catalog gaps between Shopify, Merchant Center, Amazon, and Search Console.",
    href: "/cross-channel",
    action: "Open board",
  },
];

export default function AiPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader section="Workspace" title="AI Copilot" meta="Assisted commerce operations" />

      <section className="grid gap-3 md:grid-cols-2">
        {workflows.map((workflow) => (
          <div key={workflow.href} className="ss-card" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--ss-ink)" }}>{workflow.title}</h2>
            <p style={{ marginTop: 8, minHeight: 40, fontSize: 14, lineHeight: 1.55, color: "var(--ss-ink-3)" }}>{workflow.detail}</p>
            <Link
              href={workflow.href}
              className="ss-btn ss-btn-sm ss-btn-primary"
              style={{ marginTop: 16 }}
            >
              {workflow.action}
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
