/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // File upload Excel dikirim lewat server action; batas bawaan 1 MB terlalu kecil
    serverActions: { bodySizeLimit: '20mb' },
  },
  // exceljs dipakai di server saja
  serverExternalPackages: ['exceljs'],
};
export default nextConfig;
