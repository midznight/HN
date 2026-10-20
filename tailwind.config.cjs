/** Preserve the prototype palette while moving Tailwind to a local build. */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,css}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter"', "sans-serif"], serif: ['"Playfair Display"', "serif"] },
      colors: {
        brand: {
          50: "#FAF8F5", 100: "#F0EAE1", 200: "#E1D3C0", 300: "#D0BA9D",
          400: "#C0A079", 500: "#B28859", 600: "#A1724C", 700: "#85593F"
        },
        surface: { bg: "#FDFCFB", card: "#FFFFFF", dark: "#1C1C1E", muted: "#9CA3AF" }
      },
      boxShadow: { soft: "0 4px 20px rgba(0, 0, 0, 0.04)", float: "0 10px 40px -10px rgba(0, 0, 0, 0.1)" }
    }
  },
  plugins: []
};
