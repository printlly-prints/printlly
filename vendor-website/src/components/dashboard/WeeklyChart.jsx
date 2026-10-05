// Seven bars, one per day, drawn from real order counts - no chart
// library, because one dependency for eight rectangles is not a trade
// worth making, and this keeps the bars on the same tokens as everything
// else on the page.
//
// Each bar is a real number twice over: its height is the count and its
// tooltip says the count and the day's earnings, both from the same pass
// in weeklySeries().
export default function WeeklyChart({ days, metric = "orders" }) {
  const peak = Math.max(1, ...days.map((d) => d[metric]));

  return (
    <div className="flex items-end gap-2 h-28" role="img" aria-label={weekSummary(days, metric)}>
      {days.map((day) => {
        const value = day[metric];
        // A zero day still gets a visible sliver, so the axis reads as
        // seven days rather than four bars and three gaps.
        const height = value === 0 ? 3 : Math.max(8, Math.round((value / peak) * 100));
        return (
          <div key={day.key} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <span className="text-[10px] tabular-nums text-text-muted">{value || ""}</span>
            <div className="w-full flex-1 flex items-end">
              <div
                title={`${day.label}: ${day.orders} order${day.orders === 1 ? "" : "s"}, ₹${day.earnings}`}
                style={{ height: `${height}%` }}
                className={`w-full rounded-t-[6px] transition-[height] duration-300 ${
                  day.isToday ? "bg-primary" : value === 0 ? "bg-border" : "bg-primary/35"
                }`}
              />
            </div>
            <span
              className={`text-[11px] ${
                day.isToday ? "font-bold text-primary-bright" : "text-text-muted"
              }`}
            >
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// The chart's own text alternative - a screen reader gets the numbers,
// not "chart".
function weekSummary(days, metric) {
  return `Last 7 days by ${metric}: ${days.map((d) => `${d.label} ${d[metric]}`).join(", ")}`;
}
