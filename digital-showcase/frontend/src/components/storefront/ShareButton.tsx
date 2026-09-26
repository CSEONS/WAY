import { Share08Icon } from "@hugeicons/core-free-icons";
import { IconButton, useCopyToClipboard, type ButtonVariant } from "../../ui";
import { shareLink } from "../../utils/contact";

/** Phone share sheet (send to a friend in WhatsApp/Telegram), or copy the link on a computer. */
export function ShareButton({ url, title, variant = "outline", className }: { url: string; title: string; variant?: ButtonVariant; className?: string }) {
  const copy = useCopyToClipboard();
  return <IconButton icon={Share08Icon} label="Поделиться" variant={variant} className={className} onClick={() => void shareLink(url, title, copy)} />;
}
