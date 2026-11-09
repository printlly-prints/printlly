import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, typography, spacing, fonts } from "../theme";

// The vertical status timeline.
//
// The steps below are the ones this backend actually has. The reference
// shows a "File Verification" step; there is no such status on an Order
// (see models/Order.js: pending -> accepted -> ready_for_pickup ->
// completed, plus cancelled/expired), so rendering it would put a green
// tick against something that never happened. The shop accepting the job
// is the real event at that point in the flow, and it is what is shown.
//
// "Printing" likewise has no status of its own - the backend goes
// straight from accepted to ready_for_pickup. It is kept as a step
// because it is the truthful description of what the shop is doing after
// accepting, and it becomes a distinct state for free if the backend ever
// adds one. Until then accepted lights both, which is honest: the shop
// has the job and is working on it.
const STEPS = [
  { key: "placed", label: "Order placed", pending: "Waiting for the shop to accept." },
  { key: "accepted", label: "Shop accepted", pending: "The shop will confirm shortly." },
  { key: "printing", label: "Printing in progress", pending: "Your files are queued." },
  { key: "ready", label: "Ready for pickup", pending: "We'll notify you once it's ready." },
  { key: "completed", label: "Collected", pending: "Show your pickup code at the counter." },
];

// How many steps are DONE for a given backend status. The active step is
// the one after them.
function completedCount(status) {
  switch (status) {
    case "pending":
      return 1; // placed
    case "accepted":
      // Accepted and printing are the same backend state - see above.
      return 3;
    case "ready_for_pickup":
      return 4;
    case "completed":
      return 5;
    default:
      return 1;
  }
}

export default function OrderTimeline({ status, placedAt, acceptedAt, readyAt, completedAt }) {
  const done = completedCount(status);

  // Only timestamps the order actually carries. A step with no recorded
  // time shows its description instead of a made-up one - Order stores
  // createdAt and updatedAt, not a stamp per transition, so most of these
  // are genuinely unknown.
  const timestamps = {
    placed: placedAt,
    accepted: acceptedAt,
    printing: null,
    ready: readyAt,
    completed: completedAt,
  };

  return (
    <View>
      {STEPS.map((step, i) => {
        const isDone = i < done;
        const isActive = i === done - 1;
        const isLast = i === STEPS.length - 1;
        const stamp = timestamps[step.key];

        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  isDone && styles.dotDone,
                  isActive && styles.dotActive,
                ]}
              >
                {isDone && !isActive ? (
                  <Ionicons name="checkmark" size={13} color={colors.surface} />
                ) : isActive ? (
                  <View style={styles.activeCore} />
                ) : null}
              </View>
              {!isLast ? <View style={[styles.line, i < done - 1 && styles.lineDone]} /> : null}
            </View>

            <View style={[styles.content, isLast && styles.contentLast]}>
              <Text style={[styles.label, isDone && styles.labelDone, isActive && styles.labelActive]}>
                {step.label}
              </Text>
              {stamp ? (
                <Text style={styles.stamp}>{formatStamp(stamp)}</Text>
              ) : !isDone ? (
                <Text style={styles.pending}>{step.pending}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function formatStamp(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DOT = 26;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md },
  rail: { alignItems: "center", width: DOT },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  // A finished step is success green; the step happening right now is
  // brand teal, so "where am I" is the single most prominent thing.
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  activeCore: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.surface },
  line: { flex: 1, width: 2, backgroundColor: colors.border, minHeight: 22 },
  lineDone: { backgroundColor: colors.success },

  content: { flex: 1, paddingBottom: spacing.lg },
  contentLast: { paddingBottom: 0 },
  label: { ...typography.bodyMedium, color: colors.textMuted },
  labelDone: { color: colors.textPrimary },
  labelActive: { color: colors.primaryDeep, fontFamily: fonts.headingSemiBold },
  stamp: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  pending: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
