import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { Button } from "../../ui";

/** «Вручную + ИИ»: fills one field — from the photos and what the owner already typed. */
export function AiFieldButton({
  fieldName,
  filled,
  loading,
  disabled,
  onClick
}: {
  /** «Название», «Описание»…: for the screen reader. */
  fieldName: string;
  /** The AI already filled it: one more tap asks for another variant. */
  filled: boolean;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const text = filled ? "Другой вариант" : "Заполнить с ИИ";
  return (
    <Button variant="ghost" size="sm" icon={AiMagicIcon} loading={loading} disabled={disabled} onClick={onClick} aria-label={`${text}: ${fieldName}`}>
      {loading ? "Заполняем…" : text}
    </Button>
  );
}
