import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        background: {
          warm: '#E8E4DE',
          warmLight: '#F5F0E8',
          warmYellow: '#FFF8E7'
        },
        primary: {
          DEFAULT: '#1A1A1A'
        },
        accent: {
          yellow: '#F5D547'
        },
        text: {
          primary: '#1A1A1A',
          secondary: '#6B7280'
        }
      }
    }
  },
  plugins: []
};

export default config;

