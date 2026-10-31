import { AiMagicIcon, Camera01Icon, Delete02Icon, FloppyDiskIcon, Image01Icon, ImageUpload01Icon } from "@hugeicons/core-free-icons";
import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { dataUrlToFile } from "../components/product-form/previewOptions";
import type { AdminPreviewStyle } from "../types/models";
import {
  Button,
  Card,
  CardHeader,
  ConfirmModal,
  ErrorState,
  Field,
  FileButton,
  Icon,
  Input,
  LoadingState,
  Notice,
  Page,
  PageHeader,
  SectionLabel,
  SegmentedControl,
  Switch,
  Textarea,
  useToast
} from "../ui";
// Same layout as a plan: the form, and next to it how the style comes out.
import planStyles from "./AdminPlanEditPage.module.css";
import styles from "./AdminPreviewStyleEditPage.module.css";

interface Form {
  name: string;
  description: string;
  look: string;
  textLayout: string;
  usesScene: boolean;
  usesTheme: boolean;
  usesFeatures: boolean;
  isActive: boolean;
}

const empty: Form = { name: "", description: "", look: "", textLayout: "", usesScene: false, usesTheme: false, usesFeatures: false, isActive: false };

/** The sample picture as it will be after saving: unchanged, a new file, or none. */
type Sample = { url: string; file?: File } | null;

/**
 * One style of «Превью с ИИ»: a new one (/admin/preview-styles/new) or an
 * existing one (/admin/preview-styles/:id/edit). What the image model is told
 * about the look and the text, which choices the owner gets, and whether
 * owners see it. «Пробная генерация» draws a cover in the style as typed, on
 * the admin's photo; a good one becomes the sample owners see.
 */
