import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Platform, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import ShopBrowseCard from "../components/ShopBrowseCard";
import Button from "../components/Button";
import RecoveryState from "../components/RecoveryState";
import { recoveryForError } from "../utils/requestRecovery";
import { AccountRow } from "./ProfileScreen";
import api from "../api/client";
import { geoParams, useLocation } from "../context/LocationContext";
import { useSavedShops } from "../context/SavedShopsContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import { shopAvailability } from "../utils/shopAvailability";
import { trackEvent, EVENTS } from "../lib/analytics";
import { typography, radius } from "../theme";

// M15/M15p/M15g compose in this existing route; prices come from the
// detail projection, and only actual vendor photos appear in the gallery.
export default function ShopDetailsScreen({ navigation, route }) {
  const initialShop = route.params?.shop;
  const { coords } = useLocation(), { isSaved, toggleSaved } = useSavedShops();
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const [shop, setShop] = useState(initialShop), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [failure, setFailure] = useState(null);
  const [available, setAvailable] = useState(false), [section, setSection] = useState(null), [saving, setSaving] = useState(false), [linkError, setLinkError] = useState("");
  const requestId = useRef(0), mounted = useRef(true), saveInFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current += 1; }; }, []);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    if (!initialShop?._id) { setLoading(false); setAvailable(false); setError("This shop is unavailable."); return; }
    try {
      const { data } = await api.get(`/shops/${initialShop._id}`, { params: geoParams(coords) });
      if (!mounted.current || id !== requestId.current) return;
      setShop(data); setAvailable(true); setError(""); setFailure(null);
    } catch (err) {
      if (!mounted.current || id !== requestId.current) return;
      setFailure(err);
      if (err.response?.status === 404) setAvailable(false);
      setError(err.response?.status === 404 ? "This shop is no longer available." : err.response?.data?.message || "Could not refresh this shop. Check your connection.");
    } finally { if (mounted.current && id === requestId.current) setLoading(false); }
  }, [initialShop?._id, coords]);
  useEffect(() => { setShop(initialShop); setAvailable(false); setLoading(true); load(); }, [initialShop, load]);
  useEffect(() => { if (initialShop?._id) trackEvent(EVENTS.SHOP_VIEWED, { shop_id: String(initialShop._id) }); }, [initialShop?._id]);
  useOpenStatusRefresh(load);
  const link = async (url) => { try { await Linking.openURL(url); setLinkError(""); } catch { setLinkError("Could not open this app. Try again or use the shop address below."); } };
  const directions = () => {
    const [lng, lat] = shop.location?.coordinates || [];
    const query = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : encodeURIComponent([shop.shop_name, shop.address].filter(Boolean).join(" "));
    link(Platform.select({ ios: `maps://?q=${query}`, android: `geo:0,0?q=${query}`, default: `https://maps.google.com/?q=${query}` }));
  };
  const save = async () => { if (saveInFlight.current) return; saveInFlight.current = true; setSaving(true); try { await toggleSaved(shop); } finally { saveInFlight.current = false; if (mounted.current) setSaving(false); } };
  if (!shop) return <ScreenFrame title="Shop details" onBack={() => navigation.goBack()}><RecoveryState reaction="shop_unavailable" title="This shop is unavailable." message="Choose another available print shop." primaryLabel="Find another shop" onPrimary={() => navigation.navigate("MainTabs", { screen: "Shops" })} /></ScreenFrame>;
  const availability = shopAvailability(shop), pricing = shop.pricing;
  const services = (pricing?.services || []).filter(service => service.enabled !== false);
  const gallery = [shop.shop_photo_url && { url: shop.shop_photo_url, label: "Shop" }, shop.owner_photo_url && { url: shop.owner_photo_url, label: "Shop owner" }].filter(Boolean);
  const toggle = value => setSection(section === value ? null : value);
  return <ScreenFrame title={shop.shop_name || "Shop details"} onBack={() => navigation.goBack()}
    footer={<Button title={availability.isClosed || (!available && !loading) ? "Find another shop" : "Use this shop"} disabled={loading || (!available && !availability.isClosed && failure?.response?.status !== 404)} onPress={() => availability.isClosed || !available ? navigation.navigate("MainTabs", { screen: "Shops" }) : navigation.navigate("UploadDocuments", { preselectedShop: shop })} />}>
    <ShopBrowseCard shop={shop} />
    {error ? <RecoveryState compact {...recoveryForError(failure, { notFound: "shop_unavailable" })} retryKey={failure} primaryLabel="Refresh shop" onPrimary={load} loading={loading} /> : availability.isClosed ? <RecoveryState compact reaction="shop_unavailable" title="This shop is closed." message="Choose another available shop for your print. Opening hours are shown below." /> : loading ? <ActivityIndicator color={colors.action} style={styles.loading} /> : null}
    <View style={styles.actions}>
      <Button title={isSaved(shop._id) ? "Saved shop" : "Save shop"} variant="secondary" loading={saving} onPress={save} style={styles.action} />
      <Button title="Directions" variant="secondary" onPress={directions} style={styles.action} />
    </View>
    {linkError ? <Text style={styles.error} accessibilityLiveRegion="polite">{linkError}</Text> : null}
    <View style={styles.visit}><Text style={styles.heading}>Visit the shop</Text>{shop.address ? <Text style={styles.detail}>{shop.address}</Text> : null}
      {shop.business_hours?.open_time && shop.business_hours?.close_time ? <Text style={styles.note}>Opening hours: {shop.business_hours.open_time}–{shop.business_hours.close_time}</Text> : null}
      {shop.contact ? <Pressable style={styles.call} onPress={() => link(`tel:${String(shop.contact).replace(/\s/g, "")}`)} accessibilityRole="button" accessibilityLabel={`Call ${shop.shop_name}`}><Ionicons name="call-outline" size={18} color={colors.action} /><Text style={styles.callText}>{shop.contact}</Text></Pressable> : null}
    </View>
    <View style={styles.rows}>
      <AccountRow title="Services & prices" detail="Printing rates set by this shop" onPress={() => toggle("prices")} expanded={section === "prices"} />
      {section === "prices" ? <View style={styles.expanded}>{pricing ? <>
        <PriceRow label="Black & white" rate={pricing.rate_per_page_bw} unit="per page" />
        <PriceRow label="Colour" rate={pricing.rate_per_page_color} unit="per page" />
        {pricing.paper_size_rates?.A4 > 0 ? <PriceRow label="A4 paper surcharge" rate={pricing.paper_size_rates.A4} unit="per page" /> : null}
        {pricing.paper_size_rates?.A3 > 0 ? <PriceRow label="A3 paper surcharge" rate={pricing.paper_size_rates.A3} unit="per page" /> : null}
        {pricing.sides_extra_rate > 0 ? <PriceRow label="Double-sided surcharge" rate={pricing.sides_extra_rate} unit="per page" /> : null}
        <Text style={styles.note}>Your itemized total, including the platform fee, appears before payment.</Text>
      </> : <Text style={styles.note}>{loading ? "Loading prices…" : "Prices are unavailable. Refresh the shop to try again."}</Text>}</View> : null}
      <AccountRow title="Finishing for your print" detail="Options offered by this shop" onPress={() => toggle("finishing")} expanded={section === "finishing"} />
      {section === "finishing" ? <View style={styles.expanded}>{services.length ? services.map(service => <PriceRow key={service._id || service.name} label={service.name} rate={service.rate} unit="per document" />) : <Text style={styles.note}>{loading ? "Loading options…" : pricing ? "This shop has no additional finishing options." : "Finishing options are unavailable."}</Text>}<Text style={styles.note}>Choose finishing for each file in your print preferences.</Text></View> : null}
      <AccountRow title="Shop photos" detail={gallery.length ? "View the shop and owner photos" : "No photos added by this shop"} onPress={() => toggle("photos")} expanded={section === "photos"} />
      {section === "photos" ? <View style={styles.expanded}>{gallery.length ? gallery.map(photo => <View key={photo.url}><Image source={{ uri: photo.url }} style={styles.galleryImage} resizeMode="contain" accessibilityLabel={photo.label} /><Text style={styles.note}>{photo.label}</Text></View>) : <Text style={styles.note}>This shop has not added a photo.</Text>}</View> : null}
    </View>
  </ScreenFrame>;
}
function PriceRow({ label, rate, unit }) {
  const styles = useThemedStyles(createStyles);
  if (!Number.isFinite(rate)) return null;
  return <View style={styles.priceRow}><Text style={styles.priceLabel}>{label}</Text><Text style={styles.price}>₹{rate}<Text style={styles.note}> {unit}</Text></Text></View>;
}
const createStyles = ({ colors }) => ({
  note: { ...typography.caption, color: colors.textSecondary, marginTop: 4 }, detail: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 8 }, heading: { ...typography.h3, color: colors.textPrimary },
  actions: { flexDirection: "row", gap: 8, marginVertical: 16 }, action: { flex: 1 }, visit: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 16 }, rows: { gap: 16 },
  expanded: { padding: 16, borderRadius: radius.md, backgroundColor: colors.surface, gap: 12 }, priceRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }, priceLabel: { ...typography.bodySmall, color: colors.textPrimary, flexGrow: 1, flexShrink: 1 }, price: { ...typography.bodyMedium, color: colors.textPrimary, flexShrink: 1 },
  galleryImage: { width: "100%", height: 220, backgroundColor: colors.subtle, borderRadius: radius.md }, call: { flexDirection: "row", alignItems: "center", minHeight: 48, gap: 8, marginTop: 8 }, callText: { ...typography.bodySmall, color: colors.action, flexShrink: 1 },
  loading: { marginTop: 16 }, error: { ...typography.bodySmall, color: colors.error }, errorBox: { padding: 16, backgroundColor: colors.errorSurface, borderRadius: radius.md, gap: 12, marginTop: 16 },
});
