import { Cancel01Icon, Delete02Icon, GitMergeIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Button, Card, IconButton, Notice, cx } from "../../ui";
import { type BulkPhoto, type Layout, makeCover, mergeDrafts, movePhoto, removeDraft } from "./grouping";
import styles from "./Bulk.module.css";

/** What the owner is in the middle of: moving a photo or joining a product with another. */
type Selection = { kind: "photo"; photo: number } | { kind: "merge"; draftId: string } | null;

interface GroupsStepProps {
  photos: BulkPhoto[];
  layout: Layout;
  onChange: (layout: Layout) => void;
}

/** Step 2: «Правильно разложил?» — fix what the AI put in the wrong place. */
export function GroupsStep({ photos, layout, onChange }: GroupsStepProps) {
  const [selection, setSelection] = useState<Selection>(null);
  /** The layout before the last change that removed a product: one tap brings it back. */
  const [undo, setUndo] = useState<{ layout: Layout; text: string } | null>(null);
  const selectedPhoto = selection?.kind === "photo" ? selection.photo : null;
  const photoOwner = selectedPhoto == null ? undefined : layout.drafts.find((draft) => draft.photos.includes(selectedPhoto));
  const mergeSource = selection?.kind === "merge" ? layout.drafts.find((draft) => draft.id === selection.draftId) : undefined;

  const name = (title: string) => (title ? `«${title}»` : "без названия");
  // Taking the last photo away removes the product itself.
  const emptiedText = photoOwner?.photos.length === 1 ? `Товар ${name(photoOwner.title)} убран: в нём не осталось фото` : undefined;

  /** `undoText` — for changes that make a product disappear: the owner gets «Вернуть». */
  function apply(next: Layout, undoText?: string) {
    setUndo(undoText ? { layout, text: undoText } : null);
    onChange(next);
    setSelection(null);
  }

  function togglePhoto(photo: number) {
    setSelection(selectedPhoto === photo ? null : { kind: "photo", photo });
  }

  function thumbs(list: number[], withCover: boolean) {
    return (
      <div className={styles.thumbs}>
        {list.map((photo, position) => (
          <button
            type="button"
            key={photo}
            className={cx(styles.thumb, selectedPhoto === photo && styles.thumbSelected, selectedPhoto != null && selectedPhoto !== photo && styles.thumbDimmed)}
            aria-pressed={selectedPhoto === photo}
            aria-label={`Фото ${photo + 1}`}
            disabled={selection?.kind === "merge"}
            onClick={() => togglePhoto(photo)}
          >
            <img className={styles.photo} src={photos[photo]?.url} alt="" />
            {withCover && position === 0 && <span className={styles.cover}>Обложка</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <p className={styles.lead}>Нажмите на фото, если оно попало не в тот товар. Названия и цены — на следующем шаге.</p>

      {!layout.drafts.length && (
        <Notice tone="warning">Не осталось ни одного товара. Нажмите на фото ниже и выберите «Отдельным товаром».</Notice>
      )}

      {layout.drafts.map((draft, index) => {
        const isPhotoTarget = selectedPhoto != null && draft !== photoOwner;
        const isMergeTarget = Boolean(mergeSource) && draft !== mergeSource;
        return (
          <Card as="article" className={cx(styles.group, (isPhotoTarget || isMergeTarget) && styles.groupTarget)} key={draft.id}>
            <div className={styles.groupHead}>
              <span className={styles.groupMeta}>
                Товар {index + 1} · фото: {draft.photos.length}
              </span>
              <strong className={cx(styles.groupTitle, !draft.title && styles.untitled)}>{draft.title || "Новый товар"}</strong>
            </div>
            {/* Above the photos: in sight even when the bar at the bottom covers half of the card. */}
            {isPhotoTarget && (
              <Button variant="primary" block onClick={() => apply(movePhoto(layout, selectedPhoto, { kind: "draft", id: draft.id }), emptiedText)}>
                Перенести сюда
              </Button>
            )}
            {isMergeTarget && mergeSource && (
              <Button variant="primary" block onClick={() => apply(mergeDrafts(layout, draft.id, mergeSource.id), `Товары объединены в ${name(draft.title)}`)}>
                Объединить с этим товаром
              </Button>
            )}
            {thumbs(draft.photos, true)}
            {!selection && (
              <div className={styles.groupActions}>
                {layout.drafts.length > 1 && (
                  <Button variant="ghost" size="sm" icon={GitMergeIcon} onClick={() => setSelection({ kind: "merge", draftId: draft.id })}>
                    Объединить
                  </Button>
                )}
                <Button variant="ghost" size="sm" icon={Delete02Icon} onClick={() => apply(removeDraft(layout, draft.id), `Товар ${name(draft.title)} удалён`)}>
                  Удалить
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      {layout.unused.length > 0 && (
        <section className={styles.unused}>
          <div className={styles.groupHead}>
            <span className={styles.unusedTitle}>Не используются · фото: {layout.unused.length}</span>
            <span className={styles.barHint}>Эти фото не попадут на витрину. Нажмите на фото, чтобы вернуть его в товар.</span>
          </div>
          {thumbs(layout.unused, false)}
        </section>
      )}

      {selectedPhoto != null && (
        <div className={styles.bar} role="group" aria-label="Что сделать с фото">
          <div className={styles.barHead}>
            <img className={cx(styles.photo, styles.barPhoto)} src={photos[selectedPhoto]?.url} alt="" />
            <div className={styles.barText}>
              <span className={styles.barTitle}>Куда это фото?</span>
              {layout.drafts.some((draft) => draft !== photoOwner) && <span className={styles.barHint}>Нажмите «Перенести сюда» у нужного товара.</span>}
            </div>
            <IconButton icon={Cancel01Icon} label="Отмена" size="sm" onClick={() => setSelection(null)} />
          </div>
          <div className={styles.barActions}>
            {/* The only photo of a product already is a product of its own. */}
            {photoOwner?.photos.length !== 1 && (
              <Button variant="secondary" size="sm" onClick={() => apply(movePhoto(layout, selectedPhoto, { kind: "new" }))}>
                Отдельным товаром
              </Button>
            )}
            {photoOwner && photoOwner.photos[0] !== selectedPhoto && (
              <Button variant="secondary" size="sm" onClick={() => apply(makeCover(layout, selectedPhoto))}>
                Сделать обложкой
              </Button>
            )}
            {photoOwner && (
              <Button variant="secondary" size="sm" onClick={() => apply(movePhoto(layout, selectedPhoto, { kind: "unused" }), emptiedText)}>
                Не использовать
              </Button>
            )}
          </div>
        </div>
      )}

      {mergeSource && (
        <div className={styles.bar} role="group" aria-label="Объединение товаров">
          <div className={styles.barHead}>
            <img className={cx(styles.photo, styles.barPhoto)} src={photos[mergeSource.photos[0]]?.url} alt="" />
            <div className={styles.barText}>
              <span className={styles.barTitle}>С каким товаром объединить?</span>
              <span className={styles.barHint}>Фото «{mergeSource.title || "Новый товар"}» перейдут в товар, который вы выберете.</span>
            </div>
            <IconButton icon={Cancel01Icon} label="Отмена" size="sm" onClick={() => setSelection(null)} />
          </div>
        </div>
      )}

      {undo && !selection && (
        <div className={styles.bar} role="status">
          <div className={styles.barHead}>
            <span className={cx(styles.barText, styles.barTitle)}>{undo.text}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onChange(undo.layout);
                setUndo(null);
              }}
            >
              Вернуть
            </Button>
            <IconButton icon={Cancel01Icon} label="Скрыть" size="sm" onClick={() => setUndo(null)} />
          </div>
        </div>
      )}
    </>
  );
}
