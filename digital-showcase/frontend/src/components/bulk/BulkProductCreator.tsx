import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useNavigationType, useSearchParams, type BlockerFunction } from "react-router-dom";
import { api } from "../../api/client";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { useBackgroundJobs } from "../../state/backgroundJobs";
import { Button, ConfirmModal, Notice, PageHeader, useToast } from "../../ui";
import { compressImages } from "../../utils/compressImage";
import { plural } from "../../utils/format";
import { GroupsStep } from "./GroupsStep";
import { type AiBulkDraft, type BulkPhoto, type Layout, isDraftValid, layoutFromAi, toPayload } from "./grouping";
import { MAX_PHOTOS, MIN_PHOTOS, PhotosStep } from "./PhotosStep";
import { PricesStep } from "./PricesStep";
import styles from "./Bulk.module.css";

type Step = "photos" | "groups" | "prices";

const descriptions: Record<Step, string> = {
  photos: "Шаг 1 из 3. Выберите фото всех товаров — ИИ разложит их по товарам и подпишет.",
  groups: "Шаг 2 из 3. Правильно разложил? Проверьте, что фото лежат в своих товарах.",
  prices: "Шаг 3 из 3. Проверьте названия и поставьте цены."
};

const productWords: [string, string, string] = ["товар", "товара", "товаров"];

/**
 * Adding many products at once, as the content of its own page: the owner
 * picks photos, the AI sorts them into products, the owner fixes the sorting
 * and sets prices. Saving goes to the background queue, so the owner is back
 * in the store right away.
 */
