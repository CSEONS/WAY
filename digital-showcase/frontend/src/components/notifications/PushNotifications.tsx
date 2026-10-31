import { Notification01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { usePushNotifications } from "../../hooks/usePushNotifications";
import { Button, Card, CardHeader, Notice, useToast } from "../../ui";
import { isImpersonating } from "../../utils/impersonation";
import styles from "./PushNotifications.module.css";

const hiddenKey = "push-hint-hidden";
const WHAT_COMES = "Напоминания об оплате, итоги месяца, результаты проверки фото и сообщения администратора";

function readHidden() {
  try {
    return localStorage.getItem(hiddenKey) === "1";
  } catch {
    return false;
  }
}

function useEnable() {
  const toast = useToast();
  const push = usePushNotifications();

  async function enable() {
    try {
      const result = await push.enable();
      if (result === "on") toast.show("Уведомления включены — проверочное придёт через пару секунд", { tone: "success" });
      if (result === "denied") toast.show("Браузер запретил уведомления. Разрешить их можно в настройках сайта", { tone: "danger", duration: 5000 });
    } catch {
      toast.show("Не удалось включить уведомления в этом браузере. Попробуйте Chrome или Safari", { tone: "danger", duration: 5000 });
    }
  }

  return { ...push, enable };
}

/** «Аккаунт»: notifications on this phone, with what to do when the browser can't or won't. */
export function PushSettings() {
  const toast = useToast();
  const push = useEnable();

  async function test() {
    try {
      const result = await push.test();
      if (result === "sent") toast.show("Отправили — уведомление придёт через пару секунд", { tone: "success" });
      if (result === "gone") toast.show("Телефон отключился от уведомлений. Включите их снова", { tone: "danger" });
      if (result === "failed") toast.show("Не получилось отправить. Попробуйте позже", { tone: "danger" });
    } catch {
      toast.show("Не получилось отправить. Попробуйте позже", { tone: "danger" });
    }
  }

  async function disable() {
    await push.disable().catch(() => undefined);
    toast.show("Уведомления на этом телефоне выключены");
  }

  const description =
    push.state === "on"
      ? "Включены на этом устройстве. Сообщения приходят сразу, даже когда кабинет закрыт; напоминания об оплате и итоги месяца — днём, с 9 до 21."
      : `${WHAT_COMES} будут приходить на телефон сразу, даже когда кабинет закрыт. Колокольчик в кабинете остаётся.`;

  return (
    <Card as="section" padding="lg">
      <CardHeader title="Уведомления на телефоне" description={description} />
      {push.state === "on" && (
        <div className={styles.actions}>
          <Button variant="secondary" loading={push.isBusy} onClick={test}>
            Проверить
          </Button>
          <Button variant="ghost" disabled={push.isBusy} onClick={disable}>
            Выключить
          </Button>
        </div>
      )}
      {(push.state === "off" || push.state === "checking") && (
        <Button variant="primary" size="lg" block icon={Notification01Icon} loading={push.isBusy} disabled={push.state === "checking"} onClick={push.enable}>
          Включить уведомления
        </Button>
      )}
      {push.state === "denied" && (
        <Notice tone="warning" title="Уведомления запрещены в браузере">
          Разрешите их для этого сайта и обновите страницу. На Android: в Chrome «⋮» → «Настройки» → «Настройки сайтов» → «Уведомления». На iPhone: «Настройки» → «Уведомления» → «Витрина».
        </Notice>
      )}
      {push.state === "needs-home-screen" && (
        <Notice tone="accent" title="Сначала — на экран «Домой»">
          На iPhone уведомления приходят только в кабинет с главного экрана. В Safari нажмите «Поделиться» → «На экран Домой», откройте кабинет с иконки и включите уведомления здесь.
        </Notice>
      )}
      {push.state === "unsupported" && (
        <Notice tone="neutral">
          Этот браузер не умеет показывать уведомления. Откройте кабинет в Chrome на Android или добавьте на экран «Домой» на iPhone (iOS 16.4 и новее).
        </Notice>
      )}
    </Card>
  );
}

/** On the dashboard: suggests turning notifications on, until they're on or the owner says no. Not to an admin in the owner's account. */
export function PushHint() {
  const push = useEnable();
  const [isHidden, setIsHidden] = useState(() => readHidden() || isImpersonating());

  if (isHidden || push.state !== "off") return null;

  function hide() {
    try {
      localStorage.setItem(hiddenKey, "1");
    } catch {
      // Private mode: hidden until reload.
    }
    setIsHidden(true);
  }

  return (
    <Notice
      tone="accent"
      icon={Notification01Icon}
      title="Уведомления на телефон"
      action={
        <>
          <Button variant="primary" size="sm" loading={push.isBusy} onClick={push.enable}>
            Включить
          </Button>
          <Button variant="ghost" size="sm" onClick={hide}>
            Не надо
          </Button>
        </>
      }
    >
      Напоминание об оплате, итоги месяца и ответ по фото придут сразу, даже когда кабинет закрыт. Включить позже можно в «Аккаунт».
    </Notice>
  );
}
