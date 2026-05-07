"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDark(isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "فعال‌سازی حالت روشن" : "فعال‌سازی حالت تیره"}
      className="btn btn-ghost"
      style={{ padding: "0.5rem", borderRadius: "10px" }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
