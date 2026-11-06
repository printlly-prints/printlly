export const PROFILE_AVATARS = [
  "initial",
  "customer",
  "paper-pal",
  "student",
  "pickup",
];
export const PROFILE_COLOURS = ["yellow", "cyan", "magenta", "green", "ink"];

export function validateProfilePreferences(value) {
  if (!value || typeof value.name !== "string" || !value.name.trim())
    return "Enter a display name.";
  if (value.name.trim().length > 60) return "Use 60 characters or fewer.";
  if (
    !PROFILE_AVATARS.includes(value.avatar) &&
    !/^avatar-(0[1-9]|1[0-7])$/.test(value.avatar)
  )
    return "Choose a profile character.";
  if (value.colour && !PROFILE_COLOURS.includes(value.colour))
    return "Choose an avatar colour.";
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
