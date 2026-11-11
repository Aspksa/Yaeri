      /* ---------- Душа: подвкладки, рост и графики ---------- */
      var growthData = null;
      var SOUL_TABS = ['now', 'growth', 'memory', 'world', 'char', 'depth'];
      var SOUL_XP = [0, 12, 35, 70, 120, 190, 280, 400, 560];
      var GROWTH_ICONS = { nudge: '🌧️', character: '🦊', principle: '📜', skill: '🛠️', proposal: '🪞', review: '🔍', study: '📖', insight: '💡', question: '❓', lesson: '🧭', goal: '🎯', map: '🗺️', 'goal-new': '🌱', 'goal-done': '🏆', sleep: '🌙', reflection: '💭' };
      var GROWTH_RAN = {
        study: 'разобрала ваш разговор', lessons: 'вывела уроки из поправок', goals: 'обновила учебные цели', wonder: 'задумалась о вас',
        ratings: 'разобрала ваши оценки ответов', review: 'перечитала свои ответы', character: 'чуть-чуть выросла характером', principles: 'подумала о своих принципах', skills: 'подумала о новом навыке', maintenance: 'навела порядок в памяти', opinions: 'пересмотрела свои мнения', sleep: 'уснула и пересобрала воспоминания', reflection: 'подумала о разговорах'
      };
      var INTENSITY_NOTE = {
        off: 'Только разговоры, сон и размышления. Собственного любопытства и учебных целей нет.',
        quiet: 'Редко: догадки раз в несколько часов, цели раз в сутки, пауза между задачами 20 минут.',
        normal: 'Раз в пару часов задумывается о вас, цели обновляет несколько раз в день.',
        active: 'Часто: думает о вас каждые 45 минут, шаг обучения раз в 3 минуты. Запросов больше.'
      };
      var TONE_FACE = { joy: 'happy', sad: 'sorry', sleepy: 'sleep', think: 'think', calm: 'idle' };
      function soulTone(name) {
        name = String(name || '').toLowerCase();
        if (/груст|тоск|печал|скуч|тревож|обид|одинок|винов/.test(name)) return 'sad';
        if (/сонн|сон\b|уста|дрем|покой|умирот/.test(name)) return 'sleepy';
        if (/раздум|задум|любопыт|интерес|размышл|сосредоточ/.test(name)) return 'think';
        if (/рад|счаст|весел|игрив|восторг|довольн|вдохнов|нежн|тепл/.test(name)) return 'joy';
        return 'calm';
      }
      function renderHero() {
        if (!soulData) return;
        var tone = soulTone(soulData.soul.mood && soulData.soul.mood.name);
        $('soul-hero').setAttribute('data-tone', tone);
        var src = 'yaeri/' + TONE_FACE[tone] + '-face.webp';
        var face = $('soul-face');
        if (face.getAttribute('src') !== src) face.setAttribute('src', src);
      }
      function showSoulTab(name, focus) {
        if (SOUL_TABS.indexOf(name) < 0) name = 'now';
        SOUL_TABS.forEach(function (k) {
          var t = $('stab-' + k);
          t.setAttribute('aria-selected', k === name ? 'true' : 'false');
          t.tabIndex = k === name ? 0 : -1;
          $('sp-' + k).hidden = k !== name;
          if (k === name && focus) t.focus();
        });
        try { localStorage.setItem('yaeri-soul-tab', name); } catch (e) { /* без запоминания вкладки */ }
        fitSoulText($('soul-self'));
        fitSoulText($('soul-portrait'));
        if (name === 'growth') renderGrowth();
        if (name === 'depth' && typeof renderDepth === 'function') renderDepth();
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
        try { saved = localStorage.getItem('yaeri-soul-tab') || 'now'; } catch (e) { saved = 'now'; }
        showSoulTab(saved);
      }());

      function ago(t) {
        var m = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (m < 1) return 'только что';
        if (m < 60) return m + ' мин назад';
        var h = Math.round(m / 60);
        if (h < 24) return h + ' ' + plural(h, 'час', 'часа', 'часов') + ' назад';
        var d = Math.round(h / 24);
        return d + ' ' + plural(d, 'день', 'дня', 'дней') + ' назад';
      }
      function dayMs(key) { var p = String(key).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
      function dayLabel(key) { return String(key).slice(8, 10) + '.' + String(key).slice(5, 7); }
      function chartEmpty(box, text) { box.innerHTML = '<div class="chart-empty">' + text + '</div>'; }
      function legendFill(box, items) {
        box.textContent = '';
        items.forEach(function (it) {
          var sp = el('span');
          var i = el('i');
          i.style.background = it.color;
          sp.appendChild(i);
          sp.appendChild(document.createTextNode(it.label + ' '));
          sp.appendChild(el('b', '', String(it.value)));
          box.appendChild(sp);
        });
      }
      // Линейный график по датам: подсказка и направляющая при наведении или касании.
      function drawLines(box, cfg) {
        var days = cfg.days, n = days.length;
        var W = Math.max(300, Math.round(box.clientWidth) || 640), H = 230, L = 36, R = cfg.thresholds && cfg.thresholds.length ? 54 : 14, T = 12, B = 26;
        var t0 = dayMs(days[0]), t1 = dayMs(days[n - 1]);
        function X(i) { return n < 2 || t1 === t0 ? (L + W - R) / 2 : L + (dayMs(days[i]) - t0) * (W - L - R) / (t1 - t0); }
        var lo = cfg.yMin || 0, hi = cfg.yMax;
        function Y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
        var id = box.id, s = '<svg viewBox="0 0 ' + W + ' ' + H + '"><defs>';
        cfg.series.forEach(function (sr, k) {
          s += '<linearGradient id="' + id + '-g' + k + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + sr.color + ';stop-opacity:.38"/><stop offset="1" style="stop-color:' + sr.color + ';stop-opacity:0"/></linearGradient>';
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
          // Подписи ступеней не накладываем друг на друга.
          if (lastLabelY === 1e9 || ty - lastLabelY >= 13) { s += '<text class="thr-l" x="' + (W - R + 5) + '" y="' + (ty + 3).toFixed(1) + '">' + th.label + '</text>'; lastLabelY = ty; }
        });
        s += '<text x="' + L + '" y="' + (H - 7) + '">' + dayLabel(days[0]) + '</text>';
        if (n > 1) s += '<text x="' + (W - R) + '" y="' + (H - 7) + '" text-anchor="end">' + dayLabel(days[n - 1]) + '</text>';
        if (n > 4) s += '<text x="' + ((L + W - R) / 2).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + dayLabel(days[Math.floor((n - 1) / 2)]) + '</text>';
        cfg.series.forEach(function (sr, k) {
          var d = '';
          sr.values.forEach(function (v, i) { d += (i ? ' L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
          if (n > 1 && cfg.area) s += '<path d="' + d + ' L' + X(n - 1).toFixed(1) + ' ' + Y(lo).toFixed(1) + ' L' + X(0).toFixed(1) + ' ' + Y(lo).toFixed(1) + ' Z" fill="url(#' + id + '-g' + k + ')"/>';
          if (n > 1) s += '<path class="ln" style="stroke:' + sr.color + '" d="' + d + '"/>';
          var last = n - 1;
          s += '<circle class="pt" style="fill:' + sr.color + '" cx="' + X(last).toFixed(1) + '" cy="' + Y(sr.values[last]).toFixed(1) + '" r="4"/>';
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
          var top = 1e9;
          cfg.series.forEach(function (sr) {
            var row = el('div');
            var dot = el('i');
            dot.style.background = sr.color;
            row.appendChild(dot);
            row.appendChild(document.createTextNode(sr.label + ': ' + sr.values[best]));
            tip.appendChild(row);
            top = Math.min(top, Y(sr.values[best]));
          });
          tip.hidden = false;
          tip.style.left = Math.max(60, Math.min(r.width - 60, X(best) * r.width / W)) + 'px';
          tip.style.top = Math.max(30, top * r.height / H) + 'px';
        }
        function hide() { guide.style.display = 'none'; tip.hidden = true; }
        hit.addEventListener('pointermove', show);
        hit.addEventListener('pointerdown', show);
        hit.addEventListener('pointerleave', hide);
      }
      function renderLadder() {
        var d = soulData;
        var ol = $('g-ladder');
        ol.textContent = '';
        var stages = growthData && growthData.stages ? growthData.stages : SOUL_STAGES.map(function (n, i) { return { level: i + 1, name: n, xp: SOUL_XP[i], t: 0 }; });
        var lvl = d.level || 1;
        var span = d.xpTo > d.xpFrom ? d.xpTo - d.xpFrom : 1;
        var frac = d.xpTo < 0 ? 0 : Math.max(0, Math.min(1, (d.soul.xp - d.xpFrom) / span));
        ol.style.setProperty('--p', String(Math.min(1, (lvl - 1 + frac) / 8)));
        stages.forEach(function (st) {
          var li = el('li', st.level < lvl ? 'done' : (st.level === lvl ? 'cur' : ''));
          if (st.level === lvl) li.setAttribute('aria-current', 'step');
          li.appendChild(el('span', 'dot', st.level <= lvl ? String(st.level) : String(st.level)));
          var lt = el('span', 'lt');
          lt.appendChild(el('b', '', st.name));
          lt.appendChild(el('small', '', st.level <= lvl && st.t ? dmy(st.t) : 'от ' + st.xp + ' оп.'));
          li.appendChild(lt);
          ol.appendChild(li);
        });
        $('g-ladder-meta').textContent = 'ступень ' + lvl + ' из ' + stages.length + ' · опыт ' + d.soul.xp;
      }
      function renderXpChart() {
        var box = $('g-xp-chart');
        var ser = growthData ? arr(growthData.series) : [];
        if (!ser.length) {
          chartEmpty(box, online ? 'График появится после первого дня работы: Яэри записывает опыт раз в день.' : 'Подключите Cloud.ru: график опыта и ступеней начнёт строиться сам.');
          $('g-xp-legend').textContent = '';
          $('g-xp-meta').textContent = '';
          return;
        }
        var days = ser.map(function (p) { return p.day; });
        var xs = ser.map(function (p) { return p.xp; });
        var maxXp = Math.max.apply(null, xs);
        var stages = arr(growthData.stages);
        var top = SOUL_XP[SOUL_XP.length - 1];
        for (var i = 0; i < SOUL_XP.length; i++) { if (SOUL_XP[i] > maxXp) { top = SOUL_XP[i]; break; } }
        top = Math.max(top, 12);
        drawLines(box, {
          days: days, yMax: top, area: true, series: [{ label: 'Опыт', color: 'var(--a)', values: xs }],
          thresholds: stages.filter(function (s) { return s.level > 1; }).map(function (s) { return { v: s.xp, label: 'ступ. ' + s.level }; })
        });
        var first = xs[0], lastv = xs[xs.length - 1];
        $('g-xp-meta').textContent = ser.length + ' ' + plural(ser.length, 'день', 'дня', 'дней');
        legendFill($('g-xp-legend'), [
          { color: 'var(--a)', label: 'Опыт сейчас', value: lastv },
          { color: 'var(--faint)', label: 'за период', value: (lastv - first >= 0 ? '+' : '') + (lastv - first) },
          { color: 'var(--warn)', label: 'близость', value: ser[ser.length - 1].bond }
        ]);
      }
      function renderKnowChart() {
        var box = $('g-know-chart');
        var ser = growthData ? arr(growthData.series) : [];
        if (!ser.length) { chartEmpty(box, 'Здесь будет видно, как растут её знания о вас, моменты, догадки и уроки.'); $('g-know-legend').textContent = ''; $('g-know-meta').textContent = ''; return; }
        var defs = [['facts', 'Знания', TRAIT_COLORS[0]], ['episodes', 'Эпизоды', TRAIT_COLORS[1]], ['insights', 'Догадки', TRAIT_COLORS[2]], ['lessons', 'Уроки', TRAIT_COLORS[3]]];
        var mx = 5;
        var series = defs.map(function (df) {
          var vals = ser.map(function (p) { return p[df[0]] || 0; });
          mx = Math.max(mx, Math.max.apply(null, vals));
          return { label: df[1], color: df[2], values: vals };
        });
        drawLines(box, { days: ser.map(function (p) { return p.day; }), yMax: Math.ceil(mx * 1.15 / 4) * 4, series: series });
        legendFill($('g-know-legend'), series.map(function (sr) { return { color: sr.color, label: sr.label, value: sr.values[sr.values.length - 1] }; }));
        $('g-know-meta').textContent = 'накопительно';
      }
      function renderCallsChart() {
        var box = $('g-calls-chart');
        var ser = growthData ? arr(growthData.series).slice(-14) : [];
        if (!ser.length) { chartEmpty(box, 'Сколько запросов она тратит на учёбу в фоне, по дням.'); $('g-calls-legend').textContent = ''; $('g-calls-meta').textContent = ''; return; }
        var lim = growthData.dailyLimit || 0;
        var mx = Math.max(4, lim, Math.max.apply(null, ser.map(function (p) { return p.calls || 0; })));
        var W = Math.max(300, Math.round(box.clientWidth) || 640), H = 190, L = 34, R = 10, T = 12, B = 26, slot = (W - L - R) / ser.length, bw = Math.min(34, slot * 0.62);
        function Y(v) { return T + (mx - v) * (H - T - B) / mx; }
        var s = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
        for (var g = 0; g <= 4; g++) { var v = mx * g / 4; s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + Math.round(v) + '</text>'; }
        ser.forEach(function (p, i) {
          var x = L + slot * i + (slot - bw) / 2, c = p.calls || 0, h = Math.max(c ? 2 : 0, (H - T - B) * c / mx);
          s += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + (H - B - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" style="fill:var(--a)"><title>' + dayLabel(p.day) + ': ' + c + ' ' + plural(c, 'запрос', 'запроса', 'запросов') + '</title></rect>';
        });
        if (lim > 0) s += '<line class="thr" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(lim).toFixed(1) + '" y2="' + Y(lim).toFixed(1) + '" style="stroke:var(--warn)"/><text class="thr-l" x="' + (W - R) + '" y="' + (Y(lim) - 4).toFixed(1) + '" text-anchor="end" style="fill:var(--warn)">лимит ' + lim + '</text>';
        s += '<text x="' + L + '" y="' + (H - 7) + '">' + dayLabel(ser[0].day) + '</text>';
        if (ser.length > 1) s += '<text x="' + (W - R) + '" y="' + (H - 7) + '" text-anchor="end">' + dayLabel(ser[ser.length - 1].day) + '</text>';
        box.innerHTML = s + '</svg>';
        var total = ser.reduce(function (a, p) { return a + (p.calls || 0); }, 0);
        $('g-calls-meta').textContent = 'за ' + ser.length + ' ' + plural(ser.length, 'день', 'дня', 'дней');
        legendFill($('g-calls-legend'), [{ color: 'var(--a)', label: 'Всего запросов', value: total }, { color: 'var(--warn)', label: 'Сегодня', value: ser[ser.length - 1].calls || 0 }]);
      }
      function renderRadar() {
        var box = $('g-radar');
        var traits = arr(soulData.traitList);
        if (!traits.length) { chartEmpty(box, 'Черты характера появятся позже.'); return; }
        var hist = arr(soulData.soul.traitHistory);
        var base = hist.length > 1 ? hist[0].traits : null;
        var W = 340, H = 270, cx = 170, cy = 135, Rr = 92, n = traits.length;
        function pt(i, v) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * Rr * v / 100, cy + Math.sin(a) * Rr * v / 100]; }
        function poly(f) { return traits.map(function (t, i) { var p = pt(i, f(t)); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }
        var s = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
        [25, 50, 75, 100].forEach(function (r) { s += '<polygon class="rd-g" points="' + poly(function () { return r; }) + '"/>'; });
        traits.forEach(function (t, i) { var p = pt(i, 100); s += '<line class="rd-g" x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>'; });
        if (base) s += '<polygon class="rd-old" points="' + poly(function (t) { return typeof base[t.id] === 'number' ? base[t.id] : t.value; }) + '"/>';
        s += '<polygon class="rd-now" points="' + poly(function (t) { return t.value; }) + '"/>';
        traits.forEach(function (t, i) {
          var p = pt(i, 100), lp = pt(i, 100 + 20), vp = pt(i, t.value);
          var anchor = Math.abs(lp[0] - cx) < 8 ? 'middle' : (lp[0] > cx ? 'start' : 'end');
          s += '<circle cx="' + vp[0].toFixed(1) + '" cy="' + vp[1].toFixed(1) + '" r="3.5" style="fill:var(--a-glow)"/>';
          s += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 3).toFixed(1) + '" text-anchor="' + anchor + '" style="fill:var(--ink)">' + t.name + ' <tspan style="fill:var(--a)">' + t.value + '</tspan></text>';
        });
        box.innerHTML = s + '</svg>';
      }
      function renderGoals() {
        var box = $('g-goals');
        box.textContent = '';
        var goals = growthData ? arr(growthData.goals).slice().sort(function (a, b) { return (a.status === 'done') - (b.status === 'done'); }) : [];
        var act = goals.filter(function (g) { return g.status === 'active'; }).length;
        $('g-goals-meta').textContent = goals.length ? act + ' ' + plural(act, 'цель', 'цели', 'целей') + ' в работе' : '';
        if (!goals.length) { box.appendChild(el('li', 'empty soul-small', online ? 'Пока целей нет: Яэри сама поставит их, когда немного узнает вас. Нажмите «Учиться сейчас», чтобы ускорить.' : 'Свои учебные цели Яэри ставит, когда подключена к Cloud.ru.')); return; }
        goals.forEach(function (g) {
          var li = el('li', g.status === 'done' ? 'done' : '');
          var ring = el('div', 'ring');
          ring.style.setProperty('--v', String(g.progress || 0));
          ring.appendChild(el('span', '', (g.progress || 0) + '%'));
          li.appendChild(ring);
          var t = el('div', 'goal-t');
          t.appendChild(el('b', '', g.text));
          t.appendChild(el('span', '', (g.status === 'done' ? 'Достигнуто. ' : '') + (g.why || '')));
          li.appendChild(t);
          var steps = arr(g.steps);
          if (steps.length) {
            var ul = el('ul', 'steps');
            steps.forEach(function (st) { ul.appendChild(el('li', st.done ? 'on' : '', st.text)); });
            li.appendChild(ul);
          }
          box.appendChild(li);
        });
      }
      function growthAct(id, action) {
        return api('soul/growth/insight', { id: id, action: action }).then(setGrowth).catch(function (e) { $('g-ctl-status').textContent = e.message; });
      }
      function renderInsights() {
        var ul = $('g-insights');
        ul.textContent = '';
        var items = growthData ? arr(growthData.insights).filter(function (x) { return x.status !== 'dismissed'; }).slice().reverse() : [];
        $('g-ins-meta').textContent = items.length ? items.length + ' ' + plural(items.length, 'догадка', 'догадки', 'догадок') : '';
        if (!items.length) ul.appendChild(el('li', 'empty soul-small', 'Когда вас нет, Яэри размышляет о вас и сверяет догадки с памятью и документами. Они появятся здесь.'));
        items.forEach(function (x) {
          var li = el('li');
          li.appendChild(el('div', 'iq', x.question));
          li.appendChild(el('p', '', x.answer));
          var act = el('div', 'ia');
          act.appendChild(el('span', 'badge' + (x.status === 'confirmed' ? ' ok' : ''), x.status === 'confirmed' ? 'подтверждено' : 'гипотеза'));
          act.appendChild(el('span', 'badge', x.basis === 'docs' ? 'из документов' : 'из памяти'));
          if (online && x.status === 'hypothesis') {
            act.appendChild(smallBtn('Это так', 'Подтвердить догадку', function () { growthAct(x.id, 'confirm'); }, 'mini-btn solid'));
            act.appendChild(smallBtn('Не так', 'Отклонить догадку', function () { growthAct(x.id, 'dismiss'); }, 'mini-btn'));
          }
          li.appendChild(act);
          ul.appendChild(li);
        });
        var q = $('g-questions');
        q.textContent = '';
        var qs = growthData ? arr(growthData.questions).slice().reverse() : [];
        if (!qs.length) q.appendChild(el('li', 'empty', 'Пока вопросов нет.'));
        qs.forEach(function (x) { q.appendChild(el('li', '', x.q)); });
      }
      function renderGrowthLessons() {
        var ul = $('g-lessons');
        ul.textContent = '';
        var items = growthData ? arr(growthData.lessons).slice().reverse() : [];
        $('g-lessons-meta').textContent = items.length ? String(items.length) : '';
        if (!items.length) ul.appendChild(el('li', 'empty', 'Когда вы поправите Яэри, она запишет здесь правило, чтобы не повторять ошибку.'));
        items.forEach(function (x) { ul.appendChild(el('li', '', x.rule)); });
      }
      function renderFeedList() {
        var ul = $('g-feed');
        ul.textContent = '';
        var items = growthData ? arr(growthData.feed).slice(-14).reverse() : [];
        $('g-feed-meta').textContent = items.length ? 'последнее ' + ago(items[0].t) : '';
        if (!items.length) { ul.appendChild(el('li', 'empty', online ? 'Пока тихо. Как только Яэри что-то узнает, подумает или поставит себе цель, это появится здесь.' : 'Лента обучения появится, когда Яэри подключится к Cloud.ru.')); return; }
        items.forEach(function (it) {
          var li = el('li');
          li.appendChild(el('span', 'ico', GROWTH_ICONS[it.kind] || '✨'));
          var box = el('div');
          box.appendChild(el('time', '', dmy(it.t) + ' ' + hhmm(it.t)));
          box.appendChild(el('p', '', it.text));
          li.appendChild(box);
          ul.appendChild(li);
        });
      }
      function renderGrowthControls() {
        var g = growthData;
        each(document.querySelectorAll('#g-int button'), function (b) {
          var on = !!g && b.getAttribute('data-int') === g.intensity;
          b.setAttribute('aria-checked', on ? 'true' : 'false');
          b.disabled = !online;
        });
        $('g-int-note').textContent = g ? INTENSITY_NOTE[g.intensity] || '' : 'Настройки появятся, когда Яэри подключится к Cloud.ru.';
        var sel = $('g-limit');
        sel.disabled = !online;
        if (g) {
          var v = String(g.dailyLimit);
          if (!sel.querySelector('option[value="' + v + '"]')) { var o = el('option', '', v); o.value = v; sel.appendChild(o); }
          sel.value = v;
          var pct = g.dailyLimit > 0 ? Math.min(100, g.usedToday * 100 / g.dailyLimit) : 0;
          $('g-usage-bar').style.width = Math.max(g.usedToday ? 3 : 0, pct) + '%';
          $('g-usage-text').textContent = g.dailyLimit > 0
            ? 'Сегодня: ' + g.usedToday + ' из ' + g.dailyLimit + ' ' + plural(g.dailyLimit, 'запроса', 'запросов', 'запросов') + (g.limitReached ? '. Лимит исчерпан: фоновая учёба на паузе до полуночи.' : '.')
            : 'Сегодня: ' + g.usedToday + ' запросов (без лимита).';
          $('g-ctl-meta').textContent = g.lastAction ? 'шаг ' + ago(g.lastAction) : '';
          if (g.lastError) $('g-ctl-status').textContent = 'Последняя ошибка: ' + g.lastError;
        } else {
          $('g-usage-bar').style.width = '0%';
          $('g-usage-text').textContent = '';
          $('g-ctl-meta').textContent = '';
        }
      }
      function renderGrowth() {
        if (!soulData) soulData = soulDefault();
        renderFeedList();
        if (currentView !== 'soul') return;
        renderLadder();
        renderXpChart();
        renderKnowChart();
        renderCallsChart();
        renderRadar();
        renderGoals();
        renderInsights();
        renderGrowthLessons();
        renderGrowthControls();
        renderUnderstanding();
      }
      function setGrowth(data) {
        if (!data || !data.stages) return;
        growthData = data;
        renderGrowth();
      }
      function loadGrowth() {
        if (!online) return Promise.resolve();
        return api('soul/growth').then(setGrowth).catch(function () { /* Покажем при следующем обновлении. */ });
      }
      each(document.querySelectorAll('#g-int button'), function (b) {
        b.addEventListener('click', function () {
          if (!online) return;
          api('soul/growth/settings', { intensity: b.getAttribute('data-int') }).then(setGrowth).catch(function (e) { $('g-ctl-status').textContent = e.message; });
        });
      });
      $('g-limit').addEventListener('change', function () {
        api('soul/growth/settings', { dailyLimit: Number(this.value) }).then(setGrowth).catch(function (e) { $('g-ctl-status').textContent = e.message; });
      });
      $('g-run').addEventListener('click', function () {
        var btn = this;
        btn.disabled = true;
        $('g-ctl-status').textContent = 'Яэри учится…';
        api('soul/growth/run', {}).then(function (data) {
          setGrowth(data);
          $('g-ctl-status').textContent = data.ran ? 'Готово: Яэри ' + (GROWTH_RAN[data.ran] || 'поучилась') + '.' : 'Пока нечему учиться: всё свежо. Поговорите с ней, и будет над чем думать.';
          return loadSoul();
        }).catch(function (e) { $('g-ctl-status').textContent = e.message; }).then(function () { btn.disabled = false; });
      });
      setInterval(function () {
        if (online && currentView === 'soul' && !document.hidden) loadGrowth();
      }, 60000);
      (function () {
        var timer = 0;
        window.addEventListener('resize', function () {
          clearTimeout(timer);
          timer = setTimeout(function () { if (currentView === 'soul' && !$('sp-growth').hidden) renderGrowth(); }, 160);
        });
      }());

