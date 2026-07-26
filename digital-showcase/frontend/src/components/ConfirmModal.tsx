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
    <div role="presentation" onPointerDown={(event) => event.currentTarget === event.target && onCancel()}>
      <div role="dialog" aria-modal="true">
        <div>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </div>
        <div>
          <button type="button" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

