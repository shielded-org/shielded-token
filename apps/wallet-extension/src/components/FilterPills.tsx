type Props<T extends string> = {
  options: readonly T[];
  active: T;
  onChange: (next: T) => void;
};

export function FilterPills<T extends string>({options, active, onChange}: Props<T>) {
  return (
    <div className="activity-filters">
      {options.map((option) => (
        <button key={option} type="button" className={`filter-pill ${active === option ? "active" : ""}`} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}
