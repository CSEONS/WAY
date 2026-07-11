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
        <svg viewBox="0 0 24 24">
          <path d="M4 7h16" />
          <path d="M6 7v13h12V7" />
          <path d="M9 11h6" />
          <path d="M9 15h4" />
          <path d="M8 4h8l1 3H7l1-3Z" />
        </svg>
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
