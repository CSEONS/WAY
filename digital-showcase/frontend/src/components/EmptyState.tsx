import { HugeiconsIcon } from "@hugeicons/react";
import { PackageOpenIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        <HugeiconsIcon icon={PackageOpenIcon} size={24} strokeWidth={1.6} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
