const User = require("../models/User");
const { validateProfileDetails, publicUser } = require("../utils/profileDetails");

const fields = "name email phone role contact_email date_of_birth";

async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select(fields);
    if (!user) return res.status(401).json({ message: "Invalid or expired token" });
    return res.json({ user: publicUser(user) });
  } catch {
    return res.status(500).json({ message: "Could not load profile" });
  }
}

async function updateProfile(req, res) {
  const { updates, error } = validateProfileDetails(req.body);
  if (error) return res.status(400).json({ message: error });
  if (!Object.keys(updates).length) return res.status(400).json({ message: "No profile details supplied" });
  try {
    // Atomic field update avoids overwriting a concurrent change to the other field.
    const user = await User.findByIdAndUpdate(
      req.user.id, { $set: updates }, { new: true, runValidators: true }
    ).select(fields);
    if (!user) return res.status(401).json({ message: "Invalid or expired token" });
    return res.json({ user: publicUser(user) });
  } catch {
    return res.status(500).json({ message: "Could not save profile" });
  }
}

module.exports = { getProfile, updateProfile };
