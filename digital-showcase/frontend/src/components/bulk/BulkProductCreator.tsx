import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useNavigationType, useSearchParams, type BlockerFunction } from "react-router-dom";
import { api } from "../../api/client";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { useBackgroundJobs } from "../../state/backgroundJobs";
import { Button, ConfirmModal, Notice, PageHeader, useToast } from "../../ui";
import { compressImages } from "../../utils/compressImage";
import { plural } from "../../utils/format";
import { GroupsStep } from "./GroupsStep";
import {
  type BulkPhoto,
  type BulkSorting,
  type BulkSortingSummary,
  type Layout,
  SORTING_KEEP_DAYS,
  isDraftValid,
  layoutFromAi,
  sortingsPath,
  toPayload
} from "./grouping";
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
const keepDays = `${SORTING_KEEP_DAYS} ${plural(SORTING_KEEP_DAYS, ["день", "дня", "дней"])}`;
const timeFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** How often the open page asks about the sorting; the server counts it as watched a little longer (bulkDraftService). */
const POLL_MS = 2500;

/** A sorting's photos from the server: it's continued in another tab, or after the cabinet was closed. */
async function downloadPhotos(storeId: string, sorting: BulkSorting, onProgress: (done: number) => void) {
  const files: File[] = new Array(sorting.photoCount);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < sorting.photoCount) {
      const index = next++;
      const { data } = await api.get<Blob>(`${sortingsPath(storeId)}/${sorting.id}/photos/${index}`, { responseType: "blob" });
      const type = data.type || "image/jpeg";
      files[index] = new File([data], `photo-${index + 1}.${type.split("/")[1] ?? "jpg"}`, { type });
      onProgress(++done);
    }
  }
  // A few at a time: quick on a phone without flooding its connection.
  await Promise.all(Array.from({ length: Math.min(4, sorting.photoCount) }, worker));
  return files;
}

/** «ИИ раскладывает 24 фото», «Фото разложены: 8 товаров» — a sorting the owner left, offered on the first step. */
function sortingText(item: BulkSortingSummary) {
  const when = timeFormat.format(new Date(item.createdAt));
  if (item.status === "RUNNING") return { title: "ИИ раскладывает фото", text: `${item.photoCount} фото, начато ${when}.` };
  if (item.status === "ERROR") return { title: "Фото не разложены", text: `${item.photoCount} фото, ${when}: ${item.error ?? "ИИ не ответил"}.` };
  return {
    title: "Фото разложены — продолжите",
    text: `${item.productCount} ${plural(item.productCount, productWords)} из ${item.photoCount} фото, ${when}. Раскладка хранится ${keepDays}.`
  };
}

/**
 * Adding many products at once, as the content of its own page: the owner
 * picks photos, the AI sorts them into products, the owner fixes the sorting
 * and sets prices. The AI sorts on the server: the owner may leave the page
 * while it works and come back from the notification (the address keeps the
 * sorting as `?draft=`). Saving goes to the background queue, so the owner is
 * back in the store right away.
 */
