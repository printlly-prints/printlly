module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      ...(iosClientId
        ? [
            [
              "@react-native-google-signin/google-signin",
              { iosUrlScheme: iosClientId.split(".").reverse().join(".") },
            ],
          ]
        : []),
    ],
  };
};
