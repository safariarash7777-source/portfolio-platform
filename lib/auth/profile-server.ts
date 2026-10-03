import 'server-only';

// Reading a private profile does not activate OTP, SMS admission or identity writes.
export function profileReadEnabled() {
  return process.env.AUTH_PROFILE_READ_ENABLED === 'true';
}
