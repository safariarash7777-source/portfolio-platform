"use client";

import AccountBridge from "@/components/account/AccountBridge";
import type { AccessInfo } from "@/lib/access";
import { resolveBackTarget } from "@/lib/market-nav";
import { useCurrentHref } from "@/lib/useUrlState";

/** Native filter changes do not rerender the server's original account link. */
export default function FundsAccountBridge({ access }: { access: AccessInfo }) {
  const current = useCurrentHref();
  const returnTo = resolveBackTarget(current, { href: "/market/funds", label: "دیده‌بان صندوق‌ها" }).href;
  return <AccountBridge access={access} returnTo={returnTo}
    backTo={{ href: "/market", label: "برگشت به میز بازار" }} />;
}
