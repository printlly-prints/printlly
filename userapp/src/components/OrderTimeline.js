import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { typography, spacing, fonts } from "../theme";
import { ORDER_STEPS, completedOrderStepCount } from "../utils/orderState";

// The vertical status timeline.
//
// The steps below are the ones this backend actually has. The reference
// shows a "File Verification" step; there is no such status on an Order
// (see models/Order.js: pending -> accepted -> ready_for_pickup ->
// completed, plus cancelled/expired), so rendering it would put a green
// tick against something that never happened. The shop accepting the job
// is the real event at that point in the flow, and it is what is shown.
//
export default function OrderTimeline({ status, placedAt, acceptedAt, readyAt, completedAt }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const done = completedOrderStepCount(status);

  // Only timestamps the order actually carries. A step with no recorded
  // time shows its description instead of a made-up one - Order stores
  // createdAt and updatedAt, not a stamp per transition, so most of these
  // are genuinely unknown.
  const timestamps = {
    pending: placedAt,
    accepted: acceptedAt,
    ready_for_pickup: readyAt,
    completed: completedAt,
  };

  return (
    <View>
      {ORDER_STEPS.map((step, i) => {
        const isDone = i < done;
        const isActive = i === done - 1;
        const isLast = i === ORDER_STEPS.length - 1;
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
                  <Ionicons name="checkmark" size={13} color={colors.onAction} />
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

const createStyles = ({ colors }) => ({
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
  activeCore: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.onAction },
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
