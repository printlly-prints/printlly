import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { trackEvent, EVENTS } from "../lib/analytics";
import Button from "../components/Button";
import { uploadDocuments } from "../api/client";
import { colors, typography, spacing, radius } from "../theme";

const MAX_FILES = 10;

// Step 1 of the order flow (Upload -> Preferences -> Select shop ->
// Review & pay). Pick up to 10 PDFs, upload them, and only then move on -
// the real page count for pricing always comes back from the server here,
// never guessed client-side.
//
// route.params.preselectedShop carries a shop forward when this flow was
// started by tapping a shop directly (Shops tab / Home's nearby list),
// so the customer doesn't have to pick it again at the Select Shop step.
export default function UploadDocumentsScreen({ route, navigation }) {
  const preselectedShop = route.params?.preselectedShop || null;

  const [pendingFiles, setPendingFiles] = useState([]);
  // Files the server has accepted: { upload_id, file_url, page_count, original_name }
  const [uploadedDocs, setUploadedDocs] = useState([]);
  // Files the server rejected: { original_name, error, asset }
  const [failedUploads, setFailedUploads] = useState([]);

  const [uploading, setUploading] = useState(false);
  const [retryingName, setRetryingName] = useState(null);
  const [error, setError] = useState("");

  const totalSlotsUsed = pendingFiles.length + uploadedDocs.length + failedUploads.length;
  const canProceed = uploadedDocs.length > 0 && pendingFiles.length === 0 && failedUploads.length === 0;

  const addFiles = async () => {
    setError("");
    const room = MAX_FILES - totalSlotsUsed;
    if (room <= 0) {
      setError(`You can add up to ${MAX_FILES} documents per order.`);
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    // document_upload_started - emitted after the customer has actually
    // chosen files, not when the screen opened. That placement is the whole
    // value of the event: paired with the backend's
    // document_upload_completed it measures how often an upload that was
    // genuinely attempted failed to land, which is the top of the order
    // funnel and the one step that depends on a third party (Cloudinary).
    //
    // Count only. Filenames are never sent: a filename is frequently the
    // sensitive part of a document before anyone opens it.
    trackEvent(EVENTS.DOCUMENT_UPLOAD_STARTED, { file_count: result.assets.length });

    const picked = result.assets.slice(0, room);
    if (result.assets.length > room) {
      setError(`Only ${room} more document(s) could be added (${MAX_FILES} max per order).`);
    }
    setPendingFiles((prev) => [...prev, ...picked]);
  };

  const removePendingFile = (uri) => {
    setPendingFiles((prev) => prev.filter((f) => f.uri !== uri));
  };

  const removeUploadedDoc = (uploadId) => {
    setUploadedDocs((prev) => prev.filter((d) => d.upload_id !== uploadId));
  };

  const removeFailed = (originalName) => {
    setFailedUploads((prev) => prev.filter((f) => f.original_name !== originalName));
  };

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    setError("");
    setUploading(true);
    try {
      const result = await uploadDocuments(pendingFiles);
      setUploadedDocs((prev) => [...prev, ...result.succeeded]);
      if (result.failed.length > 0) {
        // Matched back to the original asset by filename so "Retry" can
        // resubmit the exact same bytes. Two same-named files in one
        // batch would both match the first found - an accepted edge case.
        const withAssets = result.failed.map((f) => ({
          ...f,
          asset: pendingFiles.find((p) => (p.name || "document.pdf") === f.original_name),
        }));
        setFailedUploads((prev) => [...prev, ...withAssets]);
      }
      setPendingFiles([]);
    } catch (err) {
      setError(err.response?.data?.message || "Could not upload your documents. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Re-attempts a single failed file with its original bytes - useful for
  // a transient storage failure. A "wrong file type" or "corrupted PDF"
  // rejection will fail again with the same message either way.
  const retryFailed = async (failedItem) => {
    if (!failedItem.asset) {
      setError(`Couldn't find the original file for "${failedItem.original_name}" - remove it and add it again.`);
      return;
    }
    setError("");
    setRetryingName(failedItem.original_name);
    try {
      const result = await uploadDocuments([failedItem.asset]);
      setFailedUploads((prev) => prev.filter((f) => f.original_name !== failedItem.original_name));
      if (result.succeeded.length > 0) {
        setUploadedDocs((prev) => [...prev, ...result.succeeded]);
      }
      if (result.failed.length > 0) {
        setFailedUploads((prev) => [...prev, { ...result.failed[0], asset: failedItem.asset }]);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Retry failed. Please try again.");
    } finally {
      setRetryingName(null);
    }
  };

  const handleContinue = () => {
    if (!canProceed) return;
    navigation.navigate("PrintPreferences", { uploadedDocs, preselectedShop });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add your documents</Text>
      <Text style={styles.subtitle}>PDFs only - we'll count the pages for you.</Text>

      {uploadedDocs.map((doc) => (
        <View key={doc.upload_id} style={styles.docRow}>
          <View style={styles.docInfo}>
            <Text style={styles.docName} numberOfLines={1}>
              {doc.original_name}
            </Text>
            <Text style={styles.docMeta}>
              {doc.page_count} page{doc.page_count > 1 ? "s" : ""} · uploaded
            </Text>
          </View>
          <Pressable onPress={() => removeUploadedDoc(doc.upload_id)} hitSlop={10}>
            <Text style={styles.removeX}>×</Text>
          </Pressable>
        </View>
      ))}

      {failedUploads.map((f) => (
        <View key={f.original_name} style={[styles.docRow, styles.docRowFailed]}>
          <View style={styles.docInfo}>
            <Text style={styles.docName} numberOfLines={1}>
              {f.original_name}
            </Text>
            <Text style={styles.docError}>{f.error}</Text>
          </View>
          <View style={styles.failedActions}>
            <Pressable onPress={() => retryFailed(f)} disabled={retryingName === f.original_name}>
              <Text style={styles.retryText}>
                {retryingName === f.original_name ? "Retrying..." : "Retry"}
              </Text>
            </Pressable>
            <Pressable onPress={() => removeFailed(f.original_name)} hitSlop={10}>
              <Text style={styles.removeX}>×</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {pendingFiles.map((f) => (
        <View key={f.uri} style={styles.docRow}>
          <View style={styles.docInfo}>
            <Text style={styles.docName} numberOfLines={1}>
              {f.name}
            </Text>
            <Text style={styles.docMeta}>Ready to upload</Text>
          </View>
          <Pressable onPress={() => removePendingFile(f.uri)} hitSlop={10}>
            <Text style={styles.removeX}>×</Text>
          </Pressable>
        </View>
      ))}

      <Pressable style={styles.filePicker} onPress={addFiles}>
        <Text style={styles.filePickerText}>
          + Add PDF document{totalSlotsUsed > 0 ? "s" : ""}
        </Text>
        <Text style={styles.filePickerHint}>Up to {MAX_FILES} documents per order</Text>
      </Pressable>

      {pendingFiles.length > 0 && (
        <Button
          title={`Upload ${pendingFiles.length} document${pendingFiles.length > 1 ? "s" : ""}`}
          onPress={handleUpload}
          loading={uploading}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.spacer} />
      <Button title="Continue" onPress={handleContinue} disabled={!canProceed} />
      {pendingFiles.length > 0 && (
        <Text style={styles.note}>Upload your documents above before continuing.</Text>
      )}
      {failedUploads.length > 0 && (
        <Text style={styles.note}>Retry or remove the failed document(s) above.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xl },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  docRowFailed: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  docInfo: { flex: 1, marginRight: spacing.md },
  docName: { ...typography.bodyMedium, color: colors.textPrimary },
  docMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  docError: { ...typography.caption, color: colors.danger, marginTop: 2 },
  failedActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  retryText: { ...typography.labelSmall, color: colors.primaryBright },
  removeX: { fontSize: 22, color: colors.textSecondary, lineHeight: 24 },
  filePicker: {
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  filePickerText: { ...typography.bodyMedium, color: colors.primaryBright, textAlign: "center" },
  filePickerHint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
    ...typography.bodySmall,
  },
  spacer: { height: spacing.md },
  note: { textAlign: "center", color: colors.textSecondary, marginTop: spacing.md, ...typography.bodySmall },
});
