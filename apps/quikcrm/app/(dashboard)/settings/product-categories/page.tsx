import { requireUser } from "@/lib/auth/require";
import { ProductCategoriesPageClient } from "@/components/settings/product-categories-page";

export default async function ProductCategoriesSettingsPage() {
  await requireUser();
  return <ProductCategoriesPageClient />;
}
