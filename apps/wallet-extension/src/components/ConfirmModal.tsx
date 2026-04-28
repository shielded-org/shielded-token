import {Button} from "./Button";

type Props = {
  open: boolean;
  title: string;
  body: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({open, title, body, onCancel, onConfirm}: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3>{title}</h3>
        <p className="muted">{body}</p>
        <div className="row gap">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Reveal</Button>
        </div>
      </div>
    </div>
  );
}
