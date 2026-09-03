import { createPortal } from "react-dom";

export default function Modal({
  open,
  title,
  children,
  onClose,
  width = "620px",
}) {
  if (!open) {
    return null;
  }

  const modal = (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="modal"
        style={{ maxWidth: width }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title">
            {title}
          </h2>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(
    modal,
    document.body
  );
}