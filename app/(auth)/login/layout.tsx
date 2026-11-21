import type { ReactNode } from "react";
import Link from "next/link";
import Logo from "@/components/ui/Logo";
import styles from "./Login.module.css";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.sheet}>
        <header className={styles.brand}>
          <Link href="/" aria-label="صفحهٔ اصلی آرش صفری">
            <Logo size={54} textVariant="light" />
          </Link>
        </header>
        <section className={styles.content}>{children}</section>
      </div>
    </main>
  );
}
