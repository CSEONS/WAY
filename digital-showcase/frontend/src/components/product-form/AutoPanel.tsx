import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { Button, Card, CardHeader } from "../../ui";
import styles from "./ProductForm.module.css";

interface AutoPanelProps {
  hasPhotos: boolean;
  /** The store can have AI previews: the AI draws one with the card. */
  withPreview: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
}

/**
 * «Авто»: photos and one button — the AI fills the whole card and draws the
 * preview. Price and sizes aren't on the photos: the owner checks the card and
 * adds them after.
 */
export function AutoPanel({ hasPhotos, withPreview, isGenerating, onGenerate }: AutoPanelProps) {
  return (
    <Card as="section" className={styles.section} aria-busy={isGenerating}>
      <CardHeader
        title="Сгенерировать карточку"
        description={
          hasPhotos
            ? `ИИ заполнит название, описание, категорию и цвета по фото${withPreview ? " и нарисует превью для обложки" : ""}. Вам останется проверить карточку и указать цену.`
            : "Добавьте фото товара выше — по нему ИИ заполнит всю карточку."
        }
      />
      <Button variant="primary" size="lg" block icon={AiMagicIcon} disabled={!hasPhotos} loading={isGenerating} onClick={onGenerate}>
        {isGenerating ? "ИИ заполняет карточку…" : "Сгенерировать карточку"}
      </Button>
    </Card>
  );
}
