import { AiMagicIcon, Mic01Icon, PlusSignIcon, TextFontIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { Button, Card, CardHeader, Field, Notice, SegmentedControl, Textarea } from "../../ui";
import { VoiceQuestions, VoiceStatus, voiceButtonLabel } from "../VoiceRecorder";
import styles from "./ProductForm.module.css";

const voiceQuestions = ["Сколько стоит товар?", "Какие размеры есть у каждого цвета?", "Что не видно на фото: ткань, сезон, особенности?"];

/** What the owner adds to the photos: typed or said. */
export interface AutoHint {
  prompt: string;
  voice: Blob | null;
}

interface AutoPanelProps {
  hasPhotos: boolean;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  isGenerating: boolean;
  onGenerate: (hint: AutoHint) => void;
  /** The card is already filled: go back to it without generating. */
  onBack?: () => void;
}

/**
 * «Авто»: photos and one button — the AI fills the whole card. Price and sizes
 * aren't on the photos, so they can be added by voice or text, but needn't be.
 */
export function AutoPanel({ hasPhotos, prompt, onPromptChange, isGenerating, onGenerate, onBack }: AutoPanelProps) {
  const [isHintOpen, setIsHintOpen] = useState(Boolean(prompt.trim()));
  // Talking is easier than typing on a phone, so voice comes first.
  const [inputMode, setInputMode] = useState<"text" | "voice">("voice");
  const [error, setError] = useState("");
  const recorder = useVoiceRecorder(setError);
  const hint: AutoHint = isHintOpen
    ? { prompt: inputMode === "text" ? prompt : "", voice: inputMode === "voice" ? recorder.blob : null }
    : { prompt: "", voice: null };
  const canGenerate = (hasPhotos || Boolean(hint.prompt.trim() || hint.voice)) && !recorder.isRecording;

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
      {isHintOpen ? (
        <div className={styles.autoHint}>
          <SegmentedControl
            label="Как добавить цену и размеры"
            size="sm"
            value={inputMode}
            onChange={setInputMode}
            options={[
              { value: "voice", label: "Голосом", icon: Mic01Icon },
              { value: "text", label: "Текстом", icon: TextFontIcon }
            ]}
          />
          {inputMode === "text" ? (
            <Field label="Цена, размеры и что не видно на фото">
              <Textarea value={prompt} onChange={(e) => onPromptChange(e.target.value)} placeholder="Например: цена 4500, размеры S и M, есть ещё белый цвет" />
            </Field>
          ) : (
            <div className={styles.voice}>
              <VoiceStatus recorder={recorder} />
              <VoiceQuestions questions={voiceQuestions} />
              <Button variant="secondary" icon={Mic01Icon} className={styles.modeLink} onClick={recorder.toggle}>
                {voiceButtonLabel(recorder)}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Button variant="ghost" size="sm" icon={PlusSignIcon} className={styles.modeLink} onClick={() => setIsHintOpen(true)}>
          Добавить цену и размеры голосом или текстом
        </Button>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <Button variant="primary" size="lg" block icon={AiMagicIcon} disabled={!canGenerate} loading={isGenerating} onClick={() => onGenerate(hint)}>
        {isGenerating ? "ИИ заполняет карточку…" : "Сгенерировать карточку"}
      </Button>
      {onBack && !isGenerating && (
        <Button variant="ghost" size="sm" className={styles.modeLink} onClick={onBack}>
          Оставить карточку как есть
        </Button>
      )}
    </Card>
  );
}
