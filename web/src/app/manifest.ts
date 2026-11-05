import type { MetadataRoute } from 'next';
import { SHARE_ACCEPT, SHARE_PATH } from '@/lib/share-target';

// Makes the program installable and lets the phone's "Share" sheet send photos and PDFs straight to "Received documents".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'kontas.download',
    short_name: 'kontas',
    description: 'Buhalterinė apskaita ir sąskaitos faktūros',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#10b981',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    share_target: {
      action: SHARE_PATH,
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { files: [{ name: 'files', accept: SHARE_ACCEPT }] },
    },
  };
}
