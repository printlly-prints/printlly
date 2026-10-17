// Contact details are separate from the sign-in email and OAuth identity.
function validateProfileDetails(body, { now = new Date(), allowOtherFields = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Profile details must be an object" };
  }
  const allowed = new Set(["contact_email", "date_of_birth"]);
  if (!allowOtherFields && Object.keys(body).some((key) => !allowed.has(key))) {
    return { error: "Only contact_email and date_of_birth can be updated" };
  }
  const updates = {};
  if (Object.hasOwn(body, "contact_email")) {
    if (body.contact_email === null) updates.contact_email = null;
    else if (typeof body.contact_email !== "string") return { error: "Enter a valid contact email" };
    else {
      const email = body.contact_email.trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: "Enter a valid contact email" };
      }
      updates.contact_email = email;
    }
  }
  if (Object.hasOwn(body, "date_of_birth")) {
    const value = body.date_of_birth;
    if (value === null) updates.date_of_birth = null;
    else {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { error: "Date of birth must be YYYY-MM-DD or null" };
      }
      const date = new Date(`${value}T00:00:00.000Z`);
      if (value < "0001-01-01" || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        return { error: "Enter a valid date of birth" };
      }
      // Printlly serves India: use the same calendar day as the phone in IST,
      // including the 00:00–05:30 period when UTC is still the previous day.
      const todayInIndia = new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
      if (value > todayInIndia) return { error: "Date of birth cannot be in the future" };
      updates.date_of_birth = value;
    }
  }
  return { updates };
}

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  contact_email: user.contact_email ?? null,
  date_of_birth: user.date_of_birth ?? null,
});

module.exports = { validateProfileDetails, publicUser };
