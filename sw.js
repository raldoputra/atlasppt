/* AtlasPPT service worker
 *
 * - File milik sendiri (halaman, gambar, template): jaringan dulu, cache sebagai cadangan offline.
 *   Jadi data seperti templates/index.json selalu yang terbaru saat online.
 * - Library CDN yang sudah dikunci versinya (jszip, utif, supabase-js, font): cache dulu, cepat dan hemat data.
 * - Selain itu (misalnya API Supabase untuk galeri, login admin): TIDAK disentuh sama sekali,
 *   langsung ke jaringan supaya data tidak basi dan token tidak tersimpan di cache.
 *
 * Naikkan VERSION setiap kali kamu mengubah isi website agar cache lama dibuang.
 */
const VERSION = 'atlasppt-v3';

const PRECACHE = [
  './',
  './index.html',
  './AtlasPPT-editor-update-1.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // Tiap file di-cache sendiri-sendiri supaya satu yang gagal tidak membatalkan semuanya.
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putInCache(req, res) {
  const copy = res.clone();
  caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => null);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const sameOrigin = url.origin === self.location.origin;
  const isCdn = CDN_HOSTS.includes(url.hostname);

  // Alamat lain (Supabase dll): biarkan browser mengurusnya langsung.
  if (!sameOrigin && !isCdn) return;

  // Library CDN: cache dulu, ambil dari jaringan kalau belum ada.
  if (isCdn) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          // res.type === 'opaque' terjadi pada <script> lintas-origin; tetap boleh disimpan.
          if (res && (res.ok || res.type === 'opaque')) putInCache(req, res);
          return res;
        });
      })
    );
    return;
  }

  // File sendiri: jaringan dulu, cache untuk offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) putInCache(req, res);
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('./index.html').then((h) => h || caches.match('./'));
          return Response.error();
        })
      )
  );
});
