import { api } from "../../api/client";
import type { ProductDraft, ProductFormImage } from "./types";

/** The server takes up to 8 photos for a draft (ownerRoutes: ai-draft). */
const MAX_DRAFT_PHOTOS = 8;

/**
 * Asks the AI to fill the product form: from the photos alone («Заполнить
 * карточку с ИИ») or with what the owner said or typed. The cover goes first:
 * it shows the product best.
 */
export async function requestAiDraft(
  path: string,
  { images, coverId, prompt = "", voice }: { images: ProductFormImage[]; coverId?: string | null; prompt?: string; voice?: Blob | null }
) {
  const ordered = [...images].sort((left, right) => Number(right.id === coverId) - Number(left.id === coverId)).slice(0, MAX_DRAFT_PHOTOS);
  const formData = new FormData();
  if (prompt.trim()) formData.append("prompt", prompt.trim());
  for (const image of ordered) {
    // A new photo goes as a file; a saved one — by its address.
    if (image.file) formData.append("images", image.file);
    else if (image.url) formData.append("imageUrls", image.url);
  }
  if (voice) formData.append("voice", voice, "product-voice.webm");
  const { data } = await api.post<ProductDraft>(path, formData);
  return data;
}
