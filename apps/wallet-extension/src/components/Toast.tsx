type Props = {
  message: string;
  tone?: "info" | "success" | "error";
  onDismiss: () => void;
};

export function Toast({message, tone = "info", onDismiss}: Props) {
  return (
    <div className={`toast toast-${tone}`}>
      <span>{message}</span>
      <button type="button" className="toast-dismiss" onClick={onDismiss}>
        x
      </button>
    </div>
  );
}
