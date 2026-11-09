import { Pressable, Text, View } from "react-native";
import { PROFILE_GENDERS } from "../utils/profilePreferences";
import { colors, typography, spacing } from "../theme";
export default function GenderOptions({ value, onChange, disabled }) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Gender optional"
      style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
    >
      {PROFILE_GENDERS.map((item) => (
        <Pressable
          key={item.value}
          accessibilityRole="radio"
          accessibilityLabel={item.label}
          accessibilityState={{ checked: value === item.value, disabled }}
          disabled={disabled}
          onPress={() => onChange(item.value)}
          style={{
            minHeight: 44,
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: value === item.value ? colors.primary : colors.border,
            backgroundColor:
              value === item.value ? colors.primaryWash : colors.surface,
          }}
        >
          <Text style={{ ...typography.labelSmall, color: colors.textPrimary }}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
