import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  /** @type {import('tailwindcss').Config} */

  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: { extend: {} },
  plugins: [],

  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
