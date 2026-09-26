import { useEffect, useRef, useState } from "react";

/** Records one voice message with MediaRecorder. `toggle` starts or stops the recording. */
export function useVoiceRecorder(onError: (message: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  // Release the microphone if the form closes mid-recording.
  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  async function toggle() {
    const current = recorderRef.current;
    if (current && current.state === "recording") {
      current.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Браузер не поддерживает запись аудио");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      const recordingStartedAt = Date.now();
      const finish = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setIsRecording(false);
        setStartedAt(null);
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setBlob(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        setDurationSeconds(Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000)));
        finish();
      };
      recorder.onerror = () => {
        finish();
        onError("Не удалось записать голос");
      };
      setBlob(null);
      setDurationSeconds(0);
      setElapsedSeconds(0);
      setStartedAt(recordingStartedAt);
      recorderRef.current = recorder;
      setIsRecording(true);
      recorder.start();
    } catch {
      setIsRecording(false);
      setStartedAt(null);
      onError("Не удалось получить доступ к микрофону");
    }
  }

  return { isRecording, blob, elapsedSeconds, durationSeconds, toggle };
}

export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
