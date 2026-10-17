import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import api from "../api/client";
import ScreenFrame from "../components/ScreenFrame";
import ShopBrowseCard from "../components/ShopBrowseCard";
import { shopRushLevel } from "../utils/shopRush";
import Button from "../components/Button";
import RecoveryState from "../components/RecoveryState";
import { recoveryForError } from "../utils/requestRecovery";
import { geoParams, useLocation } from "../context/LocationContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import { typography, radius } from "../theme";

const SEARCH_DEBOUNCE_MS = 400;
// M11/M11s: GET /shops supplies location/rush but deliberately excludes prices.
export default function ShopsScreen({ navigation }) {
  const { coords, status, ensureLocation } = useLocation();
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const [shops, setShops] = useState([]), [query, setQuery] = useState(""), [activeQuery, setActiveQuery] = useState("");
  const [loading, setLoading] = useState(true), [searching, setSearching] = useState(false), [refreshing, setRefreshing] = useState(false), [error, setError] = useState("");
  const [failure, setFailure] = useState(null);
  const [rush, setRush] = useState("all"), [rushOpen, setRushOpen] = useState(false);
  const requestId = useRef(0), first = useRef(true), mounted = useRef(true);
  useEffect(() => { mounted.current = true; ensureLocation(); return () => { mounted.current = false; requestId.current += 1; }; }, [ensureLocation]);
  const load = useCallback(async (searchText, { silent = false } = {}) => {
    const id = ++requestId.current;
    if (!silent) setSearching(true);
    try {
      const trimmed = searchText.trim();
      const { data } = await api.get("/shops", { params: { ...(trimmed ? { search: trimmed } : {}), ...geoParams(coords) } });
      if (!mounted.current || id !== requestId.current) return;
      setShops(Array.isArray(data) ? data : []); setActiveQuery(trimmed); setError(""); setFailure(null);
    } catch (err) {
      if (mounted.current && id === requestId.current) { setFailure(err); setError("Could not refresh shops."); }
    } finally {
      if (mounted.current && id === requestId.current) { setLoading(false); setSearching(false); setRefreshing(false); }
    }
  }, [coords]);
  useEffect(() => {
    // Invalidate an older request immediately, before the debounce completes.
    requestId.current += 1;
    const timer = setTimeout(() => load(query), first.current ? 0 : SEARCH_DEBOUNCE_MS);
    first.current = false;
    return () => clearTimeout(timer);
  }, [query, load]);
  const refreshOpenStatus = useCallback(() => { if (query.trim() === activeQuery) load(activeQuery, { silent: true }); }, [load, activeQuery, query]);
  useOpenStatusRefresh(refreshOpenStatus);
  const visible = useMemo(() => shops.filter(shop => rush === "all" || shopRushLevel(shop) === rush), [shops, rush]);
  return <ScreenFrame title="Nearby shops" scroll={false} contentStyle={styles.frame}>
    <View style={styles.tools}>
      <View style={styles.search}>
        <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search shops or area" placeholderTextColor={colors.textSecondary} style={styles.input}
          accessibilityLabel="Search shops by name or area" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => load(query)} />
        {searching ? <ActivityIndicator size="small" color={colors.action} /> : query ? <Pressable onPress={() => setQuery("")} style={styles.clear} accessibilityRole="button" accessibilityLabel="Clear search"><Ionicons name="close" size={20} color={colors.textSecondary} /></Pressable> : null}
      </View>
      <Text style={styles.note} accessibilityLiveRegion="polite">{coords ? "Nearest shops first" : status === "denied" ? "Search by area to find a shop. Location is off." : "Search by area to find a shop."}</Text>
      <View style={styles.filters}>
        <Pressable style={styles.filter} onPress={() => setRushOpen(!rushOpen)} accessibilityRole="button" accessibilityState={{ expanded: rushOpen }}><Text style={styles.filterText}>{rush === "all" ? "Rush" : `${rush[0].toUpperCase()}${rush.slice(1)} rush`}</Text><Ionicons name={rushOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textPrimary} /></Pressable>
        <Pressable style={styles.filter} onPress={() => navigation.navigate("SavedShops")} accessibilityRole="button"><Ionicons name="heart-outline" size={18} color={colors.textPrimary} /><Text style={styles.filterText}>Saved shops</Text></Pressable>
      </View>
      {rushOpen ? <View style={styles.rushOptions}>{["all", "low", "medium", "high"].map(value => <Pressable key={value} onPress={() => { setRush(value); setRushOpen(false); }} accessibilityRole="radio" accessibilityState={{ checked: rush === value }} style={[styles.rushOption, rush === value && { backgroundColor: colors.selection }]}><Text style={styles.filterText}>{value === "all" ? "All shops" : `${value[0].toUpperCase()}${value.slice(1)} rush`}</Text>{rush === value ? <Ionicons name="checkmark" size={18} color={colors.action} /> : null}</Pressable>)}</View> : null}
    </View>
    <FlatList style={styles.list} contentContainerStyle={styles.listContent} data={visible} keyExtractor={shop => String(shop._id)} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(query); }} tintColor={colors.action} />}
      ListHeaderComponent={error ? <RecoveryState compact {...recoveryForError(failure)} retryKey={failure} message={shops.length ? "Showing the last available shops. Retry to check their current availability." : recoveryForError(failure).message} primaryLabel="Try again" onPrimary={() => load(query)} loading={searching} /> : null}
      ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color={colors.action} /><Text style={styles.note}>Finding shops…</Text></View> : !error ? <RecoveryState reaction="not_found" title="No matching shops." message={activeQuery ? `No shops match “${activeQuery}”. Try another area or clear your filters.` : "No shops are available with these filters right now. Try another area."} primaryLabel={query || rush !== "all" ? "Clear search & filters" : "Check again"} onPrimary={() => { if (query || rush !== "all") { setQuery(""); setRush("all"); } else load(query); }} /> : null}
      renderItem={({ item }) => <ShopBrowseCard shop={item} onPress={() => navigation.navigate("ShopDetails", { shop: item })} />} />
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({
  frame: { padding: 0 }, tools: { paddingHorizontal: 24, paddingTop: 24, gap: 12 }, search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingLeft: 16, paddingRight: 8, backgroundColor: colors.surface, borderRadius: radius.control, borderWidth: 1, borderColor: colors.controlBorder },
  input: { flex: 1, minWidth: 0, ...typography.body, paddingVertical: 12, color: colors.textPrimary }, clear: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  filters: { flexDirection: "row", gap: 8 }, filter: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: radius.button },
  filterText: { ...typography.bodySmall, color: colors.textPrimary, flexShrink: 1 }, rushOptions: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: "hidden" }, rushOption: { minHeight: 48, flexDirection: "row", gap: 12, justifyContent: "space-between", alignItems: "center", padding: 12 },
  note: { ...typography.caption, color: colors.textSecondary }, list: { flex: 1 }, listContent: { padding: 24, paddingTop: 16, gap: 16, flexGrow: 1 }, empty: { paddingVertical: 32, gap: 12 }, emptyTitle: { ...typography.h3, color: colors.textPrimary },
  errorBox: { padding: 16, backgroundColor: colors.errorSurface, borderRadius: radius.md, gap: 12 }, error: { ...typography.bodySmall, color: colors.error },
});
