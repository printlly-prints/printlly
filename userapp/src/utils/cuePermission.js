// Called only by the explicit Event sounds enable action, never during
// render/session restoration. Local foreground cues don't need a push token.
export async function requestCuePermission(notifications) {
  let permission = await notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain !== false) permission = await notifications.requestPermissionsAsync();
  return Boolean(permission.granted);
}
