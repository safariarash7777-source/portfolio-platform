/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1E3A8A",
          deep:    "#0D1F4A",
          soft:    "#2748A6",
        },
        gold: {
          DEFAULT: "#B8860B",
          soft:    "#D4A22B",
          light:   "#F5D07A",
          tint:    "#F5E6B8",
        },
        bg:      "#F8F7F4",
        surface: "#FFFFFF",
        cream:   "#F2F0E8",
        ink:     "#0F172A",
        muted:   "#64748B",
        line:    "#E5E3DC",
      },
      fontFamily: {
        display: ["var(--font-display)", "Vazirmatn", "Tahoma", "sans-serif"],
        body:    ["var(--font-body)", "Vazirmatn", "Tahoma", "sans-serif"],
      },
      boxShadow: {
        institutional: "0 12px 28px -8px rgba(23,37,84,0.18), 0 4px 8px -2px rgba(15,23,42,0.06)",
        ring: "0 0 0 3px rgba(30,58,138,0.18)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
    },
  },
  plugins: [],
};
