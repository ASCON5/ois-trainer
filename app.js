// ОИС — тренажёр: карточки к итоговой. Всё работает на телефоне без сети; прогресс — в localStorage.
//
// Карточка: «новая» (ни разу не отвечал), «учу» (ошибся и ещё не закрепил), «знаю».
// Коробки как у Лейтнера: b = 0…3. Знал с первого раза — сразу b = 2 («знаю»). Ошибся — b = 0, и в этой же
// сессии карточка вернётся через 3 другие, пока не ответишь «знаю». После ошибки «знаю» нужно сказать в двух
// разных сессиях, чтобы карточка снова стала «знаю».
(function () {
  "use strict";

  const STORE = "ois-app.v1";
  const SESSION_SIZE = 15;
  const RETRY_GAP = 3;

  // ---------- данные ----------
  const ALL = [];
  TOPICS.forEach((t, ti) =>
    t.q.forEach((q, qi) => ALL.push({ id: ti + "-" + qi, ti, qi, q: q[0], key: q[1], more: q[2] || "" }))
  );
  const BY_ID = new Map(ALL.map((c) => [c.id, c]));
  const pad = (n) => String(n).padStart(2, "0");

  // ---------- хранилище ----------
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE));
      return v && typeof v === "object" ? v : {};
    } catch (e) {
      return {};
    }
  }
  const db = load();
  if (!db.cards || typeof db.cards !== "object") db.cards = {};
  if (!db.prefs || typeof db.prefs !== "object") db.prefs = {};
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(db));
    } catch (e) {}
  }

  const blank = () => ({ b: 0, ok: 0, bad: 0, t: 0 });
  const rec = (id) => Object.assign(blank(), db.cards[id]);
  function status(id) {
    const r = db.cards[id];
    if (!r || r.ok + r.bad === 0) return "new";
    return r.b >= 2 ? "know" : "learn";
  }
  function grade(id, good) {
    const r = rec(id);
    const fresh = r.ok + r.bad === 0;
    if (good) {
      r.ok++;
      r.b = fresh ? 2 : Math.min(r.b + 1, 3);
    } else {
      r.bad++;
      r.b = 0;
    }
    r.t = Date.now();
    db.cards[id] = r;
    save();
  }
  function counts(list) {
    const c = { know: 0, learn: 0, new: 0 };
    for (const x of list) c[status(x.id)]++;
    return c;
  }

  // ---------- разметка ответов ----------
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function formula(f) {
    return f
      .replace(/_\{([^}]*)\}/g, "<sub>$1</sub>")
      .replace(/\^\{([^}]*)\}/g, "<sup>$1</sup>")
      .replace(/\^(−?[0-9A-Za-zα-ω]+)/g, "<sup>$1</sup>");
  }
  function inl(s) {
    return esc(s)
      .replace(/§([^§]+)§/g, (m, f) => "<code>" + formula(f) + "</code>")
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }
  function block(src) {
    const lines = src.split("\n").map((l) => l.trim()).filter(Boolean);
    let html = "";
    let list = null;
    const close = () => {
      if (list) {
        html += "</" + list + ">";
        list = null;
      }
    };
    for (const l of lines) {
      let m;
      if (l.startsWith("- ")) {
        if (list !== "ul") {
          close();
          html += "<ul>";
          list = "ul";
        }
        html += "<li>" + inl(l.slice(2)) + "</li>";
      } else if ((m = l.match(/^(\d+)\.\s+(.*)$/))) {
        if (list !== "ol") {
          close();
          html += '<ol start="' + m[1] + '">';
          list = "ol";
        }
        html += "<li>" + inl(m[2]) + "</li>";
      } else {
        close();
        html += l.startsWith("! ") ? '<p class="tip">' + inl(l.slice(2)) + "</p>" : "<p>" + inl(l) + "</p>";
      }
    }
    close();
    return html;
  }
  const norm = (s) => s.toLowerCase().replace(/ё/g, "е").replace(/[§*]/g, "");
  const HAY = new Map(ALL.map((c) => [c.id, norm(c.q + " " + c.key + " " + c.more + " " + TOPICS[c.ti].t)]));

  // ---------- общие куски ----------
  const app = document.getElementById("app");
  const LABEL = { know: "Знаю", learn: "Учу", new: "Новый" };
  function bar(c, total, cls) {
    const w = (n) => ((n / total) * 100).toFixed(2) + "%";
    return '<div class="' + cls + '"><i class="k" style="width:' + w(c.know) + '"></i><i class="l" style="width:' + w(c.learn) + '"></i></div>';
  }
  function answerHtml(c, open) {
    return (
      '<section class="key"><span class="lbl">Суть</span><div class="txt">' + inl(c.key) + "</div></section>" +
      (c.more
        ? '<details class="more"' + (open ? " open" : "") + '><summary>Подробнее</summary><div class="body">' + block(c.more) + "</div></details>"
        : "")
    );
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const standalone = () => window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // ---------- главная ----------
  let query = "";
  let homeScroll = 0;
  let fromSearch = false;

  function viewHome() {
    const c = counts(ALL);
    const toLearn = c.learn + c.new;
    const learnN = Math.min(SESSION_SIZE, ALL.length);
    const showInstall = isIOS() && !standalone() && !db.prefs.hideInstall;
    app.innerHTML =
      '<div class="page">' +
      '<header class="hero"><p class="eyebrow">Итоговая · ' + TOPICS.length + " тема · " + ALL.length + " вопросов</p>" +
      "<h1>Обработка сигналов и изображений</h1></header>" +
      (showInstall
        ? '<div class="install" id="install"><p>Поставь на экран «Домой»: внизу Safari нажми <span class="share" aria-hidden="true"></span> <b>Поделиться</b>, потом <b>«На экран „Домой“»</b>. Будет работать без интернета.</p><button class="x" id="hideInstall" aria-label="Скрыть">✕</button></div>'
        : "") +
      '<section class="stats" aria-label="Прогресс">' + bar(c, ALL.length, "bar") +
      '<div class="legend"><span><i class="dot know"></i><b>' + c.know + "</b> знаю</span><span><i class=\"dot learn\"></i><b>" + c.learn +
      "</b> учу</span><span><i class=\"dot\"></i><b>" + c.new + "</b> новых</span></div></section>" +
      '<div class="actions">' +
      '<a class="btn btn-primary" href="#/learn/all">' + (toLearn ? "Учить · " + learnN + " карточек" : "Повторить · " + learnN + " карточек") + "</a>" +
      '<div class="row"><a class="btn btn-soft" href="#/learn/hard"' + (c.learn ? "" : ' aria-disabled="true"') + ">Трудные · " + c.learn + "</a>" +
      '<button class="btn btn-soft" id="rand">Случайный</button></div></div>' +
      '<input class="search" id="search" type="search" placeholder="Поиск: Котельников, Собель, MFCC…" autocomplete="off" enterkeyhint="search" aria-label="Поиск по вопросам и ответам">' +
      '<div id="list"></div>' +
      '<footer class="foot"><button class="link" id="reset">Сбросить прогресс</button><p>Прогресс хранится только на этом устройстве.</p></footer>' +
      "</div>";
    const search = document.getElementById("search");
    search.value = query;
    search.addEventListener("input", () => {
      query = search.value;
      paintList();
    });
    document.getElementById("rand").addEventListener("click", () => {
      const pool = ALL.filter((x) => status(x.id) !== "know");
      const list = pool.length ? pool : ALL;
      fromSearch = false;
      location.hash = "#/q/" + list[Math.floor(Math.random() * list.length)].id;
    });
    document.getElementById("reset").addEventListener("click", () => {
      if (!confirm("Сбросить все отметки «знаю» и «учу»? Это не отменить.")) return;
      db.cards = {};
      delete db.session;
      save();
      viewHome();
    });
    const hide = document.getElementById("hideInstall");
    if (hide)
      hide.addEventListener("click", () => {
        db.prefs.hideInstall = true;
        save();
        document.getElementById("install").remove();
      });
    paintList();
    window.scrollTo(0, homeScroll);
  }

  function paintList() {
    const box = document.getElementById("list");
    if (!box) return;
    const q = norm(query.trim());
    if (q) {
      const words = q.split(/\s+/);
      const hits = ALL.filter((c) => words.every((w) => HAY.get(c.id).includes(w)));
      box.innerHTML =
        '<h2 class="section-title">Найдено: ' + hits.length + "</h2>" +
        (hits.length
          ? '<div class="list">' +
            hits
              .slice(0, 40)
              .map(
                (c) =>
                  '<a class="qrow" data-search href="#/q/' + c.id + '"><i class="dot ' + status(c.id) + '"></i><span class="tt">' + esc(c.q) +
                  '<span class="tsmall">' + pad(c.ti + 1) + " · " + esc(TOPICS[c.ti].t) + "</span></span></a>"
              )
              .join("") +
            "</div>"
          : '<div class="list"><p class="empty">Ничего не нашлось. Попробуй другое слово.</p></div>');
      box.querySelectorAll("[data-search]").forEach((a) => a.addEventListener("click", () => (fromSearch = true)));
      return;
    }
    box.innerHTML =
      '<h2 class="section-title">Темы</h2><div class="list">' +
      TOPICS.map((t, ti) => {
        const qs = ALL.filter((c) => c.ti === ti);
        const c = counts(qs);
        return (
          '<a class="trow" href="#/topic/' + ti + '"><span class="tno">' + pad(ti + 1) + '</span><span class="tt">' + esc(t.t) +
          bar(c, qs.length, "tbar") + '</span><span class="tc' + (c.know === qs.length ? " full" : "") + '">' + c.know + "/" + qs.length + "</span></a>"
        );
      }).join("") +
      "</div>";
  }

  // ---------- тема ----------
  function viewTopic(ti) {
    const t = TOPICS[ti];
    const qs = ALL.filter((c) => c.ti === ti);
    const c = counts(qs);
    app.innerHTML =
      '<div class="page"><header class="top"><a class="back" href="#/">Темы</a></header>' +
      '<div class="thead"><span class="tno">Тема ' + pad(ti + 1) + "</span><h1>" + esc(t.t) + '</h1><p class="tsub">' + esc(t.s) + "</p></div>" +
      '<section class="stats">' + bar(c, qs.length, "bar") +
      '<div class="legend"><span><i class="dot know"></i><b>' + c.know + "</b> знаю</span><span><i class=\"dot learn\"></i><b>" + c.learn +
      "</b> учу</span><span><i class=\"dot\"></i><b>" + c.new + "</b> новых</span></div></section>" +
      '<div class="actions"><a class="btn btn-primary" href="#/learn/t' + ti + '">Учить тему · ' + qs.length + " вопросов</a></div>" +
      '<div class="list">' +
      qs
        .map((x) => '<a class="qrow" href="#/q/' + x.id + '"><i class="dot ' + status(x.id) + '"></i><span class="tt">' + esc(x.q) + "</span></a>")
        .join("") +
      "</div></div>";
    window.scrollTo(0, 0);
  }

  // ---------- вопрос (чтение) ----------
  function viewQuestion(id) {
    const c = BY_ID.get(id);
    const t = TOPICS[c.ti];
    const qs = ALL.filter((x) => x.ti === c.ti);
    const prev = qs[c.qi - 1];
    const next = qs[c.qi + 1];
    const s = status(id);
    const backHref = fromSearch ? "#/" : "#/topic/" + c.ti;
    app.innerHTML =
      '<div class="page"><header class="top"><a class="back" href="' + backHref + '">' + (fromSearch ? "Поиск" : "Тема " + pad(c.ti + 1)) +
      '</a><span class="sp"></span><span class="chip ' + s + '" id="chip">' + LABEL[s] + "</span></header>" +
      '<p class="meta">' + pad(c.ti + 1) + " · " + esc(t.t) + " · вопрос " + (c.qi + 1) + " из " + qs.length + "</p>" +
      '<h1 class="qh">' + esc(c.q) + "</h1>" +
      '<section class="key"><span class="lbl">Суть</span><div class="txt">' + inl(c.key) + "</div></section>" +
      (c.more ? '<div class="more flat"><div class="body"><span class="lbl">Подробнее</span>' + block(c.more) + "</div></div>" : "") +
      '<div class="row mark"><button class="btn btn-again" id="mBad">Не знаю</button><button class="btn btn-know" id="mGood">Знаю</button></div>' +
      '<nav class="pn"><a href="' + (prev ? "#/q/" + prev.id : "#") + '"' + (prev ? "" : ' aria-disabled="true"') + ">‹ Предыдущий</a>" +
      '<a href="' + (next ? "#/q/" + next.id : "#") + '"' + (next ? "" : ' aria-disabled="true"') + ">Следующий ›</a></nav></div>";
    const paint = () => {
      const st = status(id);
      const chip = document.getElementById("chip");
      chip.className = "chip " + st;
      chip.textContent = LABEL[st];
    };
    document.getElementById("mBad").addEventListener("click", () => {
      grade(id, false);
      paint();
    });
    document.getElementById("mGood").addEventListener("click", () => {
      grade(id, true);
      paint();
    });
    window.scrollTo(0, 0);
  }

  // ---------- учёба ----------
  const validScope = (s) => s === "all" || s === "hard" || (/^t\d+$/.test(s) && TOPICS[+s.slice(1)] !== undefined);
  function scopePool(scope) {
    if (scope === "all") return ALL;
    if (scope === "hard") return ALL.filter((c) => status(c.id) === "learn");
    return ALL.filter((c) => c.ti === +scope.slice(1));
  }
  function newSession(scope) {
    const pool = scopePool(scope);
    const byAge = (a, b) => rec(a.id).b - rec(b.id).b || rec(a.id).t - rec(b.id).t;
    const learn = pool.filter((c) => status(c.id) === "learn").sort(byAge);
    const fresh = pool.filter((c) => status(c.id) === "new");
    const know = pool.filter((c) => status(c.id) === "know").sort(byAge);
    const size = scope.startsWith("t") ? pool.length : SESSION_SIZE;
    const picked = learn.concat(fresh, know).slice(0, size).map((c) => c.id);
    return { scope, queue: shuffle(picked), total: picked.length, first: {}, done: 0, shown: false };
  }
  function viewLearn(scope) {
    let s = db.session && db.session.scope === scope && db.session.queue.length ? db.session : null;
    if (!s) {
      s = newSession(scope);
      db.session = s;
      save();
    }
    paintLearn();
  }
  function endSession() {
    delete db.session;
    save();
  }
  function exitHref(scope) {
    return scope.startsWith("t") ? "#/topic/" + scope.slice(1) : "#/";
  }

  function paintLearn() {
    const s = db.session;
    if (!s.queue.length) return paintDone(s);
    const c = BY_ID.get(s.queue[0]);
    if (!c) {
      s.queue.shift();
      save();
      return paintLearn();
    }
    const repeat = s.first[c.id] === "bad";
    app.innerHTML =
      '<div class="study"><header class="ltop"><a class="icon" href="' + exitHref(s.scope) + '" id="lclose" aria-label="Закончить">✕</a>' +
      '<div class="lprog"><i style="width:' + ((s.done / s.total) * 100).toFixed(1) + '%"></i></div><span class="lcount">' + s.done + "/" + s.total + "</span></header>" +
      '<main class="lbody"><p class="meta">' + pad(c.ti + 1) + " · " + esc(TOPICS[c.ti].t) + "</p>" +
      '<h1 class="qh">' + esc(c.q) + "</h1>" +
      (repeat ? '<span class="again-note">Ещё раз — в прошлый раз не вспомнил</span>' : "") +
      '<div id="ans"' + (s.shown ? "" : " hidden") + ">" + answerHtml(c, !!db.prefs.moreOpen) + "</div></main>" +
      '<footer class="lbar' + (s.shown ? " two" : "") + '" id="lbar"></footer></div>';
    document.getElementById("lclose").addEventListener("click", endSession);
    const det = app.querySelector(".more");
    if (det)
      det.addEventListener("toggle", () => {
        db.prefs.moreOpen = det.open;
        save();
      });
    paintBar();
    window.scrollTo(0, 0);
  }

  function paintBar() {
    const s = db.session;
    const barEl = document.getElementById("lbar");
    if (!s.shown) {
      barEl.className = "lbar";
      barEl.innerHTML = '<button class="btn btn-primary" id="lreveal">Показать ответ</button><p class="hint">Пробел — показать ответ</p>';
      document.getElementById("lreveal").addEventListener("click", reveal);
    } else {
      barEl.className = "lbar two";
      barEl.innerHTML = '<button class="btn btn-again" id="lbad">Не знаю</button><button class="btn btn-know" id="lgood">Знаю</button>';
      document.getElementById("lbad").addEventListener("click", () => answer(false));
      document.getElementById("lgood").addEventListener("click", () => answer(true));
    }
  }
  function reveal() {
    const s = db.session;
    if (!s || s.shown) return;
    s.shown = true;
    save();
    document.getElementById("ans").hidden = false;
    paintBar();
  }
  function answer(good) {
    const s = db.session;
    if (!s || !s.shown) return;
    const id = s.queue.shift();
    grade(id, good);
    if (!s.first[id]) s.first[id] = good ? "ok" : "bad";
    if (good) s.done++;
    else s.queue.splice(Math.min(RETRY_GAP, s.queue.length), 0, id);
    s.shown = false;
    save();
    paintLearn();
  }

  function paintDone(s) {
    const ids = Object.keys(s.first);
    const okFirst = ids.filter((id) => s.first[id] === "ok").length;
    const again = ids.length - okFirst;
    const pct = s.total ? Math.round((okFirst / s.total) * 100) : 0;
    const R = 50;
    const L = 2 * Math.PI * R;
    const all = counts(ALL);
    const left = scopePool(s.scope).length;
    const scope = s.scope;
    const moreLabel = scope.startsWith("t") ? "Ещё раз тему" : scope === "hard" ? "Ещё трудные" : "Ещё " + SESSION_SIZE + " карточек";
    const canMore = scope !== "hard" || left > 0;
    endSession();
    app.innerHTML =
      '<div class="study"><div class="done">' +
      '<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="С первого раза ' + pct + '%">' +
      '<circle class="bgc" cx="60" cy="60" r="' + R + '"/><circle class="fg" cx="60" cy="60" r="' + R + '" stroke-dasharray="' + L.toFixed(1) +
      '" stroke-dashoffset="' + (L * (1 - pct / 100)).toFixed(1) + '" transform="rotate(-90 60 60)"/>' +
      '<text x="60" y="60" text-anchor="middle" dominant-baseline="central">' + pct + "%</text></svg>" +
      '<p class="big">' + (s.total ? (pct >= 80 ? "Отлично!" : pct >= 50 ? "Неплохо" : "Будем повторять") : "Тут пусто") + "</p>" +
      "<p>" + (s.total ? "С первого раза вспомнил " + okFirst + " из " + s.total : "Трудных карточек нет — всё, что учил, уже знаешь.") + "</p>" +
      '<div class="res"><div class="ok"><b>' + okFirst + '</b><span>знал сразу</span></div><div class="ag"><b>' + again + "</b><span>повторили</span></div></div>" +
      '<p>Всего знаю ' + all.know + " из " + ALL.length + "</p></div>" +
      '<footer class="lbar">' +
      (canMore ? '<button class="btn btn-primary" id="more">' + moreLabel + "</button>" : "") +
      '<a class="btn btn-soft" href="' + exitHref(scope) + '">' + (scope.startsWith("t") ? "К теме" : "На главную") + "</a></footer></div>";
    const more = document.getElementById("more");
    if (more)
      more.addEventListener("click", () => {
        db.session = newSession(scope);
        save();
        paintLearn();
      });
    window.scrollTo(0, 0);
  }

  // клавиатура — для учёбы с компьютера
  document.addEventListener("keydown", (e) => {
    if (!db.session || !document.getElementById("lbar") || e.target.closest("input,textarea")) return;
    if (e.key === " " || e.key === "Enter") {
      if (!db.session.shown) {
        e.preventDefault();
        reveal();
      }
    } else if (e.key === "1" || e.key === "ArrowLeft") answer(false);
    else if (e.key === "2" || e.key === "ArrowRight") answer(true);
  });

  // ---------- переходы ----------
  let current = "";
  function route() {
    if (current === "home") homeScroll = window.scrollY;
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    const a = parts[0];
    const b = parts[1];
    if (a === "topic" && TOPICS[+b] && b !== "") {
      current = "topic";
      fromSearch = false;
      return viewTopic(+b);
    }
    if (a === "q" && BY_ID.has(b)) {
      current = "q";
      return viewQuestion(b);
    }
    if (a === "learn" && validScope(b)) {
      current = "learn";
      return viewLearn(b);
    }
    current = "home";
    fromSearch = false;
    viewHome();
  }
  window.addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
