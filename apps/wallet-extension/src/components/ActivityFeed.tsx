import {ActivityRow, ActivityRowItem} from "./ActivityRow";
import {DateSeparator} from "./DateSeparator";

type Props = {
  items: ActivityRowItem[];
  onOpenItem: (id: string) => void;
};

export function ActivityFeed({items, onOpenItem}: Props) {
  if (!items.length) return null;
  return (
    <div className="stack" style={{maxHeight: 360, overflowY: "auto"}}>
      <DateSeparator label="Today" />
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} onClick={onOpenItem} />
      ))}
    </div>
  );
}
