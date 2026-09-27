import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { type FormEvent, useState } from "react";
import { api } from "../../api/client";
import { Button, Checkbox, Field, Icon, Input, Notice, Textarea } from "../../ui";
import styles from "./LeadForm.module.css";

const emptyForm = { name: "", phone: "", storeName: "", city: "", comment: "", website: "" };
type Errors = Partial<Record<"name" | "phone" | "consent", string>>;

function validate(form: typeof emptyForm, consent: boolean): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = "Как к вам обращаться?";
  if (form.phone.replace(/\D/g, "").length < 10) errors.phone = "Нужен телефон, чтобы мы перезвонили";
  if (!consent) errors.consent = "Без согласия мы не сможем принять заявку";
  return errors;
}

/** «Оставить заявку»: saved in the admin panel and sent to Telegram. */
export function LeadForm() {
  const [form, setForm] = useState(emptyForm);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState("");

  const field = (name: keyof typeof emptyForm) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) => {
      setForm((current) => ({ ...current, [name]: event.target.value }));
      // Fixing a field hides its message; the rest wait for the next submit.
      setErrors((current) => (name in current ? { ...current, [name]: undefined } : current));
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validate(form, consent);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setIsSending(true);
    setServerError("");
    try {
      await api.post("/public/leads", { ...form, consent });
      setSentTo(form.phone);
      setForm(emptyForm);
      setConsent(false);
    } catch (err: any) {
      setServerError(err?.response?.data?.message ?? "Не удалось отправить заявку. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setIsSending(false);
    }
  }

  if (sentTo) {
    return (
      <div className={styles.done} role="status">
        <span className={styles.doneIcon}>
          <Icon icon={CheckmarkCircle02Icon} size="lg" />
        </span>
        <h3 className={styles.doneTitle}>Заявка отправлена</h3>
        <p className={styles.doneText}>
          Мы позвоним на номер <span className={styles.nowrap}>{sentTo}</span>, расскажем о подключении и ответим на вопросы.
        </p>
        <Button variant="ghost" onClick={() => setSentTo("")}>
          Отправить ещё одну
        </Button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.row}>
        <Field label="Как к вам обращаться" error={errors.name} required>
          <Input autoComplete="name" {...field("name")} />
        </Field>
        <Field label="Телефон" error={errors.phone} required>
          <Input type="tel" autoComplete="tel" inputMode="tel" placeholder="+7 900 000-00-00" {...field("phone")} />
        </Field>
      </div>
      <div className={styles.row}>
        <Field label="Магазин">
          <Input autoComplete="organization" placeholder="Название, если есть" {...field("storeName")} />
        </Field>
        <Field label="Город">
          <Input autoComplete="address-level2" {...field("city")} />
        </Field>
      </div>
      <Field label="Комментарий">
        <Textarea rows={3} placeholder="Сколько товаров, удобное время для звонка…" {...field("comment")} />
      </Field>
      {/* Honeypot for bots: hidden from people and screen readers. */}
      <div className={styles.trap} aria-hidden="true">
        <label>
          Сайт
          <input tabIndex={-1} autoComplete="off" {...field("website")} />
        </label>
      </div>
      <div className={styles.consent}>
        <Checkbox
          checked={consent}
          onChange={(value) => {
            setConsent(value);
            if (value) setErrors((current) => ({ ...current, consent: undefined }));
          }}
          invalid={Boolean(errors.consent)}
          label={
            <>
              Согласен на обработку персональных данных, чтобы со мной связались по заявке, по{" "}
              <a href="/privacy" target="_blank" rel="noreferrer">
                политике конфиденциальности
              </a>
            </>
          }
        />
        {errors.consent && <small className={styles.consentError}>{errors.consent}</small>}
      </div>
      {serverError && <Notice tone="danger">{serverError}</Notice>}
      <Button type="submit" variant="primary" size="lg" block loading={isSending}>
        Оставить заявку
      </Button>
    </form>
  );
}
