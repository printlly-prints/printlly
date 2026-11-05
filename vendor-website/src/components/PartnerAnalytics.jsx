import { useMemo } from "react";
import { analyticsDateRange } from "../utils/partnerAnalytics";
import { PaperPanel } from "./PaperUI";
import { formatRupees } from "../utils/payout";

export function DateRangeControl({ range, onChange, label = "Orders placed" }) {
  return <fieldset className="analytics-date-range"><legend>{label} · Indian Standard Time</legend>
    <div className="analytics-presets">{[{days:1,label:"Today"},{days:7,label:"Last 7 days"},{days:30,label:"Last 30 days"}].map(option => <button type="button" className="paper-button paper-button--secondary" key={option.days} onClick={() => onChange(analyticsDateRange(option.days))}>{option.label}</button>)}</div>
    <label>From<input type="date" aria-label={`${label} from`} value={range.startDate} onChange={event => onChange({...range,startDate:event.target.value})} required /></label>
    <label>To<input type="date" aria-label={`${label} to`} value={range.endDate} onChange={event => onChange({...range,endDate:event.target.value})} required /></label>
  </fieldset>;
}

export function AnalyticsSummary({ analytics, loading }) {
  const cards = analytics ? [
    {label:"Orders placed",value:analytics.orderCount,detail:"All six order states"},
    {label:"Completed",value:analytics.counts.completed,detail:`${analytics.paidCompletedCount} paid and completed`},
    {label:"Completed shop earnings",value:analytics.earnings === null ? "Unavailable" : formatRupees(analytics.earnings),detail:analytics.missingEarnings ? `${analytics.missingEarnings} paid completed order${analytics.missingEarnings === 1 ? " has" : "s have"} no earnings snapshot` : "Confirmed, paid and completed orders"},
    {label:"Cancelled & expired",value:analytics.counts.cancelled + analytics.counts.expired,detail:"Excluded from shop earnings"},
  ] : [];
  if (loading) return <PaperPanel><p role="status">Loading order analytics…</p></PaperPanel>;
  return <div className="analytics-kpis">{cards.map(card => <PaperPanel key={card.label}><p>{card.label}</p><strong className="analytics-kpi-value">{card.value}</strong><small>{card.detail}</small></PaperPanel>)}</div>;
}

const STATE_LABELS = {pending:"Pending",accepted:"Accepted",ready_for_pickup:"Ready for pickup",completed:"Completed",cancelled:"Cancelled",expired:"Expired"};

export function OrderAnalyticsCharts({ analytics }) {
  const trend = useMemo(() => {
    if (!analytics) return [];
    if (analytics.series.length <= 31) return analytics.series;
    const groups = [];
    for (let i=0;i<analytics.series.length;i+=7) {
      const days=analytics.series.slice(i,i+7);
      groups.push({date:days[0].date,orders:days.reduce((sum,day)=>sum+day.orders,0)});
    }
    return groups;
  }, [analytics]);
  if (!analytics) return null;
  const max=Math.max(1,...trend.map(day=>day.orders));
  const weekly=analytics.series.length>31;
  return <div className="analytics-charts">
    <PaperPanel><h2>{weekly ? "Orders by week" : "Daily order trend"}</h2><p>Orders placed in the selected range. {weekly ? "Each bar groups up to seven days." : "Each bar represents one day."}</p>
      <svg className="analytics-trend" viewBox="0 0 640 180" role="img" aria-label={`${analytics.orderCount} orders placed across ${trend.length} ${weekly ? "weeks" : "days"}`}>
        <path d="M0 160H640" stroke="var(--color-controlBorder)" />
        {trend.map((day,index)=>{const slot=640/trend.length;const height=day.orders/max*140;return <rect key={day.date} x={index*slot+slot*.12} y={160-height} width={slot*.76} height={height} rx={Math.min(4,slot*.1)} fill="var(--color-action)"><title>{day.date}: {day.orders} orders</title></rect>;})}
      </svg>
      <div className="analytics-chart-dates"><span>{analytics.series[0].date}</span><span>{analytics.series.at(-1).date}</span></div>
      <details className="analytics-chart-table"><summary>View trend data</summary><table><thead><tr><th scope="col">{weekly ? "Week starting" : "Date"}</th><th scope="col">Orders placed</th></tr></thead><tbody>{trend.map(day=><tr key={day.date}><td>{day.date}</td><td>{day.orders}</td></tr>)}</tbody></table></details>
    </PaperPanel>
    <PaperPanel><h2>Order states</h2><p>Current states of orders placed in the selected range.</p><dl className="analytics-status-list">{Object.entries(STATE_LABELS).map(([status,label])=><div key={status}><dt>{label}</dt><dd><strong>{analytics.counts[status]}</strong><span className="analytics-status-track"><span style={{width:`${analytics.orderCount ? analytics.counts[status]/analytics.orderCount*100 : 0}%`}} /></span></dd></div>)}</dl></PaperPanel>
  </div>;
}

export function downloadCSV(content, filename) {
  const url=URL.createObjectURL(new Blob(["\uFEFF",content],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
