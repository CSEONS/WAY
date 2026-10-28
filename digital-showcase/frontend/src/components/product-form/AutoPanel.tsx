import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { Button, Card, CardHeader } from "../../ui";
import styles from "./ProductForm.module.css";

interface AutoPanelProps {
  hasPhotos: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
}

/**
 * «Авто»: photos and one button — the AI fills the whole card. Price and sizes
 * aren't on the photos: the owner checks the card and adds them after.
 */
export function AutoPanel({ hasPhotos, isGenerating, onGenerate }: AutoPanelProps) {
  return (
    <Card as="section" className={styles.section} aria-busy={isGenerating}>
      <CardHeader
        title="Сгенерировать карточку"
        description={
          hasPhotos
            ? "ИИ заполнит название, описание, категорию и цвета по фото. Вам останется проверить карточку и указать цену."
            : "Добавьте фото товара выше — по нему ИИ заполнит всю карточку."
        }
      />
      <Button variant="primary" size="lg" block icon={AiMagicIcon} disabled={!hasPhotos} loading={isGenerating} onClick={onGenerate}>
        {isGenerating ? "ИИ заполняет карточку…" : "Сгенерировать карточку"}
      </Button>
    </Card>
  );
}
