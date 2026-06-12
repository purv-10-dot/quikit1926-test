import { requireUser } from "@/lib/auth/require";
import { ProductFieldsPageClient } from "@/components/settings/product-fields-page";

export default async function ProductFieldsSettingsPage() {
  await requireUser();
  return <ProductFieldsPageClient />;
}
