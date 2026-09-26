import { Mic01Icon } from "@hugeicons/core-free-icons";
import { formatDuration, type useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { Icon, cx } from "../ui";
import styles from "./VoiceRecorder.module.css";

type Recorder = ReturnType<typeof useVoiceRecorder>;

/** «Идёт запись… 0:12» / «Голосовое сообщение записано: 0:20» / «Запись не запущена». */
export function VoiceStatus({ recorder }: { recorder: Recorder }) {
  return (
    <div className={cx(styles.status, recorder.isRecording && styles.recording)}>
      <Icon icon={Mic01Icon} size="sm" />
      {recorder.isRecording
        ? `Идёт запись… ${formatDuration(recorder.elapsedSeconds)}`
        : recorder.blob
          ? `Голосовое сообщение записано: ${formatDuration(recorder.durationSeconds)}`
          : "Запись не запущена"}
      {recorder.isRecording && (
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      )}
    </div>
  );
}

export function voiceButtonLabel(recorder: Recorder) {
  return recorder.isRecording ? "Остановить запись" : recorder.blob ? "Перезаписать" : "Надиктовать";
}

/** Hints for what to say in the voice message. */
export function VoiceQuestions({ questions }: { questions: string[] }) {
  return (
    <ol className={styles.questions}>
      {questions.map((question) => (
        <li key={question}>{question}</li>
      ))}
    </ol>
  );
}
