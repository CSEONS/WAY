import { CheckmarkCircle02Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { type ReactNode, useState } from "react";
import type { Store } from "../../types/models";
import { Button, ButtonLink, Card, CardHeader, Icon, ProgressBar, cx, useCopyToClipboard } from "../../ui";
import { markStoreShared, useStoreShared } from "./shareState";
import styles from "./LaunchChecklist.module.css";

interface LaunchChecklistProps {
  store: Store;
  productCount: number;
  publicUrl: string;
}

const hiddenKey = (storeId: string) => `launch-checklist-hidden:${storeId}`;

function readHidden(storeId: string) {
  try {
    return localStorage.getItem(hiddenKey(storeId)) === "1";
  } catch {
    return false;
  }
}

/** «Запуск витрины»: real progress of the first steps, each with a button that does it. Hides itself when done. */
export function LaunchChecklist({ store, productCount, publicUrl }: LaunchChecklistProps) {
  const copy = useCopyToClipboard();
  const isShared = useStoreShared(store.id);
  const [isHidden, setIsHidden] = useState(() => readHidden(store.id));
  const settingsUrl = `/dashboard/stores/${store.id}/settings`;

  const steps: { label: string; done: boolean; action: ReactNode }[] = [
    {
      label: "Напишите пару слов о магазине",
      done: Boolean(store.description),
      action: <StepLink to={settingsUrl}>Заполнить</StepLink>
    },
    {
      label: "Загрузите логотип",
      done: Boolean(store.logoUrl),
      action: <StepLink to={settingsUrl}>Загрузить</StepLink>
    },
    {
      label: "Укажите телефон и WhatsApp или Telegram",
      done: Boolean(store.phone && (store.whatsapp || store.telegram)),
      action: <StepLink to={settingsUrl}>Указать</StepLink>
    },
    {
      label: "Добавьте первый товар",
      done: productCount > 0,
      action: <StepLink to={`/dashboard/stores/${store.id}/products/new`}>Добавить</StepLink>
    },
    {
      label: "Отправьте ссылку на витрину покупателям",
      done: isShared,
      action: (
        <Button
          size="sm"
          variant="outline"
          icon={Copy01Icon}
          onClick={async () => {
            if (await copy(publicUrl, "Ссылка скопирована — отправьте её в WhatsApp или Telegram")) markStoreShared(store.id);
          }}
        >
          Скопировать
        </Button>
      )
    }
  ];
  const doneCount = steps.filter((step) => step.done).length;

  if (isHidden || doneCount === steps.length) return null;

  function hide() {
    try {
      localStorage.setItem(hiddenKey(store.id), "1");
    } catch {
      // Private mode: hidden until reload.
    }
    setIsHidden(true);
  }

  return (
    <Card as="section" className={styles.card}>
      <CardHeader
        title={`Запуск витрины: ${doneCount} из ${steps.length}`}
        description="Пройдите шаги, чтобы покупатели увидели готовый магазин."
        actions={
          <Button variant="ghost" size="sm" onClick={hide}>
            Скрыть
          </Button>
        }
      />
      <ProgressBar value={(doneCount / steps.length) * 100} label="Готовность витрины" />
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={step.label} className={cx(styles.step, step.done && styles.done)}>
            <span className={styles.marker} aria-hidden="true">
              {step.done ? <Icon icon={CheckmarkCircle02Icon} size="md" /> : index + 1}
            </span>
            <span className={styles.label}>
              {step.label}
              {step.done && <span className={styles.visuallyHidden}> — готово</span>}
            </span>
            {!step.done && step.action}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function StepLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <ButtonLink size="sm" variant="outline" to={to}>
      {children}
    </ButtonLink>
  );
}
