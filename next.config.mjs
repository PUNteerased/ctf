/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  /* ปิด indicator ของ Next ใน dev (ไม่ให้ปุ่มโลโก้ลอยบัง UI เกม) */
  devIndicators: false,
}

export default nextConfig
