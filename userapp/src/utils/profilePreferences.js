export const PROFILE_AVATARS = [
  "initial",
  "customer",
  "paper-pal",
  "student",
  "pickup",
];
export const PROFILE_COLOURS = [
  "auto",
  "yellow",
  "cyan",
  "magenta",
  "green",
  "ink",
];
export const PROFILE_WASH = {
  cyan: "primaryWash",
  magenta: "pinkWash",
  yellow: "leafSoft",
};
export const PROFILE_GENDERS = [
  { value: "male", label: "Man" },
  { value: "female", label: "Woman" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
export function suggestedAvatar(gender) {
  return gender === "female" ? "avatar-v2-03" : "avatar-v2-01";
}
export function profileAccent(value = {}) {
  return ["cyan", "magenta", "yellow"].includes(value.colour)
    ? value.colour
    : value.gender === "female"
      ? "magenta"
      : value.gender === "non_binary"
        ? "yellow"
        : "cyan";
}

export function validateProfilePreferences(value) {
  if (!value || typeof value.name !== "string" || !value.name.trim())
    return "Enter a display name.";
  if (value.name.trim().length > 60) return "Use 60 characters or fewer.";
  if (
    !PROFILE_AVATARS.includes(value.avatar) &&
    !/^avatar-(0[1-9]|1[0-7])$/.test(value.avatar) &&
    !/^avatar-v2-0[1-4]$/.test(value.avatar)
  )
    return "Choose a profile character.";
  if (value.colour && !PROFILE_COLOURS.includes(value.colour))
    return "Choose an avatar colour.";
  if (
    value.gender &&
    !PROFILE_GENDERS.some((item) => item.value === value.gender)
  )
    return "Choose a gender preference or skip it.";
  const print = value.printDefaults;
  if (
    print &&
    (!["bw", "color"].includes(print.color_mode) ||
      !["A4", "A3"].includes(print.paper_size) ||
      !["single", "double"].includes(print.sides) ||
      !Number.isInteger(print.copies) ||
      print.copies < 1 ||
      print.copies > 999)
  )
    return "Choose valid print preferences.";
  return "";
}

export function profilePreferencesKey(id) {
  return `paprout:profile-appearance:${id}`;
}
