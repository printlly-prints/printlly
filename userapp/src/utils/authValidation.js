export function validateCustomerAuth(
  { name, phone, email, password },
  signingUp,
) {
  if (signingUp && (!name.trim() || !phone.trim()))
    return "Enter your name and phone number.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Enter a valid email address.";
  if (!password) return "Enter your password.";
  if (signingUp && password.length < 10)
    return "Use at least 10 characters for your password.";
  if (signingUp && password !== password.trim())
    return "Your password cannot start or end with a space.";
  return "";
}

export function assertCustomerSession(data) {
  if (data?.user?.role !== "customer")
    throw new Error(
      "Print partners use the partner website. Sign in with a customer account here.",
    );
  if (typeof data.token !== "string" || !data.token)
    throw new Error("We couldn’t complete sign-in. Please try again.");
}
