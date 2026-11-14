// EoJ – shared helpers for every game on Edwards och Johns spel.
//
// Load with:  <script src="../../shared/config.js"></script>
//             <script src="../../shared/eoj.js"></script>
// (adjust ../ to the game's folder depth). Everything lives on window.EOJ.
//
//   EOJ.share({ game, text, url })           share sheet / copy link + GoatCounter event
//   EOJ.today()                               'YYYY-MM-DD' in Swedish time (same day for everyone)
//   EOJ.dailySeed(salt) / EOJ.rng(seed)       same random numbers for everyone today
//   EOJ.submitScore(board, name, score, opt)  save to leaderboard (online if configured, else this device)
//   EOJ.topScores(board, opt)                 top 10, best score per name
//   EOJ.resultPanel(opts)                     ready-made "share + leaderboard" box to drop into a results screen
//   EOJ.toast(msg)
(function () {
  'use strict';
  if (window.EOJ) return;

  const SITE = 'https://edhb15.github.io/EoJ-spel/';
  const lang = (document.documentElement.lang || 'sv').slice(0, 2) === 'en' ? 'en' : 'sv';
  const T = {
    sv: {
      share: '📤 Dela resultatet',
      copied: 'Kopierat – skicka till en kompis!',
      board: 'Topplista',
      boardDaily: 'Dagens topplista',
      local: 'Sparas på den här enheten',
      name: 'Ditt namn',
      save: 'Spara',
      saved: 'Sparat!',
      empty: 'Inga resultat än – bli först!',
      badName: 'Välj ett annat namn',
      loading: 'Laddar…',
      error: 'Kunde inte ladda topplistan',
      you: 'du',
    },
    en: {
      share: '📤 Share result',
      copied: 'Copied – send it to a friend!',
      board: 'Leaderboard',
      boardDaily: "Today's leaderboard",
      local: 'Saved on this device',
      name: 'Your name',
      save: 'Save',
      saved: 'Saved!',
      empty: 'No scores yet – be the first!',
      badName: 'Pick another name',
      loading: 'Loading…',
      error: "Couldn't load the leaderboard",
      you: 'you',
    },
  }[lang];

  // ---------------------------------------------------------------- styles
  const css = `
.eoj-toast{position:fixed;left:50%;bottom:28px;z-index:2147483647;padding:12px 20px;border-radius:12px;background:#f4f4ff;color:#0b0b16;font:700 15px system-ui,sans-serif;box-shadow:0 10px 30px #0008;opacity:0;transform:translate(-50%,20px);transition:.25s;pointer-events:none}
.eoj-toast.show{opacity:1;transform:translate(-50%,0)}
.eoj-panel{font:14px/1.4 system-ui,"Segoe UI",sans-serif;color:#f4f4ff;background:#151526ee;border:1px solid #3a3a5c;border-radius:14px;padding:14px 16px;margin:14px auto 0;max-width:360px;width:100%;text-align:left;box-sizing:border-box;pointer-events:auto}
.eoj-panel *{box-sizing:border-box}
.eoj-panel button,.eoj-panel input{margin:0;box-shadow:none;text-shadow:none;text-transform:none;letter-spacing:normal;transform:none;height:auto;line-height:1.2;min-width:0;min-height:0;font-style:normal}
.eoj-panel ol,.eoj-panel li{font-style:normal;text-transform:none;letter-spacing:normal}
.eoj-share{display:block;width:100%;padding:11px 14px;border:0;border-radius:10px;background:linear-gradient(90deg,#5ee7ff,#a970ff);color:#0b0b16;font:800 15px system-ui,sans-serif;cursor:pointer}
.eoj-share:hover{filter:brightness(1.1)}
.eoj-head{display:flex;justify-content:space-between;align-items:baseline;margin:14px 0 6px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;font-size:12px;color:#5ee7ff}
.eoj-head small{color:#8d8db0;font-weight:600;text-transform:none;letter-spacing:0}
.eoj-list{list-style:none;margin:0;padding:0;max-height:220px;overflow:auto}
.eoj-list li{display:flex;gap:8px;padding:4px 6px;border-radius:6px}
.eoj-list li:nth-child(odd){background:#ffffff08}
.eoj-list li.me{background:#5ee7ff25;font-weight:700}
.eoj-list .r{width:22px;color:#8d8db0}
.eoj-list .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.eoj-list .s{font-variant-numeric:tabular-nums;font-weight:700}
.eoj-form{display:flex;gap:6px;margin-top:8px}
.eoj-form input{flex:1;min-width:0;padding:9px 10px;border-radius:8px;border:1px solid #3a3a5c;background:#0b0b16;color:#f4f4ff;font:15px system-ui,sans-serif}
.eoj-form button{padding:9px 14px;border:0;border-radius:8px;background:#f4f4ff;color:#0b0b16;font:800 14px system-ui,sans-serif;cursor:pointer}
.eoj-form button:disabled{opacity:.5;cursor:default}
.eoj-msg{min-height:18px;margin-top:4px;font-size:12px;color:#8d8db0}`;
  function injectCss() {
    if (document.getElementById('eoj-css')) return;
    const s = document.createElement('style');
    s.id = 'eoj-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------------------------------------------------------------- utils
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('eoj:' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('eoj:' + k, JSON.stringify(v));
      } catch (e) {}
    },
  };

  function track(path, title) {
    try {
      if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path, title, event: true });
    } catch (e) {}
  }

  let toastEl, toastTimer;
  function toast(msg) {
    injectCss();
    if (!toastEl) {
      toastEl = el('div', 'eoj-toast');
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  function gameUrl() {
    return location.href.split('#')[0].split('?')[0];
  }

  async function share({ game, text, url }) {
    url = url || gameUrl();
    track('dela-resultat-' + (game || 'spel'), 'dela resultat: ' + (game || 'spel'));
    if (navigator.share) {
      try {
        await navigator.share({ title: game, text, url });
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
      }
    }
    const full = text + '\n' + url;
    try {
      await navigator.clipboard.writeText(full);
      toast(T.copied);
      return true;
    } catch (e) {
      window.prompt(T.copied, full);
      return true;
    }
  }

  // ---------------------------------------------------------------- daily
  function today() {
    try {
      return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function dailySeed(salt) {
    return hash(today() + ':' + (salt || ''));
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- names
  // Leaderboards are public: keep names short and clean.
  const BAD = ['fitta', 'kuk', 'hora', 'jävla', 'javla', 'neger', 'nigg', 'fuck', 'shit', 'cunt', 'dick', 'bitch', 'whore', 'slut', 'cock', 'pussy', 'hitler', 'nazi', 'rape', 'våldt', 'bög', 'fag', 'retard', 'mongo', 'porr', 'porn', 'sex'];
  function cleanName(raw) {
    const n = String(raw || '')
      .replace(/[^\p{L}\p{N} _\-.]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12);
    if (!n) return null;
    const flat = n.toLowerCase().replace(/[^a-zåäö]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's');
    if (BAD.some((b) => flat.includes(b))) return null;
    return n;
  }

  // ---------------------------------------------------------------- leaderboard backend
  function cfg() {
    const c = window.EOJ_CONFIG || {};
    return c.supabaseUrl && c.supabaseKey ? c : null;
  }
  // Supabase accepts both old "anon" keys (JWTs, also sent as Bearer) and new "sb_publishable_…" keys (apikey only).
  function headers(c, extra) {
    const h = Object.assign({ apikey: c.supabaseKey }, extra || {});
    if (/^eyJ/.test(c.supabaseKey)) h.Authorization = 'Bearer ' + c.supabaseKey;
    return h;
  }
  function isOnline() {
    return !!cfg();
  }
  function cleanBoard(b) {
    return String(b).toLowerCase().replace(/[^a-z0-9\-_.:]/g, '').slice(0, 60);
  }

  async function submitScore(board, name, score, opt) {
    board = cleanBoard(board);
    name = cleanName(name);
    if (!name || !isFinite(score)) throw new Error('bad');
    const c = cfg();
    if (c) {
      const r = await fetch(c.supabaseUrl.replace(/\/$/, '') + '/rest/v1/scores', {
        method: 'POST',
        headers: headers(c, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ board, name, score }),
      });
      if (!r.ok) throw new Error('save failed ' + r.status);
    } else {
      const list = store.get('lb:' + board, []);
      list.push({ name, score, t: Date.now() });
      list.sort((a, b) => ((opt && opt.lowerIsBetter) ? a.score - b.score : b.score - a.score));
      store.set('lb:' + board, list.slice(0, 50));
    }
    track('topplista-' + board.split(':')[0], 'topplista: ' + board.split(':')[0]);
    return name;
  }

  async function topScores(board, opt) {
    board = cleanBoard(board);
    const low = !!(opt && opt.lowerIsBetter);
    let rows;
    const c = cfg();
    if (c) {
      const q = 'board=eq.' + encodeURIComponent(board) + '&select=name,score&order=score.' + (low ? 'asc' : 'desc') + '&limit=100';
      const r = await fetch(c.supabaseUrl.replace(/\/$/, '') + '/rest/v1/scores?' + q, {
        headers: headers(c),
      });
      if (!r.ok) throw new Error('load failed ' + r.status);
      rows = await r.json();
    } else {
      rows = store.get('lb:' + board, []);
    }
    // best score per name
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const k = row.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(row);
      if (out.length >= ((opt && opt.limit) || 10)) break;
    }
    return out;
  }

  // ---------------------------------------------------------------- result panel
  // opts: {
  //   game: 'Stunt Rider 3D',          name used in share text + stats
  //   score: 12345,                    number saved to the leaderboard
  //   display: '12 345 p',             how the score is shown (default: score)
  //   format: (n) => string,           how other leaderboard scores are shown
  //   lowerIsBetter: false,            true for times
  //   board: 'stunt-rider:stunt',      leaderboard id (omit = no leaderboard)
  //   daily: false,                    true = board is per day (date added automatically)
  //   shareText: '…',                  text for the share button
  //   url: optional link to share (default: this game)
  // }
  // Returns the panel element. Stops key presses inside the name box reaching the game.
  function resultPanel(o) {
    injectCss();
    const fmt = o.format || ((n) => String(n));
    const board = o.board ? (o.daily ? o.board + ':' + today() : o.board) : null;
    const p = el('div', 'eoj-panel');
    ['keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach((ev) => p.addEventListener(ev, (e) => e.stopPropagation()));

    const shareBtn = el('button', 'eoj-share', T.share);
    shareBtn.type = 'button';
    shareBtn.addEventListener('click', () => share({ game: o.game, text: o.shareText, url: o.url }));
    p.appendChild(shareBtn);

    if (!board) return p;

    const head = el('div', 'eoj-head');
    head.appendChild(el('span', '', o.daily ? T.boardDaily : T.board));
    if (!isOnline()) head.appendChild(el('small', '', T.local));
    p.appendChild(head);
    const list = el('ol', 'eoj-list');
    p.appendChild(list);

    let myName = null;
    async function refresh() {
      list.innerHTML = '';
      list.appendChild(el('li', '', T.loading));
      try {
        const rows = await topScores(board, { lowerIsBetter: o.lowerIsBetter });
        list.innerHTML = '';
        if (!rows.length) list.appendChild(el('li', '', T.empty));
        rows.forEach((r, i) => {
          const li = el('li', myName && r.name.toLowerCase() === myName.toLowerCase() ? 'me' : '');
          li.appendChild(el('span', 'r', i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1 + '.'));
          li.appendChild(el('span', 'n', r.name));
          li.appendChild(el('span', 's', fmt(r.score)));
          list.appendChild(li);
        });
      } catch (e) {
        list.innerHTML = '';
        list.appendChild(el('li', '', T.error));
      }
    }

    if (isFinite(o.score) && o.score > 0) {
      const form = el('form', 'eoj-form');
      const input = el('input');
      input.maxLength = 12;
      input.placeholder = T.name;
      input.value = store.get('name', '');
      input.autocomplete = 'nickname';
      const btn = el('button', '', T.save + ' ' + (o.display || fmt(o.score)));
      btn.type = 'submit';
      form.appendChild(input);
      form.appendChild(btn);
      const msg = el('div', 'eoj-msg');
      p.appendChild(form);
      p.appendChild(msg);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const n = cleanName(input.value);
        if (!n) {
          msg.textContent = T.badName;
          return;
        }
        btn.disabled = true;
        try {
          myName = await submitScore(board, n, o.score, { lowerIsBetter: o.lowerIsBetter });
          store.set('name', myName);
          msg.textContent = T.saved;
          form.remove();
          refresh();
        } catch (err) {
          msg.textContent = T.error;
          btn.disabled = false;
        }
      });
    }
    refresh();
    return p;
  }

  window.EOJ = { SITE, lang, share, toast, today, dailySeed, rng, cleanName, submitScore, topScores, resultPanel, isOnline, track, store };
})();
