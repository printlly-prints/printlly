import { Image, View } from "react-native";
import { HUMAN_AVATARS } from "../utils/profileAvatars";
import { PROFILE_WASH } from "../utils/profilePreferences";
import { colors } from "../theme";

export default function ProfileAvatar({
  avatar = "avatar-v2-01",
  colour = "cyan",
  size = 80,
}) {
  const selected =
    HUMAN_AVATARS.find((item) => item.id === avatar) || HUMAN_AVATARS[0];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: colors[PROFILE_WASH[colour] || "primaryWash"],
      }}
    >
      <Image
        source={selected.source}
        style={{ width: size, height: size }}
        resizeMode="cover"
        accessible={false}
      />
    </View>
  );
}
