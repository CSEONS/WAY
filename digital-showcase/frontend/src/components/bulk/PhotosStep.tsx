import { ArrowDown01Icon, Cancel01Icon, ImageAdd01Icon, Mic01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { Button, Card, Field, FileButton, Icon, Input, Spinner, Textarea, cx } from "../../ui";
import { VoiceStatus, voiceButtonLabel } from "../VoiceRecorder";
import type { BulkPhoto } from "./grouping";
import styles from "./Bulk.module.css";

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 40;

interface PhotosStepProps {
  photos: BulkPhoto[];
  /** Photos are being shrunk before they show up in the list. */
  isPreparing: boolean;
  /** The AI is working: nothing can be changed. */
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  recorder: ReturnType<typeof useVoiceRecorder>;
  prompt: string;
  onPrompt: (value: string) => void;
  expectedCount: string;
  onExpectedCount: (value: string) => void;
}

/** Step 1: only photos are needed. Voice and the rest are optional help for the AI. */
export function PhotosStep({ photos, isPreparing, disabled, onAdd, onRemove, recorder, prompt, onPrompt, expectedCount, onExpectedCount }: PhotosStepProps) {
  // Opened from the start when the owner comes back to something they typed.
  const [isMoreOpen, setIsMoreOpen] = useState(() => Boolean(prompt.trim() || expectedCount.trim()));
  const isFull = photos.length >= MAX_PHOTOS;

  return (
    <>
      <Card as="section">
        <div className={styles.picker}>
          <FileButton
            variant={photos.length ? "secondary" : "primary"}
            size="lg"
            icon={ImageAdd01Icon}
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={disabled || isPreparing || isFull}
            onFiles={onAdd}
          >
            {photos.length ? "Добавить ещё фото" : "Выбрать фото"}
          </FileButton>
          <span className={styles.pickerHint} aria-live="polite">
            {isPreparing ? (
              <>
                <Spinner size="sm" />
                Готовим фото…
              </>
            ) : photos.length ? (
              `Выбрано фото: ${photos.length}${isFull ? " — это максимум" : photos.length < MIN_PHOTOS ? ". Нужно хотя бы два" : ""}`
            ) : (
              `Все товары сразу, от ${MIN_PHOTOS} до ${MAX_PHOTOS} фото. ИИ сам разложит их по товарам.`
            )}
          </span>
        </div>
        {photos.length > 0 && (
          <div className={styles.photoGrid}>
            {photos.map((photo, index) => (
              <div className={styles.photoItem} key={photo.url}>
                <img className={styles.photo} src={photo.url} alt={`Фото ${index + 1}`} />
                {!disabled && (
                  <button type="button" className={styles.photoRemove} aria-label={`Убрать фото ${index + 1}`} title="Убрать" onClick={() => onRemove(index)}>
                    <Icon icon={Cancel01Icon} size="xs" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card as="section">
        <div className={styles.voiceText}>
          <span className={styles.voiceTitle}>
            Расскажите о товарах голосом
            <span className={styles.optional}>необязательно</span>
          </span>
          <p className={styles.lead}>Назовите товары, цены и размеры — как удобно. Например: «Синее платье четыре с половиной тысячи, размеры S и M, юбка две тысячи».</p>
        </div>
        {(recorder.isRecording || recorder.blob) && <VoiceStatus recorder={recorder} />}
        <Button variant="secondary" icon={Mic01Icon} disabled={disabled} onClick={recorder.toggle}>
          {voiceButtonLabel(recorder)}
        </Button>
      </Card>

      <Button
        variant="ghost"
        size="sm"
        iconEnd={ArrowDown01Icon}
        className={cx(styles.moreToggle, isMoreOpen && styles.chevronOpen)}
        aria-expanded={isMoreOpen}
        onClick={() => setIsMoreOpen((current) => !current)}
      >
        Дополнительно
      </Button>
      {isMoreOpen && (
        <Card as="section">
          <Field label="Описать текстом" hint="Вместо голоса или вместе с ним.">
            <Textarea value={prompt} disabled={disabled} onChange={(event) => onPrompt(event.target.value)} placeholder="Например: джинсы по 1000, носки по 50, кепка 44 размера…" />
          </Field>
          <Field label="Сколько примерно товаров на фото" hint="Помогает ИИ не склеить разные вещи и не разбить одну.">
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              max={Math.max(photos.length, 1)}
              value={expectedCount}
              disabled={disabled}
              onChange={(event) => onExpectedCount(event.target.value)}
              placeholder="Например, 5"
            />
          </Field>
        </Card>
      )}
    </>
  );
}
