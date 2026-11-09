// 교무수첩 Firebase 버전의 '서버': Apps Script(Code.gs)와 같은 이름·같은 모양으로 답해서 화면 코드는 그대로 씀
// 자료는 선생님 구글 드라이브 '교무수첩' 폴더의 JSON 파일 하나에 저장 (Firebase 에는 두지 않음). 이 기기에도 한 부 두어 바로 열림
// 1단계: 자료 기능만. 드라이브가 필요한 것(파일 올리기·사진·시트 만들기·보관)은 2단계에서 이어짐
(function () {
  const FB = { apiKey: "AIzaSyCO4Mc-lGPDZWddX1E5WwAVFBh5ofc2cvc", authDomain: "gyomu-7e9e1.firebaseapp.com", projectId: "gyomu-7e9e1",
    storageBucket: "gyomu-7e9e1.firebasestorage.app", messagingSenderId: "778560026907", appId: "1:778560026907:web:82f4dab5fcbe9fcc86fbbe" };
  const OLD_SHEET = "18QiESGXlKZLdsTKEuegCWCwJagI-H6OGbnQyMbMztjs"; // 지금까지 쓰던 교무수첩 구글 시트 (가져오기용)
  // 드라이브·시트·휴대폰 알림은 '교무수첩 창구'(앱스 스크립트, 선생님 계정으로 돌아감)가 대신 부름 → 1시간마다 구글 확인 창이 안 뜸
  const PROXY = "https://script.google.com/macros/s/AKfycbxAVUJ_m3IAD84RWzttzXSuxY5LLsQwEzkkzwmYfmF-LEwLDO-khwgcrIJ2S8pNQ3E_GA/exec";
  firebase.initializeApp(FB);
  const auth = firebase.auth(), fs = firebase.firestore();

  const TABLES = ["cfg", "items", "events", "memos", "notes", "checks", "logs", "todos", "teachers", "classRosters", "attend", "pmsg", "evnotes"];
  const EMPTY = { cfg: {}, classRosters: {} };
  let uid = null, DB = null;
  try { localStorage.removeItem("gtok"); } catch (e) {} // 예전 1시간짜리 구글 열쇠 (이제 안 씀)
  const col = () => fs.collection("users").doc(uid).collection("data"); // 예전 저장 자리 (드라이브로 옮길 때 한 번 읽음)
  const get = t => DB[t] ?? (EMPTY[t] !== undefined ? structuredClone(EMPTY[t]) : []);
  // 표를 바꾸면 이 기기에 바로 두고, 드라이브 파일에는 잠시 모았다가 한 번에 씀
  // 두 기기(휴대폰·PC)에서 따로 고쳐도 사라지지 않게: 이 기기에서 바꾼 것만 기록해 두었다가, 저장할 때 드라이브의 최신본에 그것만 얹음
  // 표마다 줄을 찾는 열쇠 (열쇠가 없는 표는 표 통째로)
  const KEY = { items: r => r.id, notes: r => r.id, checks: r => r.id, todos: r => r.id, logs: r => r.date + "|" + r.period, evnotes: r => r.key, pmsg: r => r.id + "|" + r.no,
    memos: r => r.date, events: r => r.date + "|" + r.title + "|" + (r.cat || ""), attend: r => r.date + "|" + r.code + "|" + r.no };
  const freshPend = () => ({ t: {}, cfg: {} });
  let pend = freshPend(); // t[표] = true(통째로) 또는 { ch: {열쇠:1}, gone: {열쇠:1} }, cfg[설정 이름] = 1
  function track(p, t, old, v) {
    const J = x => JSON.stringify(x);
    if (t === "cfg") { const a = old || {}, b = v || {}; new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => { if (J(a[k]) !== J(b[k])) p.cfg[k] = 1; }); return; }
    if (p.t[t] === true) return;
    if (!KEY[t] || !Array.isArray(v) || !Array.isArray(old)) { p.t[t] = true; return; }
    const m = p.t[t] || (p.t[t] = { ch: {}, gone: {} }), om = new Map(old.map(r => [KEY[t](r), J(r)])), nk = new Set();
    v.forEach(r => { const k = KEY[t](r); nk.add(k); if (om.get(k) !== J(r)) { m.ch[k] = 1; delete m.gone[k]; } });
    om.forEach((_, k) => { if (!nk.has(k)) { m.gone[k] = 1; delete m.ch[k]; } });
  }
  // 드라이브 최신본(remote)에 이 기기에서 바꾼 것(p)만 얹은 새 자료
  function mergeTables(remote, local, p) {
    const out = { ...remote };
    Object.entries(p.t).forEach(([t, m]) => {
      if (m === true || !Array.isArray(remote[t])) { if (local[t] !== undefined) out[t] = local[t]; return; }
      const loc = new Map((local[t] || []).map(r => [KEY[t](r), r])), seen = new Set(), res = [];
      remote[t].forEach(r => { const k = KEY[t](r); seen.add(k); if (m.gone[k]) return; res.push(m.ch[k] && loc.has(k) ? loc.get(k) : r); });
      (local[t] || []).forEach(r => { const k = KEY[t](r); if (m.ch[k] && !seen.has(k)) res.push(r); });
      out[t] = res;
    });
    if (Object.keys(p.cfg).length) { const c = { ...(remote.cfg || {}) }, lc = local.cfg || {}; Object.keys(p.cfg).forEach(k => { if (k in lc) c[k] = lc[k]; else delete c[k]; }); out.cfg = c; }
    return out;
  }
  const joinPend = (a, b) => { const o = structuredClone(a); Object.entries(b.t).forEach(([t, m]) => { if (m === true || o.t[t] === true) o.t[t] = true; else { const x = o.t[t] || (o.t[t] = { ch: {}, gone: {} }); Object.assign(x.ch, m.ch); Object.assign(x.gone, m.gone); Object.keys(m.ch).forEach(k => delete x.gone[k]); Object.keys(m.gone).forEach(k => delete x.ch[k]); } }); Object.assign(o.cfg, b.cfg); return o; };
  window.__gyomuMerge = { mergeTables, track, freshPend, joinPend }; // 시험용
  async function put(t, v) { track(pend, t, DB[t], v); DB[t] = v; dirty = true; keepLocal(); saveSoon(); }
  const UP = "https://www.googleapis.com/upload/drive/v3/files";
  let fileId = null, fileVer = 0, dirty = false, saving = null, saveTimer = 0;
  const CACHE = () => "gyomuDB:" + uid;
  const keepLocal = () => { try { localStorage.setItem(CACHE(), JSON.stringify({ db: DB, ver: fileVer, dirty, pend })); } catch (e) {} };
  function saveSoon(ms = 600) { clearTimeout(saveTimer); saveTimer = setTimeout(() => flush().catch(e => {
    if (!/구글 확인/.test(e.message || "")) { window.say && window.say("구글 드라이브에 저장하지 못했어요. 30초 뒤 다시 저장해요."); saveSoon(30e3); } }), ms); }
  async function flush() {
    while (saving) await saving.catch(() => {});
    if (!dirty) return;
    saving = (async () => {
      const p = pend; pend = freshPend(); dirty = false;
      try {
        // 다른 기기가 그사이 저장했으면, 그 최신본에 이 기기에서 바꾼 것만 얹어서 저장 (덮어써서 지우지 않게)
        const id = await dataFile();
        if (id) { const ver = Number((await (await G(DRIVE + "/" + id + "?fields=version")).json()).version) || 0;
          if (ver !== fileVer) { const remote = ((await (await G(DRIVE + "/" + id + "?alt=media")).json()) || {}).tables || {};
            DB = mergeTables(remote, DB, joinPend(p, pend)); fileVer = ver; merged = true; } }
        await writeData(JSON.stringify({ app: "gyomu", v: 1, at: Date.now(), tables: DB }));
      } catch (e) { pend = joinPend(p, pend); dirty = true; throw e; } finally { keepLocal(); }
    })();
    try { await saving; } finally { saving = null; }
    if (merged) { merged = false; if (window.apply && readyDone) window.apply(getAll()); } // 다른 기기에서 넣은 것도 화면에
  }
  let merged = false, readyDone = false;
  // 드라이브의 자료 파일은 이름이 아니라 표시(appProperties)로 찾음 (이름을 바꿔도 됨)
  async function dataFile() { if (fileId) return fileId; const f = (await findOne("appProperties has { key='gyomu' and value='data' }"))[0]; return f ? (fileId = f.id) : null; }
  async function rootFolder() { const d = (DB.cfg || {}).drive || {}; if (d.root) return d.root; return ((await findOne("name='교무수첩' and mimeType='" + FOLDER + "' and 'root' in parents"))[0] || await makeFolder("교무수첩")).id; }
  async function driveJson(meta, body, id) {
    if (id) return (await G(UP + "/" + id + "?uploadType=media&fields=id,version", { method: "PATCH", headers: { "Content-Type": "application/json" }, body })).json();
    const bd = "gyomu" + Date.now();
    const mp = "--" + bd + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ mimeType: "application/json", ...meta }) + "\r\n--" + bd + "\r\nContent-Type: application/json\r\n\r\n" + body + "\r\n--" + bd + "--";
    return (await G(UP + "?uploadType=multipart&fields=id,version", { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + bd }, body: mp })).json();
  }
  async function writeData(body) {
    const id = await dataFile();
    const j = await driveJson({ name: "교무수첩 자료 (지우지 마세요).json", parents: [await rootFolder()], appProperties: { gyomu: "data" }, description: "나의 교무수첩이 저장하는 자료예요. 지우거나 고치지 마세요. 드라이브의 버전 기록에 지난 모습이 남아요." }, body, id);
    fileId = j.id; fileVer = Number(j.version) || 0;
  }
  async function readData() {
    const id = await dataFile(); if (!id) return null;
    const ver = Number((await (await G(DRIVE + "/" + id + "?fields=version")).json()).version) || 0;
    if (ver === fileVer && DB && Object.keys(DB).length) return { same: true, ver };
    return { tables: ((await (await G(DRIVE + "/" + id + "?alt=media")).json()) || {}).tables || {}, ver };
  }
  const cfgGet = k => get("cfg")[k] ?? null;
  async function cfgPut(patch) { const c = { ...get("cfg"), ...patch }; Object.keys(patch).forEach(k => { if (patch[k] === undefined) delete c[k]; }); await put("cfg", c); }

  // ---------- 로그인 ----------
  let readyRes; const ready = new Promise(r => { readyRes = r; });
  function gate(show, msg) {
    let g = document.getElementById("fbGate");
    if (!g) {
      g = document.createElement("div"); g.id = "fbGate";
      g.innerHTML = '<div class="fbbox"><h1>나의 교무수첩</h1><p class="fbmsg"></p><button type="button" class="btn" id="fbLogin">구글로 로그인</button>' +
        '<p class="fbalt" hidden><button type="button" class="btn ghost small" id="fbRedirect">이 창에서 로그인하기</button></p></div>';
      document.body.append(g);
      g.querySelector("#fbLogin").onclick = login;
      g.querySelector("#fbRedirect").onclick = () => auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
    }
    g.hidden = !show; g.querySelector(".fbmsg").textContent = msg || "선생님 구글 계정으로 들어가요.";
  }
  async function login() {
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    catch (e) {
      // 팝업이 막히면 이 창에서 구글 로그인 화면으로 넘어갔다 돌아오는 방법을 보여 줌
      const blocked = e.code === "auth/popup-blocked" || e.code === "auth/cancelled-popup-request" || e.code === "auth/popup-closed-by-user";
      gate(true, blocked ? "로그인 창(팝업)이 막혔어요. 주소창 오른쪽 끝의 팝업 차단 아이콘에서 '항상 허용'을 고르고 다시 누르거나, 아래 버튼을 눌러 주세요."
        : e.code === "auth/unauthorized-domain" ? "Firebase 승인된 도메인에 uzzint.github.io 가 없어요." : "로그인하지 못했어요: " + (e.message || e.code));
      document.querySelector("#fbGate .fbalt").hidden = false;
    }
  }
  // 이 창에서 로그인하고 돌아왔을 때 구글 열쇠 받기
  auth.getRedirectResult().catch(e => gate(true, "로그인하지 못했어요: " + (e.message || e.code)));
  auth.onAuthStateChanged(async u => {
    if (!u) { uid = null; gate(true); return; }
    uid = u.uid; gate(false);
    try { await load(); } catch (e) { await needGoogle(); }
    if (!DB.cfg) importBanner(); else if (!DB.cfg.archives) archiveBanner();
    readyRes(); readyDone = true;
    setTimeout(() => ensureFolders().then(autoSync), 2500); // 화면이 다 그려진 뒤 폴더 확인, 시트에서 고친 것 반영
  });
  // 이미 가져왔지만 지난 학년도 보관 시트를 아직 안 찾았을 때
  function archiveBanner() {
    const b = document.createElement("div"); b.id = "fbImport";
    b.innerHTML = '<div><b>지난 학년도 자료를 이어 둘까요?</b><br><small>드라이브의 “교무수첩 ○○학년도” 보관 시트를 찾아 설정 → 학기에 보여 줘요. 보관 시트는 그대로 남아요.</small></div><button type="button" class="btn">찾기</button>';
    document.body.append(b);
    const btn = b.querySelector("button");
    btn.onclick = async () => { btn.disabled = true; btn.textContent = "찾는 중…";
      try { const m = await findArchives(), ys = Object.keys(m).sort(); b.querySelector("div").innerHTML = "<b>" + (ys.length ? ys.join(", ") + "학년도 보관 시트를 찾았어요." : "보관 시트가 없어요. 지난 학년도 자료는 지금 교무수첩 안에 함께 있어요.") + "</b><br><small>설정 → 학기에서 고른 것만 불러올 수 있어요.</small>"; btn.textContent = "닫기"; btn.disabled = false; btn.onclick = () => location.reload(); }
      catch (e) { btn.disabled = false; btn.textContent = "다시 해 보기"; b.querySelector("small").textContent = e.message || String(e); } };
  }
  // 처음 들어왔을 때 (아직 아무것도 없음): 예전 구글 시트에서 한 번에 가져오기
  function importBanner() {
    const b = document.createElement("div"); b.id = "fbImport";
    b.innerHTML = '<div><b>예전 교무수첩(구글 시트) 자료를 가져올까요?</b><br><small>할 일·조·종례·일정·제출물·시간표·명렬표·출결·학생 명단을 옮겨요. 구글 시트는 그대로 남아요.</small></div><button type="button" class="btn">가져오기</button>';
    document.body.append(b);
    const btn = b.querySelector("button");
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = "가져오는 중…";
      try { const r = await importFromSheet(); b.querySelector("div").innerHTML = "<b>다 가져왔어요.</b><br><small>" + Object.entries(r.counts).map(([k, n]) => k + " " + n).join(" · ") + "</small>"; btn.textContent = "새로 고침"; btn.disabled = false; btn.onclick = () => location.reload(); }
      catch (e) { btn.disabled = false; btn.textContent = "다시 해 보기"; b.querySelector("small").textContent = e.message || String(e); }
    };
  }
  // 이 기기에 둔 것을 먼저 보여 주고, 드라이브에서 새로 받아 바뀌었으면 화면을 고침
  async function load() {
    let c = null; try { c = JSON.parse(localStorage.getItem(CACHE()) || "null"); } catch (e) {}
    if (c && c.db) { DB = c.db; fileVer = c.ver || 0; dirty = !!c.dirty; pend = c.pend && c.pend.t ? c.pend : freshPend(); if (dirty && !c.pend) TABLES.forEach(t => { pend.t[t] = true; }); if (dirty) saveSoon(); refreshFromDrive().catch(() => {}); return; }
    DB = {}; await refreshFromDrive(true);
  }
  async function refreshFromDrive(first) {
    const d = await readData();
    if (!d) { // 처음: 예전에 Firebase 에 있던 자료를 드라이브로 옮김 (Firebase 쪽은 그대로 둠, 나중에 따로 정리)
      const snap = await col().get(), old = {}; snap.forEach(x => { try { old[x.id] = JSON.parse(x.data().v); } catch (e) {} });
      if (Object.keys(old).length) { DB = { ...old, ...DB }; dirty = true; await flush(); window.say && window.say("교무수첩 자료를 구글 드라이브로 옮겼어요."); if (!first && window.apply) window.apply(getAll()); }
      return;
    }
    if (d.same) return;
    if (dirty || saving) { saveSoon(0); return; } // 이 기기에서 아직 저장 안 한 것이 있으면, 저장할 때 드라이브 최신본과 합침
    DB = d.tables; fileVer = d.ver; pend = freshPend(); keepLocal();
    if (!first && window.apply) window.apply(getAll());
  }
  // 다른 기기에서 고친 것: 이 창으로 돌아올 때 확인. 창을 떠날 때는 남은 것을 저장
  document.addEventListener("visibilitychange", () => { if (!uid) return; if (document.visibilityState === "visible") refreshFromDrive().catch(() => {}); else if (dirty) flush().catch(() => {}); });
  // 열어 둔 동안에도 15초마다 다른 기기에서 고친 것 확인 (창을 열었거나 입력 중이면 다음에)
  const busy = () => document.querySelector("dialog[open]") || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "");
  setInterval(() => { if (uid && readyDone && document.visibilityState === "visible" && !dirty && !saving && !busy()) refreshFromDrive().catch(() => {}); }, 15000);
  // 새로고침 단추: 이 기기에서 고친 것을 먼저 저장하고, 드라이브에서 새로 받아 화면을 다시 그림
  window.fbRefresh = async () => { await flush(); fileVer = -1; await refreshFromDrive(); };
  addEventListener("beforeunload", e => { if (dirty || saving) { flush().catch(() => {}); e.preventDefault(); e.returnValue = ""; } });
  // 이 기기에 둔 것이 없고 구글 확인도 끝났을 때: 단추를 눌러 드라이브에서 불러옴
  function needGoogle() {
    return new Promise(res => {
      gate(true, "교무수첩 자료는 선생님 구글 드라이브에 있어요. 아래를 눌러 불러와 주세요.");
      const b = document.getElementById("fbLogin"); b.textContent = "구글 드라이브에서 불러오기";
      b.onclick = async () => { try { await load(); gate(false); res(); } catch (e) { gate(true, "불러오지 못했어요: " + (e.message || e.code)); } };
    });
  }
  // ---------- 공통 정리 (Code.gs 와 같은 규칙) ----------
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TERM_RE = /^\d{4}-[12]$/, CLOTHS = ["navy", "green", "ochre", "wine", "slate"], AREA_IDS = ["subject", "class", "admin"];
  const S = (v, n) => String(v == null ? "" : v).slice(0, n);
  const uuid = () => crypto.randomUUID();
  const fail = m => { throw new Error(m); };
  const termOf = t => TERM_RE.test(String(t || "")) ? String(t) : "";
  const cleanFiles = list => (Array.isArray(list) ? list : []).slice(0, 10).filter(f => f && /^https:\/\/[^\s]+$/.test(String(f.url || "")))
    .map(f => ({ name: S(f.name || "파일", 200), url: String(f.url), fileId: S(f.fileId, 200) }));
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const normD = v => { const m = String(v || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m ? m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") : ""; };
  const daysAgo = n => ymd(new Date(Date.now() - n * 864e5));
  const areaIds = () => { const c = cfgGet("config"); return c && Array.isArray(c.areas) && c.areas.length ? c.areas.map(a => String(a.id)) : AREA_IDS; };
  const safeUrl = u => { const s = String(u || "").trim(); if (!/^https?:\/\/[^\s]+$/i.test(s)) fail("http:// 또는 https:// 로 시작하는 주소를 넣어 주세요."); return s; };
  function cleanBase(p) {
    const title = S(p.title, 100).trim(); if (!title) fail("제목을 적어 주세요.");
    if (areaIds().indexOf(p.area) < 0) fail("영역이 올바르지 않아요.");
    return { title, area: p.area, cat: S(p.cat, 40), note: S(p.note, 300).trim(), embed: p.embed === true, scope: (p.scope === "1" || p.scope === "2") ? p.scope : "" };
  }
  const T = /^([01]\d|2[0-3]):[0-5]\d$/;
  const cleanBells = l => Array.isArray(l) ? l.slice(0, 10).map(b => ({ s: T.test(b && b.s) ? b.s : "", e: T.test(b && b.e) ? b.e : "" })) : undefined;
  const cleanEvCats = l => { if (!Array.isArray(l)) return undefined; const seen = {};
    return l.slice(0, 12).map(c => ({ id: S(c && c.id, 40).replace(/[^\w-]/g, ""), name: S(c && c.name, 12).trim(), color: CLOTHS.indexOf(c && c.color) >= 0 ? c.color : "slate" }))
      .filter(c => c.id && c.name && !seen[c.id] && (seen[c.id] = true)); };
  const cleanPlanDays = o => { if (!o || typeof o !== "object") return undefined; const out = {};
    Object.keys(o).filter(k => DATE_RE.test(k) && (o[k] === "on" || o[k] === "off")).sort().slice(-300).forEach(k => { out[k] = o[k]; }); return out; };
  const SHEET_URL_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/[^\s]+$/;
  const cleanSources = s => { const out = {}; ["my", "class", "all", "events"].forEach(k => { if (s && SHEET_URL_RE.test(String(s[k] || ""))) out[k] = String(s[k]); }); return out; };
  const ttCells = (cells, rows) => (Array.isArray(cells) ? cells : []).slice(0, rows).map(r => (Array.isArray(r) ? r : []).slice(0, 5).map(v => S(v, 60)));
  const teacherCells = cells => Array.from({ length: 5 }, (_, d) => Array.from({ length: 10 }, (_, p) => S(cells && cells[d] && cells[d][p], 60)));
  const ATT_STATUS = ["", "결석", "지각", "조퇴", "결과", "기타"];

  // ---------- 읽기 ----------
  function getAll() {
    const t = daysAgo(60), lt = daysAgo(400), old = Date.now() - 60 * 864e5;
    const memos = {}, dues = {}, memoFiles = {};
    get("memos").forEach(m => { if (!DATE_RE.test(m.date)) return; if (m.text || (m.files || []).length || m.due) { memos[m.date] = m.text || ""; if (m.due) dues[m.date] = true; if ((m.files || []).length) memoFiles[m.date] = m.files; } });
    const teachers = get("teachers");
    return structuredClone({
      items: get("items"), config: cfgGet("config"), timetable: cfgGet("timetable"), kept: cfgGet("kept") || {}, ttTerm: cfgGet("ttTerm") || "",
      archives: Object.entries(cfgGet("archives") || {}).sort().reverse().map(([y, id]) => ({ year: Number(y), url: "https://docs.google.com/spreadsheets/d/" + id + "/edit" })),
      folder: (() => { const y = curYear(), id = ((cfgGet("drive") || {}).years || {})[y]; return id ? { year: y, url: "https://drive.google.com/drive/folders/" + id } : null; })(),
      links: driveLinks(),
      plans: cfgGet("plans") || {}, rosters: cfgGet("rosters") || {}, students: cfgGet("students") || [], classTT: cfgGet("classTT"),
      classRosters: get("classRosters"), allTT: teachers.length ? { periods: Number(cfgGet("periods")) || 7, teachers } : null, sheet: null,
      events: get("events"), memos, dues, memoFiles,
      // 학사일정 행사 하나마다 글·마감·사진·파일 ('날짜|행사 이름' 으로 찾음: 학사일정을 다시 불러와도 그대로 남게)
      evNotes: Object.fromEntries(get("evnotes").filter(n => n && n.key).map(n => [n.key, { text: n.text || "", due: !!n.due, files: n.files || [] }])),
      notes: get("notes").filter(n => n.date >= t), checks: get("checks").filter(c => !c.closed),
      logs: get("logs").filter(l => l.date >= lt && (l.text || l.lesson > 0 || (l.files || []).length)),
      todos: get("todos").filter(x => !x.done || x.createdAt >= old)
    });
  }
  // 표에서 id 로 찾아 바꾸기
  async function patchRow(t, id, fn) { const rows = get(t).slice(), i = rows.findIndex(r => String(r.id) === String(id)); if (i < 0) fail("항목을 찾지 못했어요. 새로 고침 해 주세요."); rows[i] = fn({ ...rows[i] }); await put(t, rows); }
  async function dropRow(t, id) { await put(t, get(t).filter(r => String(r.id) !== String(id))); }

  const API = {
    getAll,
    async saveTimetable(t) {
      const periods = Number(t && t.periods);
      if (!(periods >= 1 && periods <= 10) || !Array.isArray(t.cells) || t.cells.length !== periods) fail("시간표 형식이 올바르지 않아요.");
      const cells = t.cells.map(r => { if (!Array.isArray(r) || r.length !== 5) fail("시간표 형식이 올바르지 않아요."); return r.map(v => S(v, 50).trim()); });
      const overrides = {};
      Object.keys(t.overrides || {}).forEach(d => { const o = t.overrides[d]; if (!DATE_RE.test(d) || !o || typeof o !== "object") return;
        const c = {}; Object.keys(o).forEach(k => { if (/^\d+$/.test(k) && Number(k) < periods) c[k] = S(o[k], 50); }); if (Object.keys(c).length) overrides[d] = c; });
      await cfgPut({ timetable: { periods, cells, overrides } }); return getAll();
    },
    async addLink(p) { const b = cleanBase(p); await put("items", get("items").concat({ ...b, id: uuid(), kind: "link", url: safeUrl(p.url), fileId: "", fileName: "", size: 0, term: termOf(p.term), createdAt: Date.now(), pinned: false, body: "" })); return getAll(); },
    async addMemo(p) { const b = cleanBase(p); await put("items", get("items").concat({ ...b, id: uuid(), kind: "memo", url: "", fileId: "", fileName: "", size: 0, body: S(p.body, 2000).trim(), term: termOf(p.term), createdAt: Date.now(), pinned: false })); return getAll(); },
    async updateItem(p) { const b = cleanBase(p); await patchRow("items", p.id, o => { Object.assign(o, b); if (o.kind === "link" && p.url) o.url = safeUrl(p.url); if (o.kind === "memo" && "body" in p) o.body = S(p.body, 2000).trim(); return o; }); return getAll(); },
    async setPinned(id, on) { await patchRow("items", id, o => ({ ...o, pinned: on === true })); return getAll(); },
    async deleteItem(id) { await dropRow("items", id); return getAll(); }, // shortcut: 드라이브 파일은 아직 휴지통으로 안 보냄 (2단계)
    async removeArea(id, mode, target) {
      id = String(id);
      if (mode !== "delete" && (target === id || areaIds().indexOf(target) < 0)) fail("옮길 영역이 올바르지 않아요.");
      await put("items", get("items").flatMap(r => String(r.area) !== id ? [r] : mode === "delete" ? [] : [{ ...r, area: target, cat: "" }])); return getAll();
    },
    async saveConfig(cfg) {
      if (!cfg || !Array.isArray(cfg.areas) || cfg.areas.length < 1 || cfg.areas.length > 8) fail("영역은 1~8개여야 해요.");
      const seen = {}, carry = {};
      Object.keys(cfg.carry || {}).forEach(k => { if (TERM_RE.test(k) && Array.isArray(cfg.carry[k])) carry[k] = cfg.carry[k].filter(x => AREA_IDS.indexOf(x) >= 0); });
      const clean = { term: termOf(cfg.term), carry, homeroom: cfg.homeroom !== false, homeroomClass: S(cfg.homeroomClass, 10).trim(), sources: cleanSources(cfg.sources), attend: cfg.attend && typeof cfg.attend === "object" ? { url: SHEET_URL_RE.test(String(cfg.attend.url || "")) ? String(cfg.attend.url) : "", pos: Math.max(0, Math.min(9, Math.floor(Number(cfg.attend.pos)) || 0)), on: cfg.attend.on !== false, posSet: cfg.attend.posSet === true, name: S(cfg.attend.name, 12).trim(), msg_today: S(cfg.attend.msg_today, 300), msg_alert: S(cfg.attend.msg_alert, 300) } : undefined,
        evCats: cleanEvCats(cfg.evCats), bells: cleanBells(cfg.bells), offWork: T.test(String(cfg.offWork)) ? cfg.offWork : undefined, onWork: T.test(String(cfg.onWork)) ? cfg.onWork : undefined,
        planRange: cfg.planRange && DATE_RE.test(String(cfg.planRange.s)) && DATE_RE.test(String(cfg.planRange.e)) ? { s: cfg.planRange.s, e: cfg.planRange.e } : undefined,
        planDays: cleanPlanDays(cfg.planDays),
        areas: cfg.areas.map(a => {
          if (!/^[A-Za-z][\w-]{0,30}$/.test(String(a.id)) || seen[a.id]) fail("영역 형식이 올바르지 않아요."); seen[a.id] = true;
          const name = S(a.name, 12).trim(); if (!name) fail("영역 이름이 비어 있어요.");
          if (!Array.isArray(a.cats) || !a.cats.length || a.cats.length > 20) fail(name + ": 분류는 1~20개여야 해요.");
          const cats = a.cats.map(c => ({ id: S(c.id, 40), name: S(c.name, 20).trim() }));
          if (cats.some(c => !c.id || !c.name)) fail(name + ": 이름이 빈 분류가 있어요.");
          if (new Set(cats.map(c => c.name)).size !== cats.length) fail(name + ": 같은 이름의 분류가 있어요.");
          return { id: a.id, name, color: CLOTHS.indexOf(a.color) >= 0 ? a.color : "slate", cats };
        }) };
      Object.keys(clean).forEach(k => { if (clean[k] === undefined) delete clean[k]; });
      await cfgPut({ config: clean }); return getAll();
    },
    // 사라진 것 찾기: 자료 파일의 지난 버전(드라이브 버전 기록, 최근 것부터 25개)에 있었는데 지금은 없는 것
    async findLost(days) {
      const id = await dataFile(); if (!id) return [];
      const since = Date.now() - (Number(days) || 14) * 864e5;
      const revs = ((await (await G(DRIVE + "/" + id + "/revisions?fields=revisions(id,modifiedTime)&pageSize=200")).json()).revisions || [])
        .filter(r => Date.parse(r.modifiedTime) >= since).reverse().slice(0, 25); if (!revs.length) return [];
      const T = ["notes", "todos", "checks", "items"], now = {}, found = new Map();
      T.forEach(t => { now[t] = new Set(get(t).map(r => r.id)); });
      const out = await GM(revs.map(r => [DRIVE + "/" + id + "/revisions/" + r.id + "?alt=media", {}]), true, true);
      for (let i = 0; i < out.length; i++) {
        let tb = {}; try { if (out[i].ok) tb = ((await out[i].json()) || {}).tables || {}; } catch (e) {}
        T.forEach(t => (Array.isArray(tb[t]) ? tb[t] : []).forEach(r => { if (r && r.id && !now[t].has(r.id) && !found.has(t + r.id)) found.set(t + r.id, { table: t, rec: r, at: revs[i].modifiedTime }); }));
      }
      return [...found.values()];
    },
    async restoreLost(list) {
      const by = {}; (Array.isArray(list) ? list : []).forEach(x => { if (x && ["notes", "todos", "checks", "items"].includes(x.table) && x.rec && x.rec.id) (by[x.table] ||= []).push(x.rec); });
      for (const [t, recs] of Object.entries(by)) { const have = new Set(get(t).map(r => r.id)); await put(t, get(t).concat(recs.filter(r => !have.has(r.id)))); }
      return getAll();
    },
    // 학기가 바뀌면: 지금 시간표를 지난 학기 것으로 보관하고, 그대로 새 학기 시간표의 바탕으로 씀
    async rollTimetable(term) { term = termOf(term); if (!term) fail("학기가 올바르지 않아요."); const old = cfgGet("ttTerm"), kept = { ...(cfgGet("kept") || {}) };
      if (old && old !== term && cfgGet("timetable")) kept[old] = cfgGet("timetable");
      await cfgPut({ kept, ttTerm: term }); return getAll(); },
    async keepTimetable(term) { term = termOf(term); if (!term) fail("학기가 올바르지 않아요."); const kept = cfgGet("kept") || {}; if (cfgGet("timetable")) kept[term] = cfgGet("timetable"); await cfgPut({ kept }); return true; },
    async saveEvents(list) {
      if (!Array.isArray(list) || list.length > 1000) fail("학사일정이 너무 많아요.");
      await put("events", list.filter(e => e && DATE_RE.test(e.date) && String(e.title || "").trim()).map(e => ({ date: e.date, title: S(e.title, 40).trim(), cat: S(e.cat, 40) }))); return getAll();
    },
    async saveEvNote(date, title, text, due, files) {
      if (!DATE_RE.test(String(date))) fail("날짜가 올바르지 않아요."); title = S(title, 40).trim(); if (!title) fail("행사 이름이 없어요.");
      const key = date + "|" + title; text = S(text, 2000).trim(); files = cleanFiles(files);
      const rows = get("evnotes").filter(n => n.key !== key);
      if (text || files.length || due === true) rows.push({ key, date, title, text, due: due === true, files });
      await put("evnotes", rows); return getAll();
    },
    async saveMemo(date, text, due, files) {
      if (!DATE_RE.test(String(date))) fail("날짜가 올바르지 않아요.");
      text = S(text, 2000).trim(); files = cleanFiles(files);
      const rows = get("memos").filter(m => m.date !== date);
      if (text || files.length || due === true) rows.push({ date, text, due: due === true, files });
      await put("memos", rows); return getAll();
    },
    async addNote(n) {
      if (!n || !DATE_RE.test(String(n.date))) fail("날짜가 올바르지 않아요.");
      const text = S(n.text, 120).trim(); if (!text) fail("내용을 적어 주세요.");
      await put("notes", get("notes").concat({ id: uuid(), date: n.date, type: ["조회", "종례"].indexOf(n.type) >= 0 ? n.type : "", text, done: false, createdAt: Date.now(),
        detail: S(n.detail, 2000).trim(), share: n.share !== false, files: cleanFiles(n.files) })); return getAll();
    },
    async updateNote(id, p) { p = p || {}; await patchRow("notes", id, o => {
      if ("done" in p) o.done = !!p.done; if ("text" in p && String(p.text).trim()) o.text = S(p.text, 120).trim(); if ("detail" in p) o.detail = S(p.detail, 2000).trim();
      if ("share" in p) o.share = p.share !== false; if ("files" in p) o.files = cleanFiles(p.files); return o; }); return getAll(); },
    async deleteNote(id) { await dropRow("notes", id); return getAll(); },
    notesOn: date => DATE_RE.test(String(date)) ? structuredClone(get("notes").filter(n => n.date === date)) : [],
    searchNotes(q) { q = String(q || "").trim().toLowerCase(); if (!q) return []; return structuredClone(get("notes").filter(n => (n.text + " " + (n.detail || "")).toLowerCase().includes(q)).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 100)); },
    listNotes: () => structuredClone(get("notes").slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt).slice(0, 1500)),
    async addCheck(title, size) {
      size = Math.min(50, Math.max(1, Math.floor(Number(size) || 30))); title = S(title, 40).trim(); if (!title) fail("걷을 것의 이름을 적어 주세요.");
      await put("checks", get("checks").concat({ id: uuid(), title, size, done: [], closed: false, createdAt: Date.now(), due: "", files: [], memo: "", memoShare: true })); return getAll();
    },
    async updateCheck(id, p) { p = p || {}; await patchRow("checks", id, o => {
      o.size = Math.min(50, Math.max(1, Number(p.size) || o.size || 30));
      o.done = (Array.isArray(p.done) ? p.done : o.done || []).map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= o.size);
      o.closed = !!p.closed;
      if ("due" in p) o.due = DATE_RE.test(String(p.due)) ? p.due : ""; if ("files" in p) o.files = cleanFiles(p.files);
      if ("memo" in p) { o.memo = S(p.memo, 2000); o.memoShare = p.memoShare !== false; } return o; }); return getAll(); },
    async deleteCheck(id) { await dropRow("checks", id); return getAll(); },
    listChecks: () => structuredClone(get("checks").slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 500)),
    searchChecks(q) { q = String(q || "").trim().toLowerCase(); if (!q) return []; return structuredClone(get("checks").filter(c => c.title.toLowerCase().includes(q)).slice(0, 100)); },
    async saveLog(date, period, cls, text, lesson, done, files) {
      files = cleanFiles(files); lesson = Math.max(0, Math.min(300, Math.floor(Number(lesson) || 0))); done = done === true && lesson > 0;
      if (!DATE_RE.test(String(date)) || !(Number(period) >= 0 && Number(period) < 10)) fail("수업 기록 형식이 올바르지 않아요.");
      text = S(text, 300).trim(); cls = S(cls, 30).trim();
      const rows = get("logs").filter(l => !(l.date === date && Number(l.period) === Number(period)));
      if (text || lesson || files.length) rows.push({ date, period: Number(period), cls, text, lesson, done, files });
      await put("logs", rows); return getAll();
    },
    async addTodo(t) {
      const text = S(t && t.text, 60).trim(); if (!text) fail("할 일을 적어 주세요.");
      const area = areaIds().indexOf(String(t.area)) >= 0 ? String(t.area) : "";
      await put("todos", get("todos").concat({ id: uuid(), text, detail: S(t.detail, 2000).trim(), due: DATE_RE.test(String(t.due)) ? t.due : "", done: false, createdAt: Date.now(), area, cat: area ? S(t.cat, 40) : "", files: cleanFiles(t.files) })); return getAll();
    },
    async updateTodo(id, p) { p = p || {}; await patchRow("todos", id, o => {
      if ("text" in p && String(p.text).trim()) o.text = S(p.text, 60).trim(); if ("detail" in p) o.detail = S(p.detail, 2000).trim();
      if ("due" in p) o.due = DATE_RE.test(String(p.due)) ? p.due : ""; if ("done" in p) o.done = !!p.done; if ("files" in p) o.files = cleanFiles(p.files); return o; }); return getAll(); },
    async deleteTodo(id) { await dropRow("todos", id); return getAll(); },
    async savePlan(subject, lines) {
      subject = S(subject, 30).trim(); if (!subject) fail("과목 이름이 없어요.");
      const clean = (Array.isArray(lines) ? lines : []).map(s => S(s, 80).trim()).filter(Boolean).slice(0, 300), plans = { ...(cfgGet("plans") || {}) };
      if (clean.length) plans[subject] = clean; else delete plans[subject];
      await cfgPut({ plans }); return getAll();
    },
    async saveRoster(cls, r) {
      cls = S(cls, 30).trim(); if (!cls) fail("반 이름이 없어요.");
      const url = u => /^https:\/\/[^\s]+$/.test(String(u || "")) ? String(u) : "", all = { ...(cfgGet("rosters") || {}) };
      const v = { roster: url(r && r.roster), photo: url(r && r.photo), key: S(r && r.key, 30).replace(/[\s=+@'"<>]/g, "") };
      if (v.roster || v.photo || v.key) all[cls] = v; else delete all[cls];
      await cfgPut({ rosters: all }); return getAll();
    },
    async saveClassTT(t) { const cells = ttCells(t && t.cells, 10); if (!cells.length) fail("시간표가 비어 있어요."); await cfgPut({ classTT: { periods: cells.length, cells } }); return getAll(); },
    async saveAllTT(a) {
      const list = (a && Array.isArray(a.teachers) ? a.teachers : []).slice(0, 200).map(t => ({ name: S(t.name, 30).trim(), homeroom: S(t.homeroom, 10).trim(), cells: teacherCells(t.cells) })).filter(t => t.name);
      if (!list.length) fail("선생님 시간표가 비어 있어요.");
      await put("teachers", list); await cfgPut({ periods: Math.max(1, Math.min(10, Number(a.periods) || 7)) }); return getAll();
    },
    async saveClassRosters(list) {
      const clean = (Array.isArray(list) ? list : []).slice(0, 60).map(c => ({ code: S(c && c.code, 30).replace(/[\s=+@'"<>]/g, ""), subject: S(c && c.subject, 30).trim(), teacher: S(c && c.teacher, 20).trim(),
        students: (Array.isArray(c && c.students) ? c.students : []).slice(0, 80).map(s => ({ grade: S(s.grade, 2), cls: S(s.cls, 3), no: Math.floor(Number(s.no)) || 0, name: S(s.name, 20).trim(), photo: S(s.photo, 100).replace(/[^\w-]/g, "") })).filter(s => s.no > 0) })).filter(c => c.code);
      if (!clean.length) fail("명렬표가 비어 있어요.");
      const all = { ...get("classRosters") }; clean.forEach(c => { all[c.code] = { subject: c.subject, teacher: c.teacher, students: c.students }; });
      await put("classRosters", all); return getAll();
    },
    getAttend(code) { code = String(code || "").replace(/\s/g, ""); return structuredClone(get("attend").filter(r => r.code === code).map(r => ({ date: r.date, no: r.no, status: r.status, note: r.note }))); },
    async saveAttend(date, code, list) {
      code = String(code || "").replace(/\s/g, "");
      if (!(DATE_RE.test(String(date)) || date === "memo") || !code || code.length > 30) fail("날짜나 반이 올바르지 않아요.");
      const add = (Array.isArray(list) ? list : []).slice(0, 80).map(x => ({ date, code, no: Math.floor(Number(x && x.no)) || 0, status: ATT_STATUS.indexOf(String(x && x.status)) >= 0 ? String(x.status) : "", note: S(x && x.note, date === "memo" ? 1000 : 200).trim() }))
        .filter(x => x.no > 0 && (x.status || x.note));
      await put("attend", get("attend").filter(r => !(r.date === date && r.code === code)).concat(add)); return API.getAttend(code);
    },
    async saveStudents(list) {
      const seen = {}, phone = v => String(v || "").replace(/[^\d\-+ ]/g, "").trim().slice(0, 20);
      const clean = (Array.isArray(list) ? list : []).map(s => ({ no: Math.floor(Number(s && s.no)), name: S(s && s.name, 20).trim(), phone: phone(s && s.phone), note: S(s && s.note, 100).trim(),
        photo: S(s && s.photo, 100).replace(/[^\w-]/g, ""), memo: S(s && s.memo, 2000).trim(), files: cleanFiles(s && s.files).slice(0, 10),
        parents: (Array.isArray(s && s.parents) ? s.parents : []).slice(0, 3).map(p => ({ rel: S(p && p.rel, 10).trim(), phone: phone(p && p.phone) })).filter(p => p.phone) }))
        .filter(s => s.no >= 1 && s.no <= 50 && s.name && !seen[s.no] && (seen[s.no] = true)).sort((a, b) => a.no - b.no);
      await cfgPut({ students: clean }); return getAll();
    },
    // 알림 앱 쪽 (학생 계정 만들기·보내기는 3단계에서 학생 앱과 함께)
    noticeInfo() { const tt = cfgGet("studentTT") || {}, ttNames = {}; Object.keys(tt).forEach(no => { ttNames[no] = tt[no].name; }); const c = cfgGet("classPw");
      return { set: !!(c && c.hash), at: c ? c.at : 0, pw: { ...(cfgGet("stuPw") || {}) }, tt: ttNames, sheetUrl: "" }; },
    async setNoticePassword(pw) {
      pw = String(pw || "").trim(); if (pw.length < 4 || pw.length > 30) fail("비밀번호는 4~30자로 정해 주세요.");
      const salt = uuid(), buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pw));
      await cfgPut({ classPw: { salt, hash: [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""), at: Date.now() } }); return { set: true, at: Date.now() };
    },
    async setStudentPasswords(list) {
      if (!Array.isArray(list)) fail("목록이 없어요.");
      const pw = { ...(cfgGet("stuPw") || {}) };
      list.forEach(x => { const no = Number(x && x.no), v = String(x && x.pw || "").trim(); if (!(no >= 1 && no <= 99)) return;
        if (v && (v.length < 4 || v.length > 30)) fail(no + "번 비밀번호는 4~30자로 정해 주세요."); if (v) pw[no] = v; else delete pw[no]; });
      await cfgPut({ stuPw: pw }); return API.noticeInfo();
    },
    async saveStudentTT(map) {
      const clean = {}; Object.keys(map || {}).forEach(k => { const no = Number(k), o = map[k]; if (!(no >= 1 && no <= 99) || !o || !Array.isArray(o.cells)) return;
        clean[no] = { name: S(o.name, 20), cells: o.cells.slice(0, 10).map(r => (Array.isArray(r) ? r : []).slice(0, 5).map(v => S(v, 80))) }; });
      await cfgPut({ studentTT: clean }); return API.noticeInfo();
    },
    async sendStudentMessages(nos, text) {
      text = S(text, 1000).trim(); nos = (Array.isArray(nos) ? nos : []).map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= 99);
      if (!text) fail("보낼 말을 적어 주세요."); if (!nos.length) fail("받을 학생을 골라 주세요.");
      const id = uuid(), at = Date.now(); await put("pmsg", get("pmsg").concat(nos.map(no => ({ id, no, text, at })))); return API.listStudentMessages();
    },
    listStudentMessages() { const by = {}; get("pmsg").forEach(r => { (by[r.id] = by[r.id] || { id: r.id, text: r.text, at: r.at, nos: [] }).nos.push(r.no); }); return Object.values(by).sort((a, b) => b.at - a.at).slice(0, 200); },
    async deleteStudentMessage(id) { await put("pmsg", get("pmsg").filter(r => r.id !== id)); return API.listStudentMessages(); },
    // 지난 구글 시트에서 한 번에 옮겨 오기
    importFromSheet
  };

  // ---------- 구글 드라이브·시트 (로그인할 때 받은 구글 열쇠로 바로 부름) ----------
  // 창구에 부탁: 로그인 확인증(저절로 새로 받아짐) + 부를 주소·내용. 답은 보통 fetch 답 모양으로 돌려줌
  const reqOf = async (url, opts = {}) => { const body = opts.body;
    return { url, method: opts.method || "GET", headers: opts.headers || {}, b64: body == null ? null : bytesToB64(typeof body === "string" ? new TextEncoder().encode(body) : await new Response(body).arrayBuffer()) }; };
  const respOf = j => new Response([0, 204, 205, 304].includes(j.status) ? null : b64ToBytes(j.b64 || ""), { status: j.status || 599, headers: { "Content-Type": j.type || "" } });
  async function proxy(body) {
    const id = await auth.currentUser.getIdToken();
    let r; try { r = await fetch(PROXY, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ id, ...body }) }); }
    catch (e) { fail("인터넷 연결을 확인해 주세요."); }
    let j = null; try { j = await r.json(); } catch (e) { fail("교무수첩 창구가 아직 준비되지 않았어요. (권한 허용을 했는지 확인해 주세요)"); }
    if (j.error) fail(j.error === "auth" ? "선생님 로그인을 확인하지 못했어요. 새로 고침해 주세요." : "교무수첩 창구: " + j.error);
    return j;
  }
  const GX = async (url, opts) => respOf(await proxy(await reqOf(url, opts)));
  async function okR(r) { if (!r.ok) { let m = ""; try { m = (await r.json()).error.message; } catch (e) {} fail("구글 드라이브·시트에서 거절했어요 (" + r.status + ") " + m); } return r; }
  const G = async (url, opts) => okR(await GX(url, opts));
  // 여러 개를 창구 한 번에: [[주소, 옵션], ...]. 차례로(하나 실패하면 멈춤) 또는 parallel 이면 한꺼번에. 실패가 있으면 그 이유로 멈춤
  async function GM(list, parallel, raw) { // raw: 실패해도 멈추지 않고 답을 그대로 (휴대폰 알림처럼 하나씩 따질 때)
    const rs = (await proxy({ many: await Promise.all(list.map(([u, o]) => reqOf(u, o))), parallel: !!parallel })).many.map(respOf);
    if (!raw) for (const r of rs) if (r.status) await okR(r.clone());
    return rs;
  }
  const DRIVE = "https://www.googleapis.com/drive/v3/files", SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
  const FOLDER = "application/vnd.google-apps.folder";
  const q = s => encodeURIComponent(s);
  async function findOne(query) { const j = await (await G(DRIVE + "?q=" + q(query + " and trashed=false") + "&fields=files(id,name,webViewLink)&pageSize=20&orderBy=createdTime")).json(); return j.files || []; }
  async function makeFolder(name, parent) { return (await G(DRIVE + "?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined }) })).json(); }
  const curYear = () => { const t = termOf(cfgGet("config") && cfgGet("config").term); if (t) return Number(t.slice(0, 4)); const d = new Date(); return d.getMonth() + 1 <= 2 ? d.getFullYear() - 1 : d.getFullYear(); };
  // 영역 폴더: 2026학년도 › 교과 / 학급 / 행정 (영역 이름은 설정의 이름을 따름)
  const AREA_NAMES = { subject: "교과", class: "학급", admin: "행정" };
  const areaName = id => { const a = ((cfgGet("config") || {}).areas || []).find(x => x.id === id); return S((a && a.name) || AREA_NAMES[id] || "", 30).replace(/['\\/]/g, " ").trim(); };
  async function areaFolder(id, year) {
    const name = areaName(id); if (!name) return yearFolder(year);
    const y = year || curYear(), d = { ...(cfgGet("drive") || {}) }, key = y + ":" + id;
    if (d.areas && d.areas[key]) return d.areas[key];
    const parent = await yearFolder(y);
    const f = ((await findOne("name='" + name + "' and mimeType='" + FOLDER + "' and '" + parent + "' in parents"))[0] || await makeFolder(name, parent)).id;
    const d2 = { ...(cfgGet("drive") || {}) }; d2.areas = { ...(d2.areas || {}), [key]: f }; await cfgPut({ drive: d2 }); return f;
  }
  // 학기 초 입력 탭은 영역마다 시트 하나: 교과(내 시간표·전체 교사 시간표), 학급(우리 반 시간표·학생 명단), 행정(학사일정)
  const AREA_OF_KEY = { my: "subject", all: "subject", class: "class", students: "class", events: "admin" };
  async function inputBookFor(key) {
    const area = AREA_OF_KEY[key], books = cfgGet("inputBooks") || {};
    if (books[area]) return books[area];
    const y = curYear(), ss = await (await G(SHEETS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties: { title: "교무수첩 " + y + "학년도 " + areaName(area) + " 입력" } }) })).json();
    await moveTo(ss.spreadsheetId, await areaFolder(area, y)).catch(() => {});
    await cfgPut({ inputBooks: { ...(cfgGet("inputBooks") || {}), [area]: ss.spreadsheetId } });
    return ss.spreadsheetId;
  }
  // 내 드라이브 › 교무수첩 › 2026학년도 (예전 교무수첩이 만든 폴더를 그대로 씀)
  async function yearFolder(year) {
    const y = year || curYear(), d = { ...(cfgGet("drive") || {}) };
    if (d.years && d.years[y]) return d.years[y];
    if (!d.root) d.root = ((await findOne("name='교무수첩' and mimeType='" + FOLDER + "' and 'root' in parents"))[0] || await makeFolder("교무수첩")).id;
    const id = ((await findOne("name='" + y + "학년도' and mimeType='" + FOLDER + "' and '" + d.root + "' in parents"))[0] || await makeFolder(y + "학년도", d.root)).id;
    d.years = { ...(d.years || {}), [y]: id }; await cfgPut({ drive: d }); return id;
  }
  const b64ToBytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const bytesToB64 = buf => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  // 학사일정에 올린 사진·파일: 올해 폴더 › '학사일정 자료' (없으면 만듦, 한 번 찾으면 기억)
  async function eventsFolder() {
    const y = curYear(), d = { ...(cfgGet("drive") || {}) }; if (d.events && d.events[y]) return d.events[y];
    const yf = await yearFolder(y), id = ((await findOne("name='학사일정 자료' and mimeType='" + FOLDER + "' and '" + yf + "' in parents"))[0] || await makeFolder("학사일정 자료", yf)).id;
    const d2 = { ...(cfgGet("drive") || {}) }; d2.events = { ...(d2.events || {}), [y]: id }; await cfgPut({ drive: d2 }); return id;
  }
  async function driveUpload(p) {
    const name = S(p.name, 200).trim(); if (!name) fail("파일 이름이 없어요.");
    const bytes = b64ToBytes(String(p.data || "")); if (!bytes.length) fail("빈 파일은 올릴 수 없어요."); if (bytes.length > 20 * 1024 * 1024) fail("20MB보다 큰 파일은 올릴 수 없어요.");
    const meta = { name, parents: [p.folder === "events" ? await eventsFolder() : p.area ? await areaFolder(String(p.area)) : await yearFolder()] }, type = String(p.type || "") || "application/octet-stream";
    const body = new Blob(["--b\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n--b\r\nContent-Type: " + type + "\r\n\r\n", bytes, "\r\n--b--"]);
    const f = await (await G("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", { method: "POST", headers: { "Content-Type": "multipart/related; boundary=b" }, body })).json();
    return { name, url: f.webViewLink, fileId: f.id, size: bytes.length };
  }
  const trash = id => id ? G(DRIVE + "/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }).catch(() => {}) : null; // 휴지통으로만 (30일 동안 되살릴 수 있음)
  const sheetId = url => { const m = String(url || "").match(/\/d\/([\w-]{20,})/); if (!m) fail("구글 시트 주소가 올바르지 않아요."); return m[1]; };
  async function tabsOf(id) { return ((await (await G(SHEETS + "/" + id + "?fields=sheets.properties(sheetId,title)")).json()).sheets || []).map(s => s.properties); }
  async function batchGet(id, ranges, render) {
    const u = SHEETS + "/" + id + "/values:batchGet?valueRenderOption=" + (render || "UNFORMATTED_VALUE") + "&dateTimeRenderOption=FORMATTED_STRING&" + ranges.map(r => "ranges=" + q(r)).join("&");
    return ((await (await G(u)).json()).valueRanges || []).map(v => v.values || []);
  }
  // 학기 초 세팅에 쓰는 입력 탭: 예전 교무수첩 시트 안에 그대로 둠
  const INPUT_TABS = {
    my: { name: "입력_내시간표", head: [["※ 교시마다 두 줄: 위 칸은 교과, 아래 칸은 교실(반)이에요. 교사 시간표를 그대로 붙여 넣어도 돼요."], [], ["교시", "월", "화", "수", "목", "금"]], rows: 7, pair: true },
    class: { name: "입력_우리반시간표", head: [["※ 교시마다 두 줄: 위 칸은 과목, 아래 칸은 선생님이에요. 학반 시간표를 그대로 붙여 넣어도 돼요."], [], ["교시", "월", "화", "수", "목", "금"]], rows: 7, pair: true },
    all: { name: "입력_전체교사시간표", head: [["※ 학교 전체 교사 시간표를 A3 칸부터 그대로 붙여 넣으세요 (요일 줄, 교시 번호 줄, 선생님 줄)."]] },
    events: { name: "입력_학사일정", head: [["※ 한 줄에 하루씩. 기간은 2026.10.28~2026.10.30 처럼 써요."], [], ["날짜", "요일", "행사", "비고"]] },
    students: { name: "입력_학생명단", head: [["※ 한 줄에 학생 한 명. 쓰지 않는 칸은 비워 두세요. 이 탭은 나만 볼 수 있어요."], [], ["번호", "이름", "학생 연락처", "보호자1 관계", "보호자1 연락처", "보호자2 관계", "보호자2 연락처", "비고"]] }
  };
  async function inputTab(key) {
    const def = INPUT_TABS[key]; if (!def) fail("없는 입력 탭이에요.");
    const book = await inputBookFor(key); let t = (await tabsOf(book)).find(s => s.title === def.name);
    if (!t) {
      const r = await (await G(SHEETS + "/" + book + ":batchUpdate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: def.name, gridProperties: { frozenRowCount: def.head.length } } } }] }) })).json();
      t = r.replies[0].addSheet.properties;
      const rows = def.head.map(r => r.length ? r : [""]);
      if (def.rows) for (let i = 0; i < def.rows * (def.pair ? 2 : 1); i++) rows.push([def.pair ? (i % 2 ? "" : String(i / 2 + 1)) : String(i + 1)]);
      // 예전 교무수첩 시트에 같은 입력 탭이 있으면 그 내용을 옮겨 옴 (한 번만)
      let old = null; try { if ((await tabsOf(OLD_SHEET)).some(x => x.title === def.name)) old = (await batchGet(OLD_SHEET, ["'" + def.name + "'!A1:CB400"], "FORMATTED_VALUE"))[0]; } catch (e) {}
      await G(SHEETS + "/" + book + "/values/" + q("'" + def.name + "'!A1") + "?valueInputOption=RAW", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: old && old.length > def.head.length ? old : rows }) });
      // 새 시트에 처음 생기는 빈 탭(시트1)은 지움
      const blank = (await tabsOf(book)).filter(x => x.sheetId !== t.sheetId && /^(Sheet|시트)\d+$/.test(x.title));
      if (blank.length) await G(SHEETS + "/" + book + ":batchUpdate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requests: blank.map(x => ({ deleteSheet: { sheetId: x.sheetId } })) }) }).catch(() => {});
    }
    return "https://docs.google.com/spreadsheets/d/" + book + "/edit#gid=" + t.sheetId;
  }
  Object.assign(API, {
    async uploadFile(p) { const b = cleanBase(p), f = await driveUpload(p);
      await put("items", get("items").concat({ ...b, id: uuid(), kind: "file", term: termOf(p.term), url: f.url, fileId: f.fileId, fileName: f.name, size: f.size, createdAt: Date.now(), pinned: false, body: "" })); return getAll(); },
    async uploadNoteFile(p) { const f = await driveUpload(p); return { name: f.name, url: f.url, fileId: f.fileId }; },
    async deleteItem(id) { const it = get("items").find(r => String(r.id) === String(id)); if (it && it.fileId) await trash(it.fileId); await dropRow("items", id); return getAll(); },
    async getStudentPhoto(id) {
      id = String(id || ""); const safe = id.replace(/[^\w-]/g, "");
      const ok = id && ((cfgGet("students") || []).some(s => s.photo === id) || JSON.stringify(get("classRosters")).indexOf('"photo":"' + safe + '"') >= 0);
      if (!ok) fail("사진을 찾지 못했어요.");
      const r = await G(DRIVE + "/" + safe + "?alt=media"), type = r.headers.get("Content-Type") || "";
      if (!/^image\//.test(type)) fail("사진 파일이 아니에요.");
      return "data:" + type + ";base64," + bytesToB64(await r.arrayBuffer());
    },
    async driveFileB64(url) {
      const id = sheetId(url), m = await (await G(DRIVE + "/" + id + "?fields=mimeType,size")).json();
      if (!/spreadsheetml|ms-excel|text\/csv/.test(m.mimeType)) fail("엑셀 파일이 아니에요."); if (Number(m.size) > 20 * 1024 * 1024) fail("파일이 너무 커요.");
      return bytesToB64(await (await G(DRIVE + "/" + id + "?alt=media")).arrayBuffer());
    },
    // 연결한 구글 시트의 모든 탭을 보이는 그대로(글자) 읽음
    async readSheet(url) {
      if (!SHEET_URL_RE.test(String(url || ""))) fail("구글 시트 주소가 올바르지 않아요.");
      const id = sheetId(url), tabs = (await tabsOf(id)).slice(0, 10);
      return (await batchGet(id, tabs.map(t => "'" + t.title + "'!A1:CB400"), "FORMATTED_VALUE")).map(rows => rows.map(r => r.map(v => String(v ?? ""))));
    },
    async makeRosterSheet(title, rows) {
      title = S(title || "명렬표", 80).replace(/[\\/:*?"<>|]/g, " ").trim() || "명렬표";
      const data = (Array.isArray(rows) ? rows : []).slice(0, 200).map(r => (Array.isArray(r) ? r : []).slice(0, 8).map(v => S(v, 60)));
      if (data.length < 2) fail("명단이 비어 있어요.");
      const ss = await (await G(SHEETS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties: { title }, sheets: [{ properties: { gridProperties: { frozenRowCount: 2 } } }] }) })).json();
      await G(SHEETS + "/" + ss.spreadsheetId + "/values/A1?valueInputOption=RAW", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: data }) });
      await moveTo(ss.spreadsheetId, await areaFolder("subject")).catch(() => {}); // 명렬표 시트는 교과 폴더로
      return { url: ss.spreadsheetUrl };
    },
    // 양식 파일: 예전 교무수첩이 만들어 둔 '교무수첩 › 양식' 폴더의 파일
    async templateUrl(name) {
      const f = (await findOne("name='" + String(name).replace(/'/g, "\\'") + "' and not mimeType='" + FOLDER + "'"))[0];
      if (!f) fail("양식 파일을 드라이브에서 찾지 못했어요. 예전 교무수첩에서 한 번 [양식]을 눌러 만들어 두면 여기서도 받을 수 있어요.");
      return "https://drive.google.com/uc?export=download&id=" + f.id;
    },
    inputTab,
    async readInputTab(key) {
      const def = INPUT_TABS[key]; if (!def) fail("없는 입력 탭이에요.");
      if (!(await tabsOf(await inputBookFor(key))).some(s => s.title === def.name)) await inputTab(key);
      const rows = await readTab(key); await keepHash({ [key]: hash(rows) }); return [rows];
    },
    // 엑셀을 올리면 그 내용을 입력 탭에도 그대로 적어 둠 (시트에서 고쳐도 같은 자료)
    async writeInputTab(key, rows) {
      const def = INPUT_TABS[key]; if (!def) fail("없는 입력 탭이에요.");
      const data = (Array.isArray(rows) ? rows : []).slice(0, 400).map(r => (Array.isArray(r) ? r : []).slice(0, 80).map(v => S(v, 500)));
      await inputTab(key);
      const book = await inputBookFor(key), w = Math.max(1, ...data.map(r => r.length));
      await G(SHEETS + "/" + book + "/values/" + q("'" + def.name + "'") + ":clear", { method: "POST" });
      await G(SHEETS + "/" + book + "/values/" + q("'" + def.name + "'!A1") + "?valueInputOption=RAW", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: data.map(r => r.concat(Array(w - r.length).fill(""))) }) });
      await keepHash({ [key]: hash(await readTab(key)) }); return true;
    },
    // 지난 학년도 보관 시트('교무수첩 2025학년도')에서 고른 것만 가져옴 (보관 시트는 그대로)
    async importFromArchive(year, parts) {
      year = Number(year); const id = (cfgGet("archives") || {})[year]; if (!id) fail(year + "학년도 보관 시트가 없어요.");
      parts = Array.isArray(parts) ? parts.map(String) : []; if (!parts.length) fail("불러올 것을 골라 주세요.");
      const a = await parseBook(id), has = p => parts.indexOf(p) >= 0, patch = {};
      if (has("timetable") && a.cfg.timetable) patch.timetable = a.cfg.timetable;
      if (has("plans") && Object.keys(a.cfg.plans).length) patch.plans = a.cfg.plans;
      if (has("classTT") && a.cfg.classTT) patch.classTT = a.cfg.classTT;
      if (has("students")) { if (a.cfg.students.length) patch.students = a.cfg.students; if (Object.keys(a.cfg.rosters).length) patch.rosters = a.cfg.rosters;
        if (a.meta && a.meta.homeroomClass && cfgGet("config")) patch.config = { ...cfgGet("config"), homeroomClass: a.meta.homeroomClass }; }
      if (has("allTT") && a.teachers.length) { patch.periods = a.cfg.periods; await put("teachers", a.teachers); }
      if (Object.keys(patch).length) await cfgPut(patch);
      if (has("classRosters") && Object.keys(a.classRosters).length) await put("classRosters", a.classRosters);
      if (has("events") && a.events.length) await put("events", a.events);
      const term = termOf(cfgGet("config") && cfgGet("config").term);
      if (has("items")) { const ids = new Set(get("items").map(r => r.id)); await put("items", get("items").concat(a.items.filter(r => !ids.has(r.id)).map(r => ({ ...r, term })))); }
      if (has("todos")) { const ids = new Set(get("todos").map(r => r.id)); await put("todos", get("todos").concat(a.todos.filter(r => !r.done && !ids.has(r.id)))); }
      return getAll();
    },
    findArchives
  });
  // ---------- 입력 탭 ↔ 교무수첩 (시트에서 고친 것을 열 때 알아서 반영) ----------
  const readTab = async key => (await batchGet(await inputBookFor(key), ["'" + INPUT_TABS[key].name + "'!A1:CB400"], "FORMATTED_VALUE"))[0].map(r => r.map(v => String(v ?? "")));
  const hash = rows => { const s = JSON.stringify(rows.map(r => { const c = r.slice(); while (c.length && c[c.length - 1] === "") c.pop(); return c; }).filter(r => r.length)); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return s.length + ":" + h; };
  const keepHash = p => cfgPut({ inputHash: { ...(cfgGet("inputHash") || {}), ...p } });
  // 설정 맨 아래 바로 열기: 영역 폴더 · 학기 초 입력 시트 · 처음 쓰던 교무수첩 시트
  function driveLinks() {
    const y = curYear(), d = cfgGet("drive") || {}, books = cfgGet("inputBooks") || {}, ids = ((cfgGet("config") || {}).areas || []).map(a => a.id);
    const folder = id => "https://drive.google.com/drive/folders/" + id, sheet = id => "https://docs.google.com/spreadsheets/d/" + id + "/edit";
    return [
      { label: "영역 폴더", links: ids.filter(id => d.areas && d.areas[y + ":" + id]).map(id => ({ name: areaName(id), url: folder(d.areas[y + ":" + id]) })) },
      { label: "학기 초 입력 시트", links: Object.keys(books).map(id => ({ name: areaName(id) + " 입력", url: sheet(books[id]) })) },
      { label: "처음 쓰던 교무수첩 시트", links: cfgGet("legacyMoved") ? [] : [{ name: "예전 교무수첩 데이터 열기", url: sheet(OLD_SHEET) }] }
    ];
  }
  // 열 때 올해 폴더와 영역 폴더가 없으면 만들어 둠 (구글 열쇠가 살아 있을 때만)
  async function ensureFolders() {
    const before = JSON.stringify(cfgGet("drive") || {});
    try { await yearFolder(); for (const a of ((cfgGet("config") || {}).areas || [])) await areaFolder(a.id); } catch (e) { return; }
    if (JSON.stringify(cfgGet("drive") || {}) !== before && window.apply) window.apply(getAll());
  }
  // 구글 열쇠가 살아 있을 때만 (창을 띄우지 않음). 처음엔 지금 모양만 기억하고, 그 뒤 바뀐 탭만 다시 넣음
  async function autoSync() {
    if (typeof window.importRows !== "function") return;
    try {
      // 이미 만든 영역 입력 시트만 읽음 (없는 시트를 새로 만들지 않음)
      const books = cfgGet("inputBooks") || {}, keys = Object.keys(INPUT_TABS).filter(k => books[AREA_OF_KEY[k]]);
      if (!keys.length) return;
      const seen = cfgGet("inputHash") || {}, next = {}, done = [], got = {};
      for (const id of [...new Set(keys.map(k => books[AREA_OF_KEY[k]]))]) {
        const ks = keys.filter(k => books[AREA_OF_KEY[k]] === id), have = new Set((await tabsOf(id)).map(t => t.title)), ok = ks.filter(k => have.has(INPUT_TABS[k].name));
        if (!ok.length) continue;
        (await batchGet(id, ok.map(k => "'" + INPUT_TABS[k].name + "'!A1:CB400"), "FORMATTED_VALUE")).forEach((v, i) => { got[ok[i]] = v; });
      }
      for (const k of Object.keys(got)) {
        const rows = got[k].map(r => r.map(v => String(v ?? ""))), h = hash(rows); next[k] = h;
        if (seen[k] && seen[k] !== h && rows.length > 3) { try { done.push(await window.importRows(k, [{ rows, raw: rows }])); } catch (e) { /* 아직 덜 쓴 탭이면 그냥 둠 */ } }
      }
      await keepHash(next);
      if (done.length) { window.apply && window.apply(getAll()); window.say && window.say("구글 시트에서 고친 것을 반영했어요: " + done.join(", ")); }
    } catch (e) { /* 다음에 열 때 다시 */ }
  }

  // ---------- 새 학년도: 지난 학년도를 드라이브 'YYYY학년도' 폴더에 시트로 정리하고, Firebase 에도 한 부 보관 ----------
  const YEAR_TABLES = ["items", "events", "memos", "notes", "checks", "logs", "todos", "teachers", "classRosters", "attend", "pmsg"];
  const YEAR_CFG = ["timetable", "kept", "ttTerm", "plans", "rosters", "students", "classTT", "periods", "studentTT", "stuPw", "classPw", "inputHash"];
  const J = v => JSON.stringify(v ?? null);
  // parseBook 이 다시 읽을 수 있는 모양 (예전 교무수첩 시트와 같은 탭·칸)
  function bookTabs(db, meta) {
    const c = db.cfg || {}, g = t => db[t] || (t === "classRosters" ? {} : []);
    const HEAD = ["id", "title", "kind", "url", "fileId", "fileName", "size", "area", "cat", "note", "createdAt", "embed", "term", "scope", "pinned", "body"];
    const studentsPw = (c.students || []).map(s => [String(s.no), s.name || "", (c.stuPw || {})[s.no] || ""]);
    return {
      config: [[J(c.config), J(meta)], [J(c.timetable)], [J(c.kept)], [""], [J(c.plans)], [J(c.rosters)], [J(c.students)], [J(c.classTT)], [String(c.periods || "")], [J(c.classPw)], [J(c.studentTT)]],
      items: [HEAD].concat(g("items").map(o => HEAD.map(h => o[h] ?? ""))),
      events: [["date", "title", "cat"]].concat(g("events").map(e => [e.date, e.title, e.cat])),
      memos: [["date", "text", "due", "files"]].concat(g("memos").map(m => [m.date, m.text, !!m.due, J(m.files || [])])),
      notes: [["id", "date", "type", "text", "done", "createdAt", "detail", "share", "files"]].concat(g("notes").map(n => [n.id, n.date, n.type, n.text, !!n.done, n.createdAt, n.detail, n.share !== false, J(n.files || [])])),
      checks: [["id", "title", "size", "done", "closed", "createdAt", "due", "files", "memo", "memoShare"]].concat(g("checks").map(x => [x.id, x.title, x.size, (x.done || []).join(","), !!x.closed, x.createdAt, x.due, J(x.files || []), x.memo || "", x.memoShare !== false])),
      logs: [["date", "period", "cls", "text", "lesson", "done", "files"]].concat(g("logs").map(l => [l.date, l.period, l.cls, l.text, l.lesson, !!l.done, J(l.files || [])])),
      todos: [["id", "text", "detail", "due", "done", "createdAt", "area", "cat", "files"]].concat(g("todos").map(t => [t.id, t.text, t.detail, t.due, !!t.done, t.createdAt, t.area, t.cat, J(t.files || [])])),
      teachers: [["name", "homeroom", "cells"]].concat(g("teachers").map(t => [t.name, t.homeroom, J(t.cells)])),
      classRosters: [["code", "subject", "teacher", "students"]].concat(Object.entries(g("classRosters")).map(([k, v]) => [k, v.subject, v.teacher, J(v.students)])),
      attend: [["date", "code", "no", "status", "note"]].concat(g("attend").map(a => [a.date, a.code, a.no, a.status, a.note])),
      pmsg: [["id", "no", "text", "at"]].concat(g("pmsg").map(m => [m.id, m.no, m.text, m.at])),
      "알림앱 비밀번호": [["번호", "이름", "비밀번호"]].concat(studentsPw)
    };
  }
  async function writeBook(title, folder, db, meta) {
    const tabs = bookTabs(db, meta), names = Object.keys(tabs);
    const ss = await (await G(SHEETS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties: { title }, sheets: names.map(n => ({ properties: { title: n, gridProperties: { frozenRowCount: n === "config" ? 0 : 1 } } })) }) })).json();
    // 한 칸 50,000자 제한이 있어 아주 긴 글은 자름 (원본은 Firebase 보관본에 그대로 있음)
    const data = names.map(n => ({ range: "'" + n + "'!A1", values: tabs[n].map(r => r.map(v => typeof v === "string" ? v.slice(0, 49000) : v)) }));
    await G(SHEETS + "/" + ss.spreadsheetId + "/values:batchUpdate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valueInputOption: "RAW", data }) });
    await moveTo(ss.spreadsheetId, folder);
    return ss.spreadsheetId;
  }
  async function moveTo(id, folder) {
    const p = (await (await G(DRIVE + "/" + id + "?fields=parents")).json()).parents || [];
    await G(DRIVE + "/" + id + "?addParents=" + folder + (p.length ? "&removeParents=" + p.join(",") : "") + "&fields=id", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
  }
  const snapCol = y => fs.collection("users").doc(uid).collection("years").doc(String(y)).collection("data"); // 예전 보관 자리 (읽기만)
  // 학년도 보관본: 그 해 폴더에 JSON 파일로 (같은 해를 다시 보관하면 덮어씀)
  const yearFile = async y => (await findOne("appProperties has { key='gyomuYear' and value='" + y + "' }"))[0];
  async function snapshotYear(y) {
    const keep = {}; TABLES.forEach(t => { if (DB[t] !== undefined) keep[t] = DB[t]; });
    const f = await yearFile(y);
    await driveJson({ name: "교무수첩 " + y + "학년도 보관본 (지우지 마세요).json", parents: [await yearFolder(y)], appProperties: { gyomuYear: String(y) } }, JSON.stringify({ app: "gyomu", year: y, at: Date.now(), tables: keep }), f && f.id);
  }
  Object.assign(API, {
    // 새 학년도 시작 (설정 → 학기에서 '20XX학년도 1학기'로 바꿀 때 화면이 부름)
    async archiveBefore(newYear) {
      newYear = Number(newYear); if (!(newYear >= 2000 && newYear <= 2100)) fail("학년도가 올바르지 않아요.");
      const prev = newYear - 1, c = cfgGet("config") || {}, meta = { term: c.term || "", homeroomClass: c.homeroomClass || "" };
      const oldFolder = await yearFolder(prev);
      await snapshotYear(prev); // Firebase 에 지난 학년도 그대로 한 부
      const archId = await writeBook("교무수첩 " + prev + "학년도", oldFolder, DB, meta);
      // 예전 교무수첩 시트(처음 쓰던 것)는 지난 학년도 폴더로. 영역 입력 시트는 이미 그 해 영역 폴더에 있음 → 새 학년도에는 새로 만듦
      if (!cfgGet("legacyMoved")) { await moveTo(OLD_SHEET, oldFolder).catch(() => {}); }
      await yearFolder(newYear);
      // 새 학년도는 영역·분류·수업 시간 설정만 남기고 처음부터
      for (const t of YEAR_TABLES) await put(t, t === "classRosters" ? {} : []);
      // 학급 출결 시트: 같은 모양으로 새 학년도 것을 복제 (출결 종류·알림 규칙·교시·화면 설정은 그대로, 기록·휴지통·명부·학사일정은 비움). 지난 시트는 그대로 남음
      let attend = c.attend;
      if (c.attend && c.attend.url) try {
        const oldId = sheetId(c.attend.url), oldName = (await (await G(DRIVE + "/" + oldId + "?fields=name")).json()).name || "스마트 출결 관리 DB";
        const name = /\(\d{4}\)/.test(oldName) ? oldName.replace(/\(\d{4}\)/, "(" + newYear + ")") : "(" + newYear + ") " + oldName;
        const nid = (await (await G(DRIVE + "/" + oldId + "/copy?fields=id", { method: "POST", headers: JSONH, body: JSON.stringify({ name, parents: [await yearFolder(newYear)] }) })).json()).id;
        const have = new Set((await tabsOf(nid)).map(t => t.title)), wipe = { 출결기록: "A2:K8000", 휴지통: "A2:L3000", 학생명부: "A2:H200", 학사일정: "A2:D800" };
        const ranges = Object.keys(wipe).filter(t => have.has(t)).map(t => "'" + t + "'!" + wipe[t]);
        if (ranges.length) await G(SHEETS + "/" + nid + "/values:batchClear", { method: "POST", headers: JSONH, body: JSON.stringify({ ranges }) });
        attend = { ...c.attend, url: "https://docs.google.com/spreadsheets/d/" + nid + "/edit" };
      } catch (e) { console.warn("출결 시트 복제", e); } // 못 하면 지난 시트를 그대로 이어 둠 (설정에서 바꿀 수 있음)
      const patch = { archives: { ...(cfgGet("archives") || {}), [prev]: archId }, inputBooks: {}, legacyMoved: true, attBackupBook: undefined, config: { ...c, homeroomClass: "", attend } };
      YEAR_CFG.forEach(k => { patch[k] = undefined; });
      await cfgPut(patch);
      return getAll();
    },
    // 보관한 학년도로 돌아가기: 지금 학년도도 Firebase 에 한 부 남긴 뒤 그 해 보관본을 되살림
    async restoreArchive(year) {
      year = Number(year); const cur = curYear();
      let back = {};
      const yf = await yearFile(year), snap = yf ? null : await snapCol(year).get();
      if (yf) back = ((await (await G(DRIVE + "/" + yf.id + "?alt=media")).json()) || {}).tables || {};
      else if (!snap.empty) snap.forEach(d => { try { back[d.id] = JSON.parse(d.data().v); } catch (e) {} });
      else { const id = (cfgGet("archives") || {})[year]; if (!id) fail(year + "학년도 보관본이 없어요."); const o = await parseBook(id); back = o; back.cfg = { ...o.cfg }; back.meta = o.meta; }
      if (cur !== year) await snapshotYear(cur);
      const keep = get("cfg");
      for (const t of YEAR_TABLES) await put(t, back[t] || (t === "classRosters" ? {} : []));
      const bc = back.cfg || {}, patch = {};
      YEAR_CFG.forEach(k => { patch[k] = bc[k]; });
      const meta = back.meta || (bc.config ? { term: bc.config.term, homeroomClass: bc.config.homeroomClass } : null);
      patch.config = { ...(keep.config || {}), term: meta && TERM_RE.test(String(meta.term || "")) && Number(String(meta.term).slice(0, 4)) === year ? meta.term : year + "-2", homeroomClass: (meta && meta.homeroomClass) || "" };
      await cfgPut(patch); return getAll();
    }
  });
  window.fbAutoSync = autoSync;

  // ---------- 학급 출결: 설정에서 이어 둔 '학급 올인원 워크스페이스(스마트 출결 관리)' 시트를 그 앱과 같은 모양으로 읽고 씀 (그 시트에만 씀) ----------
  // 출결기록: 시작일, 종료일, 학번, 이름, 출결종류, 해당교시, 사유, 증빙서류목록, 서류제출상태(JSON), 입력일시, 기록ID
  // 휴지통: 휴지통ID, 시작일, 종료일, 학번, 이름, 출결종류, 해당교시, 사유, 증빙서류목록, 서류제출상태, 입력일시, 삭제일시
  const ATT_TABS = { 학생명부: "A1:H200", 출결기록: "A1:K8000", 교시설정: "A1:B10", 출결알림: "A1:G60", 화면설정: "A1:C200", 출결종류: "A1:C150", 학사일정: "A1:D800", 휴지통: "A1:L3000" };
  const ATT_HEAD = { 출결기록: ["시작일", "종료일", "학번", "이름", "출결종류", "해당교시", "사유", "증빙서류목록", "서류제출상태", "입력일시", "기록ID"],
    휴지통: ["휴지통ID", "시작일", "종료일", "학번", "이름", "출결종류", "해당교시", "사유", "증빙서류목록", "서류제출상태", "입력일시", "삭제일시"],
    학생명부: ["학번", "이름", "학생 이름", "학생 연락처", "학부모", "학부모 연락처", "메시지내용", "비밀번호"], 교시설정: ["요일", "교시수"],
    출결알림: ["규칙이름", "알림방식", "기간", "기준일수", "적용출결종류", "시작일", "종료일"], 화면설정: ["항목", "키", "값"], 출결종류: ["출결 명칭", "필요 증빙서류", "색상 그룹"], 학사일정: ["명칭", "시작일", "종료일", "구분"] };
  let lastAtt = null, attBackingUp = false;
  const attId = () => { const c = cfgGet("config") || {}, u = c.attend && c.attend.url; if (!u) fail("설정 → 학급 출결에서 출결 시트를 먼저 이어 주세요."); return sheetId(u); };
  const JSONH = { "Content-Type": "application/json" };
  const putRange = (id, range, values) => G(SHEETS + "/" + id + "/values/" + q(range) + "?valueInputOption=RAW", { method: "PUT", headers: JSONH, body: JSON.stringify({ values }) });
  const appendRows = (id, tab, values) => G(SHEETS + "/" + id + "/values/" + q("'" + tab + "'!A1") + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", headers: JSONH, body: JSON.stringify({ values }) });
  const clearRange = (id, range) => G(SHEETS + "/" + id + "/values/" + q(range) + ":clear", { method: "POST" });
  const sheetUpdate = (id, requests) => G(SHEETS + "/" + id + ":batchUpdate", { method: "POST", headers: JSONH, body: JSON.stringify({ requests }) });
  const nowStamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return ymd(d) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()); };
  // 없는 탭은 그 앱처럼 머리줄과 함께 만듦
  const attTabsMemo = {}; // 탭 목록은 한 번 읽으면 이 창에서 기억 (불러오기를 빠르게)
  async function attTabs(id) {
    if (attTabsMemo[id]) return attTabsMemo[id];
    let tabs = await tabsOf(id); const miss = Object.keys(ATT_HEAD).filter(n => !tabs.some(t => t.title === n));
    if (miss.length) { await sheetUpdate(id, miss.map(n => ({ addSheet: { properties: { title: n } } }))); for (const n of miss) await putRange(id, "'" + n + "'!A1", [ATT_HEAD[n]]); tabs = await tabsOf(id); }
    return (attTabsMemo[id] = tabs);
  }
  // 기록ID(11번째 칸)로 줄 찾기 (머리줄 = 1)
  async function recRow(id, recId) {
    const col = (await batchGet(id, ["'출결기록'!K1:K8000"], "FORMATTED_VALUE"))[0];
    const i = col.findIndex(r => String(r[0] || "") === String(recId)); if (i < 1) fail("기록을 찾지 못했어요. 이미 지워졌거나 다른 곳에서 바뀌었어요. 새로 고침 해 주세요."); return i + 1;
  }
  // 그 앱처럼 시작일 최근 순 → 학번 순으로 정렬
  const sortReq = t => ({ sortRange: { range: { sheetId: t.sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 }, sortSpecs: [{ dimensionIndex: 0, sortOrder: "DESCENDING" }, { dimensionIndex: 2, sortOrder: "ASCENDING" }] } });
  async function sortRecs(id, tabs) { const t = tabs.find(x => x.title === "출결기록"); if (t) await sheetUpdate(id, [sortReq(t)]); }
  const cleanRec = r => [S(r.startDate, 10), S(r.endDate, 10), S(r.num, 10), S(r.name, 30), S(r.type, 40), S(r.period, 60), S(r.reason, 300), S(r.doc, 300), JSON.stringify(r.docStatus && typeof r.docStatus === "object" ? r.docStatus : {})];
  Object.assign(API, {
    // after: 쓰기 부탁들 [[주소, 옵션]...] 을 먼저 하고 바로 이어서 읽음 (창구 한 번에)
    async attLoad(after) {
      const id = attId(), names = Object.keys(ATT_TABS); await attTabs(id);
      const u = SHEETS + "/" + id + "/values:batchGet?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING&" + names.map(n => "ranges=" + q("'" + n + "'!" + ATT_TABS[n])).join("&");
      const rs = await GM([...(Array.isArray(after) ? after : []), [u]]);
      const vals = ((await rs[rs.length - 1].json()).valueRanges || []).map(v => v.values || []), out = {};
      names.forEach((n, i) => { out[n] = vals[i].map(r => r.map(v => String(v ?? ""))); });
      // 기록ID 가 빈 줄에는 ID 를 붙여 둠 (그 앱과 같은 방식)
      const recs = out["출결기록"] || [], fix = [];
      recs.forEach((r, i) => { if (i && (r[0] || r[3]) && !r[10]) { const rid = "R" + Date.now() + "_" + i; while (r.length < 11) r.push(""); r[10] = rid; fix.push({ range: "'출결기록'!K" + (i + 1), values: [[rid]] }); } });
      if (fix.length) await G(SHEETS + "/" + id + "/values:batchUpdate", { method: "POST", headers: JSONH, body: JSON.stringify({ valueInputOption: "RAW", data: fix }) });
      lastAtt = { id, tabs: out };
      return { url: "https://docs.google.com/spreadsheets/d/" + id + "/edit", tabs: out };
    },
    // 출결 백업은 시트 하나: 하루 한 번 출결 시트 내용을 '출결 백업 (지우지 마세요)' 시트에 덮어씀 (올해 폴더)
    // 지난 날 내용은 그 시트의 '버전 기록'에 남음 → 날마다 새 시트가 생기지 않음
    async attBackup() {
      if (!lastAtt) return false;
      // 하루 한 번만: 쓰기 전에 '오늘 했음'을 먼저 적음 (여러 번 열거나 두 기기에서 열어도 겹치지 않게)
      const day = ymd(new Date()); if (cfgGet("attBackupDay") === day || attBackingUp) return false;
      attBackingUp = true; await cfgPut({ attBackupDay: day }); await flush().catch(() => {});
      try {
        const NAME = "출결 백업 (지우지 마세요)", names = Object.keys(lastAtt.tabs), yf = await yearFolder();
        let book = (cfgGet("attBackupBook") && cfgGet("attBackupBook").year === curYear() && cfgGet("attBackupBook").id) || ((await findOne("name='" + NAME + "' and '" + yf + "' in parents"))[0] || {}).id;
        if (!book) { book = (await (await G(SHEETS, { method: "POST", headers: JSONH, body: JSON.stringify({ properties: { title: NAME }, sheets: names.map(title => ({ properties: { title } })) }) })).json()).spreadsheetId; await moveTo(book, yf).catch(() => {}); }
        await cfgPut({ attBackupBook: { id: book, year: curYear() } });
        const have = (await tabsOf(book)).map(t => t.title), miss = names.filter(n => !have.includes(n));
        if (miss.length) await sheetUpdate(book, miss.map(title => ({ addSheet: { properties: { title } } })));
        // 지우고 쓰기를 창구 한 번에
        await GM([[SHEETS + "/" + book + "/values:batchClear", { method: "POST", headers: JSONH, body: JSON.stringify({ ranges: names.map(n => "'" + n + "'!A:Z") }) }],
          [SHEETS + "/" + book + "/values:batchUpdate", { method: "POST", headers: JSONH, body: JSON.stringify({ valueInputOption: "RAW", data: names.map(n => ({ range: "'" + n + "'!A1", values: (lastAtt.tabs[n] || []).length ? lastAtt.tabs[n] : [[""]] })) }) }]]);
        return true;
      } catch (e) { await cfgPut({ attBackupDay: "" }); throw e; } // 못 했으면 다음에 다시
      finally { attBackingUp = false; }
    },
    async attAdd(list) {
      const id = attId(), tabs = await attTabs(id), at = nowStamp(), base = Date.now();
      const rows = (Array.isArray(list) ? list : []).slice(0, 60).map((r, i) => cleanRec(r).concat([at, "R" + base + "_" + i + "_" + Math.floor(Math.random() * 1000)]));
      if (!rows.length) fail("넣을 기록이 없어요.");
      const t = tabs.find(x => x.title === "출결기록");
      return API.attLoad([[SHEETS + "/" + id + "/values/" + q("'출결기록'!A1") + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", headers: JSONH, body: JSON.stringify({ values: rows }) }],
        ...(t ? [[SHEETS + "/" + id + ":batchUpdate", { method: "POST", headers: JSONH, body: JSON.stringify({ requests: [sortReq(t)] }) }]] : [])]);
    },
    async attUpdate(recId, r) { const id = attId(), row = await recRow(id, recId); return API.attLoad([[SHEETS + "/" + id + "/values/" + q("'출결기록'!A" + row + ":I" + row) + "?valueInputOption=RAW", { method: "PUT", headers: JSONH, body: JSON.stringify({ values: [cleanRec(r)] }) }]]); },
    async attDoc(recId, status) { const id = attId(), row = await recRow(id, recId); return API.attLoad([[SHEETS + "/" + id + "/values/" + q("'출결기록'!I" + row) + "?valueInputOption=RAW", { method: "PUT", headers: JSONH, body: JSON.stringify({ values: [[JSON.stringify(status || {})]] }) }]]); },
    // 지우면 휴지통 탭으로 (돌려받은 휴지통ID 로 되살릴 수 있음)
    async attTrash(recId) {
      // 기록 줄 찾기와 그 줄 내용을 한 번에 읽고, 휴지통에 넣기·줄 지우기·다시 읽기도 창구 한 번에
      const id = attId(), tabs = await attTabs(id), t = tabs.find(x => x.title === "출결기록");
      const all = (await batchGet(id, ["'출결기록'!A1:K8000"], "FORMATTED_VALUE"))[0], i = all.findIndex(r => String(r[10] || "") === String(recId));
      if (i < 1) fail("기록을 찾지 못했어요. 이미 지워졌거나 다른 곳에서 바뀌었어요. 새로 고침 해 주세요.");
      const row = i + 1, d = (all[i] || []).map(String), tid = String(Date.now());
      const data = await API.attLoad([
        [SHEETS + "/" + id + "/values/" + q("'휴지통'!A1") + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", headers: JSONH, body: JSON.stringify({ values: [[tid, d[0] || "", d[1] || "", d[2] || "", d[3] || "", d[4] || "", d[5] || "", d[6] || "", d[7] || "", d[8] || "", d[9] || "", nowStamp()]] }) }],
        [SHEETS + "/" + id + ":batchUpdate", { method: "POST", headers: JSONH, body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: t.sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] }) }]]);
      data.trashId = tid; return data;
    },
    async attRestore(tid) {
      const id = attId(), tabs = await attTabs(id), tr = (await batchGet(id, ["'휴지통'!A1:L3000"], "FORMATTED_VALUE"))[0], i = tr.findIndex((r, k) => k && String(r[0]) === String(tid));
      if (i < 1) fail("휴지통에서 찾지 못했어요.");
      const r = tr[i].map(String); await appendRows(id, "출결기록", [[r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10] || nowStamp(), "R" + Date.now() + "_restore"]]);
      await sheetUpdate(id, [{ deleteDimension: { range: { sheetId: tabs.find(x => x.title === "휴지통").sheetId, dimension: "ROWS", startIndex: i, endIndex: i + 1 } } }]);
      await sortRecs(id, tabs); return API.attLoad();
    },
    // 휴지통에서 아주 지움 (선생님이 누를 때만)
    async attPurge(tid) {
      const id = attId(), tabs = await attTabs(id), tr = (await batchGet(id, ["'휴지통'!A1:A3000"], "FORMATTED_VALUE"))[0];
      const rows = tr.map((r, k) => (tid === "ALL" ? k > 0 && r[0] : k > 0 && String(r[0]) === String(tid)) ? k : -1).filter(k => k > 0).sort((a, b) => b - a);
      const sid = tabs.find(x => x.title === "휴지통").sheetId;
      if (rows.length) await sheetUpdate(id, rows.map(k => ({ deleteDimension: { range: { sheetId: sid, dimension: "ROWS", startIndex: k, endIndex: k + 1 } } })));
      return API.attLoad();
    },
    // 학사일정(쉬는 날): 같은 명칭·시작·종료가 있으면 건너뛰고 끝에 더함 / 하나 지움
    async attHolidayAdd(list) {
      const id = attId(); await attTabs(id); const old = (await batchGet(id, ["'학사일정'!A2:C800"], "FORMATTED_VALUE"))[0], key = (n, s, e) => String(n).trim() + "|" + s + "|" + (e || s), have = new Set(old.filter(r => r[0]).map(r => key(r[0], r[1], r[2])));
      const rows = (Array.isArray(list) ? list : []).filter(h => h && h.name && DATE_RE.test(h.start)).filter(h => { const k = key(h.name, h.start, h.end); if (have.has(k)) return false; have.add(k); return true; })
        .map(h => [S(h.name, 60), h.start, h.end || h.start, h.end && h.end !== h.start ? "기간" : "단일"]);
      if (rows.length) await appendRows(id, "학사일정", rows);
      const data = await API.attLoad(); data.added = rows.length; return data;
    },
    async attHolidayDel(h) {
      const id = attId(), tabs = await attTabs(id), all = (await batchGet(id, ["'학사일정'!A1:C800"], "FORMATTED_VALUE"))[0];
      const i = all.findIndex((r, k) => k && String(r[0]).trim() === String(h.name).trim() && normD(r[1]) === h.start && (normD(r[2]) || normD(r[1])) === (h.end || h.start));
      if (i > 0) await sheetUpdate(id, [{ deleteDimension: { range: { sheetId: tabs.find(x => x.title === "학사일정").sheetId, dimension: "ROWS", startIndex: i, endIndex: i + 1 } } }]);
      return API.attLoad();
    },
    // 설정: 출결종류 · 출결알림 · 교시설정은 2행부터 통째로, 화면설정은 색상그룹·집계규칙 줄만 바꿈
    async attSaveTab(tab, rows) {
      const W = { 출결종류: 3, 출결알림: 7, 교시설정: 2 }[tab]; if (!W) fail("바꿀 수 없는 탭이에요.");
      const id = attId(); await attTabs(id); const data = (Array.isArray(rows) ? rows : []).slice(0, 150).map(r => Array.from({ length: W }, (_, k) => S(r && r[k], 300)));
      if (tab === "출결종류" && !data.length) fail("출결 종류가 비어 있어 저장하지 않았어요.");
      await clearRange(id, "'" + tab + "'!A2:" + "ABCDEFG"[W - 1] + "1000"); if (data.length) await putRange(id, "'" + tab + "'!A2", data); return API.attLoad();
    },
    // 연락처는 출결 시트 '학생명부' 한 곳에: 학생 연락처(D)·학부모 관계(E)·학부모 연락처(F)만 고침 (학생 이름·메시지·비밀번호 칸은 그대로). 없는 학생은 줄을 더함
    async attSaveContacts(list) {
      const id = attId(); await attTabs(id);
      const old = (await batchGet(id, ["'학생명부'!A2:H200"], "FORMATTED_VALUE"))[0].map(r => Array.from({ length: 8 }, (_, k) => String(r[k] ?? "")));
      for (const c of (Array.isArray(list) ? list : []).slice(0, 60)) {
        const no = String(Number(c && c.no) || ""); if (!no) continue;
        let r = old.find(x => String(Number(x[0]) || x[0]) === no); if (!r) { r = [no, S(c.name, 20), "", "", "", "", "", ""]; old.push(r); }
        r[3] = S(c.phone, 20); r[4] = S(c.rel, 10); r[5] = S(c.parentPhone, 20);
      }
      old.sort((a, b) => (Number(a[0]) || 999) - (Number(b[0]) || 999));
      return API.attLoad([[SHEETS + "/" + id + "/values/" + q("'학생명부'!A2:H200") + ":clear", { method: "POST" }],
        [SHEETS + "/" + id + "/values/" + q("'학생명부'!A2") + "?valueInputOption=RAW", { method: "PUT", headers: JSONH, body: JSON.stringify({ values: old }) }]]);
    },
    async attSaveUi(p) {
      const id = attId(); await attTabs(id); const old = (await batchGet(id, ["'화면설정'!A2:C200"], "FORMATTED_VALUE"))[0];
      const keep = old.filter(r => r[0] && !(p.colors && r[0] === "색상그룹") && !(p.statRules && r[0] === "집계규칙"));
      if (p.colors) Object.keys(p.colors).slice(0, 30).forEach(k => keep.push(["색상그룹", S(k, 30), S(p.colors[k], 20)]));
      if (p.statRules) { keep.push(["집계규칙", "사유순서", JSON.stringify(p.statRules.reasonOrder || [])]); keep.push(["집계규칙", "종류순서", JSON.stringify(p.statRules.tieOrder || [])]); }
      await clearRange(id, "'화면설정'!A2:C200"); if (keep.length) await putRange(id, "'화면설정'!A2", keep); return API.attLoad();
    },
    // 교무수첩 → 출결 시트: 학생 명단(번호·이름·연락처, 메시지·비밀번호는 그대로), 쉬는 날(더하기만), 요일별 교시 수
    async attSync(p) {
      const id = attId(); await attTabs(id); const done = [];
      if (Array.isArray(p.students) && p.students.length) {
        const old = (await batchGet(id, ["'학생명부'!A2:H200"], "FORMATTED_VALUE"))[0], byNo = {}; old.forEach(r => { byNo[String(Number(r[0]) || r[0])] = r; });
        const batchim = n => { const c = String(n).charCodeAt(String(n).length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; };
        // C열(학생 이름: 문자에 쓰는 친근한 이름)과 메시지는 선생님이 시트에서 고친 그대로 둠. 메시지가 비어 있을 때만 새로 씀
        const rows = p.students.slice(0, 60).map(s => { const o = byNo[String(s.no)] || [], rel = S(s.rel || o[4] || "", 10), name = S(s.name, 20), friendly = o[2] || "";
          const call = friendly || name, msg = o[6] || ("안녕하세요, " + (rel || "보호자님") + ".\n아직 " + call + (batchim(call) ? "이가" : "가") + " 등교하지 않았습니다.\n확인 후 지도 부탁드립니다.");
          return [String(s.no), name, friendly, S(s.phone, 20) || o[3] || "", rel, S(s.parentPhone, 20) || o[5] || "", msg, o[7] || ""]; });
        await clearRange(id, "'학생명부'!A2:H200"); await putRange(id, "'학생명부'!A2", rows); done.push("학생 " + rows.length + "명");
      }
      if (Array.isArray(p.holidays) && p.holidays.length) { const r = await API.attHolidayAdd(p.holidays); if (r.added) done.push("쉬는 날 " + r.added + "개 더함"); }
      if (Array.isArray(p.periods) && p.periods.length === 5) { await putRange(id, "'교시설정'!A2:B6", p.periods.map((n, i) => [(i + 1) + " (" + "월화수목금"[i] + ")", String(Math.max(1, Math.min(10, Number(n) || 7)))])); done.push("요일별 교시 수"); }
      await cfgPut({ attSyncAt: Date.now() });
      return { done, data: await API.attLoad() };
    }
  });

  // 드라이브에서 '교무수첩 2025학년도' 같은 보관 시트를 찾아 둠 (목록은 설정 → 학기에 보임)
  async function findArchives() {
    const files = await findOne("mimeType='application/vnd.google-apps.spreadsheet' and name contains '교무수첩' and name contains '학년도'"), map = {};
    files.forEach(f => { const m = f.name.match(/^교무수첩 (\d{4})학년도$/); if (m && f.id !== OLD_SHEET) map[m[1]] = f.id; });
    await cfgPut({ archives: map }); return map;
  }

  // ---------- 지난 구글 시트 → Firebase ----------
  async function importFromSheet() {
    const out = await parseBook(OLD_SHEET), keep = get("cfg");
    out.cfg.drive = keep.drive; // 찾아 둔 드라이브 폴더는 그대로
    for (const t of TABLES) await put(t, out[t]);
    await findArchives().catch(() => {});
    return { counts: Object.fromEntries(TABLES.filter(t => Array.isArray(out[t])).map(t => [t, out[t].length])), all: getAll() };
  }
  // 교무수첩 시트(지금 것이나 보관 시트) 하나를 Firebase 모양으로 읽음
  async function parseBook(bookId) {
    const have = new Set((await tabsOf(bookId)).map(s => s.title));
    const names = ["items", "events", "memos", "notes", "checks", "logs", "todos", "teachers", "classRosters", "attend", "pmsg", "알림앱 비밀번호"].filter(n => have.has(n));
    const vals = await batchGet(bookId, ["config!A1:B12"].concat(names.map(n => "'" + n + "'!A2:Z")));
    const metaRaw = ((vals[0] || [])[0] || [])[1];
    const cfgCol = (vals[0] || []).map(r => r[0]), J = i => { try { return cfgCol[i] ? JSON.parse(cfgCol[i]) : null; } catch (e) { return null; } };
    const tab = {}; names.forEach((n, i) => { tab[n] = (vals[i + 1] || []).filter(r => r.some(v => v !== "" && v != null)); });
    const str = v => String(v == null ? "" : v).replace(/^'/, ""), tru = v => v === true || String(v).toUpperCase() === "TRUE", num = v => Number(v) || 0;
    const fl = v => { try { return cleanFiles(JSON.parse(str(v) || "[]")); } catch (e) { return []; } };
    const nums = v => str(v).split(",").map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= 50);
    // 시트가 날짜로 바꿔 둔 칸 (2026. 10. 30 같은 것) → 2026-10-30
    const dt = v => { const s = str(v).trim(); if (DATE_RE.test(s)) return s; const m = s.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m ? m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") : s; };
    const code = v => { const s = str(v).trim(), m = s.match(/^\d{4}\D+(\d{1,2})\D+(\d{1,2})/); return m ? Number(m[1]) + "-" + Number(m[2]) : s; };
    const HEAD = ["id", "title", "kind", "url", "fileId", "fileName", "size", "area", "cat", "note", "createdAt", "embed", "term", "scope", "pinned", "body"];
    const out = {
      cfg: { config: J(0), timetable: J(1), kept: J(2), plans: J(4) || {}, rosters: J(5) || {}, students: J(6) || [], classTT: J(7), periods: Number(cfgCol[8]) || 7, classPw: J(9), studentTT: J(10) || {}, stuPw: {} },
      items: (tab.items || []).filter(r => r[0]).map(r => { const o = {}; HEAD.forEach((h, i) => { const v = r[i];
        o[h] = h === "size" || h === "createdAt" ? num(v) : h === "embed" || h === "pinned" ? tru(v) : str(v); }); return o; }),
      events: (tab.events || []).map(r => ({ date: dt(r[0]), title: str(r[1]), cat: str(r[2]) })).filter(e => DATE_RE.test(e.date) && e.title),
      memos: (tab.memos || []).map(r => ({ date: dt(r[0]), text: str(r[1]), due: tru(r[2]), files: fl(r[3]) })).filter(m => DATE_RE.test(m.date)),
      notes: (tab.notes || []).filter(r => r[0]).map(r => ({ id: str(r[0]), date: dt(r[1]), type: str(r[2]), text: str(r[3]), done: tru(r[4]), createdAt: num(r[5]), detail: str(r[6]), share: r[7] === "" || r[7] == null || tru(r[7]), files: fl(r[8]) })),
      checks: (tab.checks || []).filter(r => r[0]).map(r => ({ id: str(r[0]), title: str(r[1]), size: num(r[2]) || 30, done: nums(r[3]), closed: tru(r[4]), createdAt: num(r[5]), due: DATE_RE.test(dt(r[6])) ? dt(r[6]) : "", files: fl(r[7]), memo: str(r[8]), memoShare: r[9] === "" || r[9] == null || tru(r[9]) })),
      logs: (tab.logs || []).map(r => ({ date: dt(r[0]), period: num(r[1]), cls: str(r[2]), text: str(r[3]), lesson: num(r[4]), done: tru(r[5]), files: fl(r[6]) })).filter(l => DATE_RE.test(l.date)),
      todos: (tab.todos || []).filter(r => r[0]).map(r => ({ id: str(r[0]), text: str(r[1]), detail: str(r[2]), due: DATE_RE.test(dt(r[3])) ? dt(r[3]) : "", done: tru(r[4]), createdAt: num(r[5]), area: str(r[6]), cat: str(r[7]), files: fl(r[8]) })),
      teachers: (tab.teachers || []).filter(r => r[0]).map(r => { let c = []; try { c = JSON.parse(str(r[2]) || "[]"); } catch (e) {} return { name: str(r[0]), homeroom: code(r[1]), cells: teacherCells(c) }; }),
      classRosters: Object.fromEntries((tab.classRosters || []).filter(r => r[0]).map(r => { let st = []; try { st = JSON.parse(str(r[3]) || "[]"); } catch (e) {} return [code(r[0]), { subject: str(r[1]), teacher: str(r[2]), students: Array.isArray(st) ? st : [] }]; })),
      attend: (tab.attend || []).map(r => ({ date: str(r[0]) === "memo" ? "memo" : dt(r[0]), code: code(r[1]), no: num(r[2]), status: str(r[3]), note: str(r[4]) })).filter(r => r.no > 0),
      pmsg: (tab.pmsg || []).filter(r => r[0]).map(r => ({ id: str(r[0]), no: num(r[1]), text: str(r[2]), at: num(r[3]) }))
    };
    (tab["알림앱 비밀번호"] || []).forEach(r => { const no = num(r[0]), v = str(r[2]).trim(); if (no > 0 && v) out.cfg.stuPw[no] = v; });
    try { out.meta = metaRaw ? JSON.parse(str(metaRaw)) : null; } catch (e) { out.meta = null; } // 보관 시트의 B1: 그 해 학기·우리 반
    return out;
  }

  // ---------- 우리 반 알림 앱(학생·학부모)으로 내보내기: Firestore notice/{선생님 uid} ----------
  // 학생 계정: 학번@s.gyomu-7e9e1.app (비밀번호 = 선생님이 정한 것 + 붙임말, Firebase 는 6자 이상이어야 해서)
  const STU_DOMAIN = "@s.gyomu-7e9e1.app", PW_SUFFIX = "#gyomu", PWA_URL = "https://uzzint.github.io/gyomu/class/";
  const HOLI_RE = /(공휴일|대체공휴일|휴업|방학|추석|설날|한글날|개천절|성탄절|어린이날|현충일|광복절|삼일절|신정|부처님)/;
  const hakbunOf = no => { const m = String((cfgGet("config") || {}).homeroomClass || "").match(/^(\d)\s*-\s*(\d+)$/); return m ? m[1] + m[2].padStart(2, "0") + String(no).padStart(2, "0") : ""; };
  const noticeDoc = () => fs.collection("notice").doc(uid);
  let auth2 = null;
  const prov = () => auth2 || (auth2 = firebase.initializeApp(FB, "prov").auth());
  // 정한 비밀번호대로 학생 계정을 만들고·바꾸고·지움 (선생님 화면 뒤에서, 선생님 로그인은 그대로)
  async function provisionAccounts() {
    const pw = cfgGet("stuPw") || {}, acct = { ...(cfgGet("stuAcct") || {}) }, a2 = prov(), problems = [];
    await a2.setPersistence(firebase.auth.Auth.Persistence.NONE).catch(() => {});
    let changed = false;
    for (const no of new Set([...Object.keys(pw), ...Object.keys(acct)])) {
      const hb = hakbunOf(no), want = pw[no], cur = acct[no]; if (!hb) continue;
      try {
        if (want && (!cur || cur.pw !== want || cur.hb !== hb)) {
          let u;
          if (cur && cur.hb === hb) { u = (await a2.signInWithEmailAndPassword(hb + STU_DOMAIN, cur.pw + PW_SUFFIX)).user; await u.updatePassword(want + PW_SUFFIX); }
          else { try { u = (await a2.createUserWithEmailAndPassword(hb + STU_DOMAIN, want + PW_SUFFIX)).user; } catch (e) { if (e.code !== "auth/email-already-in-use") throw e; u = (await a2.signInWithEmailAndPassword(hb + STU_DOMAIN, want + PW_SUFFIX)).user; } }
          await noticeDoc().collection("members").doc(u.uid).set({ hakbun: hb, no: Number(no) });
          acct[no] = { uid: u.uid, pw: want, hb }; changed = true;
        } else if (!want && cur) {
          try { const u = (await a2.signInWithEmailAndPassword(cur.hb + STU_DOMAIN, cur.pw + PW_SUFFIX)).user; await u.delete(); } catch (e) { /* 이미 없음 */ }
          await noticeDoc().collection("members").doc(cur.uid).delete().catch(() => {});
          delete acct[no]; changed = true;
        }
      } catch (e) { problems.push(no + "번(" + (e.code || e.message) + ")"); }
      await a2.signOut().catch(() => {});
    }
    if (changed) await cfgPut({ stuAcct: acct });
    return problems;
  }
  async function publishNotice() {
    if (!uid || !DB) return;
    const c = cfgGet("config") || {}, ad = n => ymd(new Date(Date.now() + n * 864e5)), since = Date.now() - 60 * 864e5;
    const problems = []; // 학생 계정은 이제 Firebase 에 만들지 않음 (창구가 시트의 비밀번호 해시로 확인)
    const classCats = (Array.isArray(c.evCats) ? c.evCats : [{ id: "class", name: "학급" }]).filter(x => x.id === "class" || x.name === "학급").map(x => x.id);
    const notes = get("notes").filter(n => n.share !== false && n.text && n.date >= ad(-21) && n.date <= ad(14))
      .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt || 0) - (b.createdAt || 0)).slice(0, 120).map(n => ({ date: n.date, type: n.type || "", text: n.text, detail: n.detail || "" }));
    const events = get("events").filter(e => (!e.cat || classCats.includes(e.cat)) && e.date >= ad(-7) && e.date <= ad(120)).map(e => ({ date: e.date, title: e.title, mine: !!e.cat })).sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 200);
    const recent = x => x.due || (x.createdAt ? ymd(new Date(x.createdAt)) : "");
    const chk = get("checks").filter(x => x.title && (!x.closed || (x.createdAt || 0) > since || (x.due && x.due >= ad(-60))));
    const checks = chk.map(x => ({ id: x.id, title: x.title, due: x.due || "", closed: !!x.closed, memo: x.memo && x.memoShare !== false ? x.memo : "" }))
      .sort((a, b) => a.closed !== b.closed ? (a.closed ? 1 : -1) : a.closed ? (recent(chk.find(x => x.id === b.id)) > recent(chk.find(x => x.id === a.id)) ? 1 : -1) : (a.due || "9999") < (b.due || "9999") ? -1 : 1);
    const tt = cfgGet("classTT"), bells = Array.isArray(c.bells) ? c.bells.map(b => ({ s: String(b && b.s || ""), e: String(b && b.e || "") })) : [];
    await publishDrive({ cls: c.homeroomClass || "", notes, events, checks, tt: tt && Array.isArray(tt.cells) ? { periods: Number(tt.periods) || tt.cells.length, cells: tt.cells } : null, bells, ui: cfgGet("noticeUi") || null }, chk);
    if (problems.length) console.warn("학생 계정을 만들지 못한 번호:", problems.join(", "));
    return problems;
  }
  // ---------- 우리 반 알림 앱 자료를 드라이브의 '우리 반 알림 자료' 시트로 (앱스 스크립트 창구가 읽어 학생 한 명 몫만 줌) ----------
  // 비밀번호는 그대로 두지 않고 해시만. 시트 '자료' 탭 A열에 JSON 을 4만 자씩 나눠 씀, '기기' 탭은 창구가 휴대폰 알림 등록을 씀
  const NOTICE_BOOK = "1Dfh1QpEk2-SsDOpQi07ZJHoZhSl7ORpLEXhZjTvG6uY";
  let noticeTabsOk = false;
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, "0")).join("");
  async function publishDrive(shared, chk) {
    if (!noticeTabsOk) { const have = (await tabsOf(NOTICE_BOOK)).map(x => x.title), miss = ["자료", "기기"].filter(n => !have.includes(n));
      if (miss.length) await sheetUpdate(NOTICE_BOOK, miss.map(n => ({ addSheet: { properties: { title: n } } })));
      if (miss.includes("기기")) await putRange(NOTICE_BOOK, "'기기'!A1", [["학번", "알림 열쇠", "등록 시각"]]);
      noticeTabsOk = true; }
    let salt = cfgGet("pubSalt"); if (!salt) { salt = uuid(); await cfgPut({ pubSalt: salt }); }
    const pwAll = cfgGet("stuPw") || {}, stt = cfgGet("studentTT") || {}, roster = cfgGet("students") || [], att = cfgGet("pubAtt") || {}, old = Date.now() - 90 * 864e5, kids = {}, pw = {};
    for (const no of Object.keys(pwAll)) {
      const hb = hakbunOf(no), n = Number(no), s = roster.find(k => k.no === n); if (!hb || !String(pwAll[no] || "").trim()) continue;
      pw[hb] = await sha(salt + ":" + hb + ":" + String(pwAll[no]).trim());
      kids[hb] = { hb, no: n, name: (s && s.name) || (stt[no] && stt[no].name) || "", cells: stt[no] && Array.isArray(stt[no].cells) ? stt[no].cells : null,
        msgs: get("pmsg").filter(m => m.no === n && m.at > old).sort((x, y) => y.at - x.at).slice(0, 50).map(m => ({ text: m.text, at: m.at })),
        done: chk.filter(x => (x.done || []).includes(n)).map(x => x.id), att: att[hb] || [] };
    }
    const cp = cfgGet("classPw"); // 선생님 비밀번호: 창구가 sha256(salt + 비밀번호) 로 비교
    const text = JSON.stringify({ v: 1, at: Date.now(), salt, pw, teacher: cp && cp.hash ? { salt: cp.salt, hash: cp.hash } : null, shared, kids }), rows = [];
    for (let i = 0; i < text.length; i += 40000) rows.push([text.slice(i, i + 40000)]);
    await GM([[SHEETS + "/" + NOTICE_BOOK + "/values/" + q("'자료'!A:A") + ":clear", { method: "POST" }],
      [SHEETS + "/" + NOTICE_BOOK + "/values/" + q("'자료'!A1") + "?valueInputOption=RAW", { method: "PUT", headers: JSONH, body: JSON.stringify({ values: rows }) }]]); // 지우고 쓰기를 창구 한 번에
  }
  let pubTimer = null;
  const schedulePublish = () => { clearTimeout(pubTimer); pubTimer = setTimeout(() => publishNotice().catch(e => console.warn("알림 앱 내보내기", e)), 2500); };
  // 학급 출결 → 학생 몫에 출결 기록 (사유 빼고: 날짜·종류·교시·수업일 수)
  let attPubKey = "";
  async function publishAtt(tabs) {
    const acct = cfgGet("stuAcct") || {}, pwAll = cfgGet("stuPw") || {}; if (!Object.keys(pwAll).length && !Object.keys(acct).length) return;
    const recs = (tabs["출결기록"] || []).slice(1).filter(r => r[0] && r[3]), key = JSON.stringify(recs.map(r => r.slice(0, 6))) + JSON.stringify(tabs["학사일정"] || []);
    if (key === attPubKey) return; attPubKey = key;
    const holi = (tabs["학사일정"] || []).slice(1).filter(r => r[0]).map(r => ({ s: normD(r[1]), e: normD(r[2]) || normD(r[1]) }));
    const bookHoli = new Set(get("events").filter(e => !e.cat && HOLI_RE.test(String(e.title).replace(/\([^)]*\)/g, ""))).map(e => e.date));
    const school = k => { const w = new Date(k + "T12:00:00").getDay(); return w > 0 && w < 6 && !bookHoli.has(k) && !holi.some(h => k >= h.s && k <= h.e); };
    const days = (s, e) => { let n = 0; for (let d = new Date(s + "T12:00:00"); ymd(d) <= e && n < 400; d.setDate(d.getDate() + 1)) if (school(ymd(d))) n++; return n || 1; };
    const pubAtt = {};
    for (const no of new Set([...Object.keys(acct), ...Object.keys(pwAll)])) {
      const list = recs.filter(r => Number(r[2]) === Number(no)).map(r => { const s = normD(r[0]), e = normD(r[1]) || s; return { s, e, type: r[4] || "", period: r[5] || "", days: days(s, e) }; }).sort((a, b) => b.s.localeCompare(a.s));
      if (hakbunOf(no)) pubAtt[hakbunOf(no)] = list;
    }
    await cfgPut({ pubAtt }); schedulePublish(); // 드라이브 알림 자료에도 (출결을 안 연 날에도 남게 교무수첩 자료에 둠)
  }
  // 휴대폰 알림 (FCM): 그 학생들 기기로. 선생님 구글 로그인 열쇠로 바로 보냄
  async function pushTo(nos, title, body) {
    const hbs = new Set(nos.map(n => hakbunOf(n)).filter(Boolean)); if (!hbs.size) return 0;
    const targets = []; // 예전(Firebase) 등록 기기도 남아 있으면 보냄, 못 읽어도 시트 쪽은 보냄
    try { (await noticeDoc().collection("push").get()).forEach(d => { const x = d.data(); if (x.token && hbs.has(x.hakbun)) targets.push({ id: d.id, token: x.token }); }); } catch (e) {}
    // 창구(앱스 스크립트)가 드라이브 시트 '기기' 탭에 적어 둔 휴대폰도 (같은 열쇠는 한 번만)
    try { ((await batchGet(NOTICE_BOOK, ["'기기'!A2:B2000"], "FORMATTED_VALUE"))[0] || []).forEach(r => { if (r[1] && hbs.has(String(r[0])) && !targets.some(x => x.token === r[1])) targets.push({ id: "", token: String(r[1]) }); }); } catch (e) {}
    let sent = 0, why = "";
    if (!targets.length) return 0;
    // 모든 휴대폰에 한꺼번에 (창구 한 번)
    const rs = await GM(targets.map(t => ["https://fcm.googleapis.com/v1/projects/" + FB.projectId + "/messages:send", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token: t.token, notification: { title, body: body.slice(0, 180) }, webpush: { fcm_options: { link: PWA_URL } } } }) }]), true, true);
    for (const [k, t] of targets.entries()) {
      const r = rs[k];
      if (r.ok) { sent++; continue; }
      why = r.status + " " + (await r.text().catch(() => "")).slice(0, 200); console.warn("휴대폰 알림", why);
      if ((r.status === 404 || r.status === 400) && t.id) await noticeDoc().collection("push").doc(t.id).delete().catch(() => {}); // 지운 기기
    }
    if (targets.length && !sent) throw new Error("구글 알림 서버가 받지 않았어요 (" + why + ")"); // 이유를 선생님 화면에
    return sent;
  }
  const PUB_FNS = new Set(["addNote", "updateNote", "deleteNote", "saveEvents", "addCheck", "updateCheck", "deleteCheck", "saveConfig", "saveClassTT", "saveStudentTT", "setStudentPasswords", "setNoticePassword", "sendStudentMessages", "deleteStudentMessage", "saveStudents", "importFromSheet", "importFromArchive", "restoreArchive", "archiveBefore"]);
  const sendMsg = API.sendStudentMessages;
  // 학생 앱 자료 고치기와 휴대폰 알림을 동시에 (기다리는 시간을 줄임)
  API.sendStudentMessages = async (nos, text, show = true) => { const r = await sendMsg(nos, text);
    const [pub, push] = await Promise.allSettled([publishNotice(), pushTo((Array.isArray(nos) ? nos : []).map(Number), "담임 선생님 알림", show === false ? "담임 선생님 새 알림이 있어요. 앱에서 확인해 주세요." : String(text || ""))]);
    if (push.status === "fulfilled") r.pushed = push.value; else r.pushError = push.reason && push.reason.message;
    if (pub.status === "rejected") r.pushError = "학생 앱에 올리지 못했어요: " + (pub.reason && pub.reason.message); return r; };
  API.publishNow = async () => ({ problems: await publishNotice() });
  const attLoad0 = API.attLoad;
  API.attLoad = async (...a) => { const r = await attLoad0(...a); publishAtt(r.tabs).catch(e => console.warn("출결 내보내기", e)); return r; };

  // 화면 코드가 부르는 곳: 로그인·자료 준비가 끝날 때까지 기다렸다가 같은 이름의 함수를 부름
  let firstPub = false;
  window.fbCall = async (fn, ...args) => {
    await ready;
    if (!API[fn]) throw new Error("없는 기능이에요: " + fn);
    if (!firstPub) { firstPub = true; setTimeout(schedulePublish, 3000); } // 열 때 한 번 (학생 앱을 최신으로)
    const r = await API[fn](...args);
    if (PUB_FNS.has(fn) && fn !== "sendStudentMessages") schedulePublish();
    return r;
  };
  window.fbSignOut = () => { return auth.signOut().then(() => location.reload()); };
  window.fbUser = () => auth.currentUser;
})();
