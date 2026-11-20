import { toLatinDigits } from "../format";

/** A profile contact number is not proof of phone ownership or an Auth identity. */
export function verifiedPhoneInput(raw: string): string {
  const phone = toLatinDigits(raw).replace(/[\s()-]/g, "");
  if (/^09\d{9}$/.test(phone)) return "+98" + phone.slice(1);
  if (/^\+989\d{9}$/.test(phone)) return phone;
  throw new Error("شمارهٔ موبایل ایران را با ۰۹ وارد کنید.");
}

export const existingPhoneChallenge = (phone: string) => ({
  phone: verifiedPhoneInput(phone), options: { shouldCreateUser: false as const },
});

export function matchesVerifiedPhone(user: { phone?: string; phone_confirmed_at?: string } | null, phone: string): boolean {
  return !!user?.phone_confirmed_at && user.phone?.replace(/^\+/, "") === verifiedPhoneInput(phone).slice(1);
}