export function AdminPreviewStyleEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const [item, setItem] = useState<AdminPreviewStyle | null>(null);
  const [form, setForm] = useState<Form>();
  const [sample, setSample] = useState<Sample>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  // «Пробная генерация»
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [testTitle, setTestTitle] = useState("");
  const [testText, setTestText] = useState<"with_text" | "no_text">("with_text");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState("");

  function load() {
    if (isNew) {
      setForm(empty);
      setState("ready");
      return;
    }
    setState("loading");
    api
      .get<AdminPreviewStyle[]>("/admin/preview-styles")
      .then((res) => {
        const found = res.data.find((entry) => entry.id === id);
        if (!found) {
          setState("missing");
          return;
        }
        setItem(found);
        setForm({
          name: found.name,
          description: found.description,
          look: found.look,
          textLayout: found.textLayout,
          usesScene: Boolean(found.usesScene),
          usesTheme: Boolean(found.usesTheme),
          usesFeatures: Boolean(found.usesFeatures),
          isActive: Boolean(found.isActive)
        });
        setSample(found.sample ? { url: found.sample } : null);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, [id]);

  // Picked photos are shown from memory: freed when replaced or the page closes.
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo]
  );

  if (state === "missing") return <Navigate to="/admin/preview-styles" replace />;

  function change(patch: Partial<Form>) {
    setForm((current) => current && { ...current, ...patch });
    setError("");
  }

  const hasText = Boolean(form?.textLayout.trim());

  /** What the server is sent: the form as typed. Icons only go with text. */
  function payload(current: Form) {
    return { ...current, usesFeatures: current.usesFeatures && Boolean(current.textLayout.trim()) };
  }

  async function test() {
    if (!form || !photo) return;
    if (!form.look.trim()) {
      setTestError("Опишите, как выглядит превью — без этого рисовать нечего");
      return;
    }
    setIsTesting(true);
    setTestError("");
    const data = new FormData();
    data.append("image", photo.file);
    data.append("style", JSON.stringify({ ...payload(form), name: form.name.trim() || "Проба" }));
    data.append("options", JSON.stringify({ title: testTitle.trim(), text: testText }));
    try {
      const res = await api.post<{ image: string }>("/admin/preview-styles/test", data);
      setTestResult(res.data.image);
    } catch (err: any) {
      setTestError(err?.response?.data?.message ?? "Не удалось нарисовать превью");
    } finally {
      setIsTesting(false);
    }
  }

  function takeAsSample() {
    if (!testResult) return;
    setSample({ url: testResult, file: dataUrlToFile(testResult, "sample") });
    toast.show("Картинка станет примером, когда вы сохраните стиль");
  }

  async function saveSample(styleId: string) {
    const original = item?.sample ?? null;
    if ((sample?.url ?? null) === original) return;
    const data = new FormData();
    if (sample?.file) data.append("image", sample.file);
    await api.put(`/admin/preview-styles/${styleId}/sample`, data);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setIsSaving(true);
    setError("");
    try {
      const body = payload(form);
      const { data } = isNew ? await api.post<AdminPreviewStyle>("/admin/preview-styles", body) : await api.put<AdminPreviewStyle>(`/admin/preview-styles/${id}`, body);
      try {
        await saveSample(data.id);
      } catch (err: any) {
        toast.show(err?.response?.data?.message ?? "Стиль сохранён, а пример — нет. Попробуйте ещё раз", { tone: "danger" });
        navigate(`/admin/preview-styles/${data.id}/edit`, { replace: true });
        return;
      }
      toast.show(isNew ? `Стиль «${data.name}» добавлен` : `Стиль «${data.name}» сохранён`, { tone: "success" });
      navigate("/admin/preview-styles");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Не удалось сохранить стиль");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!item) return;
    try {
      await api.delete(`/admin/preview-styles/${item.id}`);
      toast.show(`Стиль «${item.name}» удалён`, { tone: "success" });
      navigate("/admin/preview-styles");
    } catch (err: any) {
      setIsDeleteOpen(false);
      setError(err?.response?.data?.message ?? "Не удалось удалить стиль");
    }
  }

  const header = (
    <PageHeader
      title={isNew ? "Новый стиль превью" : form ? `Стиль «${form.name.trim() || "без названия"}»` : "Стиль превью"}
      description="Изменения сразу видны владельцам в «Превью с ИИ»"
      back={{ to: "/admin/preview-styles", label: "К стилям" }}
    />
  );

  if (state === "error") {
    return (
      <Page>
        {header}
        <ErrorState onRetry={load} />
      </Page>
    );
  }
  if (!form) {
    return (
      <Page>
        {header}
        <LoadingState />
      </Page>
    );
  }

  return (
    <Page>
      {header}
      <div className={planStyles.layout}>
        <form className={planStyles.form} onSubmit={submit}>
          <Card as="section" padding="lg" className={planStyles.section}>
            <CardHeader title="Как его увидит владелец" />
            <Field label="Название" required>
              <Input value={form.name} maxLength={40} placeholder="Например, «Новогодний»" onChange={(event) => change({ name: event.target.value })} required />
            </Field>
            <Field label="Описание" hint="Одна строка под названием: чем стиль хорош">
              <Input value={form.description} maxLength={160} onChange={(event) => change({ description: event.target.value })} />
            </Field>
          </Card>

          <Card as="section" padding="lg" className={planStyles.section}>
            <CardHeader
              title="Что сказать ИИ"
              description="Пишите по-английски: так модель понимает точнее. Что товар надо нарисовать как на фото и без людей, а также название товара и выбор владельца сервис добавит сам"
            />
            <Field label="Как выглядит" hint="Ракурс, фон, свет, настроение, общий стиль картинки" required>
              <Textarea
                rows={5}
                maxLength={1500}
                value={form.look}
                placeholder="Flat lay photo shot from directly above, the product in the center on a light wooden surface, soft daylight, minimal composition, photorealistic."
                onChange={(event) => change({ look: event.target.value })}
                required
              />
            </Field>
            <Field label="Надписи" hint="Где и каким шрифтом заголовок, плашки, иконки. Пусто — стиль без надписей">
              <Textarea
                rows={3}
                maxLength={1000}
                value={form.textLayout}
                placeholder="one bold headline at the top center, a small badge in the top-right corner"
                onChange={(event) => change({ textLayout: event.target.value })}
              />
            </Field>
          </Card>

          <Card as="section" padding="lg" className={planStyles.section}>
            <CardHeader title="Что выбирает владелец" description="Выключенное в окне превью не показывается: это решает сам стиль" />
            <Switch checked={form.usesScene} onChange={(usesScene) => change({ usesScene })} label="Фон" description="Студия, город, природа, зима… Выключите, если фон описан в стиле" />
            <Switch checked={form.usesTheme} onChange={(usesTheme) => change({ usesTheme })} label="Цвета оформления" description="Палитра надписей и настроение картинки" />
            <Switch
              checked={form.usesFeatures && hasText}
              disabled={!hasText}
              onChange={(usesFeatures) => change({ usesFeatures })}
              label="Иконки преимуществ"
              description={hasText ? "Тёплая, влагозащитная, прочная… — иконки с подписями. Где их ставить, опишите в «Надписях»" : "Только для стиля с надписями"}
            />
            {hasText && <p className={planStyles.muted}>Свой заголовок и переключатель «С надписями / Без надписей» владелец получит всегда, раз в стиле есть надписи.</p>}
          </Card>

          <Card as="section" padding="lg" className={planStyles.section}>
            <CardHeader title="Кто видит" />
            <Switch
              checked={form.isActive}
              onChange={(isActive) => change({ isActive })}
              label="Показывать владельцам"
              description="Включайте, когда пробная генерация получилась. Хотя бы один стиль должен быть включён"
            />
          </Card>

          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" icon={FloppyDiskIcon} block loading={isSaving}>
            {isNew ? "Добавить стиль" : "Сохранить стиль"}
          </Button>
          {item && (
            <Button variant="ghost" icon={Delete02Icon} className={planStyles.delete} onClick={() => setIsDeleteOpen(true)}>
              Удалить стиль
            </Button>
          )}
        </form>

        <aside className={planStyles.preview} aria-label="Пример и пробная генерация">
          <Card padding="lg" className={planStyles.section}>
            <CardHeader title="Пример" description="Его видит владелец, когда выбирает стиль" />
            {sample ? (
              <img className={styles.picture} src={sample.url} alt="Пример стиля" />
            ) : (
              <span className={`${styles.picture} ${styles.empty}`}>
                <Icon icon={Image01Icon} size="lg" />
                Примера нет
              </span>
            )}
            <div className={styles.row}>
              <FileButton
                variant="secondary"
                size="sm"
                icon={ImageUpload01Icon}
                accept="image/jpeg,image/png,image/webp"
                onFiles={([file]) => setSample({ url: URL.createObjectURL(file), file })}
              >
                Загрузить свою
              </FileButton>
              {sample && (
                <Button variant="ghost" size="sm" onClick={() => setSample(null)}>
                  Убрать
                </Button>
              )}
            </div>
          </Card>

          <Card padding="lg" className={planStyles.section}>
            <CardHeader title="Пробная генерация" description="Рисует по тексту в форме, даже несохранённому. Расход ИИ — за счёт сервиса, не магазина" />
            <div className={styles.row}>
              {photo && <img className={styles.photo} src={photo.url} alt="Фото товара" />}
              <FileButton
                variant="secondary"
                size="sm"
                icon={Camera01Icon}
                accept="image/jpeg,image/png,image/webp"
                onFiles={([file]) => setPhoto({ file, url: URL.createObjectURL(file) })}
              >
                {photo ? "Другое фото" : "Фото товара"}
              </FileButton>
            </div>
            <Field label="Товар" hint="Необязательно: помогает ИИ с надписями">
              <Input value={testTitle} maxLength={120} placeholder="Например, зимняя куртка" onChange={(event) => setTestTitle(event.target.value)} />
            </Field>
            {hasText && (
              <SegmentedControl
                label="Надписи"
                value={testText}
                onChange={setTestText}
                options={[
                  { value: "with_text", label: "С надписями" },
                  { value: "no_text", label: "Без надписей" }
                ]}
              />
            )}
            <Button variant="primary" icon={AiMagicIcon} loading={isTesting} disabled={!photo} onClick={test}>
              {isTesting ? "Рисуем… до минуты" : "Нарисовать"}
            </Button>
            {testError && <Notice tone="danger">{testError}</Notice>}
            {testResult && (
              <>
                <SectionLabel>Результат</SectionLabel>
                <img className={styles.picture} src={testResult} alt="Пробное превью" />
                <Button variant="secondary" onClick={takeAsSample} disabled={sample?.url === testResult}>
                  {sample?.url === testResult ? "Это пример" : "Сделать примером"}
                </Button>
              </>
            )}
          </Card>
        </aside>
      </div>

      {isDeleteOpen && item && (
        <ConfirmModal
          title={`Удалить стиль «${item.name}»?`}
          description="Владельцы, которые его выбрали, в следующий раз получат первый стиль из списка. Чтобы просто убрать его из выбора, выключите «Показывать владельцам»."
          confirmLabel="Удалить"
          danger
          onCancel={() => setIsDeleteOpen(false)}
          onConfirm={remove}
        />
      )}
    </Page>
  );
}
