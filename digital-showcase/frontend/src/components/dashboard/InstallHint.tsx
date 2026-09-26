import { SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useInstallPrompt } from "../../hooks/useInstallPrompt";
import { Button, Notice } from "../../ui";

const hiddenKey = "install-hint-hidden";

function readHidden() {
  try {
    return localStorage.getItem(hiddenKey) === "1";
  } catch {
    return false;
  }
}

/** Suggests putting the owner's cabinet on the phone's home screen, like an app. */
export function InstallHint() {
  const { isInstalled, canPrompt, needsManualIosSteps, install } = useInstallPrompt();
  const [isHidden, setIsHidden] = useState(readHidden);

  if (isHidden || isInstalled || (!canPrompt && !needsManualIosSteps)) return null;

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
      icon={SmartPhone01Icon}
      title="Кабинет на главном экране телефона"
      action={
        <>
          {canPrompt && (
            <Button variant="primary" size="sm" onClick={install}>
              Установить
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={hide}>
            Не надо
          </Button>
        </>
      }
    >
      {canPrompt
        ? "Откроется с иконки, как приложение, — без поиска ссылки."
        : "В Safari нажмите «Поделиться», затем «На экран Домой» — кабинет будет открываться с иконки."}
    </Notice>
  );
}
