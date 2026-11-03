// 앱 화면만 저장해 두어 인터넷이 약해도 열리게 함 (공지 내용은 앱이 따로 기억) + 휴대폰 알림 받기
const CACHE = "class-v3", SHELL = ["./", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if(e.request.method !== "GET" || u.origin !== location.origin) return; // Firebase 요청은 그대로
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});

// 선생님이 개별 알림을 보내면 (앱이 닫혀 있어도) 알림으로 보여 줌
// 불러오지 못해도 화면 저장(오프라인)은 그대로 되게
try {
  importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js", "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");
  firebase.initializeApp({ apiKey:"AIzaSyCO4Mc-lGPDZWddX1E5WwAVFBh5ofc2cvc", authDomain:"gyomu-7e9e1.firebaseapp.com", projectId:"gyomu-7e9e1", messagingSenderId:"778560026907", appId:"1:778560026907:web:82f4dab5fcbe9fcc86fbbe" });
  firebase.messaging().onBackgroundMessage(() => {}); // 알림 내용은 FCM 이 알아서 띄움
} catch (e) { /* 알림만 안 됨 */ }
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type:"window", includeUncontrolled:true }).then(ws => { const w = ws.find(x => x.url.includes("/gyomu/class/")); return w ? w.focus() : clients.openWindow("./"); }));
});
