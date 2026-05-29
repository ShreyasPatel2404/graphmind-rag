/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        fadeInUp: {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)"    },
        },
        progress: {
          "0%":   { width: "10%", marginLeft: "0%"   },
          "50%":  { width: "60%", marginLeft: "20%"  },
          "100%": { width: "10%", marginLeft: "90%"  },
        },
      },
      animation: {
        fadeInUp: "fadeInUp 0.2s ease",
        progress: "progress 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};