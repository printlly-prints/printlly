import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CUSTOMER_AVATAR_IDS } from "../constants/avatarIds";
import { typography } from "../theme";
import { useTheme } from "../context/ThemeContext";
import ScreenFrame from "./ScreenFrame";
import Avatar from "./Avatar";
import Button from "./Button";
export default function AvatarPicker({ visible, initialId, onClose, onConfirm }) {
  const { colors, reducedMotion } = useTheme();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState(initialId);
  useEffect(() => { if (visible) setSelected(initialId); }, [visible, initialId]);
  const size = Math.min(100, (Math.min(width, 608) - 88) / 3);
  return <Modal visible={visible} onRequestClose={onClose} animationType={reducedMotion ? "none" : "fade"} presentationStyle="fullScreen">
    <ScreenFrame hideNavigation title="Choose avatar" onBack={onClose} footer={<Button title="Use this avatar" onPress={() => onConfirm(selected)} />}>
      <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: 20 }]}>Pick your favourite.</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
        {CUSTOMER_AVATAR_IDS.map((id, index) => <Pressable key={id} onPress={() => setSelected(id)} accessibilityRole="radio"
          accessibilityLabel={`Avatar ${index + 1}`} accessibilityState={{ selected: id === selected }}
          style={{ width: size, height: size, borderRadius: size / 2, borderWidth: id === selected ? 3 : 0, borderColor: colors.action, alignItems: "center", justifyContent: "center" }}>
          <Avatar avatarId={id} size={size - 6} decorative />
          {id === selected ? <View style={{ position: "absolute", right: 0, bottom: 0, backgroundColor: colors.action, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" }}><Ionicons name="checkmark" size={16} color={colors.onAction} /></View> : null}
        </Pressable>)}
      </View>
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 24 }]}>Your avatar is saved on this device.</Text>
    </ScreenFrame>
  </Modal>;
}
