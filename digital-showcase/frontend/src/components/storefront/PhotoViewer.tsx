import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { type KeyboardEvent, type TouchEvent, useEffect, useRef } from "react";
import { IconButton, cx } from "../../ui";
import { photoSources } from "../ProductPhoto";
import styles from "./PhotoViewer.module.css";

/** A finger moved this far sideways: the next or previous photo. */
const SWIPE_PX = 50;

interface PhotoViewerProps {
  /** Photo addresses, in gallery order. */
  images: string[];
  index: number;
  alt: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * A product photo on the whole screen, as large as it fits. Arrows, swipes and
 * the keyboard (← →) go through the photos; dots at the bottom show which one
 * it is and how many are left, a tap on a dot opens that photo. Escape, the
 * cross or a tap beside the photo closes it. A native <dialog>: above everything, focus stays inside.
 */
export function PhotoViewer({ images, index, alt, onIndexChange, onClose }: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);
  const count = images.length;
  const photo = photoSources(images[index]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      dialog?.close();
    };
  }, []);

  function go(step: -1 | 1) {
    if (count > 1) onIndexChange((index + step + count) % count);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === "ArrowRight") go(1);
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touchX.current;
    touchX.current = null;
    if (start == null) return;
    const shift = event.changedTouches[0].clientX - start;
    if (Math.abs(shift) >= SWIPE_PX) go(shift < 0 ? 1 : -1);
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.viewer}
      aria-label={alt}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // Only the empty space around the photo is the <dialog> itself.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      onKeyDown={onKeyDown}
      onTouchStart={(event) => (touchX.current = event.touches[0].clientX)}
      onTouchEnd={onTouchEnd}
    >
      <img key={images[index]} className={styles.photo} src={photo.src} srcSet={photo.srcSet} sizes="100vw" alt={alt} />
      <div className={styles.top}>
        {count > 1 && (
          <span className={styles.counter}>
            {index + 1} / {count}
          </span>
        )}
        <IconButton icon={Cancel01Icon} label="Закрыть" variant="neutral" className={styles.close} onClick={onClose} autoFocus />
      </div>
      {count > 1 && (
        <>
          <IconButton icon={ArrowLeft01Icon} label="Предыдущее фото" variant="neutral" className={styles.prev} onClick={() => go(-1)} />
          <IconButton icon={ArrowRight01Icon} label="Следующее фото" variant="neutral" className={styles.next} onClick={() => go(1)} />
          <div className={styles.dots} role="group" aria-label="Фото товара">
            {images.map((image, dot) => (
              <button
                type="button"
                key={image}
                className={cx(styles.dot, dot === index && styles.dotActive)}
                aria-label={`Фото ${dot + 1} из ${count}`}
                aria-current={dot === index || undefined}
                onClick={() => onIndexChange(dot)}
              />
            ))}
          </div>
        </>
      )}
    </dialog>
  );
}
