import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Google profile pictures (auth user_metadata.avatar_url).
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

export default nextConfig;
