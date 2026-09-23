import { normalizeReturnPath } from "./returnPath";

interface SignInError {
  message: string;
}

interface SignInResult {
  error: SignInError | null;
}

export interface LoginFlowDependencies {
  signIn: (credentials: { email: string; password: string }) => Promise<SignInResult>;
  navigate: (destination: string) => void;
  refresh: () => void;
}

/**
 * مسیر موفق ورود را قابل‌آزمون نگه می‌دارد: فقط بعد از تأیید Supabase،
 * به مقصد محلیِ پالایش‌شده برمی‌گردد.
 */
export async function signInAndReturn(
  dependencies: LoginFlowDependencies,
  credentials: { email: string; password: string },
  requestedDestination: string,
): Promise<SignInError | null> {
  const result = await dependencies.signIn(credentials);
  if (result.error) return result.error;

  dependencies.navigate(normalizeReturnPath(requestedDestination));
  dependencies.refresh();
  return null;
}
