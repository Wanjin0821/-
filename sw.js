const CACHE_NAME = "zhilian-quiz-v10";
const ASSETS = [
  "./",
  "./index.html",
  "./src/styles.css",
  "./src/app.js",
  "./src/questionBank.js",
  "./src/questionBank.json",
  "./src/recitationBank.js",
  "./src/recitation.js",
  "./src/recitation.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(
      ASSETS.map((url) => new Request(url, { cache: "reload" }))
    ))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME && /^(ai-power-quiz-|zhilian-quiz-)/.test(key))
        .map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
        return response;
      });
    })
  );
});
