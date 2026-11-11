      /* ---------- Душа: интерфейс ---------- */
      // Пять вкладок вместо шести и сорока карточек: Обзор, Путь, Память, Характер и Настройки.
      // Всё, что Яэри делает сама, показывается как итог; ручные кнопки «подумать/уснуть/учиться» убраны.
      var SOUL_TABS = ['now', 'path', 'memory', 'char', 'set'];
      var SOUL_TAB_KEY = 'yaeri-soul-tab2';
      var soulTab = 'now';
      var SVGNS = 'http://www.w3.org/2000/svg';
      var TONE_FACE = { joy: 'happy', sad: 'sorry', sleepy: 'sleep', think: 'think', calm: 'idle' };
      var TONE_HINT = {
        tired: 'Отвечает короче и мягче, без лишних вопросов.', hurry: 'Сначала результат, коротко, без вступлений.',
        tense: 'Спокойный тон, без шуток; сначала про чувства.', sad: 'Тепло, не торопит с советами, сначала слушает.',
        joy: 'Делит радость, говорит живее.', neutral: 'Явных признаков усталости или спешки нет.'
      };
      var INTENSITY_NOTE = {
        off: 'Только разговоры, сон и раздумья. Своих целей и догадок нет.',
        quiet: 'Редко: догадки раз в несколько часов, цели раз в сутки.',
        normal: 'Раз в пару часов задумывается о вас, цели обновляет несколько раз в день.',
        active: 'Часто: думает о вас каждые 45 минут. Запросов больше.'
      };
      var DEPTH_FLAGS = [
        ['rhythm', 'Предчувствие', 'Замечает выгорание и застревание по ритму сообщений'],
        ['foresight', 'Варианты будущего', 'Перед советом прогоняет 2–3 сценария'],
        ['character', 'Свой характер', 'Вкусы, привычки и причуды растут сами'],
        ['philosophy', 'Принципы', 'Формулирует, во что верит, и помнит, откуда это'],
        ['skills', 'Свои навыки', 'Пишет себе сценарии; включаются после вашего «Да»'],
        ['review', 'Самоулучшение', 'Перечитывает ответы и предлагает правки себя']
      ];
      var FREE_FLAGS = [
        ['boredom', 'Скука и свои занятия', 'Если вы молчите дольше получаса, ей скучно, и она сама чем-то занимается'],
        ['create', 'Творчество без запроса', 'Стихи, истории, рисунки и находки в памяти — в подарок вам'],
        ['will', 'Свободная воля', 'Может мягко отказаться от прихоти или не согласиться — с причиной'],
        ['hurt', 'Может обижаться', 'На грубость — обида с причиной; прощает, когда помиритесь или пройдёт время']
      ];
      var WILL_ICON = { decline: 'hand', disagree: 'scale', hurt: 'cloud', forgive: 'heart' };
      var TOPIC_MODES = [['open', 'Открыто'], ['hold', 'Не использовать без запроса'], ['off', 'Не запоминать']];
      var TRAIT_COLORS = ['hsl(43 92% 62%)', 'hsl(28 90% 62%)', 'hsl(338 75% 70%)', 'hsl(186 70% 62%)', 'hsl(262 65% 74%)', 'hsl(96 50% 60%)'];
      var MASTERY_ICON = { talk: 'chat', think: 'thought', memory: 'book', know: 'eye', bond: 'heart', world: 'globe' };

      /* Векторные иконки: одна линия, цвет от текста. */
      var ICONS = {
        spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
        star: 'M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4 6.9 19.2 8 13.5 3.7 9.5l5.8-.7z',
        moon: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z',
        book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5',
        bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
        question: 'M9.2 9a3 3 0 1 1 4.2 2.8c-.9.4-1.4 1.1-1.4 2.1v.6M12 18h.01M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19z',
        compass: 'M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19zM15.5 8.5l-2 5-5 2 2-5z',
        target: 'M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12.01V12',
        sprout: 'M12 21v-9M12 12C12 7 8 5 4 5c0 4 3 7 8 7zM12 14c0-4 3-6 7-6 0 3.5-2.5 6-7 6z',
        trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 21h7M9.5 17h5v4h-5z',
        map: 'M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20',
        thought: 'M7 17.5C4.5 17.5 3 15.8 3 13.8c0-1.8 1.3-3.3 3-3.6C6.4 7.2 8.8 5 11.8 5c2.6 0 4.8 1.7 5.6 4 2 .3 3.6 2 3.6 4.1 0 2.4-1.9 4.4-4.4 4.4zM8 20.5h.01M5 22.5h.01',
        scroll: 'M7 4h11a2 2 0 0 1 2 2v1h-4M7 4a2 2 0 0 0-2 2v12a2 2 0 0 1-2 2h11a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2M8.5 9.5h4M8.5 13h4',
        tool: 'M14.5 6.5a4 4 0 0 0 5 5l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 0-2-2zM14.5 6.5L17 4l3 3-2.5 2.5',
        mirror: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 15v6M9 21h6M9.5 6.5l-2 2',
        search: 'M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM16 16l4.5 4.5',
        lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2.5',
        unlock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2M12 15v2.5',
        heart: 'M12 20.5s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.5c0 5.5-7.5 10-7.5 10z',
        chat: 'M4 5h16v11H9l-5 4z',
        eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        globe: 'M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19zM2.5 12h19M12 2.5c2.6 2.8 3.8 6 3.8 9.5s-1.2 6.7-3.8 9.5c-2.6-2.8-3.8-6-3.8-9.5S9.4 5.3 12 2.5z',
        cloud: 'M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9zM9 21l1-2M13 21l1-2',
        check: 'M5 12.5l4.5 4.5L19 7.5',
        cross: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
        pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v8',
        gift: 'M4 10h16v11H4zM3 7h18v3H3zM12 7v14M12 7C10.5 4 7 3.5 7 5.8 7 7 9.5 7 12 7zM12 7c1.5-3 5-3.5 5-1.2C17 7 14.5 7 12 7z',
        feather: 'M20 4C13 4 7 9 6 17l-2 3.5M6 17c4.5 0 9.5-3 12-9M9.5 13.5H15',
        hand: 'M7 11V5.5a1.5 1.5 0 0 1 3 0V11M10 10V4a1.5 1.5 0 0 1 3 0v6M13 10V5a1.5 1.5 0 0 1 3 0v7M16 10.5a1.5 1.5 0 0 1 3 0V15a6.5 6.5 0 0 1-6.5 6.5H12a6 6 0 0 1-5-2.7L4.3 14.6a1.5 1.5 0 0 1 2.6-1.5L7 13.5',
        scale: 'M12 4v17M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z'
      };
      var FEED_ICON = {
        nudge: 'cloud', character: 'star', principle: 'scroll', skill: 'tool', proposal: 'mirror', review: 'search', study: 'book',
        insight: 'bulb', question: 'question', lesson: 'compass', goal: 'target', map: 'map', 'goal-new': 'sprout', 'goal-done': 'trophy',
        sleep: 'moon', reflection: 'thought', muse: 'thought', milestone: 'star', dream: 'moon', secret: 'lock', moment: 'pin',
        change: 'spark', bond: 'heart', birth: 'sprout', create: 'gift', bored: 'feather', will: 'hand'
      };
      function ico(name, cls) {
        return '<svg class="ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (ICONS[name] || ICONS.spark) + '"/></svg>';
      }
      function icoEl(name, cls) { var s = el('span', 'ico-wrap' + (cls ? ' ' + cls : '')); s.innerHTML = ico(name); return s; }
      function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
      function smallBtn(text, label, fn, cls) {
        var b = el('button', cls || '', text);
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.title = label;
        b.addEventListener('click', fn);
        return b;
      }
      function xBtn(label, fn) { var b = smallBtn('', label, fn, 'sx-x'); b.innerHTML = ico('cross'); return b; }
      function emptyLi(ul, text) { ul.appendChild(el('li', 'sx-empty', text)); }
      function busyIn(node) { var a = document.activeElement; return !!(a && node && node.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)); }
      function soulTone(name) {
        name = String(name || '').toLowerCase();
        if (/груст|тоск|печал|скуч|тревож|обид|одинок|винов/.test(name)) return 'sad';
        if (/сонн|сон\b|уста|дрем|покой|умирот/.test(name)) return 'sleepy';
        if (/раздум|задум|любопыт|интерес|размышл|сосредоточ/.test(name)) return 'think';
        if (/рад|счаст|весел|игрив|восторг|довольн|вдохнов|нежн|тепл/.test(name)) return 'joy';
        return 'calm';
      }
      function dayLabel(key) { return String(key).slice(8, 10) + '.' + String(key).slice(5, 7); }
      function dayMs(key) { var p = String(key).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
      function chartEmpty(box, text) { box.innerHTML = '<div class="chart-empty">' + esc(text) + '</div>'; }
      function arc(cx, cy, r, a0, a1) {
        // Дуга по часовой стрелке от угла a0 до a1 (градусы, 0 — вверх).
        var p0 = [cx + r * Math.sin(a0 * Math.PI / 180), cy - r * Math.cos(a0 * Math.PI / 180)];
        var p1 = [cx + r * Math.sin(a1 * Math.PI / 180), cy - r * Math.cos(a1 * Math.PI / 180)];
        return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
      }
      function starPath(x, y, r) {
        // Четырёхлучевая искра.
        var k = r * 0.28;
        return 'M' + x + ' ' + (y - r) + ' Q' + (x + k) + ' ' + (y - k) + ' ' + (x + r) + ' ' + y + ' Q' + (x + k) + ' ' + (y + k) + ' ' + x + ' ' + (y + r) + ' Q' + (x - k) + ' ' + (y + k) + ' ' + (x - r) + ' ' + y + ' Q' + (x - k) + ' ' + (y - k) + ' ' + x + ' ' + (y - r) + 'Z';
      }
      function goldDefs(id) {
        return '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c8"/><stop offset=".45" stop-color="#f6c84f"/><stop offset="1" stop-color="#a8701a"/></linearGradient>' +
          '<radialGradient id="' + id + 'r"><stop offset="0" stop-color="#ffd76a" stop-opacity=".55"/><stop offset=".6" stop-color="#f0a92c" stop-opacity=".12"/><stop offset="1" stop-color="#f0a92c" stop-opacity="0"/></radialGradient>' +
          '<filter id="' + id + 'f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
      }

      /* ---------- Вкладки ---------- */
      function showSoulTab(name, focus) {
        if (SOUL_TABS.indexOf(name) < 0) name = 'now';
        soulTab = name;
        SOUL_TABS.forEach(function (k) {
          var t = $('stab-' + k);
          t.setAttribute('aria-selected', k === name ? 'true' : 'false');
          t.tabIndex = k === name ? 0 : -1;
          $('sp-' + k).hidden = k !== name;
          if (k === name && focus) t.focus();
        });
        try { localStorage.setItem(SOUL_TAB_KEY, name); } catch (e) { /* без запоминания вкладки */ }
        renderSoulParts();
        fitSoulText($('soul-self'));
        fitSoulText($('soul-portrait'));
      }
      each(document.querySelectorAll('.stab'), function (b) {
        b.addEventListener('click', function () { showSoulTab(b.getAttribute('data-sp')); });
        b.addEventListener('keydown', function (e) {
          var i = SOUL_TABS.indexOf(b.getAttribute('data-sp'));
          if (e.key === 'ArrowRight') { e.preventDefault(); showSoulTab(SOUL_TABS[(i + 1) % SOUL_TABS.length], true); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); showSoulTab(SOUL_TABS[(i + SOUL_TABS.length - 1) % SOUL_TABS.length], true); }
        });
      });
      (function () {
        var saved = 'now';
        try { saved = localStorage.getItem(SOUL_TAB_KEY) || 'now'; } catch (e) { saved = 'now'; }
        soulTab = SOUL_TABS.indexOf(saved) < 0 ? 'now' : saved;
        SOUL_TABS.forEach(function (k) {
          $('stab-' + k).setAttribute('aria-selected', k === soulTab ? 'true' : 'false');
          $('stab-' + k).tabIndex = k === soulTab ? 0 : -1;
          $('sp-' + k).hidden = k !== soulTab;
        });
      }());

      /* ---------- Отрисовка ---------- */
      function renderSoul() {
        if (!soulData) soulData = soulDefault();
        if (currentView !== 'soul') return;
        renderSoulHero();
        renderSoulParts();
      }
      function renderSoulParts() {
        if (!soulData || currentView !== 'soul') return;
        var items = inboxItems();
        var badge = $('sx-inbox-badge');
        badge.hidden = !items.length;
        badge.textContent = items.length ? String(items.length) : '';
        if (soulTab === 'now') renderNow(items);
        else if (soulTab === 'path') renderPathTab();
        else if (soulTab === 'memory') renderMemoryTab();
        else if (soulTab === 'char') renderCharTab();
        else renderSettingsTab();
      }

      /* Герой: сигил пути, ступень, настроение, шкалы. */
      var sigilState = { key: '' };
      function sigilSvg(d, p) {
        var s = d.soul, C = 120;
        var tone = soulTone(s.mood && s.mood.name);
        var face = 'yaeri/' + TONE_FACE[tone] + '-face.webp';
        var out = '<svg viewBox="0 0 240 240">' + goldDefs('sg') +
          '<clipPath id="sgclip"><circle cx="' + C + '" cy="' + C + '" r="62"/></clipPath>' +
          '<circle class="sg-aura" cx="' + C + '" cy="' + C + '" r="112" fill="url(#sgr)"/>';
        // Риски, как на циферблате.
        out += '<g class="sg-ticks">';
        for (var t = 0; t < 72; t++) {
          var a = t * 5, long = t % 8 === 0, r0 = long ? 100 : 102.5, r1 = 106;
          var sa = Math.sin(a * Math.PI / 180), ca = Math.cos(a * Math.PI / 180);
          out += '<line x1="' + (C + r0 * sa).toFixed(1) + '" y1="' + (C - r0 * ca).toFixed(1) + '" x2="' + (C + r1 * sa).toFixed(1) + '" y2="' + (C - r1 * ca).toFixed(1) + '"' + (long ? ' class="l"' : '') + '/>';
        }
        out += '</g>';
        // Девять сегментов ступеней.
        for (var i = 0; i < 9; i++) {
          var a0 = i * 40 + 3, a1 = (i + 1) * 40 - 3;
          var cls = i + 1 < p.level || p.complete ? 'sg-seg on' : (i + 1 === p.level ? 'sg-seg cur' : 'sg-seg');
          out += '<path class="sg-base" d="' + arc(C, C, 92, a0, a1) + '"/>';
          if (i + 1 < p.level || p.complete) out += '<path class="' + cls + '" style="--i:' + i + '" d="' + arc(C, C, 92, a0, a1) + '"/>';
          else if (i + 1 === p.level) out += '<path class="' + cls + '" d="' + arc(C, C, 92, a0, a0 + Math.max(1, (a1 - a0) * p.frac)) + '"/>';
          var mid = (a0 + a1) / 2, mx = C + 92 * Math.sin(mid * Math.PI / 180), my = C - 92 * Math.cos(mid * Math.PI / 180);
          if (i + 1 <= p.level) out += '<circle class="sg-node' + (i + 1 === p.level && !p.complete ? ' cur' : '') + '" cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="2.4"/>';
        }
        // Кольцо прогресса до следующей ступени или звезды.
        var L = 2 * Math.PI * 76;
        out += '<circle class="sg-track" cx="' + C + '" cy="' + C + '" r="76"/>' +
          '<circle class="sg-prog" cx="' + C + '" cy="' + C + '" r="76" stroke="url(#sgg)" stroke-dasharray="' + L.toFixed(1) + '" stroke-dashoffset="' + (L * (1 - p.frac)).toFixed(1) + '" transform="rotate(-90 ' + C + ' ' + C + ')"/>';
        out += '<circle class="sg-dash" cx="' + C + '" cy="' + C + '" r="84"/>';
        // После девятой ступени — орбита звёзд текущего созвездия.
        if (p.complete) {
          out += '<g class="sg-orbit">';
          for (var k = 0; k < 9; k++) {
            var ang = k * 40 + 20, sx = C + 114 * Math.sin(ang * Math.PI / 180), sy = C - 114 * Math.cos(ang * Math.PI / 180);
            out += '<path class="sg-star' + (k < p.inConstellation ? ' on' : '') + '" d="' + starPath(+sx.toFixed(1), +sy.toFixed(1), k < p.inConstellation ? 6 : 4) + '"/>';
          }
          out += '</g>';
        }
        out += '<circle cx="' + C + '" cy="' + C + '" r="64" class="sg-ring"/>' +
          '<image class="sg-face" href="' + face + '" x="' + (C - 62) + '" y="' + (C - 62) + '" width="124" height="124" clip-path="url(#sgclip)" preserveAspectRatio="xMidYMid slice"/>';
        // Знак ступени внизу.
        out += '<g class="sg-badge"><path d="M' + C + ' 196 l15 8.5 v17 l-15 8.5 l-15 -8.5 v-17z" fill="url(#sgg)"/><text x="' + C + '" y="218" text-anchor="middle">' + (p.complete ? (p.stars ? '✦' + p.stars : '9') : p.level) + '</text></g>';
        return out + '</svg>';
      }
      function gauge(label, v, cls, note) {
        v = Math.max(0, Math.min(100, Math.round(v || 0)));
        var C = 40, L = 2 * Math.PI * 32 * 0.75;
        var g = el('div', 'sx-gauge ' + cls);
        g.title = note || label;
        g.innerHTML = '<svg viewBox="0 0 80 80" aria-hidden="true"><path class="gt" d="' + arc(C, C, 32, -135, 135) + '"/>' +
          '<path class="gv" d="' + arc(C, C, 32, -135, 135) + '" stroke-dasharray="' + L.toFixed(1) + '" stroke-dashoffset="' + (L * (1 - v / 100)).toFixed(1) + '"/></svg>' +
          '<b>' + v + '</b><span>' + esc(label) + '</span>';
        g.setAttribute('role', 'img');
        g.setAttribute('aria-label', label + ': ' + v + ' из 100');
        return g;
      }
      function renderSoulHero() {
        var d = soulData, s = d.soul, p = soulPath(s.xp);
        $('soul-demo').hidden = online;
        $('soul-hero').setAttribute('data-tone', soulTone(s.mood && s.mood.name));
        var key = [p.level, p.stars, Math.round(p.frac * 200), soulTone(s.mood && s.mood.name)].join('|');
        if (sigilState.key !== key) { $('sx-sigil').innerHTML = sigilSvg(d, p); sigilState.key = key; }
        $('soul-stage').textContent = p.stage;
        $('sx-kicker').textContent = p.complete
          ? 'Ступень 9 из 9 · созвездие «' + p.constellationName + '» · ' + p.inConstellation + '/9 ★'
          : 'Ступень ' + p.level + ' из 9';
        $('sx-fill').style.width = Math.max(2, p.frac * 100) + '%';
        $('sx-bar').setAttribute('aria-valuenow', String(Math.round(p.frac * 100)));
        $('sx-sub').textContent = p.complete
          ? (p.stars ? 'Зажжено звёзд: ' + p.stars + '. ' : 'Путь ступеней пройден. ') + 'До следующей звезды — ' + p.left + ' опыта'
          : 'До ступени «' + p.next + '» — ' + p.left + ' опыта';
        $('soul-mood').textContent = s.mood.name || '—';
        $('soul-mood-why').textContent = s.mood.why || '';
        var needs = d.needs || { longing: 0, joy: 55, curiosity: 60 };
        var gs = $('sx-gauges');
        gs.textContent = '';
        gs.appendChild(gauge('близость', s.bond, 'bond', s.bondNote));
        gs.appendChild(gauge('радость', needs.joy, 'joy'));
        if ((needs.longing || 0) >= 40) gs.appendChild(gauge('скучает', needs.longing, 'miss', 'Давно не разговаривали'));
        else gs.appendChild(gauge('любопытство', needs.curiosity, 'cur'));
        var days = Math.max(1, Math.floor((Date.now() - (s.born || Date.now())) / 864e5) + 1);
        var st = $('sx-stats');
        st.textContent = '';
        [[days, plural(days, 'день вместе', 'дня вместе', 'дней вместе')], [s.exchanges || 0, plural(s.exchanges || 0, 'реплика', 'реплики', 'реплик')], [s.reflections || 0, plural(s.reflections || 0, 'раздумье', 'раздумья', 'раздумий')], [s.xp || 0, 'опыта']].forEach(function (x) {
          var b = el('div', 'sx-stat');
          b.appendChild(el('b', '', String(x[0])));
          b.appendChild(el('span', '', x[1]));
          st.appendChild(b);
        });
      }

      /* ---------- Обзор ---------- */
      function inboxItems() {
        var out = [];
        if (!online) return out;
        if (depthData) {
          var n = depthData.nudge;
          if (n && (n.status === 'new' || n.status === 'shown')) out.push({ kind: 'nudge', id: '', icon: 'cloud', tag: 'Она заметила', text: n.text, yes: 'Спасибо, учту', no: 'Не сейчас' });
          arr(depthData.skills).forEach(function (sk) {
            if (sk.status === 'proposed') out.push({ kind: 'skill', id: sk.id, icon: 'tool', tag: 'Новый навык /' + sk.command, text: sk.name + ': ' + sk.instruction, why: sk.why, yes: 'Включить', no: 'Не нужно' });
          });
          var PT = { lesson: 'Урок общения', rule: 'Правило стиля', self: 'Как она видит себя', trait: 'Черта характера' };
          arr(depthData.proposals).forEach(function (pr) {
            if (pr.status === 'proposed') out.push({ kind: 'proposal', id: pr.id, icon: 'mirror', tag: 'Хочет изменить в себе · ' + (PT[pr.type] || pr.type), text: pr.text, why: pr.why, yes: 'Применить', no: 'Оставить как есть' });
          });
        }
        if (growthData) arr(growthData.insights).forEach(function (x) {
          if (x.status === 'hypothesis') out.push({ kind: 'insight', id: x.id, icon: 'bulb', tag: 'Догадка о вас', text: x.answer, why: x.question, yes: 'Это так', no: 'Не так' });
        });
        if (lifeData) arr((lifeData.tools || {}).tools).forEach(function (t) {
          if (t.status === 'proposed') out.push({ kind: 'tool', id: t.id, icon: 'tool', tag: 'Инструмент', text: t.name, why: t.why, yes: 'Разрешить', no: 'Нет' });
        });
        if (e5Data) {
          arr(e5Data.goals).forEach(function (g) { if (g.status === 'proposed') out.push({ kind: 'e5goal', id: g.id, icon: 'target', tag: 'Учебная цель', text: g.title, yes: 'Одобрить', no: 'Нет' }); });
          arr(e5Data.strategies).forEach(function (x) { if (x.status === 'proposed') out.push({ kind: 'strategy', id: x.id, icon: 'compass', tag: 'Метод мышления', text: x.text || x.method, why: 'Тест: ' + x.benchmark + '/10, было ' + x.baseline + '/10', yes: 'Одобрить', no: 'Нет' }); });
          arr(e5Data.concepts).forEach(function (x) { if (x.status === 'proposed') out.push({ kind: 'concept', id: x.id, icon: 'bulb', tag: 'Новая идея', text: x.title + ' — ' + x.idea, yes: 'Принять', no: 'Нет' }); });
          arr(e5Data.transfers).forEach(function (x) { if (x.status === 'proposed') out.push({ kind: 'transfer', id: x.id, icon: 'spark', tag: 'Перенос метода', text: x.method + ': ' + x.sourceDomain + ' → ' + x.targetDomain, why: x.example, yes: 'Одобрить', no: 'Нет' }); });
        }
        return out;
      }
      function renderNow(items) {
        var card = $('sx-inbox-card'), ul = $('sx-inbox');
        card.hidden = !items.length;
        ul.textContent = '';
        $('sx-inbox-meta').textContent = items.length ? items.length + ' ' + plural(items.length, 'вопрос', 'вопроса', 'вопросов') : '';
        items.forEach(function (it, i) {
          var li = el('li', 'sx-ask');
          li.style.setProperty('--i', String(i));
          li.appendChild(icoEl(it.icon, 'big'));
          var body = el('div', 'sx-ask-body');
          body.appendChild(el('span', 'sx-tag', it.tag));
          body.appendChild(el('p', '', it.text));
          if (it.why) body.appendChild(el('small', '', it.why));
          li.appendChild(body);
          var act = el('div', 'sx-ask-act');
          [[true, it.yes, 'mini-btn solid'], [false, it.no, 'mini-btn']].forEach(function (b) {
            act.appendChild(smallBtn(b[1], b[1], function (ev) {
              ev.currentTarget.disabled = true;
              li.classList.add('leaving');
              soulDecide(it.kind, it.id, b[0]);
            }, b[2]));
          });
          li.appendChild(act);
          ul.appendChild(li);
        });
        renderFree();
        renderThought();
        renderYou();
        renderFeed();
      }

      /* ---------- Скука и подарки ---------- */
      function boredText(f) {
        if (!f.settings.boredom) return 'Скука выключена в настройках: пока вас нет, она просто ждёт.';
        if (!f.lastSeen) return 'Начнёт скучать по вам после первых разговоров.';
        var b = f.boredom || 0;
        if (!b) return f.lastAct > f.lastSeen ? 'Недавно чем-то занималась и теперь снова ждёт вас.' : 'Вы рядом или только что ушли: ей не скучно.';
        if (b < f.actAt) return 'Становится скучно. Если вы не вернётесь, около ' + hhmm(f.nextAt) + ' займётся чем-нибудь своим.';
        return f.canCreate ? 'Очень скучно! Вот-вот что-нибудь сочинит или нарисует.' : 'Скучно. Творений на сегодня хватит — перебирает воспоминания, без запросов к облаку.';
      }
      function renderFree() {
        var f = freeData, box = $('sx-bored'), gl = $('sx-gifts');
        if (!box) return;
        box.textContent = '';
        gl.textContent = '';
        if (!f) {
          $('sx-free-meta').textContent = '';
          box.appendChild(el('p', 'soul-small', online ? 'Загружаю её занятия…' : 'Когда Яэри подключится, здесь появятся её занятия и подарки.'));
          return;
        }
        var b = f.boredom || 0, hot = b >= f.actAt;
        $('sx-free-meta').textContent = 'творений сегодня ' + f.createdToday + ' из ' + f.pace;
        var row = el('div', 'sx-bored-row' + (hot ? ' hot' : '') + (f.settings.boredom ? '' : ' off'));
        row.appendChild(icoEl(hot ? 'feather' : 'moon', 'big'));
        var body = el('div', 'sx-bored-body');
        body.appendChild(el('span', 'sx-tag', !f.settings.boredom ? 'скука выключена' : (b ? 'скучает · ' + b + '%' : 'не скучает')));
        body.appendChild(el('p', '', boredText(f)));
        var m = el('div', 'sx-meter sx-bored-meter');
        var fill = el('i');
        fill.style.width = b + '%';
        m.appendChild(fill);
        var mark = el('b');
        mark.style.left = f.actAt + '%';
        mark.title = 'С этого места она займётся чем-то своим';
        m.appendChild(mark);
        body.appendChild(m);
        var last = arr(f.acts).slice(-1)[0];
        if (last) body.appendChild(el('small', '', 'Последнее занятие ' + ago(last.t) + ': ' + last.text));
        row.appendChild(body);
        box.appendChild(row);
        var cs = arr(f.creations).slice().reverse();
        if (!cs.length) { gl.appendChild(el('p', 'sx-gifts-empty', 'Подарков пока нет. Первый появится, когда ей станет скучно без вас.')); return; }
        cs.forEach(function (c, i) {
          var art = el('article', 'sx-gift k-' + c.kind + (c.delivered ? '' : ' fresh'));
          art.style.setProperty('--i', String(Math.min(i, 10)));
          var head = el('header');
          head.appendChild(icoEl(c.kind === 'drawing' ? 'feather' : (c.kind === 'find' ? 'search' : (c.kind === 'story' ? 'book' : 'scroll'))));
          var ht = el('div');
          ht.appendChild(el('span', 'sx-tag', (GIFT_KIND[c.kind] || 'творение') + (c.delivered ? '' : ' · ещё не подарено')));
          ht.appendChild(el('h3', '', c.title || 'Без названия'));
          head.appendChild(ht);
          art.appendChild(head);
          if (c.svg) art.appendChild(giftArt(c.svg, c.title));
          if (c.text) art.appendChild(el('p', 'sx-gift-text', c.text));
          if (c.why) art.appendChild(el('small', 'sx-gift-why', 'Вдохновило: ' + c.why));
          var foot = el('footer');
          foot.appendChild(el('time', '', ago(c.t) + (c.mood ? ' · ' + c.mood : '')));
          if (online) {
            var like = smallBtn('', c.liked ? 'Больше не отмечать' : 'Нравится', function () {
              api('soul/free/creation', { id: c.id, action: c.liked ? 'unlike' : 'like' }).then(setFree).then(function () { if (!c.liked) flash('happy', 3000); }).catch(undErr);
            }, 'sx-like' + (c.liked ? ' on' : ''));
            like.innerHTML = ico('heart');
            like.setAttribute('aria-pressed', c.liked ? 'true' : 'false');
            foot.appendChild(like);
            foot.appendChild(xBtn('Убрать подарок', function () {
              if (window.confirm('Убрать «' + (c.title || 'подарок') + '» из галереи?')) api('soul/free/creation', { id: c.id, action: 'delete' }).then(setFree).catch(undErr);
            }));
          }
          art.appendChild(foot);
          gl.appendChild(art);
        });
      }

      /* ---------- Свободная воля ---------- */
      function renderWill() {
        var f = freeData, box = $('sx-will');
        box.textContent = '';
        if (!f) { $('sx-will-meta').textContent = ''; box.appendChild(el('p', 'soul-small', 'Появится после подключения к Cloud.ru.')); return; }
        if (!f.settings.will) {
          $('sx-will-meta').textContent = 'выключена';
          box.appendChild(el('p', 'soul-small', 'Свободная воля выключена в настройках: Яэри соглашается со всем, как раньше.'));
          return;
        }
        var h = f.hurt || {}, t = f.today || {};
        $('sx-will-meta').textContent = 'сегодня: отказов ' + (t.decline || 0) + ' из ' + f.declineMax;
        var st = el('div', 'sx-will-state' + (h.level ? ' hurt' : ''));
        st.appendChild(icoEl(h.level ? 'cloud' : 'heart', 'big'));
        var sb = el('div');
        sb.appendChild(el('span', 'sx-tag', h.level ? 'немного обижена · ' + h.level + '/100' : 'на вас не обижена'));
        sb.appendChild(el('p', '', h.level ? h.reason : 'Спокойна и рядом. Своё мнение у неё есть — скажет честно, если не согласна.'));
        if (h.level) {
          var m = el('div', 'sx-meter');
          var fill = el('i');
          fill.style.width = h.level + '%';
          m.appendChild(fill);
          sb.appendChild(m);
          sb.appendChild(el('small', '', 'Обида тает сама: вдвое за три часа. Извинитесь в чате — простит сразу.'));
        }
        st.appendChild(sb);
        if (h.level && online) st.appendChild(smallBtn('Помириться', 'Помириться с Яэри', function (ev) {
          ev.currentTarget.disabled = true;
          api('soul/free/makeup', {}).then(setFree).then(function () { flash('happy', 3600); return api('soul').then(setSoul); }).catch(undErr);
        }, 'mini-btn solid'));
        box.appendChild(st);
        var chips = el('div', 'sx-will-today');
        [['decline', 'отказов'], ['disagree', 'несогласий'], ['hurt', 'обид'], ['forgive', 'прощений']].forEach(function (k) {
          var c = el('span', 'w-' + k[0]);
          c.innerHTML = ico(WILL_ICON[k[0]]);
          c.appendChild(el('b', '', String(t[k[0]] || 0)));
          c.appendChild(document.createTextNode(' ' + k[1] + ' сегодня'));
          chips.appendChild(c);
        });
        box.appendChild(chips);
        var ul = el('ul', 'sx-will-list');
        var list = arr(f.will).slice().reverse();
        if (!list.length) emptyLi(ul, 'Пока она ни разу не возразила. Если не согласится или откажется от прихоти, причина появится здесь и под её ответом в чате.');
        list.forEach(function (w) {
          var li = el('li', 'w-' + w.type);
          li.appendChild(icoEl(WILL_ICON[w.type] || 'spark'));
          var b = el('div');
          b.appendChild(el('span', 'sx-tag', String(WILL_TAG[w.type] || w.type).replace(/^\S+\s/, '')));
          b.appendChild(el('p', '', w.reason));
          if (w.about) b.appendChild(el('small', '', 'на «' + w.about + '»'));
          li.appendChild(b);
          li.appendChild(el('time', '', ago(w.t)));
          ul.appendChild(li);
        });
        box.appendChild(ul);
      }
      function renderThought() {
        var s = soulData.soul, box = $('sx-thought');
        box.textContent = '';
        var q = el('blockquote', 'sx-quote');
        q.innerHTML = '<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M2 28V17C2 8 7 3 15 2v5c-4 1-6 4-6 8h6v13zM23 28V17c0-9 5-14 13-15v5c-4 1-6 4-6 8h6v13z"/></svg>';
        q.appendChild(el('p', '', s.thought || s.mood.why || 'Она пока слушает и запоминает.'));
        box.appendChild(q);
        var last = s.journal.slice().reverse().filter(function (j) { return j.kind === 'reflection' || j.kind === 'muse' || j.kind === 'dream'; })[0];
        $('sx-thought-meta').textContent = last ? ago(last.t) : '';
        var sl = el('p', 'sx-note');
        sl.innerHTML = ico('moon');
        sl.appendChild(document.createTextNode(s.lastSleep ? 'Спала ' + ago(s.lastSleep) + ' · всего снов: ' + (s.sleeps || 0) + '. Засыпает сама, когда вы не работаете.' : 'Уснёт сама, когда вы отойдёте от компьютера, и пересоберёт память.'));
        box.appendChild(sl);
      }
      function renderYou() {
        var box = $('sx-you'), s = soulData.soul;
        box.textContent = '';
        var st = undData && undData.state;
        var tone = st && st.confidence >= 0.66 ? st.tone : 'neutral';
        var line = el('p', 'sx-read');
        line.appendChild(document.createTextNode('Сейчас вы, похоже, '));
        line.appendChild(el('b', 'tone-' + tone, st && tone !== 'neutral' ? st.label : 'спокойны'));
        box.appendChild(line);
        box.appendChild(el('p', 'soul-small', undData ? TONE_HINT[tone] : (online ? 'Загружаю…' : 'После подключения здесь будет видно, как она читает ваши сообщения.')));
        $('sx-you-meta').textContent = st ? ago(st.t) : '';
        if ((soulData.sadStreak || 0) >= 2) box.appendChild(el('p', 'soul-small soul-sad', 'Вам грустно уже ' + soulData.sadStreak + ' ' + plural(soulData.sadStreak, 'день', 'дня', 'дней') + ' подряд — она бережёт вас.'));
        // Настроение за 30 дней: столбики вверх — светлее, вниз — тяжелее.
        var byDay = {};
        arr(s.ownerMoods).forEach(function (m) { byDay[m.day] = m; });
        var W = 300, H = 64, mid = 32, bw = W / 30;
        var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><line class="mid" x1="0" x2="' + W + '" y1="' + mid + '" y2="' + mid + '"/>';
        var now = new Date(), seen = 0;
        for (var i = 29; i >= 0; i--) {
          var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), m = byDay[dayKey(day)], x = (29 - i) * bw;
          if (!m) { svg += '<rect class="none" x="' + (x + 2).toFixed(1) + '" y="' + (mid - 1) + '" width="' + (bw - 4).toFixed(1) + '" height="2" rx="1"/>'; continue; }
          seen++;
          var h = Math.max(3, Math.min(2, Math.abs(m.score)) / 2 * (mid - 4));
          svg += '<rect class="' + (m.score < 0 ? 'neg' : 'pos') + '" style="--i:' + (29 - i) + '" x="' + (x + 2).toFixed(1) + '" y="' + (m.score < 0 ? mid : mid - h).toFixed(1) + '" width="' + (bw - 4).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"><title>' + esc(day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ': ' + (m.label || m.score)) + '</title></rect>';
        }
        var moodBox = el('div', 'sx-moods');
        moodBox.appendChild(el('span', 'soul-lbl', 'Ваше настроение · 30 дней'));
        var chart = el('div', 'sx-moodbars');
        chart.innerHTML = svg + '</svg>';
        moodBox.appendChild(chart);
        if (!seen) moodBox.appendChild(el('p', 'soul-small', 'Яэри отмечает настроение, когда обдумывает разговоры.'));
        box.appendChild(moodBox);
        var r = depthData && depthData.rhythm;
        if (r && depthData.settings.rhythm) {
          var meters = el('div', 'sx-meters');
          [['burnout', 'Выгорание'], ['stuck', 'Застревание']].forEach(function (k) {
            var v = typeof r[k[0]] === 'number' ? r[k[0]] : 0;
            var row = el('div', 'sx-mrow' + (v >= 60 ? ' hot' : ''));
            row.appendChild(el('span', '', k[1]));
            var bar = el('div', 'sx-meter');
            var f = el('i');
            f.style.width = Math.max(v ? 3 : 0, v) + '%';
            bar.appendChild(f);
            row.appendChild(bar);
            row.appendChild(el('b', '', String(v)));
            meters.appendChild(row);
          });
          box.appendChild(meters);
          arr(r.signals).slice(0, 2).forEach(function (x) { box.appendChild(el('p', 'soul-small', '· ' + x)); });
        }
      }
      function feedItems() {
        var out = [], s = soulData.soul;
        if (growthData) arr(growthData.feed).forEach(function (x) { out.push({ t: x.t, kind: x.kind, text: x.text }); });
        s.journal.forEach(function (j) { if (j.kind === 'milestone' || j.kind === 'dream' || j.kind === 'secret' || j.kind === 'birth') out.push({ t: j.t, kind: j.kind, text: j.text }); });
        if (evoData) arr(evoData.timeline).forEach(function (x) { out.push({ t: x.t, kind: 'change', text: 'Изменилось «' + (x.field || '') + '»: ' + (x.after || '') + (x.reason ? ' — ' + x.reason : '') }); });
        if (s3Data) arr(s3Data.growth).forEach(function (x) { if (x.t) out.push({ t: x.t, kind: 'bond', text: x.text }); });
        if (depthData) arr(depthData.charLog).forEach(function (x) { out.push({ t: x.t, kind: 'character', text: x.text }); });
        var seen = {};
        return out.filter(function (x) {
          if (!x.t || !x.text) return false;
          var k = String(x.text).slice(0, 80);
          if (seen[k]) return false;
          seen[k] = 1;
          return true;
        }).sort(function (a, b) { return b.t - a.t; }).slice(0, 40);
      }
      function renderFeed() {
        var ul = $('sx-feed'), items = feedItems();
        ul.textContent = '';
        $('sx-feed-meta').textContent = items.length ? 'последнее ' + ago(items[0].t) : '';
        if (!items.length) { emptyLi(ul, 'Пока тихо. Как только Яэри что-то узнает или в чём-то изменится, это появится здесь.'); return; }
        var lastDay = '';
        items.forEach(function (it, i) {
          var dk = dayKey(new Date(it.t));
          if (dk !== lastDay) {
            lastDay = dk;
            var today = dayKey(new Date()), yest = dayKey(new Date(Date.now() - 864e5));
            ul.appendChild(el('li', 'sx-day', dk === today ? 'Сегодня' : (dk === yest ? 'Вчера' : dmy(it.t))));
          }
          var li = el('li', 'sx-ev k-' + it.kind);
          li.style.setProperty('--i', String(Math.min(i, 12)));
          li.appendChild(icoEl(FEED_ICON[it.kind] || 'spark'));
          var b = el('div');
          b.appendChild(el('p', '', it.text));
          b.appendChild(el('time', '', hhmm(it.t)));
          li.appendChild(b);
          ul.appendChild(li);
        });
      }

      /* ---------- Путь ---------- */
      function renderPathTab() {
        var d = soulData, p = soulPath(d.soul.xp);
        $('sx-path-meta').textContent = 'опыт ' + d.soul.xp + (p.complete ? ' · звёзд ' + p.stars : '');
        renderRoad(p);
        renderConstellation(p);
        renderMastery();
        renderXpChart();
        renderGoals();
        renderSkills(p);
      }
      function renderRoad(p) {
        var box = $('sx-road');
        var W = 900, H = 190, pts = [];
        for (var i = 0; i < 9; i++) {
          var x = 50 + i * 92;
          pts.push([x, 92 - Math.sin(i / 8 * Math.PI * 1.15) * 34 + (i % 2 ? 10 : -6)]);
        }
        var dates = {};
        if (growthData) arr(growthData.stages).forEach(function (st) { dates[st.level] = st.t; });
        function seg(a, b) { var mx = (a[0] + b[0]) / 2; return ' C' + mx + ' ' + a[1] + ' ' + mx + ' ' + b[1] + ' ' + b[0] + ' ' + b[1]; }
        var full = 'M' + pts[0][0] + ' ' + pts[0][1];
        for (var j = 1; j < 9; j++) full += seg(pts[j - 1], pts[j]);
        var tail = 'M' + pts[8][0] + ' ' + pts[8][1] + ' C' + (pts[8][0] + 30) + ' ' + pts[8][1] + ' 860 40 878 30';
        var lit = 'M' + pts[0][0] + ' ' + pts[0][1];
        var upto = p.complete ? 8 : p.level - 1;
        for (var k = 1; k <= upto; k++) lit += seg(pts[k - 1], pts[k]);
        if (!p.complete && p.level < 9) {
          var a = pts[p.level - 1], b = pts[p.level], f = p.frac;
          lit += ' L' + (a[0] + (b[0] - a[0]) * f).toFixed(1) + ' ' + (a[1] + (b[1] - a[1]) * f).toFixed(1);
        }
        var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">' + goldDefs('rd') +
          '<path class="rd-base" d="' + full + '"/><path class="rd-tail' + (p.complete ? ' on' : '') + '" d="' + tail + '"/>' +
          '<path class="rd-lit" d="' + lit + '" stroke="url(#rdg)" filter="url(#rdf)"/>';
        pts.forEach(function (pt, i) {
          var n = i + 1, done = n < p.level || p.complete, cur = n === p.level && !p.complete;
          svg += '<g class="rd-node' + (done ? ' done' : '') + (cur ? ' cur' : '') + '" style="--i:' + i + '">';
          if (cur) svg += '<circle class="rd-pulse" cx="' + pt[0] + '" cy="' + pt[1] + '" r="16"/>';
          svg += '<circle class="rd-dot" cx="' + pt[0] + '" cy="' + pt[1] + '" r="' + (cur ? 13 : 11) + '"' + (done || cur ? ' fill="url(#rdg)"' : '') + '/>' +
            '<text class="rd-n" x="' + pt[0] + '" y="' + (pt[1] + 4) + '" text-anchor="middle">' + n + '</text>' +
            '<text class="rd-name" x="' + pt[0] + '" y="' + (pt[1] + 34) + '" text-anchor="middle">' + SOUL_STAGES[i] + '</text>' +
            '<text class="rd-sub" x="' + pt[0] + '" y="' + (pt[1] + 49) + '" text-anchor="middle">' + (done && dates[n] ? esc(dmy(dates[n])) : 'от ' + SOUL_XP[i]) + '</text></g>';
        });
        svg += '<path class="rd-end' + (p.complete ? ' on' : '') + '" d="' + starPath(880, 28, 13) + '"/>' +
          '<text class="rd-name rd-inf" x="880" y="64" text-anchor="middle">∞</text>';
        box.innerHTML = svg + '</svg>';
      }
      // Одно и то же созвездие из девяти звёзд, слегка повёрнутое для каждого следующего.
      var CONST_PTS = [[40, 120], [78, 92], [118, 104], [150, 70], [196, 62], [226, 96], [212, 136], [170, 150], [254, 40]];
      function renderConstellation(p) {
        var box = $('sx-sky');
        var lit = p.complete ? p.inConstellation : 0;
        var rot = ((p.constellation - 1) * 23) % 360;
        var svg = '<svg viewBox="0 0 290 180" aria-hidden="true">' + goldDefs('sk') + '<g transform="rotate(' + rot + ' 145 95)">';
        for (var i = 1; i < 9; i++) {
          var a = CONST_PTS[i - 1], b = CONST_PTS[i];
          svg += '<line class="sk-l' + (i < lit ? ' on' : '') + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
        }
        CONST_PTS.forEach(function (pt, i) {
          var on = i < lit;
          svg += '<path class="sk-s' + (on ? ' on' : '') + (i === lit && p.complete ? ' next' : '') + '" style="--i:' + i + '" d="' + starPath(pt[0], pt[1], on ? 9 : 5) + '"' + (on ? ' fill="url(#skg)" filter="url(#skf)"' : '') + '/>';
        });
        svg += '</g></svg>';
        box.innerHTML = svg;
        var t = el('div', 'sx-sky-t');
        if (p.complete) {
          t.appendChild(el('span', 'sx-tag', 'Созвездие ' + p.constellation));
          t.appendChild(el('b', '', '«' + p.constellationName + '» · ' + p.inConstellation + ' из 9 звёзд'));
          t.appendChild(el('p', 'soul-small', 'Следующая звезда через ' + p.left + ' опыта. Каждая звезда чуть дороже прошлой; девять звёзд складываются в созвездие, а созвездиям нет конца.'));
        } else {
          t.appendChild(el('span', 'sx-tag', 'После девятой ступени'));
          t.appendChild(el('b', '', 'Путь не заканчивается'));
          t.appendChild(el('p', 'soul-small', 'Девятая ступень — «Полнота». Дальше начинают загораться звёзды: каждые девять складываются в новое созвездие — «Лиса», «Луна», «Сакура»… Уровни мастерства ниже тоже без потолка.'));
        }
        box.appendChild(t);
      }
      function renderMastery() {
        var box = $('sx-mastery');
        box.textContent = '';
        soulMastery(soulData).forEach(function (m, i) {
          var L = 2 * Math.PI * 30;
          var tile = el('div', 'sx-mtile');
          tile.style.setProperty('--i', String(i));
          tile.innerHTML = '<svg viewBox="0 0 72 72" aria-hidden="true">' + goldDefs('ms' + i) +
            '<polygon class="mt-hex" points="36,3 64.6,19.5 64.6,52.5 36,69 7.4,52.5 7.4,19.5"/>' +
            '<circle class="mt-tr" cx="36" cy="36" r="30"/><circle class="mt-pr" cx="36" cy="36" r="30" stroke="url(#ms' + i + 'g)" stroke-dasharray="' + L.toFixed(1) + '" stroke-dashoffset="' + (L * (1 - m.frac)).toFixed(1) + '" transform="rotate(-90 36 36)"/>' +
            '<g transform="translate(24 14)" class="mt-ico"><path d="' + ICONS[MASTERY_ICON[m.id]] + '"/></g>' +
            '<text x="36" y="54" text-anchor="middle" class="mt-n">' + m.level + '</text></svg>';
          var t = el('div', 'mt-t');
          t.appendChild(el('b', '', m.name));
          t.appendChild(el('span', '', 'до ' + (m.level + 1) + '-го уровня: ' + m.left));
          t.appendChild(el('small', '', m.hint));
          tile.appendChild(t);
          tile.title = m.name + ': ' + m.points + ' очков';
          box.appendChild(tile);
        });
      }
      function drawLines(box, cfg) {
        var days = cfg.days, n = days.length;
        var W = Math.max(300, Math.round(box.clientWidth) || 640), H = 220, L = 40, R = cfg.thresholds && cfg.thresholds.length ? 64 : 14, T = 12, B = 26;
        var t0 = dayMs(days[0]), t1 = dayMs(days[n - 1]);
        function X(i) { return n < 2 || t1 === t0 ? (L + W - R) / 2 : L + (dayMs(days[i]) - t0) * (W - L - R) / (t1 - t0); }
        var lo = cfg.yMin || 0, hi = cfg.yMax;
        function Y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
        var id = box.id, s = '<svg viewBox="0 0 ' + W + ' ' + H + '"><defs>';
        cfg.series.forEach(function (sr, k) {
          s += '<linearGradient id="' + id + '-g' + k + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + sr.color + ';stop-opacity:.4"/><stop offset="1" style="stop-color:' + sr.color + ';stop-opacity:0"/></linearGradient>';
        });
        s += '</defs>';
        for (var g = 0; g <= 4; g++) {
          var v = lo + (hi - lo) * g / 4;
          s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + Math.round(v) + '</text>';
        }
        var lastLabelY = 1e9;
        (cfg.thresholds || []).slice().sort(function (a, b) { return b.v - a.v; }).forEach(function (th) {
          if (th.v <= lo || th.v > hi) return;
          var ty = Y(th.v);
          s += '<line class="thr" x1="' + L + '" x2="' + (W - R) + '" y1="' + ty.toFixed(1) + '" y2="' + ty.toFixed(1) + '"/>';
          if (lastLabelY === 1e9 || ty - lastLabelY >= 13) { s += '<text class="thr-l" x="' + (W - R + 5) + '" y="' + (ty + 3).toFixed(1) + '">' + esc(th.label) + '</text>'; lastLabelY = ty; }
        });
        s += '<text x="' + L + '" y="' + (H - 7) + '">' + dayLabel(days[0]) + '</text>';
        if (n > 1) s += '<text x="' + (W - R) + '" y="' + (H - 7) + '" text-anchor="end">' + dayLabel(days[n - 1]) + '</text>';
        cfg.series.forEach(function (sr, k) {
          var d = '';
          sr.values.forEach(function (v, i) { d += (i ? ' L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
          if (n > 1) s += '<path d="' + d + ' L' + X(n - 1).toFixed(1) + ' ' + Y(lo).toFixed(1) + ' L' + X(0).toFixed(1) + ' ' + Y(lo).toFixed(1) + ' Z" fill="url(#' + id + '-g' + k + ')"/>';
          if (n > 1) s += '<path class="ln" style="stroke:' + sr.color + '" d="' + d + '"/>';
          s += '<circle class="pt" style="fill:' + sr.color + '" cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(sr.values[n - 1]).toFixed(1) + '" r="4"/>';
        });
        s += '<line class="guide" id="' + id + '-guide" y1="' + T + '" y2="' + (H - B) + '" x1="0" x2="0" style="display:none"/>';
        s += '<rect id="' + id + '-hit" x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '" fill="transparent" style="touch-action:pan-y"/></svg>';
        box.innerHTML = s;
        var svg = box.querySelector('svg'), guide = $(id + '-guide'), hit = $(id + '-hit');
        var tip = el('div', 'c-tip');
        tip.hidden = true;
        box.appendChild(tip);
        function show(e) {
          var r = svg.getBoundingClientRect();
          var sx = (e.clientX - r.left) * W / r.width;
          var best = 0, bd = 1e9;
          for (var i = 0; i < n; i++) { var dd = Math.abs(X(i) - sx); if (dd < bd) { bd = dd; best = i; } }
          guide.setAttribute('x1', X(best)); guide.setAttribute('x2', X(best)); guide.style.display = '';
          tip.textContent = '';
          tip.appendChild(el('b', '', days[best].split('-').reverse().join('.')));
          cfg.series.forEach(function (sr) { tip.appendChild(el('div', '', sr.label + ': ' + sr.values[best])); });
          tip.hidden = false;
          tip.style.left = Math.max(60, Math.min(r.width - 60, X(best) * r.width / W)) + 'px';
          tip.style.top = '30px';
        }
        hit.addEventListener('pointermove', show);
        hit.addEventListener('pointerdown', show);
        hit.addEventListener('pointerleave', function () { guide.style.display = 'none'; tip.hidden = true; });
      }
      function renderXpChart() {
        var box = $('sx-xp-chart');
        var ser = growthData ? arr(growthData.series) : [];
        if (!ser.length) { chartEmpty(box, online ? 'График появится после первого дня: опыт записывается раз в день.' : 'После подключения к Cloud.ru график опыта начнёт строиться сам.'); $('sx-xp-meta').textContent = ''; return; }
        var xs = ser.map(function (x) { return x.xp; });
        var mx = Math.max.apply(null, xs), top = 12;
        var th = [];
        SOUL_XP.forEach(function (v, i) { if (i) th.push({ v: v, label: 'ступ. ' + (i + 1) }); });
        var p = soulPath(mx + 1), acc = SOUL_XP[8];
        for (var k = 1; k <= p.stars + 1; k++) { acc += SOUL_STAR_BASE + SOUL_STAR_STEP * k; th.push({ v: acc, label: '★ ' + k }); }
        for (var i = 0; i < th.length; i++) { if (th[i].v > mx) { top = th[i].v; break; } }
        drawLines(box, { days: ser.map(function (x) { return x.day; }), yMax: Math.max(top, 12), series: [{ label: 'Опыт', color: 'var(--a)', values: xs }], thresholds: th });
        var first = xs[0], last = xs[xs.length - 1];
        $('sx-xp-meta').textContent = ser.length + ' ' + plural(ser.length, 'день', 'дня', 'дней') + ' · +' + Math.max(0, last - first);
      }
      function ringEl(v) {
        var L = 2 * Math.PI * 15;
        var r = el('div', 'sx-ring');
        r.innerHTML = '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="t" cx="18" cy="18" r="15"/><circle class="v" cx="18" cy="18" r="15" stroke-dasharray="' + L.toFixed(1) + '" stroke-dashoffset="' + (L * (1 - Math.max(0, Math.min(100, v)) / 100)).toFixed(1) + '" transform="rotate(-90 18 18)"/></svg><span>' + Math.round(v) + '</span>';
        return r;
      }
      function renderGoals() {
        var ul = $('sx-goals'), s = soulData.soul;
        ul.textContent = '';
        var items = [];
        if (growthData) arr(growthData.goals).forEach(function (g) { items.push({ text: g.text, why: g.why, progress: g.progress || 0, done: g.status === 'done', steps: arr(g.steps) }); });
        if (e5Data) arr(e5Data.goals).forEach(function (g) { if (g.status === 'active') items.push({ text: g.title, why: g.next ? 'Дальше: ' + g.next : '', progress: g.progress || 0 }); });
        arr(s.aims).forEach(function (a) { items.push({ text: a.text, progress: a.progress || 0, aim: a }); });
        items.sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0); });
        var act = items.filter(function (x) { return !x.done; }).length;
        $('sx-goals-meta').textContent = items.length ? act + ' в работе' : '';
        if (!items.length) emptyLi(ul, 'Цели появятся сами, когда она немного узнает вас.');
        items.forEach(function (g) {
          var li = el('li', g.done ? 'done' : '');
          li.appendChild(ringEl(g.progress));
          var t = el('div', 'sx-goal-t');
          t.appendChild(el('b', '', g.text));
          if (g.why || g.done) t.appendChild(el('span', '', (g.done ? 'Достигнуто. ' : '') + (g.why || '')));
          if (g.steps && g.steps.length) {
            var st = el('div', 'sx-steps');
            g.steps.forEach(function (x) { var dot = el('i', x.done ? 'on' : ''); dot.title = x.text; st.appendChild(dot); });
            t.appendChild(st);
          }
          li.appendChild(t);
          if (g.aim && online) li.appendChild(xBtn('Убрать цель', function () { soulUpdate({ removeAim: g.aim.id }); }));
          ul.appendChild(li);
        });
      }
      function renderSkills(p) {
        var ul = $('sx-skills');
        ul.textContent = '';
        var open = 0;
        arr(soulData.skills).forEach(function (k) {
          if (k.unlocked) open++;
          var li = el('li', k.unlocked ? 'on' : 'locked');
          li.appendChild(icoEl(k.unlocked ? 'star' : 'lock'));
          li.appendChild(el('b', '', k.name));
          li.appendChild(el('span', '', k.unlocked ? (k.desc || '') : 'ступень ' + k.level));
          ul.appendChild(li);
        });
        if (depthData) arr(depthData.skills).forEach(function (sk) {
          if (sk.status !== 'active' && sk.status !== 'off') return;
          var li = el('li', sk.status === 'active' ? 'on own' : 'locked own');
          li.appendChild(icoEl('tool'));
          li.appendChild(el('b', '', '/' + sk.command));
          li.appendChild(el('span', '', sk.name + (sk.uses ? ' · ' + sk.uses + ' р.' : '')));
          if (online) li.appendChild(smallBtn(sk.status === 'active' ? 'Выкл' : 'Вкл', sk.status === 'active' ? 'Выключить навык' : 'Включить навык', function () {
            api('soul/depth/skill', { id: sk.id, action: sk.status === 'active' ? 'disable' : 'approve' }).then(setDepth).catch(function (e) { soulMsg(e.message, true); });
          }, 'mini-btn'));
          ul.appendChild(li);
        });
        $('sx-skills-meta').textContent = open + ' из ' + arr(soulData.skills).length;
      }

      /* ---------- Память ---------- */
      var jState = { q: '', day: '', month: null };
      function renderMemoryTab() {
        var s = soulData.soul;
        if (!soulEditing) $('soul-portrait').value = s.owner.portrait || '';
        $('soul-portrait').readOnly = !online;
        fitSoulText($('soul-portrait'));
        renderKnow();
        renderMoments();
        renderJournal();
        renderRules();
        $('sx-recall').disabled = !online;
      }
      function chipSection(title, items, onDel, onAdd) {
        var sec = el('div', 'sx-sec');
        sec.appendChild(el('h3', '', title));
        var ul = el('ul', 'sx-chips');
        if (!items.length) ul.appendChild(el('li', 'sx-empty', 'пока пусто'));
        items.forEach(function (it) {
          var li = el('li', it.held ? 'held' : '');
          li.appendChild(el('span', '', (it.held ? '🔒 ' : '') + it.text));
          if (online && onDel) li.appendChild(xBtn('Забыть: ' + it.text, function () { onDel(it); }));
          ul.appendChild(li);
        });
        sec.appendChild(ul);
        if (online && onAdd) {
          var inp = el('input', 'field sx-add');
          inp.type = 'text';
          inp.maxLength = 220;
          inp.placeholder = '+ добавить';
          inp.setAttribute('aria-label', 'Добавить в «' + title + '»');
          inp.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter' || ev.isComposing || !inp.value.trim()) return;
            ev.preventDefault();
            var v = inp.value.trim();
            inp.value = '';
            inp.blur();
            onAdd(v);
          });
          sec.appendChild(inp);
        }
        return sec;
      }
      function undErr(e) { soulMsg(e && e.message ? e.message : 'Не получилось.', true); }
      function renderKnow() {
        var box = $('sx-map'), s = soulData.soul;
        if (busyIn(box)) return;
        box.textContent = '';
        var total = 0;
        [['goals', 'Цели и мечты'], ['likes', 'Что вам нравится'], ['worries', 'Что тревожит']].forEach(function (k) {
          var list = arr(s.owner[k[0]]);
          total += list.length;
          box.appendChild(chipSection(k[1], list.map(function (t, i) { return { text: t, i: i }; }), function (it) {
            var next = list.slice(); next.splice(it.i, 1); var patch = {}; patch[k[0]] = next; soulUpdate(patch);
          }, function (v) { var patch = {}; patch[k[0]] = list.concat([v]); soulUpdate(patch); }));
        });
        arr(undData && undData.sections).forEach(function (sec) {
          total += sec.entries.length;
          box.appendChild(chipSection(sec.name, sec.entries.map(function (e) { return { text: e.text, id: e.id, held: e.hidden }; }), function (it) {
            api('soul/understanding/map', { action: 'delete', id: it.id }).then(setUnderstanding).catch(undErr);
          }, function (v) {
            api('soul/understanding/map', { action: 'add', section: sec.id, text: v }).then(setUnderstanding).catch(undErr);
          }));
        });
        $('sx-know-meta').textContent = total + ' ' + plural(total, 'запись', 'записи', 'записей');
        var g = $('sx-guesses');
        g.textContent = '';
        var conf = growthData ? arr(growthData.insights).filter(function (x) { return x.status === 'confirmed'; }) : [];
        var qs = growthData ? arr(growthData.questions) : [];
        if (conf.length) {
          g.appendChild(el('span', 'soul-lbl soul-gap', 'Подтверждённые догадки'));
          var ul = el('ul', 'sx-list');
          conf.slice(-6).reverse().forEach(function (x) { var li = el('li'); li.appendChild(icoEl('check')); li.appendChild(el('span', '', x.answer)); ul.appendChild(li); });
          g.appendChild(ul);
        }
        if (qs.length) {
          g.appendChild(el('span', 'soul-lbl soul-gap', 'Хочет у вас узнать'));
          var q = el('ul', 'sx-list');
          qs.slice(-4).reverse().forEach(function (x) { var li = el('li'); li.appendChild(icoEl('question')); li.appendChild(el('span', '', x.q)); q.appendChild(li); });
          g.appendChild(q);
        }
      }
      function renderMoments() {
        var ul = $('sx-moments');
        ul.textContent = '';
        var ms = arr(soulData.soul.moments).slice().sort(function (a, b) { return (b.pinned - a.pinned) || (b.strength - a.strength); });
        $('sx-moments-meta').textContent = ms.length ? String(ms.length) : '';
        if (!ms.length) emptyLi(ul, 'Здесь будет по-настоящему важное: ваши успехи, решения, первые разы.');
        ms.forEach(function (mo) {
          var li = el('li', mo.pinned ? 'pinned' : '');
          li.style.setProperty('--s', String(0.45 + Math.min(1, mo.strength / 10) * 0.55));
          var t = el('div');
          t.appendChild(el('b', '', mo.title));
          if (mo.text) t.appendChild(el('p', '', mo.text));
          var bar = el('span', 'sx-str');
          var f = el('i');
          f.style.width = Math.round(mo.strength * 10) + '%';
          bar.appendChild(f);
          bar.title = 'Сила памяти ' + mo.strength + '/10 · ' + dmy(mo.t);
          t.appendChild(bar);
          li.appendChild(t);
          if (online) {
            var acts = el('span', 'sx-acts');
            var pin = smallBtn('', mo.pinned ? 'Можно забыть' : 'Не забывать', function () { soulUpdate({ momentId: mo.id, pinned: !mo.pinned }); }, 'sx-pin' + (mo.pinned ? ' on' : ''));
            pin.innerHTML = ico('pin');
            acts.appendChild(pin);
            acts.appendChild(xBtn('Забыть момент', function () { if (window.confirm('Пусть Яэри забудет «' + mo.title + '»?')) soulUpdate({ momentId: mo.id, remove: true }); }));
            li.appendChild(acts);
          }
          ul.appendChild(li);
        });
      }
      function renderJournal() {
        var s = soulData.soul, list = $('sx-journal');
        list.textContent = '';
        var jq = jState.q.toLowerCase();
        var shown = s.journal.slice().reverse().filter(function (j) {
          if (jState.day && dayKey(new Date(j.t || 0)) !== jState.day) return false;
          return !jq || String(j.text || '').toLowerCase().indexOf(jq) > -1 || String(j.mood || '').toLowerCase().indexOf(jq) > -1;
        });
        $('sx-journal-meta').textContent = (shown.length !== s.journal.length ? shown.length + ' из ' : '') + s.journal.length + ' ' + plural(s.journal.length, 'запись', 'записи', 'записей');
        renderJCal(s.journal);
        var jf = $('soul-jfilter');
        jf.hidden = !jState.day && !jq;
        jf.textContent = '';
        if (!jf.hidden) {
          jf.appendChild(el('span', '', (jState.day ? 'За ' + jState.day.split('-').reverse().join('.') : 'Все дни') + (jq ? ' · «' + jState.q + '»' : '')));
          jf.appendChild(smallBtn('Показать всё', 'Сбросить фильтр дневника', function () { jState.day = ''; jState.q = ''; $('soul-jsearch').value = ''; renderJournal(); }, 'mini-btn'));
        }
        shown.slice(0, 60).forEach(function (j) {
          var li = el('li', 'k-' + (j.kind || 'reflection'));
          li.appendChild(icoEl(FEED_ICON[j.kind] || 'thought'));
          var b = el('div');
          var head = el('div', 'j-head');
          head.appendChild(el('b', '', SOUL_KINDS[j.kind] || 'запись'));
          head.appendChild(el('span', '', dmy(j.t) + ' ' + hhmm(j.t)));
          if (j.mood) head.appendChild(el('span', '', j.mood));
          b.appendChild(head);
          b.appendChild(el('p', 'j-text', j.text));
          li.appendChild(b);
          if (online) li.appendChild(xBtn('Удалить запись дневника', function () { if (window.confirm('Удалить эту запись из дневника Яэри?')) soulUpdate({ removeJournal: j.id }); }));
          list.appendChild(li);
        });
        if (!s.journal.length) emptyLi(list, 'Дневник пока пуст.');
        else if (!shown.length) emptyLi(list, 'Ничего не нашлось.');
      }
      var JWEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
      function renderJCal(journal) {
        var days = {};
        journal.forEach(function (j) { var k = dayKey(new Date(j.t || 0)); days[k] = (days[k] || 0) + 1; });
        if (!jState.month) jState.month = new Date();
        var m = jState.month, cal = $('soul-jcal');
        cal.textContent = '';
        var head = el('div', 'cal-head');
        head.appendChild(smallBtn('‹', 'Предыдущий месяц', function () { jState.month = new Date(m.getFullYear(), m.getMonth() - 1, 1); renderJournal(); }));
        var title = '';
        try { title = m.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }); } catch (e) { title = (m.getMonth() + 1) + '.' + m.getFullYear(); }
        head.appendChild(el('span', '', title));
        head.appendChild(smallBtn('›', 'Следующий месяц', function () { jState.month = new Date(m.getFullYear(), m.getMonth() + 1, 1); renderJournal(); }));
        cal.appendChild(head);
        JWEEK.forEach(function (w) { cal.appendChild(el('span', 'wd', w)); });
        var lead = (new Date(m.getFullYear(), m.getMonth(), 1).getDay() + 6) % 7;
        for (var i = 0; i < lead; i++) cal.appendChild(el('span'));
        var total = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate(), today = dayKey(new Date());
        for (var dd = 1; dd <= total; dd++) {
          (function (key, n) {
            var cnt = days[key] || 0;
            var b = el('button', 'd' + (cnt ? ' has' : '') + (key === jState.day ? ' sel' : '') + (key === today ? ' today' : ''), String(n));
            b.type = 'button';
            b.disabled = !cnt;
            b.title = cnt ? cnt + ' ' + plural(cnt, 'запись', 'записи', 'записей') : 'записей нет';
            b.addEventListener('click', function () { jState.day = jState.day === key ? '' : key; renderJournal(); });
            cal.appendChild(b);
          })(dayKey(new Date(m.getFullYear(), m.getMonth(), dd)), dd);
        }
      }
      $('soul-jsearch').addEventListener('input', function () { jState.q = this.value.trim(); renderJournal(); });
      function renderRules() {
        var ul = $('sx-rules'), s = soulData.soul;
        ul.textContent = '';
        var seen = {}, n = 0;
        function add(text, icon, del) {
          var k = String(text).toLowerCase().slice(0, 60);
          if (!text || seen[k]) return;
          seen[k] = 1;
          n++;
          var li = el('li');
          li.appendChild(icoEl(icon));
          li.appendChild(el('span', '', text));
          if (online && del) li.appendChild(xBtn('Убрать правило', del));
          ul.appendChild(li);
        }
        s.lessons.forEach(function (t, i) { add(t, 'compass', function () { var next = s.lessons.slice(); next.splice(i, 1); soulUpdate({ lessons: next }); }); });
        if (growthData) arr(growthData.lessons).slice().reverse().forEach(function (x) { add(x.rule, 'compass'); });
        if (depthData) arr(depthData.rules).forEach(function (r) { add(r.text, 'scroll', function () { api('soul/depth/remove', { list: 'rules', id: r.id }).then(setDepth).catch(undErr); }); });
        $('sx-rules-meta').textContent = n ? String(n) : '';
        if (!n) emptyLi(ul, 'Когда вы поправите Яэри или поставите 👎, она сама выведет правило.');
        $('sx-rule-add').hidden = !online;
      }
      $('sx-rule-add').addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' || ev.isComposing || !soulData) return;
        ev.preventDefault();
        var t = this.value.trim();
        if (!t) return;
        this.value = '';
        soulUpdate({ lessons: soulData.soul.lessons.concat([t]) });
      });
      $('sx-recall-form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var q = $('sx-recall').value.trim(), out = $('sx-recall-out');
        if (!q || !online) return;
        out.textContent = '';
        emptyLi(out, 'Ищу в воспоминаниях…');
        api('vector/search', { query: q }).then(function (d) {
          out.textContent = '';
          var res = arr(d.results);
          if (!res.length) emptyLi(out, 'Ничего не вспомнилось.');
          res.slice(0, 8).forEach(function (x, i) {
            var li = el('li', 'sx-hit');
            li.style.setProperty('--i', String(i));
            li.appendChild(el('span', 'sx-score', Math.round((x.score || 0) * 100) + '%'));
            var b = el('div');
            b.appendChild(el('p', '', x.text));
            b.appendChild(el('small', '', (x.source || x.space || '') + (x.associated ? ' · связанное' : '')));
            li.appendChild(b);
            out.appendChild(li);
          });
        }).catch(function (e) { out.textContent = ''; emptyLi(out, e.message); });
      });

      /* ---------- Характер ---------- */
      var secretAsked = {};
      function renderCharTab() {
        var d = soulData, s = d.soul;
        if (!soulEditing) $('soul-self').value = s.self || '';
        $('soul-self').readOnly = !online;
        fitSoulText($('soul-self'));
        renderRadar();
        renderOwn();
        renderPhil();
        renderWill();
        renderSecrets();
      }
      function renderRadar() {
        var box = $('sx-radar'), traits = arr(soulData.traitList);
        var hist = arr(soulData.soul.traitHistory);
        var base = hist.length > 1 ? hist[0].traits : null;
        var W = 320, H = 260, cx = 160, cy = 130, Rr = 88, n = traits.length;
        if (!n) { chartEmpty(box, 'Черты появятся позже.'); return; }
        function pt(i, v) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * Rr * v / 100, cy + Math.sin(a) * Rr * v / 100]; }
        function poly(f) { return traits.map(function (t, i) { var p = pt(i, f(t)); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }
        var s = '<svg viewBox="0 0 ' + W + ' ' + H + '">' + goldDefs('rr');
        [25, 50, 75, 100].forEach(function (r) { s += '<polygon class="rd-g" points="' + poly(function () { return r; }) + '"/>'; });
        traits.forEach(function (t, i) { var p = pt(i, 100); s += '<line class="rd-g" x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>'; });
        if (base) s += '<polygon class="rd-old" points="' + poly(function (t) { return typeof base[t.id] === 'number' ? base[t.id] : t.value; }) + '"/>';
        s += '<polygon class="rd-now" points="' + poly(function (t) { return t.value; }) + '" fill="url(#rrr)" stroke="url(#rrg)"/>';
        traits.forEach(function (t, i) {
          var lp = pt(i, 122), vp = pt(i, t.value);
          var anchor = Math.abs(lp[0] - cx) < 8 ? 'middle' : (lp[0] > cx ? 'start' : 'end');
          s += '<circle class="rd-pt" cx="' + vp[0].toFixed(1) + '" cy="' + vp[1].toFixed(1) + '" r="3.6"/>';
          s += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 4).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(t.name) + ' <tspan>' + t.value + '</tspan></text>';
        });
        box.innerHTML = s + '</svg>';
        var ul = $('sx-deltas');
        ul.textContent = '';
        traits.forEach(function (t, ti) {
          var pts = hist.map(function (h) { return h.traits && h.traits[t.id]; }).filter(function (v) { return typeof v === 'number'; });
          pts.push(t.value);
          var li = el('li');
          var dot = el('i');
          dot.style.background = TRAIT_COLORS[ti % TRAIT_COLORS.length];
          li.appendChild(dot);
          li.appendChild(el('span', '', t.name));
          var sp = el('span', 'sx-spark');
          if (pts.length > 1) {
            var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), rng = Math.max(4, hi - lo);
            sp.innerHTML = '<svg viewBox="0 0 60 16" preserveAspectRatio="none"><polyline points="' + pts.slice(-30).map(function (v, i, a) { return (i * 60 / Math.max(1, a.length - 1)).toFixed(1) + ',' + (14 - (v - lo) * 12 / rng).toFixed(1); }).join(' ') + '" style="stroke:' + TRAIT_COLORS[ti % TRAIT_COLORS.length] + '"/></svg>';
          }
          li.appendChild(sp);
          var delta = pts.length > 1 ? t.value - pts[0] : 0;
          li.appendChild(el('b', delta > 0 ? 'up' : (delta < 0 ? 'down' : ''), (delta > 0 ? '+' : '') + (delta || '·')));
          ul.appendChild(li);
        });
        $('sx-traits-meta').textContent = hist.length > 1 ? 'за ' + hist.length + ' ' + plural(hist.length, 'день', 'дня', 'дней') : 'меняются сами';
      }
      function renderOwn() {
        var box = $('sx-own'), s = soulData.soul;
        box.textContent = '';
        var own = depthData ? arr(depthData.own) : [];
        [['taste', 'Вкусы'], ['habit', 'Привычки'], ['quirk', 'Причуды']].forEach(function (k) {
          var items = own.filter(function (x) { return x.kind === k[0]; });
          if (!items.length) return;
          box.appendChild(chipSection(k[1], items.map(function (x) { return { text: x.text, id: x.id }; }), function (it) {
            api('soul/depth/remove', { list: 'traitsOwn', id: it.id }).then(setDepth).catch(undErr);
          }));
        });
        var ints = arr(s.interests);
        box.appendChild(chipSection('Увлечения', ints.map(function (x) { return { text: x.name }; }), function (it) { soulUpdate({ removeInterest: it.text }); }));
        var ops = arr(s.opinions);
        if (ops.length) {
          var sec = el('div', 'sx-sec');
          sec.appendChild(el('h3', '', 'Мнения'));
          var ul = el('ul', 'sx-list');
          ops.forEach(function (o) {
            var li = el('li');
            li.appendChild(icoEl('chat'));
            var t = el('span');
            t.appendChild(el('b', '', o.topic + ': '));
            t.appendChild(document.createTextNode(o.view));
            li.appendChild(t);
            if (online) li.appendChild(xBtn('Убрать мнение', function () { soulUpdate({ removeOpinion: o.topic }); }));
            ul.appendChild(li);
          });
          sec.appendChild(ul);
          box.appendChild(sec);
        }
      }
      function renderPhil() {
        var ul = $('sx-phil');
        ul.textContent = '';
        var items = depthData ? arr(depthData.principles) : [];
        items.forEach(function (p) {
          var li = el('li');
          li.appendChild(el('p', '', '«' + p.text + '»'));
          if (p.origin) li.appendChild(el('small', '', 'Откуда: ' + p.origin));
          if (online) li.appendChild(xBtn('Убрать принцип', function () { api('soul/depth/remove', { list: 'principles', id: p.id }).then(setDepth).catch(undErr); }));
          ul.appendChild(li);
        });
        arr(s3Data && s3Data.values).forEach(function (v) {
          var li = el('li', 'value');
          var parts = String(v).split(':');
          li.appendChild(el('p', '', parts.length > 1 ? parts.slice(1).join(':').trim() : v));
          if (parts.length > 1) li.appendChild(el('small', '', parts[0]));
          ul.appendChild(li);
        });
        $('sx-phil-meta').textContent = items.length ? items.length + ' своих' : '';
        if (!ul.children.length) emptyLi(ul, 'Принципы появятся, когда у неё накопится опыт.');
      }
      function renderSecrets() {
        var ul = $('sx-secrets'), bond = soulData.soul.bond || 0;
        ul.textContent = '';
        arr(soulData.secretList).forEach(function (x, i) {
          // Открытый порог — секрет открывается сам, без кнопки.
          if (online && x.unlocked && !x.opened && !secretAsked[x.bond]) { secretAsked[x.bond] = 1; soulUpdate({ openSecret: x.bond }).then(function () { flash('happy', 3200); }); }
          var li = el('li', x.opened ? 'open' : (x.unlocked ? 'ready' : 'locked'));
          li.style.setProperty('--i', String(i));
          li.appendChild(icoEl(x.opened ? 'unlock' : 'lock', 'big'));
          li.appendChild(el('b', '', x.title));
          if (x.opened) li.appendChild(el('p', '', x.text));
          else {
            var bar = el('div', 'sx-meter');
            var f = el('i');
            f.style.width = Math.min(100, bond / x.bond * 100) + '%';
            bar.appendChild(f);
            li.appendChild(bar);
            li.appendChild(el('small', '', x.unlocked ? 'открывается…' : 'при близости ' + x.bond + ' · сейчас ' + bond));
          }
          ul.appendChild(li);
        });
      }

      /* ---------- Настройки ---------- */
      function toggleRow(name, desc, on, fn) {
        var lab = el('label', 'toggle');
        var t = el('span', 't-text');
        t.appendChild(el('span', 't-name', name));
        t.appendChild(el('span', 't-desc', desc));
        lab.appendChild(t);
        var inp = el('input', 'vh');
        inp.type = 'checkbox';
        inp.setAttribute('role', 'switch');
        inp.checked = !!on;
        inp.disabled = !online;
        inp.addEventListener('change', function () { fn(inp.checked); });
        lab.appendChild(inp);
        var tr = el('span', 'track');
        tr.setAttribute('aria-hidden', 'true');
        lab.appendChild(tr);
        return lab;
      }
      function renderSettingsTab() {
        var g = growthData;
        $('sx-evo').checked = !!(evoData && evoData.enabled);
        $('sx-s-life-meta').textContent = evoData ? (evoData.enabled ? 'активна' : 'на паузе') : '';
        each(document.querySelectorAll('#g-int button'), function (b) {
          b.setAttribute('aria-checked', g && b.getAttribute('data-int') === g.intensity ? 'true' : 'false');
          b.disabled = !online;
        });
        $('g-int-note').textContent = g ? INTENSITY_NOTE[g.intensity] || '' : 'Настройки появятся после подключения к Cloud.ru.';
        var sel = $('g-limit');
        sel.disabled = !online;
        if (g) {
          var v = String(g.dailyLimit);
          if (!sel.querySelector('option[value="' + v + '"]')) { var o = el('option', '', v); o.value = v; sel.appendChild(o); }
          sel.value = v;
          var pct = g.dailyLimit > 0 ? Math.min(100, g.usedToday * 100 / g.dailyLimit) : 0;
          $('g-usage-bar').style.width = Math.max(g.usedToday ? 3 : 0, pct) + '%';
          $('g-usage-text').textContent = (g.dailyLimit > 0 ? 'Сегодня ' + g.usedToday + ' из ' + g.dailyLimit + ' запросов' + (g.limitReached ? ' — лимит исчерпан, учёба на паузе до полуночи.' : '.') : 'Сегодня ' + g.usedToday + ' запросов, без лимита.') + (g.lastError ? ' Последняя ошибка: ' + g.lastError : '');
        }
        var flags = $('sx-depth-flags');
        flags.textContent = '';
        DEPTH_FLAGS.forEach(function (f) {
          flags.appendChild(toggleRow(f[1], f[2], depthData && depthData.settings[f[0]], function (on) {
            var o = {}; o[f[0]] = on;
            api('soul/depth/settings', o).then(setDepth).catch(undErr);
          }));
        });
        var ff = $('sx-free-flags');
        ff.textContent = '';
        FREE_FLAGS.forEach(function (f) {
          ff.appendChild(toggleRow(f[1], f[2], freeData && freeData.settings[f[0]], function (on) {
            var o = {}; o[f[0]] = on;
            api('soul/free/settings', o).then(setFree).catch(undErr);
          }));
        });
        $('sx-free-pace').disabled = !online || !freeData;
        if (freeData) {
          $('sx-free-pace').value = freeData.settings.pace || 'normal';
          $('sx-s-free-meta').textContent = freeData.settings.boredom || freeData.settings.will ? 'включена' : 'выключена';
          $('sx-free-note').textContent = 'Одно творение = один запрос из общего лимита (сегодня ' + freeData.usedToday + (freeData.dailyLimit > 0 ? ' из ' + freeData.dailyLimit : '') +
            '). Занимается собой только когда вы не работаете. Без ключа и после лимита — только перебирает воспоминания, бесплатно.';
        }
        $('sx-e5').checked = !!(e5Data && e5Data.enabled);
        $('sx-s3').checked = !!(s3Data && s3Data.enabled);
        $('sx-init').checked = !!(s3Data && s3Data.initiative);
        if (s3Data) $('sx-affection').value = String(s3Data.affection || 0);
        if (lifeData && !busyIn($('sp-set'))) {
          $('sx-lang').value = lifeData.language || 'gentle';
          $('sx-nick').value = lifeData.nickname || '';
          $('sx-local').value = lifeData.localModel || 'yaeri-local';
          $('sx-offline').checked = !!lifeData.offline;
          $('sx-local-status').textContent = lifeData.offline ? 'Автономный режим включён: облачные запросы запрещены.' : 'Cloud.ru разрешён.';
        }
        if (vecData) {
          $('sx-vec').checked = !!vecData.enabled;
          $('sx-rerank').checked = !!vecData.rerank;
          $('sx-assoc').checked = !!vecData.associations;
          var q = vecData.quality || {};
          $('sx-s-mem-meta').textContent = (q.total || 0) + ' записей';
        }
        ['sx-affection', 'sx-lang', 'sx-nick', 'sx-local'].forEach(function (id) { $(id).disabled = !online; });
        var tb = $('u-topics');
        if (!busyIn(tb)) {
          tb.textContent = '';
          if (!undData) tb.appendChild(el('p', 'soul-small', 'Темы доступны после подключения.'));
          arr(undData && undData.topics).forEach(function (t) {
            var row = el('div', 'topic-row');
            var name = el('span', 'tn');
            name.appendChild(el('b', '', t.name));
            name.appendChild(el('small', '', t.count + ' ' + plural(t.count, 'запись', 'записи', 'записей')));
            row.appendChild(name);
            var s2 = el('select', 'field');
            s2.setAttribute('aria-label', 'Режим темы «' + t.name + '»');
            TOPIC_MODES.forEach(function (m) { var o2 = el('option', '', m[1]); o2.value = m[0]; if (m[0] === t.mode) o2.selected = true; s2.appendChild(o2); });
            s2.disabled = !online;
            s2.addEventListener('change', function () { api('soul/understanding/topic', { topic: t.id, mode: s2.value }).then(setUnderstanding).catch(undErr); });
            row.appendChild(s2);
            tb.appendChild(row);
          });
        }
      }
      each(document.querySelectorAll('#g-int button'), function (b) {
        b.addEventListener('click', function () {
          if (online) api('soul/growth/settings', { intensity: b.getAttribute('data-int') }).then(setGrowth).catch(undErr);
        });
      });
      $('g-limit').addEventListener('change', function () { api('soul/growth/settings', { dailyLimit: Number(this.value) }).then(setGrowth).catch(undErr); });
      $('sx-free-pace').addEventListener('change', function () { api('soul/free/settings', { pace: this.value }).then(setFree).catch(undErr); });
      $('sx-evo').addEventListener('change', function () { api('soul/evolution', { enabled: this.checked }).then(function (d) { evoData = d; renderSoulParts(); }).catch(undErr); });
      $('sx-e5').addEventListener('change', function () { api('evolution5/settings', { enabled: this.checked, periodic: this.checked }).then(loadEvolution5).catch(undErr); });
      function saveS3() {
        api('soul3/settings', { enabled: $('sx-s3').checked, affection: Number($('sx-affection').value), initiative: $('sx-init').checked }).then(loadSoul3).catch(undErr);
      }
      ['sx-s3', 'sx-init', 'sx-affection'].forEach(function (id) { $(id).addEventListener('change', saveS3); });
      function saveLife() {
        api('life/settings', { language: $('sx-lang').value, nickname: $('sx-nick').value, localModel: $('sx-local').value }).then(function () { soulMsg('Сохранено.'); return loadLife4(); }).catch(undErr);
      }
      $('sx-lang').addEventListener('change', saveLife);
      $('sx-nick').addEventListener('change', saveLife);
      $('sx-local').addEventListener('change', saveLife);
      $('sx-offline').addEventListener('change', function () {
        api('life/settings', { offline: this.checked, localModel: $('sx-local').value }).then(function () { return api('status'); })
          .then(applyConfig).then(loadLife4).catch(undErr);
      });
      $('sx-local-test').addEventListener('click', function () {
        $('sx-local-status').textContent = 'Проверяю локальный сервер…';
        api('life/local/test', {}).then(function (r) {
          $('sx-local-status').textContent = r.generative ? 'Локальная модель готова; запросы только на 127.0.0.1.' : 'Работает поиск по памяти без модели. ' + (r.error || '');
        }).catch(function (e) { $('sx-local-status').textContent = e.message; });
      });
      function saveVec() {
        api('vector/settings', { enabled: $('sx-vec').checked, rerank: $('sx-rerank').checked, associations: $('sx-assoc').checked }).then(loadVector2).catch(undErr);
      }
      ['sx-vec', 'sx-rerank', 'sx-assoc'].forEach(function (id) { $(id).addEventListener('change', saveVec); });
      var CLEAR = {
        evolution: ['Очистить фоновую память: эпизоды, проверенные знания и историю изменений? Дневник и моменты останутся.', 'soul/evolution/clear', loadEvolution],
        depth: ['Очистить глубину: её характер, принципы, навыки и предложения? Остальная душа сохранится.', 'soul/depth/clear', loadDepth],
        free: ['Очистить её творения, занятия и историю воли? Настройки свободы сохранятся.', 'soul/free/clear', setFree],
        soul3: ['Очистить историю отношений: заботу, этапы, планы и обещания? Остальная душа сохранится.', 'soul3/clear', loadSoul3],
        soul: ['Сбросить душу Яэри целиком? Характер, ступени, мысли о вас и дневник начнутся заново.', 'soul/reset', function (d) { setSoul(d); flash('greet', 3600); }]
      };
      each(document.querySelectorAll('[data-clear]'), function (b) {
        b.addEventListener('click', function () {
          var c = CLEAR[b.getAttribute('data-clear')];
          if (!online || !window.confirm(c[0])) return;
          api(c[1], {}).then(c[2]).then(function () { soulMsg('Готово.'); }).catch(undErr);
        });
      });

      /* Правка текстов: «кем она себя чувствует» и портрет хозяина сохраняются при выходе из поля. */
      function bindSoulText(id, key) {
        var field = $(id);
        field.addEventListener('input', function () { fitSoulText(field); });
        field.addEventListener('focus', function () { soulEditing = true; });
        field.addEventListener('blur', function () {
          soulEditing = false;
          if (!online || !soulData) return;
          var cur = key === 'portrait' ? soulData.soul.owner.portrait : soulData.soul[key];
          if (field.value.trim() === String(cur || '').trim()) return;
          var patch = {};
          patch[key] = field.value;
          soulUpdate(patch);
        });
      }
      bindSoulText('soul-self', 'self');
      bindSoulText('soul-portrait', 'portrait');
      (function () {
        var timer = 0;
        window.addEventListener('resize', function () {
          clearTimeout(timer);
          timer = setTimeout(function () { if (currentView === 'soul' && soulTab === 'path') renderXpChart(); }, 160);
        });
      }());
