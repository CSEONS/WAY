import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  danger,
  onCancel,
  onConfirm
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && onCancel()}>
      <div className="modal confirm-modal" role="dialog" aria-modal="true">
        {danger && (
          <span className="confirm-modal-icon">
            <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={1.8} />
          </span>
        )}
        <div className="modal-title">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-neutral" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className={danger ? "btn btn-danger" : "btn btn-primary"} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

