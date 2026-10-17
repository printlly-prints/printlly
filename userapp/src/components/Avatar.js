import { Image } from "react-native";
import { useAvatar } from "../context/AvatarContext";
import { avatarSources } from "../constants/avatarSources";
import { customerAvatarId } from "../constants/avatarIds";
export default function Avatar({ name, size = 40, avatarId, decorative = false }) {
  const stored = useAvatar();
  return <Image source={avatarSources[customerAvatarId(avatarId || stored?.avatarId)]} resizeMode="contain" style={{ width: size, height: size, borderRadius: size / 2 }} accessible={!decorative} accessibilityLabel={name ? `${name}'s avatar` : "Selected avatar"} />;
}
