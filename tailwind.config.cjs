module.exports = {
  // Use class strategy so toggling the `dark` class on the root element works
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
    './*.jsx'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
