import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { Badge } from "../../ui";

/** Marks a field the AI filled, so the owner knows what to double-check. */
export function AiBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Badge tone="accent" icon={AiMagicIcon}>
      ИИ
    </Badge>
  );
}
