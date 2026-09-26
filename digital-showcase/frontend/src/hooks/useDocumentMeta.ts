import { useEffect } from "react";

const DEFAULT_TITLE = "Витрины";
const DEFAULT_DESCRIPTION = "Цифровые витрины для магазинов одежды: каталог по ссылке, товары с фото и ценами, связь с продавцом в WhatsApp.";

function setDescription(content: string) {
  let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = "description";
    document.head.appendChild(tag);
  }
  tag.content = content;
}

/** Page title and description for the browser tab, bookmarks and search engines. Restored on leave. */
export function useDocumentMeta(title?: string | null, description?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} — Витрины` : DEFAULT_TITLE;
    setDescription(description?.trim() ? description.trim().slice(0, 200) : DEFAULT_DESCRIPTION);
    return () => {
      document.title = DEFAULT_TITLE;
      setDescription(DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}
