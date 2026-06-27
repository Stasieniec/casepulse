import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ink-and-parchment base
        ink: {
          DEFAULT: '#0B0E14', // app background (deep ink)
          panel: '#11151F', // panel surfaces
          raised: '#161B27', // hover / raised surface
          line: '#1E2533', // hairline borders
        },
        parchment: {
          DEFAULT: '#ECE7DA', // headings
          body: '#C7CCD6', // body copy
          muted: '#8A93A3', // muted / captions
        },
        gold: {
          DEFAULT: '#E0A86A', // refined molten gold (accent)
          deep: '#C8893F', // deeper amber (gradients / pressed)
          dim: '#9C7445', // muted gold for borders
        },
        // Semantic status colors (used everywhere via statusColor helper)
        status: {
          supported: '#2FBF8F', // well_supported — emerald
          contradicted: '#E5484D', // contradicted — serious crimson
          contested: '#E8A13A', // contested — amber
          gap: '#D9772B', // gap — burnt-orange
          unaddressed: '#5B6675', // unaddressed — slate
        },
      },
      fontFamily: {
        serif: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        label: '0.14em', // small-caps UI labels
      },
      borderRadius: {
        panel: '4px', // sharp, not bubbly
      },
      boxShadow: {
        // restrained — borders preferred over shadows
        popover: '0 18px 50px -20px rgba(0,0,0,0.75)',
      },
      keyframes: {
        'fade-rise': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.97) translateY(6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        // A claim "resolving" as it's adjudicated: the status tint settles in.
        'claim-resolve': {
          '0%': { backgroundColor: 'transparent', boxShadow: 'inset 0 -2px 0 transparent' },
          '100%': { backgroundColor: 'var(--claim-bg)', boxShadow: 'var(--claim-underline)' },
        },
        // Deep-linked claim emphasis: a brief ring pulse.
        'claim-pulse': {
          '0%, 100%': { boxShadow: 'var(--claim-underline), 0 0 0 0 transparent' },
          '35%': { boxShadow: 'var(--claim-underline), 0 0 0 4px var(--pulse-color)' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 0.4s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'pop-in': 'pop-in 0.18s cubic-bezier(0.16,1,0.3,1) both',
        'claim-resolve': 'claim-resolve 0.55s cubic-bezier(0.16,1,0.3,1) both',
        'claim-pulse': 'claim-pulse 0.9s ease-out 3',
      },
    },
  },
  plugins: [],
} satisfies Config
