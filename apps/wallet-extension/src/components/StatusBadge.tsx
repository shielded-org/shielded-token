import {Badge} from "./Badge";

type Props = {status: "completed" | "pending" | "failed"};

export function StatusBadge({status}: Props) {
  if (status === "completed") return <Badge variant="success">Completed</Badge>;
  if (status === "pending") return <Badge variant="warning">Pending</Badge>;
  return <Badge variant="danger">Failed</Badge>;
}
