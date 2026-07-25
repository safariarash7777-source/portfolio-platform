import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/**
 * ESLint flat config.
 *
 * چرا CLI و نه `next lint`: `next lint` منسوخ است و وقتی پیکربندیِ ESLint وجود
 * نداشته باشد یک prompt تعاملی می‌زند، پس در CI و در هر اجرای غیرتعاملی هنگ
 * می‌کند (بلاکرِ B-014). با این فایل و اسکریپتِ `eslint .`، لینت قابلِ اجرا در
 * CI است.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/**",
      "relay/**",
      "scripts/**/*.py",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // با `noUnusedLocals` در tsconfig هم‌پوشانی دارد؛ TypeScript منبعِ حقیقتِ
      // «متغیرِ بی‌استفاده» است تا دو ابزار دو حرفِ متفاوت نزنند.
      "no-unused-vars": "off",
    },
  },
];

export default config;
