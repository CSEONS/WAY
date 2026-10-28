import { api } from "../../api/client";
import type { ProductDraft, ProductFormImage } from "./types";

/** The server takes up to 8 photos for a draft (ownerRoutes: ai-draft). */
const MAX_DRAFT_PHOTOS = 8;

/** «Вручную + ИИ»: the fields the AI can fill one at a time. */
export type AiDraftField = "title" | "description" | "category" | "colors";

/**
 * Asks the AI to fill the product form: from the photos alone («Сгенерировать
 * карточку»), or just one `field` built on what the owner already typed
 * (`known`). The cover goes first: it shows the product best.
 */
export async function requestAiDraft(
  path: string,
  {
    images,
    coverId,
    field,
    known
  }: {
    images: ProductFormImage[];
    coverId?: string | null;
    field?: AiDraftField;
    known?: { title: string; description: string; category: string };
  }
) {
  const ordered = [...images].sort((left, right) => Number(right.id === coverId) - Number(left.id === coverId)).slice(0, MAX_DRAFT_PHOTOS);
  const formData = new FormData();
  if (field) {
    formData.append("field", field);
    if (known) formData.append("known", JSON.stringify(known));
  }
  for (const image of ordered) {
    // A new photo goes as a file; a saved one — by its address.
    if (image.file) formData.append("images", image.file);
    else if (image.url) formData.append("imageUrls", image.url);
  }
  const { data } = await api.post<ProductDraft>(path, formData);
  return data;
}
