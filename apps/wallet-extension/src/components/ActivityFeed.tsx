import {ActivityRow, ActivityRowItem} from "./ActivityRow";
import {DateSeparator} from "./DateSeparator";

type Props = {
  items: ActivityRowItem[];
  onOpenItem: (id: string) => void;
};

export function ActivityFeed({items, onOpenItem}: Props) {
  if (!items.length) return null;
  const groups = new Map<string, ActivityRowItem[]>();
  for (const item of items) {
    const date = new Date(item.timeLabel);
    const key = Number.isNaN(date.getTime()) ? "Recent" : date.toDateString();
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  return (
    <div className="stack" style={{maxHeight: 360, overflowY: "auto"}}>
      {Array.from(groups.entries()).map(([label, grouped]) => (
        <div key={label} className="stack">
          <DateSeparator label={label} />
          {grouped.map((item) => (
            <ActivityRow key={item.id} item={item} onClick={onOpenItem} />
          ))}
        </div>
      ))}
    </div>
  );
}
