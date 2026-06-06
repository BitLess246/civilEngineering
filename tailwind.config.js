/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan every page + the JS that emits markup so used utilities are kept.
  content: [
    './public/**/*.html',
    './public/assets/js/**/*.js',
  ],
  // Incremental adoption alongside the legacy styles1.css:
  //  • prefix `tw-`  → no collision with existing generic classes (container, …)
  //  • important     → tw- utilities win over the legacy high-specificity rules
  //  • preflight off → don't reset the existing element styles
  prefix: 'tw-',
  important: true,
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // Brand palette pulled from the existing UI for a consistent refresh.
        brand: {
          DEFAULT: '#0056b3',
          dark: '#003f86',
          light: '#e7f3ff',
        },
      },
    },
  },
  plugins: [],
};
