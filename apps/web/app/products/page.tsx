import { type Product, ProductsTable } from "./products-table";
import { PageHeader } from "../components/page-header";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

async function getProducts(): Promise<Product[]> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/products`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as Product[];
  } catch {
    return [];
  }
}

type ProductsPageProps = {
  searchParams?: {
    query?: string;
    gap?: string;
  };
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const products = await getProducts();

  return (
    <div className="flex flex-col gap-6">
        <PageHeader section="Workspace" title="Products" meta={`${products.length} products`} />
        <ProductsTable products={products} initialQuery={searchParams?.query} initialGap={searchParams?.gap} />
    </div>
  );
}
