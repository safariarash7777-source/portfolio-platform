"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  PieChart,
  CreditCard,
  Mail,
  LineChart,
  Bell,
  Video,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import Logo from "@/components/ui/Logo";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  key: string;
  label: string;
  href?: string;
  icon: ReactNode;
  soon?: boolean;
};

const NAV: NavItem[] = [
  { key: "dashboard", label: "داشبورد", href: "/admin", icon: <LayoutDashboard size={18} /> },
  { key: "users", label: "کاربران", href: "/admin/users", icon: <Users size={18} /> },
  { key: "portfolio", label: "پرتفوی‌ها", href: "/admin/manage?tab=portfolio", icon: <PieChart size={18} /> },
  { key: "payments", label: "پرداخت‌ها", href: "/admin/manage?tab=payments", icon: <CreditCard size={18} /> },
  { key: "waitlist", label: "لیست انتظار", href: "/admin/manage?tab=waitlist", icon: <Mail size={18} /> },
  { key: "news", label: "اطلاعیه‌ها", href: "/admin/announcements", icon: <Bell size={18} /> },
  { key: "webinars", label: "وبینارها", href: "/admin/webinars", icon: <Video size={18} /> },
  { key: "market", label: "رصد بازار", icon: <LineChart size={18} />, soon: true },
];

export default function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") ?? "users";

  const isActive = (item: NavItem) => {
    if (item.soon) return false;
    if (item.key === "dashboard") return pathname === "/admin";
    if (item.key === "users") return pathname.startsWith("/admin/users");
    if (item.key === "news") return pathname.startsWith("/admin/announcements");
    if (item.key === "webinars") return pathname.startsWith("/admin/webinars");
    if (pathname.startsWith("/admin/manage")) {
      if (item.key === "portfolio") return tab === "portfolio";
      if (item.key === "payments") return tab === "payments";
      if (item.key === "waitlist") return tab === "waitlist";
    }
    return false;
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const NavList = () => (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = isActive(item);
        if (item.soon) {
          return (
            <div
              key={item.key}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium cursor-not-allowed"
              style={{ color: "var(--text-3)" }}
            >
              {item.icon}
              <span>{item.label}</span>
              <span
                className="mr-auto rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
              >
                به‌زودی
              </span>
            </div>
          );
        }
        return (
          <Link
            key={item.key}
            href={item.href!}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors"
            style={{
              background: active ? "var(--navy-deep)" : "transparent",
              color: active ? "var(--text-on-navy)" : "var(--text-2)",
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const SidebarInner = () => (
    <>
      <div className="px-3 py-5">
        <Logo size={40} showText textVariant="navy" />
      </div>
      <div className="flex-1 px-3 overflow-y-auto">
        <NavList />
      </div>
      <div className="px-3 py-4 border-t" style={{ borderColor: "var(--line)" }}>
        <p className="px-3 mb-2 text-[11px] truncate" dir="ltr" style={{ color: "var(--text-3)" }}>
          {userEmail}
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors"
          style={{ color: "var(--danger)" }}
        >
          <LogOut size={18} />
          خروج از حساب
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Mobile top bar */}
      <div
        className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-16 border-b"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="باز کردن منو"
          className="btn btn-ghost"
          style={{ padding: "0.5rem" }}
        >
          <Menu size={20} />
        </button>
        <Logo size={34} showText textVariant="navy" />
      </div>

      <div className="lg:flex">
        {/* Desktop sidebar (right in RTL) */}
        <aside
          className="hidden lg:flex lg:flex-col w-64 shrink-0 sticky top-0 h-screen border-l"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}
        >
          <SidebarInner />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-5 py-8 lg:px-8">{children}</main>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(15,23,42,0.5)" }}
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            className="absolute top-0 right-0 h-full w-72 flex flex-col shadow-xl"
            style={{ background: "var(--surface)" }}
            role="dialog"
            aria-label="منوی مدیریت"
          >
            <div className="flex justify-end p-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="بستن منو"
                className="btn btn-ghost"
                style={{ padding: "0.5rem" }}
              >
                <X size={20} />
              </button>
            </div>
            <SidebarInner />
          </aside>
        </div>
      )}
    </div>
  );
}
