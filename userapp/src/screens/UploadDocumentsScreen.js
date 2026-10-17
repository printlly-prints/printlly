import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import { trackEvent, EVENTS } from "../lib/analytics";
import Button from "../components/Button";
import RecoveryState from "../components/RecoveryState";
import ScreenFrame from "../components/ScreenFrame";
import { uploadDocuments } from "../api/client";
import { prepareUploadAsset, discardConvertedAsset } from "../utils/uploadAssets";
import { MAX_DOCUMENT_BYTES } from "../utils/imagePdf";
import { successfulDocuments, retryableFiles, patchUploadItem } from "../utils/uploadRecovery";
import { typography } from "../theme";
import { defaultDocumentSettings } from "../utils/documentSettings";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useOrderDraft } from "../context/OrderDraftContext";
const MAX_FILES = 10;

export default function UploadDocumentsScreen({ route, navigation }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles), { getDraft, setDraft } = useOrderDraft();
  const restored = useRef(getDraft()), preselectedShop = route.params?.preselectedShop || restored.current?.preselectedShop || null;
  const [items, setItems] = useState(() => (route.params?.uploadedDocs || restored.current?.uploadedDocs || []).map((doc) => ({ id: doc.upload_id, doc, status: "uploaded" })));
  const [busy, setBusy] = useState(false), [choosing, setChoosing] = useState(false), [error, setError] = useState("");
  const mounted = useRef(true), working = useRef(false), picking = useRef(false), controller = useRef(null), itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const uploadedDocs = successfulDocuments(items);
  const failed = items.some((item) => item.status === "failed");
  useEffect(() => {
    const previous = getDraft();
    const docSettings = uploadedDocs.map((doc) => { const index = previous?.uploadedDocs?.findIndex((entry) => entry.upload_id === doc.upload_id); return index >= 0 && previous.docSettings?.[index] ? previous.docSettings[index] : defaultDocumentSettings(); });
    setDraft({ ...previous, uploadedDocs, docSettings, preselectedShop });
  }, [items, preselectedShop, getDraft, setDraft]);
  const patch = (id, changes) => { if (mounted.current) setItems((previous) => patchUploadItem(previous, id, changes)); };

  const upload = async (selected) => {
    if (working.current) return;
    working.current = true; setBusy(true); controller.current = new AbortController();
    // Each upload has its own client identity; duplicate filenames cannot
    // assign a failed result to another file. Only server counts are used.
    for (const item of selected) {
      if (!mounted.current) break;
      let prepared;
      try {
        patch(item.id, { status: "preparing", error: "" });
        prepared = await prepareUploadAsset(item.asset);
        if (!mounted.current) break;
        patch(item.id, { status: "uploading" });
        const result = await uploadDocuments([prepared], { signal: controller.current.signal });
        const doc = result.succeeded?.[0];
        if (!doc?.upload_id || !Number.isInteger(doc.page_count) || doc.page_count < 1) throw new Error(result.failed?.[0]?.error || "The server could not confirm this file. Retry or remove it.");
        patch(item.id, { status: "uploaded", doc, asset: null, converted: prepared.converted });
      } catch (failure) {
        patch(item.id, { status: "failed", error: failure.response?.data?.message || failure.message || "Upload failed. Please try again." });
      } finally { discardConvertedAsset(prepared); }
    }
    working.current = false;
    if (mounted.current) setBusy(false);
  };
  const chooseFiles = async () => {
    if (working.current || picking.current) return;
    picking.current = true; setChoosing(true);
    setError("");
    if (itemsRef.current.length >= MAX_FILES) { setError("You can add up to 10 documents per order."); picking.current = false; setChoosing(false); return; }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], multiple: true, copyToCacheDirectory: true });
      if (result.canceled || !mounted.current) return;
      const room = Math.max(0, MAX_FILES - itemsRef.current.length);
      const selected = result.assets.slice(0, room).map((asset, index) => ({ id: `file-${Date.now()}-${index}-${Math.random()}`, asset, status: asset.size > MAX_DOCUMENT_BYTES ? "failed" : "queued", error: asset.size > MAX_DOCUMENT_BYTES ? "Each file must be 10 MB or smaller." : "" }));
      itemsRef.current = [...itemsRef.current, ...selected]; setItems(itemsRef.current);
      if (result.assets.length > room) setError(`Added ${room} files. An order can contain up to 10 documents.`);
      trackEvent(EVENTS.DOCUMENT_UPLOAD_STARTED, { file_count: selected.length });
      await upload(selected.filter((item) => item.status !== "failed"));
    } catch (failure) { if (mounted.current) setError(failure.message || "Could not choose files. Please try again."); }
    finally { picking.current = false; if (mounted.current) setChoosing(false); }
  };
  const proceed = () => {
    if (busy || !uploadedDocs.length) return;
    // Failed files remain visibly excluded; continuing never pretends that
    // they uploaded. The explicit CTA makes partial success reviewable.
    navigation.navigate("PrintPreferences", { uploadedDocs, preselectedShop, restoredSettings: getDraft()?.docSettings, restoredNotes: getDraft()?.notes });
  };
  const footer = items.length ? <>
    {failed && !busy ? <Button title="Retry failed files" variant="secondary" disabled={choosing} onPress={() => upload(retryableFiles(itemsRef.current))} /> : null}
    <Button title={busy ? "Uploading files…" : failed ? "Continue with uploaded files" : "Set print options"} loading={busy} disabled={!uploadedDocs.length || busy} onPress={proceed} />
    {!busy && items.length < MAX_FILES ? <Button title="Choose files" variant="secondary" disabled={choosing} onPress={chooseFiles} /> : null}
  </> : <Button title="Choose files" disabled={choosing} onPress={chooseFiles} />;
  return <ScreenFrame title="Upload files" onBack={() => navigation.goBack()} footer={footer}>
    {!failed ? <Text style={styles.title}>{items.length ? busy ? "Bringing your files in." : uploadedDocs.length ? "Your files are here." : "Let's try that again." : "Bring your files."}</Text> : null}
    {!failed ? <Text style={styles.subtitle}>{items.length ? "Only uploaded files will be included in your order." : "Add the documents you'd like printed."}</Text> : null}
    {!items.length ? <View style={styles.hero}><View style={{ flex: 1 }}><Text style={styles.heroTitle}>PDFs + images</Text><Text style={styles.meta}>Set print options for each file.</Text></View><Image source={require("../../assets/artwork/customer_pdf_image_compact.png")} style={{ width: 76, height: 76 }} resizeMode="contain" /></View> : null}
    {failed ? <RecoveryState compact reaction="upload_failed" title={uploadedDocs.length ? "Some files need another try." : "Let’s try those files again."} message={uploadedDocs.length ? "Your uploaded files are kept. Retry only the files below that failed, or continue with the successful files." : "Choose another PDF or image, or retry the affected file below."} /> : null}
    {items.map((item) => <View key={item.id} style={[styles.row, item.status === "failed" && styles.failed]}>
      <View style={styles.fileIcon}><Ionicons name="document-outline" size={24} color={colors.action} /></View>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.name} numberOfLines={2}>{item.doc?.original_name || item.asset?.name || "Document"}</Text>
        <Text style={[styles.meta, item.status === "failed" && { color: colors.error }]}>{item.status === "uploaded" ? `${item.doc.page_count} page${item.doc.page_count === 1 ? "" : "s"} · uploaded${item.converted ? " · image converted to PDF" : ""}` : item.status === "failed" ? item.error : item.status === "preparing" ? "Preparing file…" : "Uploading…"}</Text>
        {item.status === "failed" ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry ${item.asset?.name || "this file"}`} accessibilityState={{ disabled: busy }} disabled={busy} style={styles.retry} onPress={() => upload([item])}><Text style={styles.retryText}>Retry this file</Text></Pressable> : null}
      </View>
      {busy ? <ActivityIndicator color={colors.action} /> : <Pressable style={styles.remove} accessibilityRole="button" accessibilityLabel={`Remove ${item.doc?.original_name || item.asset?.name || "file"}`} onPress={() => setItems((previous) => previous.filter((entry) => entry.id !== item.id))}><Ionicons name="close" size={22} color={colors.textSecondary} /></Pressable>}
    </View>)}
    <Text style={styles.helper}>PDF, JPG and PNG · up to 10 files · 10 MB each. Images become one-page PDFs without cropping.</Text>
    {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({ title: { ...typography.h1, color: colors.textPrimary }, subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 12, marginBottom: 16 }, hero: { padding: 16, minHeight: 136, backgroundColor: colors.surface, borderRadius: 24, flexDirection: "row", alignItems: "center", gap: 16 }, heroTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: 8 }, meta: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 4 }, helper: { ...typography.caption, color: colors.textMuted, marginTop: 16 }, row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: colors.surface, borderRadius: 16, marginBottom: 12 }, failed: { borderWidth: 1, borderColor: colors.error, backgroundColor: colors.errorSurface }, fileIcon: { width: 36, height: 48, alignItems: "center", justifyContent: "center" }, name: { ...typography.bodyMedium, color: colors.textPrimary }, remove: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, retry: { minHeight: 48, justifyContent: "center" }, retryText: { ...typography.label, color: colors.action }, error: { ...typography.bodySmall, color: colors.error, padding: 16, backgroundColor: colors.errorSurface, borderRadius: 16, marginTop: 16 } });
