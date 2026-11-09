const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { issueToken } = require("./authController");
const client = new OAuth2Client();

async function customerGoogleLogin(req, res) {
  const audience = process.env.GOOGLE_CUSTOMER_WEB_CLIENT_ID;
  if (!audience)
    return res
      .status(501)
      .json({
        message:
          "Google sign-in is not available yet. Please sign in with email.",
      });
  const { id_token } = req.body;
  if (typeof id_token !== "string" || !id_token || id_token.length > 10000)
    return res.status(400).json({ message: "A Google ID token is required." });
  let profile;
  try {
    const ticket = await client.verifyIdToken({ idToken: id_token, audience });
    profile = ticket.getPayload();
    if (!profile?.sub || !profile.email || profile.email_verified !== true)
      throw Error("Unverified identity");
  } catch {
    return res
      .status(401)
      .json({
        message: "Google sign-in could not be verified. Please try again.",
      });
  }
  try {
    const email = profile.email.toLowerCase();
    let user = await User.findOne({ google_id: profile.sub });
    if (!user) {
      user = await User.findOne({ email });
      if (
        user &&
        (user.role !== "customer" ||
          (user.google_id && user.google_id !== profile.sub))
      )
        return res
          .status(403)
          .json({ message: "Use a customer account to sign in to this app." });
      // Linking an existing password account requires Google to own its email domain.
      if (user && !email.endsWith("@gmail.com") && !profile.hd)
        return res
          .status(403)
          .json({
            message:
              "Please sign in to this account with your email and password.",
          });
      if (user) {
        user.google_id = profile.sub;
        user.auth_provider = "google";
        await user.save();
      } else
        user = await User.create({
          name: profile.name || email.split("@")[0],
          email,
          google_id: profile.sub,
          auth_provider: "google",
          role: "customer",
        });
    }
    if (user.role !== "customer")
      return res
        .status(403)
        .json({ message: "Use a customer account to sign in to this app." });
    const token = await issueToken(user);
    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        gender: user.gender,
      },
    });
  } catch (error) {
    return res
      .status(error.code === 11000 ? 409 : 500)
      .json({ message: "Could not finish Google sign-in. Please try again." });
  }
}
module.exports = { customerGoogleLogin };
