import { type ImgHTMLAttributes, useState } from "react";

// Every uploaded photo has smaller copies next to it (see backend
// imageService: /uploads/<id>.webp → <id>-400.webp, <id>-800.webp).
const UPLOADED = /^\/uploads\/[0-9a-f-]{36}\.webp$/;

function thumbnail(url: string, width: 400 | 800) {
  return url.replace(/\.webp$/, `-${width}.webp`);
}

export type ProductPhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  src: string;
  /**
   * How wide the photo is shown, for the browser to pick a copy — e.g.
   * "(min-width: 720px) 25vw, 50vw". Defaults to the full width.
   */
  sizes?: string;
};

/** A product photo that downloads a 400/800px copy instead of the 2048px original when that's enough. */
export function ProductPhoto({ src, sizes = "100vw", loading = "lazy", alt = "", ...rest }: ProductPhotoProps) {
  // If a copy is missing (very old upload), fall back to the original once.
  const [useOriginal, setUseOriginal] = useState(false);
  if (!UPLOADED.test(src) || useOriginal) return <img src={src} alt={alt} loading={loading} {...rest} />;

  return (
    <img
      src={thumbnail(src, 800)}
      srcSet={`${thumbnail(src, 400)} 400w, ${thumbnail(src, 800)} 800w, ${src} 2048w`}
      sizes={sizes}
      alt={alt}
      loading={loading}
      onError={() => setUseOriginal(true)}
      {...rest}
    />
  );
}
