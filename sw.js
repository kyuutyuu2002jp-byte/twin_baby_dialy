// ふたごノート Service Worker
// オフラインでもアプリの「見た目」だけは開けるように、最低限のファイルをキャッシュする。
// 記録データ自体はFirestore(オンライン)に保存されるため、オフライン時は記録の追加・閲覧はできない。

const CACHE_NAME = "twinlog-cache-v2";
const CACHE_FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_FILES))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  // ネットワーク優先、失敗したらキャッシュにフォールバック
  // (記録データの新しさを優先するため、キャッシュ優先にはしない)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 取得できたファイルはキャッシュを更新しておく(同一オリジンのみ)
        if (event.request.url.startsWith(self.location.origin)) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
