// 교무수첩 Firebase 버전의 '서버': Apps Script(Code.gs)와 같은 이름·같은 모양으로 답해서 화면 코드는 그대로 씀
// 자료는 Firestore users/{uid}/data/{표이름} 문서 하나에 JSON 글로 저장 (Firestore 는 배열 안 배열을 못 넣음)
// 1단계: 자료 기능만. 드라이브가 필요한 것(파일 올리기·사진·시트 만들기·보관)은 2단계에서 이어짐
(function () {
  const FB = { apiKey: "AIzaSyCO4Mc-lGPDZWddX1E5WwAVFBh5ofc2cvc", authDomain: "gyomu-7e9e1.firebaseapp.com", projectId: "gyomu-7e9e1",
    storageBucket: "gyomu-7e9e1.firebasestorage.app", messagingSenderId: "778560026907", appId: "1:778560026907:web:82f4dab5fcbe9fcc86fbbe" };
  const OLD_SHEET = "18QiESGXlKZLdsTKEuegCWCwJagI-H6OGbnQyMbMztjs"; // 지금까지 쓰던 교무수첩 구글 시트 (가져오기용)
  const SCOPES = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"];
  firebase.initializeApp(FB);
  const auth = firebase.auth(), fs = firebase.firestore();
  fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); // 이 기기에 남겨 두어 다음에 바로 열림

  const TABLES = ["cfg", "items", "events", "memos", "notes", "checks", "logs", "todos", "teachers", "classRosters", "attend", "pmsg"];
  const EMPTY = { cfg: {}, classRosters: {} };
  let uid = null, DB = null, token = null, tokenAt = 0;
  // 구글 열쇠는 이 탭에서만 1시간 기억 (새로 고침해도 다시 묻지 않게)
  try { const t = JSON.parse(sessionStorage.getItem("gtok") || "null"); if (t && Date.now() - t.at < 50 * 60e3) { token = t.v; tokenAt = t.at; } } catch (e) {}
  const keepToken = () => { try { sessionStorage.setItem("gtok", JSON.stringify({ v: token, at: tokenAt })); } catch (e) {} };
  const col = () => fs.collection("users").doc(uid).collection("data");
  const get = t => DB[t] ?? (EMPTY[t] !== undefined ? structuredClone(EMPTY[t]) : []);
  // 표 하나를 통째로 저장 (선생님 혼자 쓰니 마지막에 쓴 것이 남음)
  async function put(t, v) { DB[t] = v; await col().doc(t).set({ v: JSON.stringify(v), at: Date.now() }); }
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
      g.querySelector("#fbRedirect").onclick = () => { const p = new firebase.auth.GoogleAuthProvider(); SCOPES.forEach(s => p.addScope(s)); auth.signInWithRedirect(p); };
    }
    g.hidden = !show; g.querySelector(".fbmsg").textContent = msg || "선생님 구글 계정으로 들어가요.";
  }
  async function login() {
    const p = new firebase.auth.GoogleAuthProvider(); SCOPES.forEach(s => p.addScope(s));
    try { const r = await auth.signInWithPopup(p); token = r.credential && r.credential.accessToken; tokenAt = Date.now(); keepToken(); }
    catch (e) {
      // 팝업이 막히면 이 창에서 구글 로그인 화면으로 넘어갔다 돌아오는 방법을 보여 줌
      const blocked = e.code === "auth/popup-blocked" || e.code === "auth/cancelled-popup-request" || e.code === "auth/popup-closed-by-user";
      gate(true, blocked ? "로그인 창(팝업)이 막혔어요. 주소창 오른쪽 끝의 팝업 차단 아이콘에서 '항상 허용'을 고르고 다시 누르거나, 아래 버튼을 눌러 주세요."
        : e.code === "auth/unauthorized-domain" ? "Firebase 승인된 도메인에 uzzint.github.io 가 없어요." : "로그인하지 못했어요: " + (e.message || e.code));
      document.querySelector("#fbGate .fbalt").hidden = false;
    }
  }
  // 이 창에서 로그인하고 돌아왔을 때 구글 열쇠 받기
  auth.getRedirectResult().then(r => { if (r && r.credential) { token = r.credential.accessToken; tokenAt = Date.now(); keepToken(); } }).catch(e => gate(true, "로그인하지 못했어요: " + (e.message || e.code)));
  auth.onAuthStateChanged(async u => {
    if (!u) { uid = null; gate(true); return; }
    uid = u.uid; gate(false);
    await load();
    if (!DB.cfg) importBanner(); else if (!DB.cfg.archives) archiveBanner();
    readyRes();
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
  async function load() {
    const snap = await col().get(); DB = {};
    snap.forEach(d => { try { DB[d.id] = JSON.parse(d.data().v); } catch (e) { /* 깨진 문서는 빈 것으로 */ } });
    // 다른 기기에서 바꾼 것도 바로 반영
    col().onSnapshot(s => s.docChanges().forEach(ch => { if (ch.doc.metadata.hasPendingWrites) return; try { DB[ch.doc.id] = JSON.parse(ch.doc.data().v); } catch (e) {} }));
  }
  // 구글 API 열쇠 (1시간짜리). 지나면 다시 로그인 창으로 받음
  async function gtoken() {
    if (token && Date.now() - tokenAt < 50 * 60e3) return token;
    const p = new firebase.auth.GoogleAuthProvider(); SCOPES.forEach(s => p.addScope(s));
    const r = await auth.currentUser.reauthenticateWithPopup(p);
    token = r.credential.accessToken; tokenAt = Date.now(); keepToken(); return token;
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
      items: get("items"), config: cfgGet("config"), timetable: cfgGet("timetable"),
      archives: Object.entries(cfgGet("archives") || {}).sort().reverse().map(([y, id]) => ({ year: Number(y), url: "https://docs.google.com/spreadsheets/d/" + id + "/edit" })),
      folder: (() => { const y = curYear(), id = ((cfgGet("drive") || {}).years || {})[y]; return id ? { year: y, url: "https://drive.google.com/drive/folders/" + id } : null; })(),
      plans: cfgGet("plans") || {}, rosters: cfgGet("rosters") || {}, students: cfgGet("students") || [], classTT: cfgGet("classTT"),
      classRosters: get("classRosters"), allTT: teachers.length ? { periods: Number(cfgGet("periods")) || 7, teachers } : null, sheet: null,
      events: get("events"), memos, dues, memoFiles,
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
      const clean = { term: termOf(cfg.term), carry, homeroom: cfg.homeroom !== false, homeroomClass: S(cfg.homeroomClass, 10).trim(), sources: cleanSources(cfg.sources),
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
    async keepTimetable(term) { term = termOf(term); if (!term) fail("학기가 올바르지 않아요."); const kept = cfgGet("kept") || {}; if (cfgGet("timetable")) kept[term] = cfgGet("timetable"); await cfgPut({ kept }); return true; },
    async saveEvents(list) {
      if (!Array.isArray(list) || list.length > 1000) fail("학사일정이 너무 많아요.");
      await put("events", list.filter(e => e && DATE_RE.test(e.date) && String(e.title || "").trim()).map(e => ({ date: e.date, title: S(e.title, 40).trim(), cat: S(e.cat, 40) }))); return getAll();
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
  // 아직 Firebase 로 옮기지 않은 것: 학년도 넘기기·되돌리기 (3월 학년도 시작 전에 이어 붙임)
  ["archiveBefore", "restoreArchive"].forEach(n => { API[n] = () => fail("새 학년도로 넘기기는 아직 예전 교무수첩에서 해 주세요. (Firebase 버전은 학년도 시작 전에 이어 붙여요)"); });

  // ---------- 구글 드라이브·시트 (로그인할 때 받은 구글 열쇠로 바로 부름) ----------
  async function G(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + await gtoken(), ...(opts.headers || {}) } });
    if (r.status === 401) { token = null; fail("구글 확인이 끝났어요. 한 번 더 눌러 주세요."); }
    if (!r.ok) { let m = ""; try { m = (await r.json()).error.message; } catch (e) {} fail("구글 드라이브·시트에서 거절했어요 (" + r.status + ") " + m); }
    return r;
  }
  const DRIVE = "https://www.googleapis.com/drive/v3/files", SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
  const FOLDER = "application/vnd.google-apps.folder";
  const q = s => encodeURIComponent(s);
  async function findOne(query) { const j = await (await G(DRIVE + "?q=" + q(query + " and trashed=false") + "&fields=files(id,name,webViewLink)&pageSize=20&orderBy=createdTime")).json(); return j.files || []; }
  async function makeFolder(name, parent) { return (await G(DRIVE + "?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined }) })).json(); }
  const curYear = () => { const t = termOf(cfgGet("config") && cfgGet("config").term); if (t) return Number(t.slice(0, 4)); const d = new Date(); return d.getMonth() + 1 <= 2 ? d.getFullYear() - 1 : d.getFullYear(); };
  // 내 드라이브 › 교무수첩 › 2026학년도 (예전 교무수첩이 만든 폴더를 그대로 씀)
  async function yearFolder() {
    const y = curYear(), d = { ...(cfgGet("drive") || {}) };
    if (d.years && d.years[y]) return d.years[y];
    if (!d.root) d.root = ((await findOne("name='교무수첩' and mimeType='" + FOLDER + "' and 'root' in parents"))[0] || await makeFolder("교무수첩")).id;
    const id = ((await findOne("name='" + y + "학년도' and mimeType='" + FOLDER + "' and '" + d.root + "' in parents"))[0] || await makeFolder(y + "학년도", d.root)).id;
    d.years = { ...(d.years || {}), [y]: id }; await cfgPut({ drive: d }); return id;
  }
  const b64ToBytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const bytesToB64 = buf => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  async function driveUpload(p) {
    const name = S(p.name, 200).trim(); if (!name) fail("파일 이름이 없어요.");
    const bytes = b64ToBytes(String(p.data || "")); if (!bytes.length) fail("빈 파일은 올릴 수 없어요."); if (bytes.length > 20 * 1024 * 1024) fail("20MB보다 큰 파일은 올릴 수 없어요.");
    const meta = { name, parents: [await yearFolder()] }, type = String(p.type || "") || "application/octet-stream";
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
    let t = (await tabsOf(OLD_SHEET)).find(s => s.title === def.name);
    if (!t) {
      const r = await (await G(SHEETS + "/" + OLD_SHEET + ":batchUpdate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: def.name, gridProperties: { frozenRowCount: def.head.length } } } }] }) })).json();
      t = r.replies[0].addSheet.properties;
      const rows = def.head.map(r => r.length ? r : [""]);
      if (def.rows) for (let i = 0; i < def.rows * (def.pair ? 2 : 1); i++) rows.push([def.pair ? (i % 2 ? "" : String(i / 2 + 1)) : String(i + 1)]);
      await G(SHEETS + "/" + OLD_SHEET + "/values/" + q("'" + def.name + "'!A1") + "?valueInputOption=RAW", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: rows }) });
    }
    return "https://docs.google.com/spreadsheets/d/" + OLD_SHEET + "/edit#gid=" + t.sheetId;
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
      await G(DRIVE + "/" + ss.spreadsheetId + "?addParents=" + await yearFolder() + "&removeParents=root&fields=id", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
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
      if (!(await tabsOf(OLD_SHEET)).some(s => s.title === def.name)) fail("아직 입력 탭이 없어요. '시트에 입력'을 먼저 눌러 주세요.");
      return [(await batchGet(OLD_SHEET, ["'" + def.name + "'!A1:CB400"], "FORMATTED_VALUE"))[0].map(r => r.map(v => String(v ?? "")))];
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

  // 화면 코드가 부르는 곳: 로그인·자료 준비가 끝날 때까지 기다렸다가 같은 이름의 함수를 부름
  window.fbCall = async (fn, ...args) => {
    await ready;
    if (!API[fn]) throw new Error("없는 기능이에요: " + fn);
    return API[fn](...args);
  };
  window.fbSignOut = () => auth.signOut().then(() => location.reload());
  window.fbUser = () => auth.currentUser;
})();
