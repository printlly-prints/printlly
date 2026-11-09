import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as DocumentPicker from "expo-document-picker";
import { trackEvent, EVENTS } from "../lib/analytics";
import Button from "../components/Button";
import { toast } from "react-native-sonner";
import { PressableScale } from "pressto";
import DocumentSettingsCard from "../components/DocumentSettingsCard";
import { defaultDocumentSettings } from "../utils/documentSettings";
import { describeDocumentSettings } from "../utils/documentSettings";
import DocumentThumbnail from "../components/DocumentThumbnail";
import PaperPreview from "../components/PaperPreview";
import { uploadDocuments } from "../api/client";
import { DEMO_MODE } from "../config/runtime";
import { demoStore } from "../demo/store";
import { useAuth } from "../context/AuthContext";
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
export default function UploadDocumentsScreen({
  route,
  navigation,
  completedOrderId,
}) {
  const insets = useSafeAreaInsets();
  const { appearance } = useAuth();
  const preselectedShop = route.params?.preselectedShop || null;

  const [pendingFiles, setPendingFiles] = useState([]);
  // Files the server has accepted: { upload_id, file_url, page_count, original_name }
  const [uploadedDocs, setUploadedDocs] = useState([]);
  // Files the server rejected: { original_name, error, asset }
  const [failedUploads, setFailedUploads] = useState([]);

  const [uploading, setUploading] = useState(false);
  const [retryingName, setRetryingName] = useState(null);
  const [error, setError] = useState("");
  const [settingsById, setSettingsById] = useState({});
  const [activeDocId, setActiveDocId] = useState(null);

  useEffect(() => {
    const docs = route.params?.initialUploadedDocs;
    if (!docs) return;
    setUploadedDocs(docs);
    setSettingsById(
      Object.fromEntries(
        docs.map((doc, index) => [
          doc.upload_id,
          route.params.initialDocSettings?.[index] || defaultDocumentSettings(),
        ]),
      ),
    );
    setActiveDocId(docs[0]?.upload_id || null);
  }, [route.params?.initialUploadedDocs, route.params?.initialDocSettings]);

  useEffect(() => {
    if (!completedOrderId) return;
    setUploadedDocs([]);
    setPendingFiles([]);
    setFailedUploads([]);
    setError("");
    setSettingsById({});
    setActiveDocId(null);
  }, [completedOrderId]);

  const totalSlotsUsed =
    pendingFiles.length + uploadedDocs.length + failedUploads.length;
  const canProceed =
    uploadedDocs.length > 0 &&
    pendingFiles.length === 0 &&
    failedUploads.length === 0;

  const rememberSettings = (docs) => {
    setSettingsById((previous) => {
      const next = { ...previous };
      docs.forEach((doc) => {
        if (!next[doc.upload_id])
          next[doc.upload_id] = {
            ...defaultDocumentSettings(),
            ...appearance?.printDefaults,
            services: [],
          };
      });
      return next;
    });
  };

  const addFiles = async () => {
    setError("");
    const room = MAX_FILES - totalSlotsUsed;
    if (room <= 0) {
      setError(`You can add up to ${MAX_FILES} documents per order.`);
      return;
    }
    if (DEMO_MODE) {
      const sample = demoStore.addDocument();
      setUploadedDocs((previous) => [...previous, sample]);
      setActiveDocId(sample.upload_id);
      rememberSettings([sample]);
      toast.success("Document added", {
        description: sample.page_count + " pages ready to configure.",
      });
      return;
    }

    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png"],
        multiple: true,
        copyToCacheDirectory: true,
      });
    } catch {
      setError("Couldn’t open the file picker. Please try again.");
      return;
    }
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
    trackEvent(EVENTS.DOCUMENT_UPLOAD_STARTED, {
      file_count: result.assets.length,
    });

    const picked = result.assets.slice(0, room);
    if (result.assets.length > room) {
      setError(
        `Only ${room} more document(s) could be added (${MAX_FILES} max per order).`,
      );
    }
    setPendingFiles((prev) => [...prev, ...picked]);
  };

  const removePendingFile = (uri) => {
    setPendingFiles((prev) => prev.filter((f) => f.uri !== uri));
  };

  const removeUploadedDoc = (uploadId) => {
    setUploadedDocs((prev) => prev.filter((d) => d.upload_id !== uploadId));
    setSettingsById((previous) => {
      const next = { ...previous };
      delete next[uploadId];
      return next;
    });
  };

  const removeFailed = (originalName) => {
    setFailedUploads((prev) =>
      prev.filter((f) => f.original_name !== originalName),
    );
  };

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    setError("");
    setUploading(true);
    try {
      const result = await uploadDocuments(pendingFiles);
      rememberSettings(result.succeeded);
      setUploadedDocs((prev) => [...prev, ...result.succeeded]);
      if (result.succeeded.length)
        toast.success("Documents added", {
          description:
            result.succeeded.length + " document(s) ready to configure.",
        });
      if (result.failed.length > 0) {
        // Matched back to the original asset by filename so "Retry" can
        // resubmit the exact same bytes. Two same-named files in one
        // batch would both match the first found - an accepted edge case.
        const withAssets = result.failed.map((f) => ({
          ...f,
          asset: pendingFiles.find(
            (p) => (p.name || "document.pdf") === f.original_name,
          ),
        }));
        setFailedUploads((prev) => [...prev, ...withAssets]);
      }
      setPendingFiles([]);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not upload your documents. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  // Re-attempts a single failed file with its original bytes - useful for
  // a transient storage failure. A "wrong file type" or "corrupted PDF"
  // rejection will fail again with the same message either way.
  const retryFailed = async (failedItem) => {
    if (!failedItem.asset) {
      setError(
        `Couldn't find the original file for "${failedItem.original_name}" - remove it and add it again.`,
      );
      return;
    }
    setError("");
    setRetryingName(failedItem.original_name);
    try {
      const result = await uploadDocuments([failedItem.asset]);
      rememberSettings(result.succeeded);
      setFailedUploads((prev) =>
        prev.filter((f) => f.original_name !== failedItem.original_name),
      );
      if (result.succeeded.length > 0) {
        setUploadedDocs((prev) => [...prev, ...result.succeeded]);
      }
      if (result.failed.length > 0) {
        setFailedUploads((prev) => [
          ...prev,
          { ...result.failed[0], asset: failedItem.asset },
        ]);
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Retry failed. Please try again.",
      );
    } finally {
      setRetryingName(null);
    }
  };

  const settingsFor = (doc) =>
    settingsById[doc.upload_id] || {
      ...defaultDocumentSettings(),
      ...appearance?.printDefaults,
      services: [],
    };
  const docSettings = uploadedDocs.map(settingsFor);
  const openTask = (screen, params) => {
    if (navigation.getState().routeNames.includes(screen))
      navigation.navigate(screen, params);
    else navigation.navigate("PrintFlow", { screen, params });
  };
  const handleContinue = () => {
    if (!canProceed || uploading || retryingName) return;
    openTask(preselectedShop ? "ChooseShopOption" : "SelectShop", {
      uploadedDocs,
      docSettings,
      notes: "",
      preselectedShop,
    });
  };
  const activeDoc =
    uploadedDocs.find((doc) => doc.upload_id === activeDocId) ||
    uploadedDocs[0];
  const pageCount = uploadedDocs.reduce(
    (sum, doc) => sum + (doc.page_count || 0),
    0,
  );
  const hasFailure = failedUploads.length > 0 || Boolean(error);
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {totalSlotsUsed === 0 ? (
          <View style={styles.emptyWorkspace}>
            <PaperPreview />
            <Text accessibilityRole="header" style={styles.title}>
              What are we{"\n"}printing today?
            </Text>
            <Text style={styles.subtitle}>
              Add documents or images and set them up. Compare nearby shops
              after.
            </Text>
            <Button
              title="Add documents"
              icon="document-attach-outline"
              iconPosition="left"
              onPress={addFiles}
            />
            <Text style={styles.fileLimit}>
              PDF, JPG, JPEG, PNG · up to 10 MB each · 10 files per order
            </Text>
            <View style={styles.defaults}>
              <Text style={styles.defaultTitle}>Your defaults</Text>
              <Text style={styles.note}>
                {describeDocumentSettings({
                  ...defaultDocumentSettings(),
                  ...appearance?.printDefaults,
                  services: [],
                })}{" "}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.documentsHeading}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text accessibilityRole="header" style={styles.listTitle}>
                Your documents
              </Text>
              <Text style={styles.note}>
                {uploadedDocs.length}{" "}
                {uploadedDocs.length === 1 ? "file" : "files"} · {pageCount}{" "}
                pages
              </Text>
            </View>
            <Image
              source={
                hasFailure
                  ? require("../../assets/art/paper-pal-pending.png")
                  : require("../../assets/art/paper-pal-cmyk.png")
              }
              style={{ width: 70, height: 86 }}
              resizeMode="contain"
              accessible={false}
            />
          </View>
        )}
        {uploadedDocs.map((doc) => (
          <DocumentRow
            key={doc.upload_id}
            name={doc.original_name}
            meta={
              doc.page_count +
              " pages · " +
              describeDocumentSettings(settingsFor(doc))
            }
            colour={settingsFor(doc).color_mode === "color"}
            onRemove={() => removeUploadedDoc(doc.upload_id)}
            disabled={uploading}
            selected={doc.upload_id === activeDoc?.upload_id}
            onSelect={() => setActiveDocId(doc.upload_id)}
          />
        ))}
        {pendingFiles.map((file) => (
          <DocumentRow
            key={file.uri}
            name={file.name}
            meta="Ready to upload"
            onRemove={() => removePendingFile(file.uri)}
            disabled={uploading}
          />
        ))}
        {failedUploads.map((file) => (
          <View key={file.original_name}>
            <DocumentRow
              name={file.original_name}
              meta={file.error}
              failed
              onRemove={() => removeFailed(file.original_name)}
              disabled={retryingName === file.original_name}
            />
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={"Retry " + file.original_name}
              onPress={() => retryFailed(file)}
              disabled={retryingName !== null || uploading}
              style={styles.retry}
            >
              <Text style={styles.link}>
                {retryingName === file.original_name
                  ? "Retrying…"
                  : "Retry upload"}
              </Text>
            </PressableScale>
          </View>
        ))}
        {totalSlotsUsed > 0 && totalSlotsUsed < MAX_FILES ? (
          <PressableScale
            accessibilityRole="button"
            disabled={uploading}
            onPress={addFiles}
            style={styles.add}
          >
            <Ionicons name="add" size={23} color={colors.primary} />
            <Text style={styles.link}>Add documents</Text>
          </PressableScale>
        ) : null}
        {pendingFiles.length > 0 ? (
          <Button
            title={
              "Upload " +
              pendingFiles.length +
              " document" +
              (pendingFiles.length === 1 ? "" : "s")
            }
            onPress={handleUpload}
            loading={uploading}
          />
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {activeDoc ? (
          <View style={styles.preferences}>
            <DocumentSettingsCard
              compact
              name={activeDoc.original_name}
              settings={settingsFor(activeDoc)}
              onChange={(next) =>
                setSettingsById((previous) => ({
                  ...previous,
                  [activeDoc.upload_id]: next,
                }))
              }
              availableServices={preselectedShop?.pricing?.services}
            />
            <PressableScale
              accessibilityRole="button"
              onPress={() =>
                openTask("PrintPreferences", {
                  uploadedDocs,
                  preselectedShop,
                  initialDocSettings: docSettings,
                })
              }
              style={styles.more}
            >
              <View>
                <Text style={styles.link}>Finishing & instructions</Text>
                <Text style={styles.note}>
                  Binding, stapling and notes for the shop
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.primary}
              />
            </PressableScale>
          </View>
        ) : totalSlotsUsed > 0 ? (
          <View style={styles.emptyNote}>
            <Ionicons
              name="document-text-outline"
              size={19}
              color={colors.textMuted}
            />
            <Text style={styles.note}>
              PDF, JPG, JPEG and PNG. Up to {MAX_FILES} files per order. Each
              image prints as one page.
            </Text>
          </View>
        ) : null}
        {!DEMO_MODE ? (
          <Text style={styles.privacy}>
            Your files are used for your print order and deleted when the order
            ends.
          </Text>
        ) : null}
      </ScrollView>
      {totalSlotsUsed > 0 ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom:
                route.name === "Home"
                  ? spacing.md
                  : Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          <Button
            title="Choose a shop"
            onPress={handleContinue}
            disabled={
              totalSlotsUsed > 0 &&
              (!canProceed || uploading || retryingName !== null)
            }
          />
          {pendingFiles.length > 0 || failedUploads.length > 0 ? (
            <Text style={styles.note}>
              Upload, retry or remove remaining files to continue.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
function DocumentRow({
  name,
  meta,
  onRemove,
  onSelect,
  selected,
  disabled,
  failed,
  colour,
}) {
  return (
    <View
      style={[
        styles.docRow,
        selected && styles.docSelected,
        failed && { backgroundColor: colors.dangerBg },
      ]}
    >
      <DocumentThumbnail colour={colour} name={name} />
      <Pressable
        disabled={!onSelect || disabled}
        onPress={onSelect}
        accessibilityRole={onSelect ? "button" : undefined}
        accessibilityLabel={onSelect ? "Print settings for " + name : undefined}
        accessibilityState={{ selected: Boolean(selected) }}
        style={styles.docCopy}
      >
        <Text style={styles.docName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.note, failed && { color: colors.danger }]}>
          {meta}
        </Text>
      </Pressable>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={"Remove " + name}
        disabled={disabled}
        onPress={onRemove}
        style={styles.remove}
      >
        <Ionicons name="trash-outline" size={19} color={colors.textSecondary} />
      </PressableScale>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 20,
    paddingBottom: spacing.xl,
    width: "100%",
    alignSelf: "center",
  },
  title: { ...typography.h2, color: colors.ink },
  emptyWorkspace: { gap: spacing.lg },
  fileLimit: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
  },
  defaults: {
    padding: spacing.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 24,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  defaultTitle: { ...typography.labelSmall, color: colors.ink },
  documentsHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  listTitle: { ...typography.h3, fontSize: 18, color: colors.ink },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  feedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginVertical: spacing.md,
  },
  mascot: { width: 112, height: 136 },
  speech: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 22,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  speechText: {
    ...typography.bodyMedium,
    color: colors.ink,
    textAlign: "center",
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: "transparent",
    borderRadius: 24,
    minHeight: 86,
  },
  docSelected: { borderColor: colors.primary, backgroundColor: colors.surface },
  pdf: { width: 38, alignItems: "center", justifyContent: "center" },
  pdfText: {
    ...typography.production,
    color: colors.primary,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  docCopy: { flex: 1, gap: spacing.xs },
  docName: { ...typography.bodyMedium, color: colors.ink },
  remove: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  link: { ...typography.labelSmall, color: colors.primary },
  add: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
  },
  retry: { minHeight: 44, justifyContent: "center", alignSelf: "flex-end" },
  preferences: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  preferenceTitle: { ...typography.h3, color: colors.ink },
  more: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  note: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  emptyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  error: {
    ...typography.bodySmall,
    color: colors.danger,
    paddingVertical: spacing.md,
  },
  privacy: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderColor: colors.border,
    width: "100%",
    alignSelf: "center",
  },
});
