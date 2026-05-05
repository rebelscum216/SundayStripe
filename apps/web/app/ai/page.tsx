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
          <div key={workflow.href} className="rounded border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold text-zinc-100">{workflow.title}</h2>
            <p className="mt-2 min-h-10 text-sm leading-relaxed text-zinc-400">{workflow.detail}</p>
            <Link
              href={workflow.href}
              className="mt-4 inline-flex rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
            >
              {workflow.action}
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
