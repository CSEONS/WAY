import { AiMagicIcon, Mic01Icon, TextFontIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { api } from "../../api/client";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { Button, Card, Field, Notice, SegmentedControl, Textarea } from "../../ui";
import { VoiceQuestions, VoiceStatus, voiceButtonLabel } from "../VoiceRecorder";
import type { ProductDraft, ProductFormImage } from "./types";
import styles from "./ProductForm.module.css";

const voiceQuestions = [
  "Что это за товар и как он называется?",
  "Какие цвета доступны?",
  "Какие размеры есть у каждого цвета?",
  "Сколько стоит товар или отдельные комбинации?",
  "К какой категории его отнести?"
];

interface AiPanelProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  images: ProductFormImage[];
  aiDraftPath?: string;
  onDraft: (draft: ProductDraft) => void;
}

/** Describe the product in text or by voice; the AI fills the form below. */
export function AiPanel({ prompt, onPromptChange, images, aiDraftPath, onDraft }: AiPanelProps) {
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const recorder = useVoiceRecorder(setError);
  const canFill = inputMode === "text" ? Boolean(prompt.trim()) : Boolean(recorder.blob) && !recorder.isRecording;

  async function fillWithAi() {
    setError("");
    setIsLoading(true);
    try {
      const formData = new FormData();
      if (prompt.trim()) formData.append("prompt", prompt.trim());
      for (const image of images) {
        if (image.file) formData.append("images", image.file);
        else if (image.url) formData.append("imageUrls", image.url);
      }
      if (inputMode === "voice") {
        if (!recorder.blob) throw new Error("Сначала запишите голосовое сообщение");
        formData.append("voice", recorder.blob, "product-voice.webm");
      }

      const { data } = await api.post<ProductDraft>(aiDraftPath ?? "/owner/products/ai-draft", formData);
      onDraft(data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? "Не удалось заполнить форму");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card as="section" className={styles.section} aria-busy={isLoading}>
      <SegmentedControl
        label="Способ описания"
        size="sm"
        value={inputMode}
        onChange={setInputMode}
        options={[
          { value: "text", label: "Текст", icon: TextFontIcon },
          { value: "voice", label: "Голос", icon: Mic01Icon }
        ]}
      />
      {inputMode === "text" ? (
        <Field label="Описание товара для ИИ">
          <Textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Например: синее платье, размеры S и M, цена 4500 рублей, есть ещё белый цвет…"
          />
        </Field>
      ) : (
        <div className={styles.voice}>
          <VoiceStatus recorder={recorder} />
          <VoiceQuestions questions={voiceQuestions} />
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className={styles.aiActions}>
        {inputMode === "voice" && (
          <Button variant="secondary" icon={Mic01Icon} onClick={recorder.toggle}>
            {voiceButtonLabel(recorder)}
          </Button>
        )}
        <Button variant="primary" icon={AiMagicIcon} className={styles.aiFill} disabled={!canFill} loading={isLoading} onClick={fillWithAi}>
          {isLoading ? "ИИ обрабатывает данные…" : "Заполнить форму"}
        </Button>
      </div>
    </Card>
  );
}
