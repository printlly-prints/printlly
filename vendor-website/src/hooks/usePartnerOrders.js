import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";

/** Existing paginated shop-order endpoint; bounded client analytics only. */
export default function usePartnerOrders(shopId) {
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [requestError,setRequestError]=useState(null);
  const refresh=useCallback(async()=>{
    if (!shopId) return;
    setLoading(true);setError("");setRequestError(null);
    try {
      const collected=[];
      for(let page=0;page<5;page++) {
        const {data}=await api.get(`/orders/shop/${shopId}?limit=100&skip=${page*100}`);
        if (!Array.isArray(data)) throw new Error("Order response was unavailable.");
        collected.push(...data);if(data.length<100)break;
      }
      setOrders(collected);
    } catch(err){setError(err.response?.data?.message||"Could not load order analytics. Please try again.");setRequestError(err);}
    finally{setLoading(false);}
  },[shopId]);
  useEffect(()=>{refresh();},[refresh]);
  return {orders,loading,error,requestError,refresh,capped:orders.length>=500};
}