export function BulkProductCreator({ storeId }: { storeId: string }) {
  const toast = useToast();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  const { queueProductBatch, watchBulkSorting, takeBulkSorting } = useBackgroundJobs();
  const [photos, setPhotos] = useState<BulkPhoto[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [expectedCount, setExpectedCount] = useState("");
  /** The AI's sorting with the owner's fixes. Dropped when the set of photos changes. */
  const [layout, setLayout] = useState<Layout | null>(null);
  /** The AI's sorting on the server: started here, or opened from a notification. */
  const [sorting, setSorting] = useState<BulkSorting | null>(null);
  /** Photos on their way to the server for a new sorting, percent. */
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  /** A sorting's photos coming back from the server. */
  const [restoring, setRestoring] = useState<{ done: number; total: number } | null>(null);
  const [seconds, setSeconds] = useState(0);
  /** Sortings the owner left earlier: offered on the first step. */
  const [leftSortings, setLeftSortings] = useState<BulkSortingSummary[]>([]);
  const [error, setError] = useState("");
  const [errorsShown, setErrorsShown] = useState(0);
  const recorder = useVoiceRecorder(setError);
  const photosRef = useRef(photos);
  const sortingRef = useRef(sorting);
  const isMounted = useRef(false);
  const isPublished = useRef(false);
  const storeUrl = `/dashboard/stores/${storeId}`;
  const basePath = sortingsPath(storeId);

  // The step and the sorting live in the address: the phone's «Назад» goes one step back, the notification opens the same place.
  const draftId = searchParams.get("draft");
  const requestedStep = searchParams.get("step");
  const step: Step = layout && (requestedStep === "groups" || requestedStep === "prices") ? requestedStep : "photos";
  const isRunning = sorting?.status === "RUNNING";
  const isSorting = uploadPercent !== null || isRunning;

  // A later step opened by a reload or a saved link has nothing to show yet (a sorting in the address brings its own).
  useEffect(() => {
    if (requestedStep && !layout && !draftId) setSearchParams({}, { replace: true });
  }, [requestedStep, layout, draftId, setSearchParams]);

  // A step the owner moved on to starts from the top; a step they came back to keeps its place (ScrollManager).
  useEffect(() => {
    if (navigationType !== "POP") window.scrollTo(0, 0);
  }, [step, navigationType]);

  useEffect(() => {
    photosRef.current = photos;
    sortingRef.current = sorting;
  });

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      const current = sortingRef.current;
      // Left while the AI sorts: the dock follows the sorting, and the server notifies the owner when it's done.
      if (current?.status === "RUNNING" && !isPublished.current) {
        watchBulkSorting({ storeId, draftId: current.id, photoCount: current.photoCount, photos: photosRef.current.map((photo) => photo.file) });
        void api.get(`${sortingsPath(storeId)}/${current.id}`, { params: { watch: 0 } }).catch(() => undefined);
      }
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, [storeId, watchBulkSorting]);

  function goTo(next: Step, replace = false) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === "photos") params.delete("step");
        else params.set("step", next);
        return params;
      },
      { replace }
    );
  }

  function replacePhotos(files: File[]) {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos(files.map((file) => ({ file, url: URL.createObjectURL(file) })));
  }

  /** What the server says about the sorting: done — on to the sorting step; failed — say why. */
  function receive(next: BulkSorting, isReopened = false) {
    setSorting(next);
    if (next.status === "ERROR") {
      setError(`${next.error ?? "Не удалось разложить фото"}. Фото на месте — нажмите «Разложить заново».`);
      if (requestedStep) goTo("photos", true);
      return;
    }
    if (next.status !== "DONE" || !next.drafts) return;
    const ready = layoutFromAi(next.drafts, next.photoCount);
    if (!ready.drafts.length) {
      setError("ИИ не смог разложить фото по товарам. Попробуйте ещё раз.");
      return;
    }
    setLayout(ready);
    // Reopened on a later step (a reload): the AI's sorting is back, though not the owner's fixes.
    if (!isReopened || (requestedStep !== "groups" && requestedStep !== "prices")) goTo("groups", isReopened);
  }

  // The polling below calls the latest receive, not the one of the render it started in.
  const receiveRef = useRef(receive);
  useEffect(() => {
    receiveRef.current = receive;
  });

  // Opened with a sorting in the address (a notification, the dock, a reload): its photos and the AI's answer.
  useEffect(() => {
    if (!draftId || sorting?.id === draftId) return;
    let ignore = false;
    setError("");
    setLayout(null);
    setRestoring({ done: 0, total: 0 });
    void (async () => {
      try {
        const { data } = await api.get<BulkSorting>(`${basePath}/${draftId}`, { params: { watch: 1 } });
        if (ignore) return;
        // Left to the dock a moment ago: its photos are still in memory.
        const kept = takeBulkSorting(draftId);
        const files =
          kept?.length === data.photoCount ? kept : await downloadPhotos(storeId, data, (done) => !ignore && setRestoring({ done, total: data.photoCount }));
        if (ignore) return;
        replacePhotos(files);
        setPrompt(data.prompt);
        setExpectedCount(data.expectedCount ? String(data.expectedCount) : "");
        receiveRef.current(data, true);
      } catch (err: any) {
        if (ignore) return;
        setError(err.response?.data?.message ?? "Не удалось открыть раскладку. Проверьте интернет и попробуйте ещё раз.");
        setSearchParams({}, { replace: true });
      } finally {
        if (!ignore) setRestoring(null);
      }
    })();
    return () => {
      ignore = true;
    };
    // Only a new sorting in the address starts this; what it sets along the way doesn't.
  }, [draftId, basePath]);

  // While the AI sorts: ask every few seconds. Only a visible page counts as watching — a locked phone gets the notification.
  useEffect(() => {
    if (!isRunning || !sorting) return;
    const id = sorting.id;
    let stopped = false;
    function ask() {
      const watch = document.visibilityState === "visible" ? 1 : 0;
      api
        .get<BulkSorting>(`${basePath}/${id}`, { params: { watch } })
        .then(({ data }) => {
          if (!stopped && data.status !== "RUNNING") receiveRef.current(data);
        })
        .catch((err) => {
          // A hiccup of the connection: asked again in a moment. Gone: thrown away elsewhere.
          if (stopped || err?.response?.status !== 404) return;
          setSorting(null);
          setError(err.response.data?.message ?? "Раскладка больше недоступна. Разложите фото заново.");
        });
    }
    const timer = window.setInterval(ask, POLL_MS);
    document.addEventListener("visibilitychange", ask);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [isRunning, sorting?.id, basePath]);

  // «ИИ раскладывает фото… 35 с».
  useEffect(() => {
    if (!isRunning || !sorting) return;
    const startedAt = Math.min(Date.now(), Date.parse(sorting.createdAt) || Date.now());
    const tick = () => setSeconds(Math.round((Date.now() - startedAt) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, sorting?.createdAt]);

  // Sortings left earlier, offered on an empty first step.
  useEffect(() => {
    if (draftId) return;
    let ignore = false;
    api
      .get<BulkSortingSummary[]>(basePath)
      .then(({ data }) => {
        if (!ignore) setLeftSortings(data);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [basePath, draftId]);

  // Picked photos, a voice note, fixed sorting — too much to lose to a stray tap. A sorting the AI is on is safe on the server.
  const hasWork = (photos.length > 0 || Boolean(recorder.blob)) && !isRunning;

  // Leaving the page inside the app — a link, «Назад», «Выйти» — asks first. Steps only change the query.
  // Photos on their way to the server keep going: the dock picks the sorting up.
  const shouldAsk = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => hasWork && uploadPercent === null && !isPublished.current && currentLocation.pathname !== nextLocation.pathname,
    [hasWork, uploadPercent]
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

  /** The photos changed: the sorting on the server was for others. */
  function forgetSorting() {
    if (!sorting) return;
    void api.delete(`${basePath}/${sorting.id}`).catch(() => undefined);
    setSorting(null);
    setSearchParams({}, { replace: true });
  }

  async function addPhotos(files: File[]) {
    const room = MAX_PHOTOS - photos.length;
    setError(files.length > room ? `Можно не больше ${MAX_PHOTOS} фото за раз — лишние не добавлены.` : "");
    setIsPreparing(true);
    const prepared = await compressImages(files.slice(0, room));
    setPhotos((current) => [...current, ...prepared.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    setLayout(null);
    forgetSorting();
    setIsPreparing(false);
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photos[index].url);
    setPhotos((current) => current.filter((_, position) => position !== index));
    setLayout(null);
    forgetSorting();
    setError("");
  }

  async function sortPhotos() {
    setError("");
    setUploadPercent(0);
    const previous = sorting;
    const files = photos.map((photo) => photo.file);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("images", file));
      if (prompt.trim()) formData.append("prompt", prompt.trim());
      if (Number(expectedCount) > 0) formData.append("expectedCount", String(Math.round(Number(expectedCount))));
      if (recorder.blob) formData.append("voice", recorder.blob, "bulk-products-voice.webm");
      const { data } = await api.post<BulkSorting>(basePath, formData, {
        onUploadProgress: (event) => {
          if (event.total) setUploadPercent(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        }
      });
      // «Разложить заново»: the earlier sorting isn't needed any more.
      if (previous && previous.id !== data.id) void api.delete(`${basePath}/${previous.id}`).catch(() => undefined);
      if (!isMounted.current) {
        // Left while the photos were on their way: the dock follows the sorting.
        watchBulkSorting({ storeId, draftId: data.id, photoCount: data.photoCount, photos: files });
        void api.get(`${basePath}/${data.id}`, { params: { watch: 0 } }).catch(() => undefined);
        return;
      }
      setSorting(data);
      setSearchParams({ draft: data.id }, { replace: true });
    } catch (err: any) {
      if (isMounted.current) setError(err.response?.data?.message ?? "Не удалось отправить фото. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      if (isMounted.current) setUploadPercent(null);
    }
  }

  function continueInBackground() {
    toast.show("ИИ раскладывает фото. Когда закончит, придёт уведомление — продолжите с того же места.", { tone: "success", duration: 6000 });
    navigate(storeUrl);
  }

  function discardLeft(id: string) {
    setLeftSortings((current) => current.filter((item) => item.id !== id));
    void api.delete(`${basePath}/${id}`).catch(() => undefined);
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
    // The photos go up from here; the server's copy isn't needed.
    if (sorting) void api.delete(`${basePath}/${sorting.id}`).catch(() => undefined);
    const count = layout.drafts.length;
    toast.show(`Сохраняем ${count} ${plural(count, productWords)} — они появятся в списке сами.`, { tone: "success" });
    isPublished.current = true;
    navigate(storeUrl);
  }

  const productCount = layout?.drafts.length ?? 0;
  const offered = step === "photos" && !draftId && !photos.length && !isSorting ? leftSortings.slice(0, 3) : [];

  return (
    <>
      <PageHeader title="Добавить много товаров" description={descriptions[step]} back={{ to: storeUrl, label: "Вернуться назад" }} />

      <div className={styles.flow}>
        {offered.map((item) => {
          const { title, text } = sortingText(item);
          return (
            <Notice
              key={item.id}
              tone={item.status === "ERROR" ? "warning" : "accent"}
              icon={item.status === "ERROR" ? undefined : AiMagicIcon}
              title={title}
              action={
                <>
                  <Button variant={item.status === "DONE" ? "primary" : "secondary"} size="sm" onClick={() => setSearchParams({ draft: item.id })}>
                    {item.status === "DONE" ? "Продолжить" : "Открыть"}
                  </Button>
                  {item.status !== "RUNNING" && (
                    <Button variant="ghost" size="sm" onClick={() => discardLeft(item.id)}>
                      Удалить
                    </Button>
                  )}
                </>
              }
            >
              {text}
            </Notice>
          );
        })}

        {restoring && (
          <Notice tone="accent" icon={AiMagicIcon} title="Открываем раскладку">
            {restoring.total ? `Загружаем фото: ${restoring.done} из ${restoring.total}` : "Спрашиваем у сервера…"}
          </Notice>
        )}

        {step === "photos" && (
          <PhotosStep
            photos={photos}
            isPreparing={isPreparing}
            disabled={isSorting || Boolean(restoring)}
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
        {step === "photos" && isRunning && (
          <Notice tone="accent" icon={AiMagicIcon} title="ИИ раскладывает фото">
            Обычно это минута-две. Ждать на странице не обязательно: нажмите «Продолжить в фоне» — когда ИИ закончит, придёт уведомление, и вы продолжите с этого
            места.
          </Notice>
        )}

        <div className={styles.actions}>
          {step === "photos" && (
            <>
              {layout && !isSorting && (
                <Button variant="neutral" size="lg" onClick={() => goTo("groups")}>
                  Вернуться к раскладке
                </Button>
              )}
              {isRunning && (
                <Button variant="neutral" size="lg" onClick={continueInBackground}>
                  Продолжить в фоне
                </Button>
              )}
              <Button
                variant="primary"
                size="lg"
                disabled={photos.length < MIN_PHOTOS || isPreparing || recorder.isRecording || Boolean(restoring)}
                loading={isSorting}
                onClick={sortPhotos}
              >
                {uploadPercent !== null
                  ? `Отправляем фото… ${uploadPercent}%`
                  : isRunning
                    ? `ИИ раскладывает фото… ${seconds} с`
                    : layout
                      ? "Разложить заново"
                      : "Разложить по товарам"}
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
          description={
            sorting
              ? `Ваши правки здесь не сохранятся, а фото и раскладка ИИ останутся на ${keepDays} — их можно будет открыть снова на этой странице.`
              : "Выбранные фото и всё, что вы здесь настроили, не сохранятся."
          }
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
