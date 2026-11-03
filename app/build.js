// 교무수첩 화면(apps-script/index.html)을 Firebase 버전(app/index.html)으로 만듦
// 화면 코드는 그대로 두고, 서버를 부르는 call() 한 줄만 Firebase 쪽(backend.js)으로 바꿈
// 쓰는 법: node app/build.js   (apps-script/index.html 을 고친 뒤 다시 실행)
const fs = require("fs"), path = require("path");
const src = path.join(__dirname, "..", "..", "apps-script", "index.html"), out = path.join(__dirname, "index.html");
let s = fs.readFileSync(src, "utf8");
const swap = (a, b) => { if (!s.includes(a)) throw new Error("못 찾음: " + a.slice(0, 60)); s = s.replace(a, b); };
swap("const call = (fn, ...args) => new Promise((res, rej) => google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](...args));",
  "const call = (fn, ...args) => window.fbCall(fn, ...args); // Firebase 버전 (backend.js)");
swap('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">\n<title>나의 교무수첩</title>');
const V = "10.14.1", head = [
  `<script src="https://www.gstatic.com/firebasejs/${V}/firebase-app-compat.js"></script>`,
  `<script src="https://www.gstatic.com/firebasejs/${V}/firebase-auth-compat.js"></script>`,
  `<script src="https://www.gstatic.com/firebasejs/${V}/firebase-firestore-compat.js"></script>`,
  `<script src="backend.js"></script>`,
  `<style>
#fbGate{position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:var(--desk)}
#fbGate .fbbox{background:var(--paper);border-radius:22px;padding:36px 32px;text-align:center;box-shadow:0 18px 40px -24px rgba(20,40,25,.35);max-width:340px}
#fbGate h1{color:var(--accent);margin:0 0 6px}#fbGate .fbmsg{color:var(--muted);margin:0 0 18px}
#fbImport{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:70;display:flex;gap:14px;align-items:center;max-width:min(640px,calc(100vw - 24px));
  padding:12px 14px 12px 18px;border-radius:16px;background:var(--forest);color:#fff;box-shadow:0 12px 30px -12px rgba(0,0,0,.45)}
#fbImport small{opacity:.8}#fbImport .btn{flex:none}
</style>`].join("\n");
swap('<script id="errTrap">', head + '\n<script id="errTrap">');
fs.writeFileSync(out, s);
console.log("만들었어요:", out, Math.round(s.length / 1024) + "KB");
