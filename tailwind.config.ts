import type { Config } from "tailwindcss";

/* Moink Tailwind Configuration
   Theme tokens live in src/app/globals.css via @theme — this is the v4 model.
   This file handles content source detection and any plugin additions.
   Design token reference: /design.json                                        */

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
};

export default config;
