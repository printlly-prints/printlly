import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { PaperPanel, Button } from "../components/PaperUI";
import { DateRangeControl, AnalyticsSummary, downloadCSV } from "../components/PartnerAnalytics";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { formatRupees, hasPayoutDetails } from "../utils/payout";
import { analyticsDateRange, partnerAnalytics, analyticsCSV, istDateKey } from "../utils/partnerAnalytics";
import usePartnerOrders from "../hooks/usePartnerOrders";
import MascotRecovery from "../components/MascotRecovery";

/** Reads existing settlements and bounded orders; no transfer or payout action. */
export default function Earnings() {
  const { shop }=useAuth();
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [requestError,setRequestError]=useState(null);
  const [range,setRange]=useState(()=>analyticsDateRange(30));
  const [historyRange,setHistoryRange]=useState(()=>analyticsDateRange(30));
  const orderData=usePartnerOrders(shop?._id);
  const load=useCallback(async()=>{
    setLoading(true);setError("");setRequestError(null);
    try { const {data:result}=await api.get("/shops/me/settlements");setData(result); }
    catch(err){setError(err.response?.data?.message||"Could not load your payment records. Please try again.");setRequestError(err);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  const report=useMemo(()=>{try{return {analytics:partnerAnalytics(orderData.orders,range),error:""};}catch(err){return {analytics:null,error:err.message};}},[orderData.orders,range]);
  const history=useMemo(()=>{
    try {
      partnerAnalytics([],historyRange);
      return {rows:(data?.settlements||[]).filter(row=>{const date=istDateKey(row.settled_at);return date&&date>=historyRange.startDate&&date<=historyRange.endDate;}),error:""};
    }catch(err){return {rows:[],error:err.message};}
  },[data,historyRange]);
  const unsettled=data?.unsettled;
  const payoutReady=hasPayoutDetails(shop);
  function exportTransfers() {
    const safe=value=>{let text=String(value??"");if(/^[=+@\-\t\r]/.test(text))text=`'${text}`;return `"${text.replace(/"/g,'""')}"`;};
    const rows=[["Recorded date (IST)","Amount (INR)","Orders","Reference"],...history.rows.map(row=>[istDateKey(row.settled_at),row.total_amount,row.order_count,row.reference_note])];
    downloadCSV(rows.map(row=>row.map(safe).join(",")).join("\r\n"),`printlly-transfers-${historyRange.startDate}-${historyRange.endDate}.csv`);
  }
  return <DashboardLayout title="Earnings">
    <div className="analytics-section-heading"><div><h1 className="partner-page-title">Shop earnings</h1><p>Completed orders, amounts awaiting settlement, and recorded transfers.</p></div><Button variant="text" onClick={()=>{load();orderData.refresh();}}>Refresh records</Button></div>
    {!payoutReady&&<PaperPanel><h2>Add your payout details</h2><p>Provide a UPI ID or bank details so an administrator can make a manual transfer.</p><Link className="paper-button paper-button--text" to="/shop-profile#payout">Add payout details</Link></PaperPanel>}
    {error&&<MascotRecovery compact headingLevel={2} error={requestError} onRetry={load} />}
    <PaperPanel><h2>Unsettled balance</h2>{loading?<p role="status">Loading your balance…</p>:error||!unsettled?<p>Balance unavailable. Refresh records to try again.</p>:<><strong className="analytics-kpi-value">{formatRupees(unsettled.total_amount)}</strong><p>{unsettled.order_count} completed, paid order{unsettled.order_count===1?"":"s"} awaiting a recorded settlement.{unsettled.oldest_order_at&&` Oldest placed ${istDateKey(unsettled.oldest_order_at)}.`}</p></>}<p className="analytics-data-note">This authoritative balance covers all unsettled orders, independent of the date filters below. Transfers are made manually; this website records them and does not move money.</p></PaperPanel>
    <section className="analytics-section" aria-label="Completed order earnings">
      <div className="analytics-section-heading"><div><h2>Completed order earnings</h2><p>For orders placed in the selected range. Shop earnings use the amount stored when payment was confirmed.</p></div><Button variant="secondary" disabled={orderData.loading||!!orderData.error||!report.analytics} onClick={()=>downloadCSV(analyticsCSV(orderData.orders,range),`printlly-earnings-${range.startDate}-${range.endDate}.csv`)}>Export orders CSV</Button></div>
      <DateRangeControl range={range} onChange={setRange} />
      {report.error&&<p role="alert" className="paper-error">{report.error}</p>}{orderData.error&&<MascotRecovery compact headingLevel={2} error={orderData.requestError} onRetry={orderData.refresh} />}
      {!orderData.error&&<AnalyticsSummary analytics={report.analytics} loading={orderData.loading} />}
      <p className="analytics-data-note">Based on up to 500 loaded orders. {orderData.capped?"Older orders may be excluded; this is not a complete account report.":"Cancelled, expired and unpaid orders contribute no shop earnings."}</p>
    </section>
    <PaperPanel>
      <div className="analytics-section-heading"><div><h2>Recorded transfers</h2><p>Filter by the date a transfer was recorded, in Indian Standard Time.</p></div><Button variant="secondary" disabled={loading||!!error||!!history.error||!history.rows.length} onClick={exportTransfers}>Export transfers CSV</Button></div>
      <DateRangeControl range={historyRange} onChange={setHistoryRange} label="Transfers recorded" />
      {history.error&&<p role="alert" className="paper-error">{history.error}</p>}
      {loading?<p role="status">Loading transfer history…</p>:error?<p>Transfer history unavailable.</p>:history.error?null:history.rows.length?<div className="analytics-transfer-table"><table><caption>{history.rows.length} recorded transfer{history.rows.length===1?"":"s"} · {formatRupees(history.rows.reduce((sum,row)=>sum+row.total_amount,0))}</caption><thead><tr><th scope="col">Recorded date</th><th scope="col">Amount</th><th scope="col">Orders</th><th scope="col">Reference</th></tr></thead><tbody>{history.rows.map(row=><tr key={row._id}><td>{istDateKey(row.settled_at)}</td><td>{formatRupees(row.total_amount)}</td><td>{row.order_count}</td><td>{row.reference_note||"—"}</td></tr>)}</tbody></table></div>:<p>No recorded transfers in this date range.</p>}
    </PaperPanel>
    {payoutReady&&<Link className="paper-button paper-button--text" to="/shop-profile#payout">Update payout details</Link>}
  </DashboardLayout>;
}
