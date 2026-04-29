export default function Home() {
  return (
    <main className="min-h-screen px-6 py-10">
      <section className="mx-auto flex max-w-3xl flex-col gap-5">
        <p className="text-sm font-medium uppercase tracking-wide text-stone-600">
          Sunday Stripe Hub
        </p>
        <h1 className="text-4xl font-semibold text-stone-950">
          Shopify sync foundation
        </h1>
        <p className="max-w-2xl text-base leading-7 text-stone-700">
          Phase 1 is focused on the backend pipeline: Postgres, Redis, Shopify
          connection, product sync, webhooks, and status checks.
        </p>
        <a
          className="w-fit rounded-md bg-stone-950 px-4 py-2 text-sm font-medium text-white"
          href="http://localhost:3001/api/status"
        >
          API status
        </a>
      </section>
    </main>
  );
}
