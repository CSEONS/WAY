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
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="modal-head">
          <div>
            <h2 id="confirm-title">{title}</h2>
            <p>{description}</p>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Отмена
          </button>
          <button className={danger ? "danger-button" : "primary"} type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