export function BulkProductCreator({ storeId }: { storeId: string }) {
  const toast = useToast();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  const { queueProductBatch } = useBackgroundJobs();
  const [photos, setPhotos] = useState<BulkPhoto[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [expectedCount, setExpectedCount] = useState("");
  /** The AI's sorting with the owner's fixes. Dropped when the set of photos changes. */
  const [layout, setLayout] = useState<Layout | null>(null);
  const [isSorting, setIsSorting] = useState(false);
  const [error, setError] = useState("");
  const [errorsShown, setErrorsShown] = useState(0);
  const recorder = useVoiceRecorder(setError);
  const photosRef = useRef(photos);
  const isPublished = useRef(false);
  const storeUrl = `/dashboard/stores/${storeId}`;

  // The step lives in the address: the phone's «Назад» goes one step back instead of leaving the page.
  const requestedStep = searchParams.get("step");
  const step: Step = layout && (requestedStep === "groups" || requestedStep === "prices") ? requestedStep : "photos";

  // A later step opened by a reload or a saved link has nothing to show yet.
  useEffect(() => {
    if (requestedStep && !layout) setSearchParams({}, { replace: true });
  }, [requestedStep, layout, setSearchParams]);

  // A step the owner moved on to starts from the top; a step they came back to keeps its place (ScrollManager).
  useEffect(() => {
    if (navigationType !== "POP") window.scrollTo(0, 0);
  }, [step, navigationType]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  // Picked photos, a voice note, fixed sorting — too much to lose to a stray tap.
  const hasWork = photos.length > 0 || Boolean(recorder.blob);

  // Leaving the page inside the app — a link, «Назад», «Выйти» — asks first. Steps only change the query.
  const shouldAsk = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => hasWork && !isPublished.current && currentLocation.pathname !== nextLocation.pathname,
    [hasWork]
  );
  const blocker = useBlocker(shouldAsk);

  // Closing or reloading the tab: only the browser's own dialog can ask.
  useEffect(() => {
    if (!hasWork) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Older browsers need returnValue set to show the «Leave site?» dialog.
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasWork]);

  function goTo(next: Step) {
    setSearchParams(next === "photos" ? {} : { step: next });
  }

  async function addPhotos(files: File[]) {
    const room = MAX_PHOTOS - photos.length;
    setError(files.length > room ? `Можно не больше ${MAX_PHOTOS} фото за раз — лишние не добавлены.` : "");
    setIsPreparing(true);
    const prepared = await compressImages(files.slice(0, room));
    setPhotos((current) => [...current, ...prepared.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    setLayout(null);
    setIsPreparing(false);
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photos[index].url);
    setPhotos((current) => current.filter((_, position) => position !== index));
    setLayout(null);
    setError("");
  }

  async function sortPhotos() {
    setError("");
    setIsSorting(true);
    try {
      const formData = new FormData();
      photos.forEach((photo) => formData.append("images", photo.file));
      if (prompt.trim()) formData.append("prompt", prompt.trim());
      if (Number(expectedCount) > 0) formData.append("expectedCount", String(Math.round(Number(expectedCount))));
      if (recorder.blob) formData.append("voice", recorder.blob, "bulk-products-voice.webm");
      const { data } = await api.post<AiBulkDraft[]>(`/owner/stores/${storeId}/products/bulk-ai-draft`, formData);
      const next = layoutFromAi(data, photos.length);
      if (!next.drafts.length) {
        setError("ИИ не смог разложить фото по товарам. Попробуйте ещё раз.");
        return;
      }
      setLayout(next);
      goTo("groups");
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Не удалось разложить фото. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setIsSorting(false);
    }
  }

  function publish() {
    if (!layout) return;
    if (!layout.drafts.every(isDraftValid)) {
      setErrorsShown((count) => count + 1);
      return;
    }
    queueProductBatch(
      layout.drafts.map((draft) => ({
        storeId,
        payload: toPayload(draft),
        imageSelection: {
          images: draft.photos.map((index) => ({ id: `bulk-${index}`, existingId: null, file: photos[index].file, name: photos[index].file.name, url: "" })),
          previewImageId: `bulk-${draft.photos[0]}`
        },
        existingImageIds: []
      }))
    );
    const count = layout.drafts.length;
    toast.show(`Сохраняем ${count} ${plural(count, productWords)} — они появятся в списке сами.`, { tone: "success" });
    isPublished.current = true;
    navigate(storeUrl);
  }

  const productCount = layout?.drafts.length ?? 0;

  return (
    <>
      <PageHeader title="Добавить много товаров" description={descriptions[step]} back={{ to: storeUrl, label: "Вернуться назад" }} />

      <div className={styles.flow}>
        {step === "photos" && (
          <PhotosStep
            photos={photos}
            isPreparing={isPreparing}
            disabled={isSorting}
            onAdd={(files) => void addPhotos(files)}
            onRemove={removePhoto}
            recorder={recorder}
            prompt={prompt}
            onPrompt={setPrompt}
            expectedCount={expectedCount}
            onExpectedCount={setExpectedCount}
          />
        )}
        {step === "groups" && layout && <GroupsStep photos={photos} layout={layout} onChange={setLayout} />}
        {step === "prices" && layout && <PricesStep photos={photos} layout={layout} onChange={setLayout} errorsShown={errorsShown} />}
        {error && step === "photos" && <Notice tone="danger">{error}</Notice>}
        {step === "prices" && errorsShown > 0 && layout && !layout.drafts.every(isDraftValid) && <Notice tone="danger">Заполните название у каждого товара и проверьте цены.</Notice>}

        <div className={styles.actions}>
          {step === "photos" && (
            <>
              {layout && (
                <Button variant="neutral" size="lg" disabled={isSorting} onClick={() => goTo("groups")}>
                  Вернуться к раскладке
                </Button>
              )}
              <Button variant="primary" size="lg" disabled={photos.length < MIN_PHOTOS || isPreparing || recorder.isRecording} loading={isSorting} onClick={sortPhotos}>
                {isSorting ? "ИИ раскладывает фото…" : layout ? "Разложить заново" : "Разложить по товарам"}
              </Button>
            </>
          )}
          {step === "groups" && (
            <>
              <Button variant="neutral" size="lg" onClick={() => goTo("photos")}>
                Назад
              </Button>
              <Button variant="primary" size="lg" disabled={!productCount} onClick={() => goTo("prices")}>
                Дальше: цены
              </Button>
            </>
          )}
          {step === "prices" && (
            <>
              <Button variant="neutral" size="lg" onClick={() => goTo("groups")}>
                Назад
              </Button>
              <Button variant="primary" size="lg" onClick={publish}>
                Опубликовать {productCount} {plural(productCount, productWords)}
              </Button>
            </>
          )}
        </div>
      </div>

      {blocker.state === "blocked" && (
        <ConfirmModal
          title="Уйти со страницы?"
          description="Выбранные фото и всё, что вы здесь настроили, не сохранятся."
          confirmLabel="Уйти"
          cancelLabel="Остаться"
          danger
          onCancel={blocker.reset}
          onConfirm={blocker.proceed}
        />
      )}
    </>
  );
}
