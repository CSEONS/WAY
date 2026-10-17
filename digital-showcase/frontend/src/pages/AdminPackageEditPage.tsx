import { Delete02Icon, FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PackageCard } from "../components/landing/PackageCard";
import { refreshSiteSettings } from "../state/siteSettings";
import type { AdminPackage, PackageView } from "../types/models";
import {
  Button,
  Card,
  CardHeader,
  ConfirmModal,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  Page,
  PageHeader,
  SectionLabel,
  Switch,
  Textarea,
  useToast
} from "../ui";
import { plural } from "../utils/format";
// Same layout as a plan: the form, and the card as it will look next to it.
import styles from "./AdminPlanEditPage.module.css";

interface Form {
  name: string;
  price: string;
  description: string;
  previews: string;
  fills: string;
  isService: boolean;
  isPublic: boolean;
}

const empty: Form = { name: "", price: "", description: "", previews: "", fills: "", isService: false, isPublic: true };

/** "", "10" → a whole number ≥ 0; NaN for anything else. */
function wholeNumber(value: string) {
  const text = value.replace(/\s/g, "");
  if (!text) return 0;
  return /^\d+$/.test(text) ? Number(text) : NaN;
}

/**
 * One package: a new one (/admin/packages/new) or an existing one
 * (/admin/packages/:id/edit). What it costs, what it adds — AI previews, AI
 * cards, a service the admin does — and whether the landing and owners see it.
 * Stores that bought it keep what they got, whatever happens to it here.
 */
