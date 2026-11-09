import { Image, View } from "react-native";
import { HUMAN_AVATARS } from "../utils/profileAvatars";

export default function ProfileAvatar({ avatar = "avatar-01", size = 80 }) {
  const selected =
    HUMAN_AVATARS.find((item) => item.id === avatar) || HUMAN_AVATARS[0];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
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
