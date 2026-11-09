# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Mobile implementation

- Use Ponytail and the installed Expo overview, design-system, native-UI and data-fetching guidance for app changes. Use Expo animation and Software Mansion's React Native animation guidance for motion.
- Keep the existing React Navigation structure and shared `src/theme` components; avoid introducing a parallel UI system.
- Match the approved Paprout paper/ink/CMYK identity and updated character artwork. Do not use the old teal printer illustrations.
- Keep reduced-motion behavior, safe areas, text scaling and real API error/loading/empty states. Do not invent shop ratings, prices or testimonials.
- SwiftUI guidance is available for platform-specific iOS work; the customer app remains Expo/React Native for iOS and Android.
- The user has authorized seeded data for mobile and explicitly requested no demo/sample labels in the interface. Keep it isolated behind `DEMO_MODE` and keep real API data and payment verification unchanged when demo mode is off.
