/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors'

export default {
  content: [
    "./client/index.html",
    "./client/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Remap the default 'blue' palette to Tailwind's 'orange' palette
      // so existing classes like `bg-blue-600` become orange without
      // changing component code.
      colors: {
        blue: colors.orange,
      },
    },
  },
  plugins: [],
}
