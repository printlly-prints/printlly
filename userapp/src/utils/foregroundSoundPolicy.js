// The native cue is itself a notification so Android's notification mute and
// DND policy apply. If the remote notification was already shown during
// initialization, consume its event without adding a second notification.
export function canPresentConfirmedCue(snapshot, key) {
  return snapshot.ready && snapshot.active && snapshot.available && !snapshot.presentedKeys.has(key);
}
