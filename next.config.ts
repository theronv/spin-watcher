/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable strict mode to avoid double-renders on slow hardware
  reactStrictMode: false,
  // SWC minification can produce code too modern for Android 4.2
  swcMinify: false,
  // Allow the image proxy to work without SSL issues
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig