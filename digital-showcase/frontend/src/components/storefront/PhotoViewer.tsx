import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { type KeyboardEvent, type PointerEvent, type TouchEvent, useEffect, useRef, useState } from "react";
import { IconButton, cx } from "../../ui";
import { photoSources } from "../ProductPhoto";
import styles from "./PhotoViewer.module.css";

/** A finger or the mouse moved this far sideways: the next or previous photo. */
const SWIPE_PX = 50;
/** A trackpad swipe or the mouse wheel scrolled this far: the next or previous photo. */
const WHEEL_PX = 60;
/** One swipe sends wheel events for a while after the fingers stop: they wait for a pause this long. */
const WHEEL_PAUSE_MS = 250;

/** The photo on screen and the ones on either side: they're loaded, so a step shows the next at once. */
function around(index: number, count: number) {
  return new Set([index, (index + 1) % count, (index - 1 + count) % count]);
}

interface PhotoViewerProps {
  /** Photo addresses, in gallery order. */
  images: string[];
  index: number;
  alt: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * A product photo on the whole screen, as large as it fits. Arrows, swipes (a
 * finger, the mouse, a trackpad), the mouse wheel and the keyboard (← →) go
 * through the photos; dots at the bottom show which one it is and how many are
 * left, a tap on a dot opens that photo. Escape or the cross closes it. A
 * native <dialog>: above everything, focus stays inside.
 *
 * Photos already seen stay in the page, and the neighbours load ahead, so
 * going back and forth shows them at once.
 */
export function PhotoViewer({ images, index, alt, onIndexChange, onClose }: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const swipeX = useRef<number | null>(null);
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const count = images.length;
  const near = around(index, count);
  // The wheel listener lives outside React: it always steps from the photo on screen.
  const goRef = useRef(go);

  useEffect(() => {
    goRef.current = go;
  });

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

  useEffect(() => {
    const photos = around(index, count);
    setSeen((current) => ([...photos].every((photo) => current.has(photo)) ? current : new Set([...current, ...photos])));
  }, [index, count]);

  // A sideways trackpad swipe would otherwise make the browser go back a page —
  // and close the photos. Here it, and the mouse wheel, go through the photos.
  // React listens to the wheel passively, so the listener is added by hand.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    let travelled = 0;
    let isWaiting = false;
    let pause: number | undefined;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      window.clearTimeout(pause);
      pause = window.setTimeout(() => {
        travelled = 0;
        isWaiting = false;
      }, WHEEL_PAUSE_MS);
      if (isWaiting) return;
      travelled += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(travelled) < WHEEL_PX) return;
      goRef.current(travelled > 0 ? 1 : -1);
      isWaiting = true;
    }
    dialog.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      dialog.removeEventListener("wheel", onWheel);
      window.clearTimeout(pause);
    };
  }, []);

  function go(step: -1 | 1) {
    if (count > 1) onIndexChange((index + step + count) % count);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === "ArrowRight") go(1);
  }

  function swipeTo(x: number) {
    const start = swipeX.current;
    swipeX.current = null;
    if (start == null) return;
    const shift = x - start;
    if (Math.abs(shift) >= SWIPE_PX) go(shift < 0 ? 1 : -1);
  }

  // A finger: touch events (pointer events on a phone are taken over by the browser's own gestures).
  function onTouchEnd(event: TouchEvent) {
    swipeTo(event.changedTouches[0].clientX);
  }

  // The mouse: dragged sideways like a finger.
  function onPointerUp(event: PointerEvent) {
    if (event.pointerType === "mouse") swipeTo(event.clientX);
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
      onKeyDown={onKeyDown}
      onTouchStart={(event) => (swipeX.current = event.touches[0].clientX)}
      onTouchEnd={onTouchEnd}
      onPointerDown={(event) => event.pointerType === "mouse" && (swipeX.current = event.clientX)}
      onPointerUp={onPointerUp}
    >
      {images.map((image, photo) => {
        if (!near.has(photo) && !seen.has(photo)) return null;
        const sources = photoSources(image);
        return (
          <img
            key={image}
            className={cx(styles.photo, photo !== index && styles.photoAside)}
            src={sources.src}
            srcSet={sources.srcSet}
            sizes="100vw"
            alt={photo === index ? alt : ""}
            aria-hidden={photo !== index || undefined}
            // Dragged with the mouse, a picture would be carried off (and dropped as a link in some browsers).
            draggable={false}
          />
        );
      })}
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
