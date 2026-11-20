"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function MemberLogout() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function logout() {
    setPending(true);
    setFailed(false);
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      window.location.replace("/");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return <>
    <button type="button" className="btn btn-outline" onClick={logout} disabled={pending}>خروج</button>
    {failed && <p role="alert">خروج کامل نشد. دوباره تلاش کنید.</p>}
  </>;
}
