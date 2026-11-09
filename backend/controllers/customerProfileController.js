const User = require("../models/User");
async function updateCustomerProfile(req, res) {
  const { name, gender } = req.body;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 60 ||
    !User.PROFILE_GENDERS.includes(gender)
  )
    return res
      .status(400)
      .json({
        message: "Enter a name and choose a valid optional gender preference.",
      });
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { name: name.trim(), gender } },
      { new: true, runValidators: true },
    ).select("_id name email phone role gender");
    if (!user) return res.status(404).json({ message: "Account not found" });
    return res.json({ user });
  } catch {
    return res
      .status(500)
      .json({ message: "Could not update your profile. Please try again." });
  }
}
module.exports = { updateCustomerProfile };
