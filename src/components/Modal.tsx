import type { ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  title: string;
  kicker?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  layer?: "base" | "top";
};

export function Modal({ title, kicker, onClose, children, wide = false, layer = "base" }: Props) {
  return (
    <div
      className={`modal-backdrop${layer === "top" ? " modal-top" : ""}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            {kicker ? <span className="kicker">{kicker}</span> : null}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