export function AdminPackageEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const [item, setItem] = useState<AdminPackage | null>(null);
  const [form, setForm] = useState<Form>();
  const [state, setState] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  function load() {
    if (isNew) {
      setForm(empty);
      setState("ready");
      return;
    }
    setState("loading");
    api
      .get<AdminPackage[]>("/admin/packages")
      .then((res) => {
        const found = res.data.find((entry) => entry.id === id);
        if (!found) {
          setState("missing");
          return;
        }
        setItem(found);
        setForm({
          name: found.name,
          price: String(found.price),
          description: found.description,
          previews: found.previews ? String(found.previews) : "",
          fills: found.fills ? String(found.fills) : "",
          isService: Boolean(found.isService),
          isPublic: Boolean(found.isPublic)
        });
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, [id]);

  if (state === "missing") return <Navigate to="/admin/plans?view=packages" replace />;

  function change(patch: Partial<Form>) {
    setForm((current) => current && { ...current, ...patch });
    setError("");
  }

  const price = form ? wholeNumber(form.price) : 0;
  const previews = form ? wholeNumber(form.previews) : 0;
  const fills = form ? wholeNumber(form.fills) : 0;
  const isEmpty = form && !previews && !fills && !form.isService;

  /** The card as the landing will show it, from what is typed right now. */
  const preview: PackageView | null = form
    ? {
        name: form.name.trim() || "Название пакета",
        price: Number.isNaN(price) ? 0 : price,
        description: form.description.trim(),
        previews: Number.isNaN(previews) ? 0 : previews,
        fills: Number.isNaN(fills) ? 0 : fills,
        isService: form.isService
      }
    : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (form.price.trim() === "" || Number.isNaN(price)) {
      setError("Цена — целое число рублей, 0 — бесплатно");
      return;
    }
    if (Number.isNaN(previews) || Number.isNaN(fills)) {
      setError("Превью и карточки — целые числа, пусто — ноль");
      return;
    }
    if (isEmpty) {
      setError("В пакете ничего нет: добавьте превью, карточки с ИИ или включите «Услуга»");
      return;
    }
    setIsSaving(true);
    setError("");
    const payload = { name: form.name, price, description: form.description, previews, fills, isService: form.isService, isPublic: form.isPublic };
    try {
      const { data } = isNew ? await api.post<AdminPackage>("/admin/packages", payload) : await api.put<AdminPackage>(`/admin/packages/${id}`, payload);
      refreshSiteSettings();
      toast.show(isNew ? `Пакет «${data.name}» добавлен` : `Пакет «${data.name}» сохранён`, { tone: "success" });
      navigate("/admin/plans?view=packages");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Не удалось сохранить пакет");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!item) return;
    try {
      await api.delete(`/admin/packages/${item.id}`);
      refreshSiteSettings();
      toast.show(`Пакет «${item.name}» удалён`, { tone: "success" });
      navigate("/admin/plans?view=packages");
    } catch (err: any) {
      setIsDeleteOpen(false);
      setError(err?.response?.data?.message ?? "Не удалось удалить пакет");
    }
  }

  const header = (
    <PageHeader
      title={isNew ? "Новый пакет" : form ? `Пакет «${form.name.trim() || "без названия"}»` : "Пакет"}
      description="Докупается к любому тарифу разово. Изменения сразу видны на лендинге и владельцам"
      back={{ to: "/admin/plans?view=packages", label: "К пакетам" }}
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
  if (!form || !preview) {
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
      <div className={styles.layout}>
        <form className={styles.form} onSubmit={submit}>
          <Card as="section" padding="lg" className={styles.section}>
            <CardHeader title="Название и цена" />
            <Field label="Название" required>
              <Input value={form.name} maxLength={60} placeholder="Например, «+10 ИИ-превью»" onChange={(event) => change({ name: event.target.value })} required />
            </Field>
            <Field label="Цена" hint="Платится один раз, не каждый месяц. Подставится в «Продать пакет»" required>
              <div className={styles.unitInput}>
                <Input inputMode="numeric" placeholder="200" value={form.price} onChange={(event) => change({ price: event.target.value })} />
                <span>₽ разово</span>
              </div>
            </Field>
            <Field label="Описание" hint="Одно предложение: зачем он нужен">
              <Textarea rows={2} maxLength={300} value={form.description} onChange={(event) => change({ description: event.target.value })} />
            </Field>
          </Card>

          <Card as="section" padding="lg" className={styles.section}>
            <CardHeader
              title="Что в пакете"
              description="Превью и карточки добавляются магазину сразу после оплаты. Тратятся, когда закончится месячный лимит тарифа, и не сгорают 1-го числа"
            />
            <Field label="ИИ-превью" hint="Обложки для товаров, которые рисует ИИ. Пусто — без превью">
              <div className={styles.unitInput}>
                <Input inputMode="numeric" placeholder="0" value={form.previews} onChange={(event) => change({ previews: event.target.value })} />
                <span>превью</span>
              </div>
            </Field>
            <Field label="Карточки с ИИ" hint="Заполнение товара по фото и голосу, в том числе много товаров сразу. Пусто — без карточек">
              <div className={styles.unitInput}>
                <Input inputMode="numeric" placeholder="0" value={form.fills} onChange={(event) => change({ fills: event.target.value })} />
                <span>{plural(Number.isNaN(fills) ? 0 : fills, ["карточка", "карточки", "карточек"])}</span>
              </div>
            </Field>
            <Switch
              checked={form.isService}
              onChange={(isService) => change({ isService })}
              label="Услуга — делает администратор"
              description="Например, помощь с первым заполнением. После оплаты появится в «Нужно сделать сейчас», пока вы не нажмёте «Выполнено»"
            />
            {(previews > 0 || fills > 0) && (
              <p className={styles.muted}>ИИ откроется и магазинам на тарифе без ИИ — ровно на столько, сколько в пакете.</p>
            )}
          </Card>

          <Card as="section" padding="lg" className={styles.section}>
            <CardHeader title="Кто видит" />
            <Switch
              checked={form.isPublic}
              onChange={(isPublic) => change({ isPublic })}
              label="Показывать на лендинге и владельцам"
              description="Владелец попросит пакет в «Подписке». Скрытый можно продать самому — в «Магазинах» или в админке"
            />
          </Card>

          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" icon={FloppyDiskIcon} block loading={isSaving}>
            {isNew ? "Добавить пакет" : "Сохранить пакет"}
          </Button>
          {item && (
            <Button variant="ghost" icon={Delete02Icon} className={styles.delete} onClick={() => setIsDeleteOpen(true)}>
              Удалить пакет
            </Button>
          )}
        </form>

        <aside className={styles.preview} aria-label="Как пакет выглядит на лендинге">
          <SectionLabel>{form.isPublic ? "Так увидят на лендинге и в «Подписке»" : "Скрыт — так выглядел бы"}</SectionLabel>
          <PackageCard item={preview} />
        </aside>
      </div>

      {isDeleteOpen && item && (
        <ConfirmModal
          title={`Удалить пакет «${item.name}»?`}
          description={
            item.soldCount > 0
              ? `Его купили ${item.soldCount} ${plural(item.soldCount, ["раз", "раза", "раз"])} — у магазинов останется то, что они получили. Чтобы просто не продавать, выключите «Показывать».`
              : "Он пропадёт с лендинга и из «Подписки» владельцев."
          }
          confirmLabel="Удалить"
          danger
          onCancel={() => setIsDeleteOpen(false)}
          onConfirm={remove}
        />
      )}
    </Page>
  );
}
