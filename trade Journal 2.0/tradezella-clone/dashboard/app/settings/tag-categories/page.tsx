/**
 * app/settings/tag-categories/page.tsx
 *
 * Settings page for the modular tag-category system. Renders inside the
 * Settings layout. All the real interactivity lives in TagCategoryManager —
 * this page is just a thin server wrapper so the route exists.
 */

import { requireAuth } from "@/lib/auth";
import TagCategoryManager from "./TagCategoryManager";

export default async function TagCategoriesPage() {
  await requireAuth();
  return (
    <div className="max-w-4xl py-4">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Tag categories</h2>
      <p className="mb-6 text-xs text-gray-500">
        Create custom fields for your trades — multi-select lists, star ratings,
        sliders, yes/no toggles, and short text notes. Drag to reorder.
      </p>
      <TagCategoryManager />
    </div>
  );
}
