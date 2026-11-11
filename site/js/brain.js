
    /* ===================== Второй мозг: граф памяти на canvas ===================== */
    (function () {
      'use strict';
      var App = window.YaeriApp;
      function $(id) { return document.getElementById(id); }
      function each(list, fn) { Array.prototype.forEach.call(list, fn); }
      var TAU = Math.PI * 2;
      var GOLD = Math.PI * (3 - Math.sqrt(5));

      /* ---------- Темы ---------- */
      var THEMES = [
        { id: 'site', name: 'Яэри (цвет сайта)', site: true },
        { id: 'metal', name: 'Металлик', bg: '#0c1013', grid: '#1b242a', ink: '#d5dde2', muted: '#7d8a93', core: '#e4eaee', colors: ['#a7bccf', '#e3b25e', '#79d1a0', '#c799f2', '#f29a5a', '#6fc3df', '#e7e2d6'] },
        { id: 'ruby', name: 'Рубин', bg: '#110709', grid: '#2a1418', ink: '#f6e3e6', muted: '#a07f86', core: '#ff5d73', colors: ['#ff5d73', '#ffb36b', '#f3e7e9', '#c77dff', '#ff8fab', '#ffd166', '#e85d04'] },
        { id: 'ocean', name: 'Океан', bg: '#061115', grid: '#11262c', ink: '#d2eeea', muted: '#6f9590', core: '#3ddbc0', colors: ['#3ddbc0', '#5ab8ff', '#8b7dff', '#e8f1f2', '#ffb454', '#7ee081', '#ff7b9c'] },
        { id: 'neon', name: 'Неон', bg: '#06050b', grid: '#17142a', ink: '#f2f2ff', muted: '#8a86a8', core: '#00e5ff', colors: ['#39ff14', '#ff2bd6', '#00e5ff', '#fff200', '#ff6b00', '#9d4dff', '#ffffff'] },
        { id: 'bordeaux', name: 'Бордо', bg: '#13060a', grid: '#2b1219', ink: '#f3dde2', muted: '#a07a84', core: '#e2a0a8', colors: ['#e2a0a8', '#c24d5f', '#f5d0a9', '#b08ba0', '#ffffff', '#d98a5b', '#8fb5a3'] },
        { id: 'paper', name: 'Бумага', bg: '#f3efe6', grid: '#ddd5c6', ink: '#29241f', muted: '#7b7266', core: '#1f6f8b', colors: ['#1f6f8b', '#c0392b', '#d68910', '#6c3483', '#1e8449', '#2e4053', '#b9770e'], light: true }
      ];
      function siteTheme() {
        var cs = getComputedStyle(document.documentElement);
        var h = parseFloat(cs.getPropertyValue('--h')) || 168;
        function hsl(hh, s, l) { return 'hsl(' + ((hh % 360) + 360) % 360 + ',' + s + '%,' + l + '%)'; }
        return {
          id: 'site', name: 'Яэри (цвет сайта)', site: true,
          bg: hsl(h, 30, 4.5), grid: hsl(h, 18, 13), ink: hsl(h, 18, 90), muted: hsl(h, 10, 55), core: hsl(h, 68, 62),
          colors: [hsl(h, 68, 62), hsl(h + 50, 70, 66), hsl(h - 60, 70, 68), hsl(h + 140, 65, 70), hsl(h + 190, 75, 68), hsl(h + 100, 55, 72), hsl(h, 15, 85)]
        };
      }

      /* ---------- Состояние и настройки вида ---------- */
      var defaults = { layout: 'rings', group: 'sections', spin: 0.25, springs: 1, links: 0.45, nodes: 1, labels: 1, names: true, semantic: true, theme: 'site', collapsed: [] };
      var view = (function () {
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem('yaeri_brain_v1')); } catch (error) { saved = null; }
        var v = {};
        Object.keys(defaults).forEach(function (k) { v[k] = saved && saved[k] !== undefined && typeof saved[k] === typeof defaults[k] ? saved[k] : defaults[k]; });
        if (['rings', 'stars', 'hex', 'force', 'time'].indexOf(v.layout) < 0) v.layout = 'rings';
        if (['sections', 'types'].indexOf(v.group) < 0) v.group = 'sections';
        if (!THEMES.some(function (t) { return t.id === v.theme; })) v.theme = 'site';
        if (!Array.isArray(v.collapsed)) v.collapsed = [];
        return v;
      }());
      var theme = null;
      function pickTheme() {
        var t = THEMES.filter(function (x) { return x.id === view.theme; })[0] || THEMES[0];
        theme = t.site ? siteTheme() : t;
        var stage = $('stage');
        stage.style.background = theme.bg;
        stage.style.setProperty('--stage-ink', theme.ink);
        stage.style.setProperty('--stage-muted', theme.muted);
        stage.style.setProperty('--stage-accent', theme.core);
      }

      var data = { notes: [], memory: [], docs: [], links: [], messages: 0, soul: [] };
      var SOUL_TYPES = { moment: 'Важные моменты', interest: 'Её увлечения', opinion: 'Её мнения', aim: 'Её цели', dream: 'Её сны' };
      var SOUL_COLOR = 'hsl(330, 85%, 72%)';
      var lit = {}; // узлы, которые сейчас светятся: id → { start, until }
      var graph = { nodes: [], links: [], groups: [], byId: {} };
      var groupColor = {};

      var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
      var KIND = { note: 'Заметка', memory: 'Воспоминание', doc: 'Документ', soul: 'Душа' };
      function monthName(t) { var d = new Date(t || 0); return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
      function cut(text, n) { text = String(text || '').replace(/\s+/g, ' ').trim(); return text.length > n ? text.slice(0, n - 1) + '…' : text; }
      function ago(t) {
        var d = Math.max(0, Date.now() - t), m = Math.round(d / 6e4);
        if (m < 1) return 'только что';
        if (m < 60) return m + ' мин назад';
        var h = Math.round(m / 60);
        if (h < 24) return h + ' ч назад';
        var days = Math.round(h / 24);
        return days === 1 ? 'вчера' : days + ' ' + (days % 10 === 1 && days % 100 !== 11 ? 'день' : days % 10 > 1 && days % 10 < 5 && (days % 100 < 10 || days % 100 > 20) ? 'дня' : 'дней') + ' назад';
      }
      function sizeOf(chars) {
        var b = (chars || 0) * 2;
        return b < 1024 ? b + ' Б' : b < 1048576 ? Math.round(b / 1024) + ' КБ' : (b / 1048576).toFixed(1) + ' МБ';
      }
      function groupKind(g) { return g.kind === 'memory' ? 'разговоры' : g.kind === 'doc' ? 'документы' : g.kind === 'soul' ? 'душа Яэри' : 'раздел памяти'; }
      function memTitle(text) { return cut(String(text || '').replace(/^Пользователь:\s*/, '').split('\n')[0], 48); }

      function groupKey(kind, item) {
        if (view.group === 'types') return kind === 'note' ? 'Рабочая память' : kind === 'memory' ? 'Разговоры' : kind === 'soul' ? 'Душа' : 'Документы';
        if (kind === 'note') return item.cat || 'Общее';
        if (kind === 'soul') return 'Душа · ' + (SOUL_TYPES[item.type] || 'другое');
        if (kind === 'memory') return 'Разговоры · ' + monthName(item.t);
        return 'Документы';
      }
      function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
      function colorFor(kind, key) {
        // Запасной цвет, пока граф ещё не построен (обычно цвет берётся из groupColor).
        if (!theme) pickTheme();
        if (groupColor[key]) return groupColor[key];
        if (kind === 'memory') return theme.colors[3 % theme.colors.length];
        if (kind === 'doc') return theme.colors[4 % theme.colors.length];
        if (kind === 'soul') return SOUL_COLOR;
        return theme.colors[hashStr(key) % theme.colors.length];
      }

      function build() {
        groupColor = {};
        var nodes = [];
        var byId = {};
        var groups = {};
        var gList = [];
        var core = { id: 'core', type: 'core', label: 'ЯЭРИ', r: 40, x: 0, y: 0 };
        nodes.push(core);
        byId.core = core;
        function addItem(kind, item, title) {
          var key = groupKey(kind, item);
          var g = groups[key];
          if (!g) {
            g = { id: 'g:' + key, type: 'group', key: key, label: key, kind: kind, items: [], x: 0, y: 0, t: 0 };
            groups[key] = g;
            gList.push(g);
          }
          var t = kind === 'doc' ? item.added : item.t;
          var n = { id: (kind === 'note' ? 'n:' : kind === 'memory' ? 'm:' : kind === 'soul' ? 's:' : 'd:') + item.id, type: 'leaf', kind: kind, item: item, group: g, label: title, t: t || 0, x: 0, y: 0 };
          g.items.push(n);
          g.t = Math.max(g.t, n.t);
          nodes.push(n);
          byId[n.id] = n;
        }
        data.notes.forEach(function (n) { addItem('note', n, cut(n.text, 48)); });
        data.memory.forEach(function (m) { addItem('memory', m, memTitle(m.text)); });
        data.docs.forEach(function (d) { addItem('doc', d, cut(d.name, 48)); });
        (data.soul || []).forEach(function (x) { addItem('soul', x, cut(x.title || x.text, 48)); });

        // Порядок групп: заметки по алфавиту, затем документы, затем разговоры по времени.
        var rank = { note: 0, soul: 1, doc: 2, memory: 3 };
        gList.sort(function (a, b) {
          if (view.group === 'types') return rank[a.kind] - rank[b.kind];
          return rank[a.kind] - rank[b.kind] || (a.kind === 'memory' ? a.t - b.t : a.key.localeCompare(b.key, 'ru'));
        });
        var ci = 0;
        gList.forEach(function (g) {
          if (g.kind === 'soul') groupColor[g.key] = SOUL_COLOR;
          else if (view.group === 'types') groupColor[g.key] = theme.colors[{ note: 0, memory: 3, doc: 4 }[g.kind] % theme.colors.length];
          else if (g.kind === 'memory') groupColor[g.key] = theme.colors[3 % theme.colors.length];
          else if (g.kind === 'doc') groupColor[g.key] = theme.colors[4 % theme.colors.length];
          else { groupColor[g.key] = theme.colors[[0, 1, 2, 5, 6][ci % 5] % theme.colors.length]; ci++; }
          g.color = groupColor[g.key];
          g.collapsed = view.collapsed.indexOf(g.key) > -1;
          g.items.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
          g.items.forEach(function (n) { n.color = g.color; });
          nodes.push(g);
          byId[g.id] = g;
        });
        // Ядро рисуется последним, чтобы быть поверх.
        nodes.push(nodes.shift());

        var links = [];
        gList.forEach(function (g) {
          links.push({ a: core, b: g, kind: 'core' });
          g.items.forEach(function (n) { links.push({ a: g, b: n, kind: 'group' }); });
        });
        (data.links || []).forEach(function (l) {
          var a = byId[l[0]];
          var b = byId[l[1]];
          if (a && b) links.push({ a: a, b: b, kind: 'sem', w: +l[2] || 0.5 });
        });
        var old = graph.byId;
        nodes.forEach(function (n) {
          var o = old[n.id];
          if (o) { n.x = o.x; n.y = o.y; n.seen = true; }
        });
        graph = { nodes: nodes, links: links, groups: gList, byId: byId };
      }
      function visible(n) { return n.type !== 'leaf' || !n.group.collapsed; }

      /* ---------- Раскладки ---------- */
      function phyllo(n, j, spacing) {
        var r = spacing * Math.sqrt(j + 0.6);
        return { x: Math.cos(j * GOLD) * r, y: Math.sin(j * GOLD) * r, r: r };
      }
      var deco = { rings: [], hexes: [], axis: null };
      function layout() {
        var G = graph.groups;
        deco = { rings: [], hexes: [], axis: null };
        var targets = {};
        function set(n, x, y) { targets[n.id] = { x: x, y: y }; }
        set(graph.byId.core, 0, 0);
        if (!G.length) { apply(targets); return; }
        var sp = 15;

        if (view.layout === 'rings') {
          // Как в референсе: разделы памяти — плотные «клинья» точек вокруг ядра,
          // разговоры — внешнее кольцо из кружков-иконок, сгруппированных по месяцам.
          var inner = G.filter(function (g) { return g.kind !== 'memory'; });
          var outerG = G.filter(function (g) { return g.kind === 'memory'; });
          var step = 13;
          var shapes = inner.map(function (g) {
            var n = g.collapsed ? 1 : Math.max(1, g.items.length);
            var cols = Math.max(1, Math.min(9, Math.round(Math.sqrt(n / 1.2))));
            return { g: g, cols: cols, rows: Math.ceil(n / cols) };
          });
          var widthPx = shapes.reduce(function (s0, x) { return s0 + x.cols * step; }, 0);
          var gapPx = 46;
          var R0 = Math.max(230, (widthPx + gapPx * Math.max(1, shapes.length)) / TAU);
          var maxRows = shapes.reduce(function (m, x) { return Math.max(m, x.rows); }, 1);
          var gapA = shapes.length ? (TAU - widthPx / R0) / shapes.length : 0;
          var a = -Math.PI / 2 - (shapes.length ? shapes[0].cols * step / R0 / 2 : 0);
          var innerOuter = R0;
          shapes.forEach(function (x) {
            var g = x.g;
            var wA = x.cols * step / R0;
            var mid = a + wA / 2;
            g.items.forEach(function (n, j) {
              var row = Math.floor(j / x.cols);
              var col = j % x.cols;
              var rr = R0 + row * step;
              var ang = a + (col + 0.5) * step / R0;
              set(n, Math.cos(ang) * rr, Math.sin(ang) * rr);
            });
            var lr = R0 + (g.collapsed ? 1 : x.rows) * step + 16;
            innerOuter = Math.max(innerOuter, lr);
            // Узел группы стоит у подписи: от неё веером расходятся связи к узлам раздела.
            set(g, Math.cos(mid) * lr, Math.sin(mid) * lr);
            g.angle = mid;
            a += wA + gapA;
          });
          var Rout = Math.max(innerOuter + 130, R0 + maxRows * step + 150);
          var memCount = outerG.reduce(function (s0, g) { return s0 + (g.collapsed ? 1 : g.items.length); }, 0);
          var slot = 19;
          var perBand = Math.max(1, Math.floor((TAU * Rout - outerG.length * 30) / slot));
          var bands = Math.max(1, Math.ceil(memCount / perBand));
          // Кластеры разговоров равномерно распределены по всему внешнему кольцу.
          var usedA = outerG.reduce(function (s0, g) { return s0 + Math.ceil((g.collapsed ? 1 : g.items.length) / bands) * slot / Rout; }, 0);
          var spareA = outerG.length ? Math.max(30 / Rout, (TAU - usedA) / outerG.length) : 0;
          var b = -Math.PI / 2 + spareA / 2;
          outerG.forEach(function (g) {
            var start = b;
            var n = g.collapsed ? 1 : g.items.length;
            var colsHere = Math.ceil(n / bands);
            g.items.forEach(function (it, j) {
              var band = j % bands;
              var col = Math.floor(j / bands);
              var rr = Rout + band * 18;
              var ang = start + (col + 0.5) * slot / Rout;
              set(it, Math.cos(ang) * rr, Math.sin(ang) * rr);
            });
            var wA = colsHere * slot / Rout;
            var mid = start + wA / 2;
            var lr = Rout + bands * 18 + 10;
            set(g, Math.cos(mid) * lr, Math.sin(mid) * lr);
            g.angle = mid;
            b = start + wA + spareA;
          });
          deco.rings = [R0 - 70, R0 - 112];
          if (outerG.length) deco.rings.push(Rout - 48, Rout + bands * 18 + 14);
          deco.orbit = outerG.length ? Rout + bands * 18 + 120 : innerOuter + 40;
        } else if (view.layout === 'stars' || view.layout === 'force') {
          // Созвездия: группы по кругу, узлы — спиралью вокруг центра группы.
          var maxR = 0;
          G.forEach(function (g) { maxR = Math.max(maxR, phyllo(g.items.length, g.items.length, sp * 0.9).r); });
          var Rg = Math.max(230, (G.length * (maxR * 2 + 60)) / TAU);
          G.forEach(function (g, i) {
            var ang = -Math.PI / 2 + TAU * i / G.length;
            var gx = Math.cos(ang) * Rg;
            var gy = Math.sin(ang) * Rg;
            set(g, gx, gy);
            g.angle = ang;
            g.items.forEach(function (n, j) { var p = phyllo(n, j, sp * 0.9); set(n, gx + p.x, gy + p.y); });
          });
          deco.rings = [Rg];
          if (view.layout === 'force') { force(targets); }
        } else if (view.layout === 'hex') {
          // Соты: каждая группа — шестиугольная ячейка вокруг ячейки ядра.
          var need = 0;
          G.forEach(function (g) { need = Math.max(need, phyllo(g.items.length, g.items.length, sp * 0.8).r); });
          var S = Math.max(120, need + 46);
          var cells = hexSpiral(G.length + 1).slice(1);
          deco.hexes.push({ x: 0, y: 0, s: S, color: theme.core, core: true });
          G.forEach(function (g, i) {
            var c = cells[i];
            var hx = S * Math.sqrt(3) * (c.q + c.r / 2);
            var hy = S * 1.5 * c.r;
            set(g, hx, hy);
            g.items.forEach(function (n, j) { var p = phyllo(n, j, sp * 0.8); set(n, hx + p.x, hy + p.y + 10); });
            deco.hexes.push({ x: hx, y: hy, s: S, color: g.color, label: g.label, inner: phyllo(0, g.items.length, sp * 0.8).r + 16, cy: 10 });
          });
        } else if (view.layout === 'time') {
          // Лента времени: по горизонтали дата, по вертикали группы.
          var all = graph.nodes.filter(function (n) { return n.type === 'leaf' && n.t; });
          var tMin = Infinity, tMax = -Infinity;
          all.forEach(function (n) { tMin = Math.min(tMin, n.t); tMax = Math.max(tMax, n.t); });
          if (!isFinite(tMin)) { tMin = Date.now() - 864e5; tMax = Date.now(); }
          if (tMax - tMin < 36e5) { tMin -= 18e5; tMax += 18e5; }
          var W = Math.max(900, Math.min(4000, all.length * 14));
          var rowH = 64;
          var top = -(G.length - 1) * rowH / 2;
          G.forEach(function (g, i) {
            var y = top + i * rowH;
            set(g, -W / 2 - 150, y);
            var lastX = -Infinity, stack = 0;
            g.items.forEach(function (n) {
              var x = -W / 2 + (n.t ? (n.t - tMin) / (tMax - tMin) : 0) * W;
              if (x - lastX < 9) { stack++; } else { stack = 0; }
              lastX = x;
              set(n, x, y + ((stack % 5) - 2) * 7);
            });
          });
          set(graph.byId.core, -W / 2 - 330, 0);
          deco.axis = { x0: -W / 2, x1: W / 2, y0: top - rowH / 2, y1: top + (G.length - 0.5) * rowH, tMin: tMin, tMax: tMax, rows: G.map(function (g, i) { return top + i * rowH; }) };
        }
        apply(targets);
      }
      function hexSpiral(count) {
        var out = [{ q: 0, r: 0 }];
        var dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
        for (var k = 1; out.length < count; k++) {
          var q = -k, r = k; // старт: k шагов в направлении 4 (низ-лево)
          q = dirs[4][0] * k; r = dirs[4][1] * k;
          for (var side = 0; side < 6 && out.length < count; side++) {
            for (var s = 0; s < k && out.length < count; s++) {
              out.push({ q: q, r: r });
              q += dirs[side][0];
              r += dirs[side][1];
            }
          }
        }
        return out;
      }
      function force(t) {
        // Простая силовая укладка: пружины по связям, отталкивание по сетке, ядро в центре.
        var ns = graph.nodes.filter(visible);
        var P = {};
        ns.forEach(function (n) { P[n.id] = { x: t[n.id].x + (Math.random() - 0.5) * 4, y: t[n.id].y + (Math.random() - 0.5) * 4, vx: 0, vy: 0, n: n }; });
        var L = graph.links.filter(function (l) { return P[l.a.id] && P[l.b.id]; });
        var cell = 46;
        for (var it = 0; it < 220; it++) {
          var alpha = 1 - it / 220;
          var grid = {};
          ns.forEach(function (n) {
            var p = P[n.id];
            var k = Math.floor(p.x / cell) + ':' + Math.floor(p.y / cell);
            (grid[k] = grid[k] || []).push(p);
          });
          ns.forEach(function (n) {
            var p = P[n.id];
            var cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
            for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
              var list = grid[(cx + dx) + ':' + (cy + dy)];
              if (!list) continue;
              for (var i = 0; i < list.length; i++) {
                var q = list[i];
                if (q === p) continue;
                var ddx = p.x - q.x, ddy = p.y - q.y;
                var d2 = ddx * ddx + ddy * ddy || 0.01;
                if (d2 > cell * cell) continue;
                var f = (cell * cell - d2) / (cell * cell) * 1.6 * alpha;
                var d = Math.sqrt(d2);
                p.vx += ddx / d * f;
                p.vy += ddy / d * f;
              }
            }
          });
          // Группы отталкиваются друг от друга сильнее и издалека.
          graph.groups.forEach(function (g1) {
            graph.groups.forEach(function (g2) {
              if (g1 === g2) return;
              var a = P[g1.id], b = P[g2.id];
              var ddx = a.x - b.x, ddy = a.y - b.y;
              var d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
              var f = Math.min(8, 9000 / (d * d)) * alpha;
              a.vx += ddx / d * f;
              a.vy += ddy / d * f;
            });
          });
          L.forEach(function (l) {
            var a = P[l.a.id], b = P[l.b.id];
            var want = l.kind === 'core' ? 260 : l.kind === 'group' ? 30 + Math.sqrt(l.a.items.length) * 9 : 90;
            var str = (l.kind === 'sem' ? 0.01 : l.kind === 'core' ? 0.04 : 0.06) * view.springs;
            var ddx = b.x - a.x, ddy = b.y - a.y;
            var d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
            var f = (d - want) * str * alpha;
            var fx = ddx / d * f, fy = ddy / d * f;
            if (a.n.type !== 'core') { a.vx += fx; a.vy += fy; }
            if (b.n.type !== 'core') { b.vx -= fx; b.vy -= fy; }
          });
          ns.forEach(function (n) {
            var p = P[n.id];
            if (n.type === 'core') { p.x = 0; p.y = 0; return; }
            p.vx *= 0.6; p.vy *= 0.6;
            p.x += Math.max(-30, Math.min(30, p.vx));
            p.y += Math.max(-30, Math.min(30, p.vy));
          });
        }
        ns.forEach(function (n) { t[n.id] = { x: P[n.id].x, y: P[n.id].y }; });
      }

      /* Плавный переход к новым позициям. */
      var anim = null;
      function apply(targets) {
        var motion = App.motion();
        graph.nodes.forEach(function (n) {
          var tg = targets[n.id];
          if (!tg) {
            // Свёрнутые узлы прячутся в свою группу.
            var g = n.group && targets[n.group.id];
            tg = g ? { x: g.x, y: g.y } : { x: 0, y: 0 };
          }
          if (!n.seen) { var src = n.group && targets[n.group.id]; n.x = src ? src.x : 0; n.y = src ? src.y : 0; n.seen = true; }
          n.x0 = n.x; n.y0 = n.y; n.tx = tg.x; n.ty = tg.y;
        });
        anim = motion ? { start: performance.now(), dur: 650 } : null;
        if (!motion) graph.nodes.forEach(function (n) { n.x = n.tx; n.y = n.ty; });
        needFit = true;
        dirty = true;
      }
      function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

      /* ---------- Отрисовка ---------- */
      function Renderer(canvas, mini) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.mini = mini;
        this.cam = { x: 0, y: 0, k: 1 };
        this.camTo = null;
        this.w = 0; this.h = 0; this.dpr = 1;
      }
      Renderer.prototype.resize = function () {
        var r = this.canvas.getBoundingClientRect();
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (r.width < 2 || r.height < 2) return false;
        if (r.width !== this.w || r.height !== this.h || dpr !== this.dpr) {
          this.w = r.width; this.h = r.height; this.dpr = dpr;
          this.canvas.width = Math.round(r.width * dpr);
          this.canvas.height = Math.round(r.height * dpr);
          return true;
        }
        return false;
      };
      Renderer.prototype.bounds = function (final) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        graph.nodes.forEach(function (n) {
          if (!visible(n)) return;
          var x = final ? n.tx : n.x, y = final ? n.ty : n.y;
          if (x === undefined) return;
          var pad = n.type === 'group' ? 120 : 30;
          x0 = Math.min(x0, x - pad); y0 = Math.min(y0, y - pad); x1 = Math.max(x1, x + pad); y1 = Math.max(y1, y + pad);
        });
        if (deco.orbit) { x0 = Math.min(x0, -deco.orbit - 20); x1 = Math.max(x1, deco.orbit + 20); y0 = Math.min(y0, -deco.orbit - 20); y1 = Math.max(y1, deco.orbit + 20); }
        deco.hexes.forEach(function (h) { x0 = Math.min(x0, h.x - h.s); x1 = Math.max(x1, h.x + h.s); y0 = Math.min(y0, h.y - h.s); y1 = Math.max(y1, h.y + h.s); });
        if (!isFinite(x0)) return { x0: -200, y0: -200, x1: 200, y1: 200 };
        return { x0: x0, y0: y0, x1: x1, y1: y1 };
      };
      Renderer.prototype.fit = function (instant) {
        if (!this.w) return;
        var b = this.bounds(true);
        var k = Math.min(this.w / (b.x1 - b.x0), this.h / (b.y1 - b.y0)) * (this.mini ? 1 : 0.92);
        k = Math.max(0.05, Math.min(this.mini ? 1.2 : 2.2, k));
        var to = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, k: k };
        if (instant || !App.motion()) { this.cam = to; this.camTo = null; } else { this.camTo = to; }
      };
      Renderer.prototype.toWorld = function (sx, sy) {
        return { x: (sx - this.w / 2) / this.cam.k + this.cam.x, y: (sy - this.h / 2) / this.cam.k + this.cam.y };
      };
      Renderer.prototype.nodeR = function (n) {
        var s = view.nodes;
        if (n.type === 'core') return 40;
        if (n.type === 'group') {
          if (view.layout === 'rings' && !n.collapsed) return 7 * Math.sqrt(s);
          return (n.collapsed ? 9 + Math.min(14, Math.sqrt(n.items.length) * 2.2) : 6) * Math.sqrt(s);
        }
        if (n.kind === 'memory' && view.layout === 'rings') return 7.5 * Math.sqrt(s);
        var base = n.kind === 'doc' ? 5.5 : n.kind === 'note' ? 4.6 : n.kind === 'soul' ? 4.8 : 3.4;
        if (n.kind === 'note' && n.item.pinned) base += 1.2;
        return base * s;
      };
      function alpha(color, a) {
        if (color.charAt(0) === '#') {
          var c = color.length === 4 ? color.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : color;
          var r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
          return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
        }
        if (color.indexOf('hsl(') === 0) return color.replace('hsl(', 'hsla(').replace(')', ',' + a + ')');
        return color;
      }
      var MONO = '"Cascadia Mono", Consolas, "JetBrains Mono", Menlo, ui-monospace, monospace';
      Renderer.prototype.draw = function (now) {
        var ctx = this.ctx, cam = this.cam, mini = this.mini;
        var w = this.w, h = this.h, dpr = this.dpr;
        if (!w) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, w, h);
        // Сетка точек на фоне.
        if (!mini) {
          var stepS = 28;
          ctx.fillStyle = alpha(theme.grid, 0.9);
          var ox = ((-cam.x * cam.k + w / 2) % stepS + stepS) % stepS;
          var oy = ((-cam.y * cam.k + h / 2) % stepS + stepS) % stepS;
          for (var gx = ox; gx < w; gx += stepS) for (var gy = oy; gy < h; gy += stepS) ctx.fillRect(gx, gy, 1, 1);
        }
        ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * (w / 2 - cam.x * cam.k), dpr * (h / 2 - cam.y * cam.k));
        var k = cam.k;
        var t = now / 1000;
        var motion = App.motion();
        var focus = state.focus; // подсвеченные узлы (наведение, выбор, поиск)
        var dimOthers = !!focus;

        // Декор: кольца, соты, ось времени.
        ctx.lineWidth = 1 / k;
        deco.rings.forEach(function (r, i) {
          ctx.strokeStyle = alpha(theme.grid, i === deco.rings.length - 1 ? 1 : 0.8);
          ctx.setLineDash(i === deco.rings.length - 1 ? [2 / k, 6 / k] : []);
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        });
        ctx.setLineDash([]);
        deco.hexes.forEach(function (hx) {
          ctx.beginPath();
          for (var s = 0; s < 6; s++) {
            var ang = Math.PI / 6 + s * Math.PI / 3;
            var px = hx.x + Math.cos(ang) * (hx.s - 4), py = hx.y + Math.sin(ang) * (hx.s - 4);
            if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = alpha(hx.color, theme.light ? 0.07 : 0.05);
          ctx.fill();
          ctx.strokeStyle = alpha(hx.color, 0.35);
          ctx.lineWidth = 1.2 / k;
          ctx.stroke();
          if (hx.inner) {
            // Внутренний круг кластера и маленькие кружки на углах соты, как в референсе.
            ctx.strokeStyle = alpha(hx.color, 0.45);
            ctx.lineWidth = 1 / k;
            ctx.beginPath(); ctx.arc(hx.x, hx.y + hx.cy, hx.inner, 0, TAU); ctx.stroke();
            ctx.fillStyle = theme.bg;
            for (var v = 0; v < 6; v += 2) {
              var va = Math.PI / 6 + v * Math.PI / 3;
              var vx = hx.x + Math.cos(va) * (hx.s - 4), vy = hx.y + Math.sin(va) * (hx.s - 4);
              ctx.beginPath(); ctx.arc(vx, vy, 7, 0, TAU); ctx.fill(); ctx.stroke();
            }
          }
          if (hx.label && !mini) {
            ctx.fillStyle = hx.color;
            ctx.font = '600 ' + (13 * view.labels) + 'px ' + MONO;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cut(hx.label, 26).toUpperCase(), hx.x, hx.y - hx.s * 0.62);
          }
        });
        if (deco.axis && !mini) {
          var ax = deco.axis;
          ctx.strokeStyle = alpha(theme.grid, 1);
          ctx.lineWidth = 1 / k;
          ax.rows.forEach(function (y) { ctx.beginPath(); ctx.moveTo(ax.x0, y); ctx.lineTo(ax.x1, y); ctx.stroke(); });
          var ticks = 6;
          ctx.fillStyle = theme.muted;
          ctx.font = (10 / Math.sqrt(k)) * view.labels + 'px ' + MONO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          for (var ti = 0; ti <= ticks; ti++) {
            var tx = ax.x0 + (ax.x1 - ax.x0) * ti / ticks;
            var tt = ax.tMin + (ax.tMax - ax.tMin) * ti / ticks;
            ctx.beginPath(); ctx.moveTo(tx, ax.y0); ctx.lineTo(tx, ax.y1); ctx.stroke();
            var d = new Date(tt);
            var lab = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + (ax.tMax - ax.tMin < 2 * 864e5 ? ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) : '');
            ctx.fillText(lab, tx, ax.y1 + 8);
          }
        }

        // Связи.
        var la = view.links;
        graph.links.forEach(function (l) {
          if (!visible(l.a) || !visible(l.b)) return;
          if (l.kind === 'sem' && !view.semantic) return;
          if (view.layout === 'time' && l.kind !== 'core') return;
          var hot = focus && (focus[l.a.id] && focus[l.b.id]);
          if (view.layout === 'rings' && l.kind === 'group' && !hot) return;
          var base = l.kind === 'core' ? 0.5 : l.kind === 'group' ? 0.28 : view.layout === 'rings' ? 0.3 : 0.55;
          var aa = la * base * (dimOthers ? (hot ? 2.2 : 0.25) : 1);
          if (aa <= 0.01) return;
          var col = l.kind === 'core' ? l.b.color : l.kind === 'group' ? l.b.color : theme.core;
          ctx.strokeStyle = alpha(col, Math.min(1, aa));
          ctx.lineWidth = (l.kind === 'sem' ? 1.2 : l.kind === 'core' ? 1.1 : 0.7) / k * (hot ? 1.8 : 1);
          ctx.beginPath();
          ctx.moveTo(l.a.x, l.a.y);
          if (l.kind === 'sem') {
            var mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2;
            ctx.quadraticCurveTo(mx * 0.75, my * 0.75, l.b.x, l.b.y);
          } else {
            ctx.lineTo(l.b.x, l.b.y);
          }
          ctx.stroke();
        });

        // Узлы.
        var self = this;
        var q = state.query;
        graph.nodes.forEach(function (n) {
          if (!visible(n) || n.type === 'core') return;
          var r = self.nodeR(n);
          var on = !dimOthers || focus[n.id];
          ctx.globalAlpha = on ? 1 : 0.18;
          if (n.type === 'group' && view.layout === 'rings' && !n.collapsed) {
            ctx.fillStyle = n.color;
            ctx.beginPath(); ctx.arc(n.x, n.y, 2.2 / Math.max(k, 0.3), 0, TAU); ctx.fill();
          } else if (n.type === 'group') {
            ctx.fillStyle = theme.bg;
            ctx.strokeStyle = n.color;
            ctx.lineWidth = 1.6 / k;
            ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill(); ctx.stroke();
            ctx.fillStyle = n.color;
            ctx.beginPath(); ctx.arc(n.x, n.y, r * 0.45, 0, TAU); ctx.fill();
            if (n.collapsed && !mini) {
              ctx.fillStyle = theme.ink;
              ctx.font = '600 ' + (Math.max(8, r * 0.7)) + 'px ' + MONO;
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillStyle = theme.bg;
              ctx.fillText(String(n.items.length), n.x, n.y + 0.5);
            }
          } else {
            if (n.kind === 'doc') {
              ctx.fillStyle = n.color;
              ctx.beginPath(); ctx.rect(n.x - r, n.y - r, r * 2, r * 2); ctx.fill();
            } else if (n.kind === 'soul') {
              // Ромб: узлы души отличаются и цветом, и формой.
              ctx.fillStyle = n.color;
              ctx.beginPath(); ctx.moveTo(n.x, n.y - r * 1.25); ctx.lineTo(n.x + r * 1.05, n.y); ctx.lineTo(n.x, n.y + r * 1.25); ctx.lineTo(n.x - r * 1.05, n.y); ctx.closePath(); ctx.fill();
            } else if (n.kind === 'note') {
              ctx.fillStyle = n.color;
              ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
              if (n.item.pinned) { ctx.strokeStyle = n.color; ctx.lineWidth = 1.2 / k; ctx.beginPath(); ctx.arc(n.x, n.y, r + 3, 0, TAU); ctx.stroke(); }
            } else if (view.layout === 'rings') {
              // Кружок-иконка разговора, как «рутины» на внешнем кольце референса.
              ctx.fillStyle = theme.bg;
              ctx.strokeStyle = alpha(n.color, 0.9);
              ctx.lineWidth = 1.1 / Math.max(k, 0.5);
              ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill(); ctx.stroke();
              if (!mini && r * k > 3) {
                var u = r * 0.42;
                ctx.fillStyle = alpha(n.color, 0.9);
                ctx.beginPath();
                ctx.rect(n.x - u, n.y - u * 0.75, u * 2, u * 1.2);
                ctx.moveTo(n.x - u * 0.4, n.y + u * 0.45);
                ctx.lineTo(n.x - u * 0.7, n.y + u * 0.95);
                ctx.lineTo(n.x + u * 0.1, n.y + u * 0.45);
                ctx.fill();
              }
            } else {
              ctx.fillStyle = alpha(n.color, 0.85);
              ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill();
            }
            if (q && state.matches[n.id]) {
              ctx.strokeStyle = theme.ink; ctx.lineWidth = 1.5 / k;
              ctx.beginPath(); ctx.arc(n.x, n.y, r + 4 / k + 2, 0, TAU); ctx.stroke();
            }
          }
          if (state.sel === n || state.hover === n) {
            ctx.strokeStyle = theme.ink; ctx.lineWidth = 2 / k;
            ctx.beginPath(); ctx.arc(n.x, n.y, r + 5 / k, 0, TAU); ctx.stroke();
          }
        });
        ctx.globalAlpha = 1;

        // Ядро — Яэри.
        var core = graph.byId.core;
        if (core) {
          var pulse = motion ? (Math.sin(t * 1.6) + 1) / 2 : 0.5;
          var R = 40;
          var glow = ctx.createRadialGradient(core.x, core.y, R * 0.6, core.x, core.y, R * 2.4);
          glow.addColorStop(0, alpha(theme.core, 0.22 + pulse * 0.1));
          glow.addColorStop(1, alpha(theme.core, 0));
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(core.x, core.y, R * 2.4, 0, TAU); ctx.fill();
          ctx.fillStyle = theme.light ? '#ffffff' : '#05080a';
          ctx.strokeStyle = theme.core;
          ctx.lineWidth = 2.4 / Math.max(k, 0.4);
          ctx.beginPath(); ctx.arc(core.x, core.y, R, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.save();
          ctx.translate(core.x, core.y);
          ctx.rotate(motion ? t * 0.25 : 0);
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = alpha(theme.core, 0.6);
          ctx.lineWidth = 1.2 / Math.max(k, 0.4);
          ctx.beginPath(); ctx.arc(0, 0, R + 10, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
          // Эмблема: восемь хвостов и жемчужина.
          ctx.save();
          ctx.translate(core.x, core.y + 8);
          for (var ti2 = 0; ti2 < 8; ti2++) {
            ctx.save();
            ctx.rotate((-70 + ti2 * 20) * Math.PI / 180);
            ctx.fillStyle = alpha(theme.core, ti2 % 2 ? 0.55 : 0.95);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(-9, -8, -11, -24, 0, -34);
            ctx.bezierCurveTo(8, -24, 8, -10, 0, 0);
            ctx.fill();
            ctx.restore();
          }
          ctx.fillStyle = theme.light ? '#ffffff' : '#05080a';
          ctx.beginPath(); ctx.arc(0, -2, 8, 0, TAU); ctx.fill();
          ctx.fillStyle = theme.core;
          ctx.beginPath(); ctx.arc(0, -2, 3.2 + pulse, 0, TAU); ctx.fill();
          ctx.restore();
          if (!mini) {
            ctx.fillStyle = theme.ink;
            ctx.font = '700 ' + (12 * view.labels) + 'px ' + MONO;
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText('ЯЭРИ', core.x, core.y + R + 16);
          }
        }

        // Свечение узлов, на которые Яэри опиралась в последнем ответе.
        var litIds = Object.keys(lit);
        if (litIds.length) {
          var self2 = this;
          litIds.forEach(function (id) {
            var L = lit[id];
            if (now > L.until) { delete lit[id]; return; }
            var n = graph.byId[id];
            if (!n) return;
            if (!visible(n)) n = n.group;
            var r = self2.nodeR(n);
            var fade = Math.min(1, (L.until - now) / 1200, (now - L.start) / 300);
            var ph = ((now - L.start) % 1500) / 1500;
            ctx.strokeStyle = theme.core;
            ctx.lineWidth = 2 / Math.max(k, 0.3);
            ctx.globalAlpha = fade * (1 - ph);
            ctx.beginPath(); ctx.arc(n.x, n.y, r + (4 + ph * 22) / Math.max(k, 0.3), 0, TAU); ctx.stroke();
            ctx.globalAlpha = fade * 0.9;
            ctx.beginPath(); ctx.arc(n.x, n.y, r + 2.5 / Math.max(k, 0.3), 0, TAU); ctx.stroke();
          });
          ctx.globalAlpha = 1;
        }

        // Подписи групп.
        if (!mini) {
          var gfs = 13 * view.labels / Math.sqrt(Math.max(k, 0.05));
          ctx.font = '700 ' + gfs + 'px ' + MONO;
          ctx.textBaseline = 'middle';
          graph.groups.forEach(function (g) {
            if (view.layout === 'hex') return;
            var on = !dimOthers || focus[g.id];
            ctx.globalAlpha = on ? 1 : 0.25;
            var lx = g.x, ly = g.y, align = 'center';
            if (view.layout === 'rings' && !g.collapsed) {
              var ang = Math.atan2(g.y, g.x);
              var out = 1;
              lx = g.x + Math.cos(ang) * 6 * out; ly = g.y + Math.sin(ang) * 6 * out;
              var c = Math.cos(ang) * out;
              align = c > 0.25 ? 'left' : c < -0.25 ? 'right' : 'center';
            } else if (view.layout === 'time') {
              lx = g.x - 16; align = 'right';
            } else {
              ly = g.y - (g.collapsed ? 30 : Math.max(26, phyllo(0, g.items.length, 13.5).r + 18));
            }
            ctx.textAlign = align;
            var text = cut(g.label, 30).toUpperCase() + (g.collapsed ? '  +' + g.items.length : '');
            ctx.fillStyle = alpha(theme.bg, 0.7);
            var tw = ctx.measureText(text).width;
            var bx = align === 'left' ? lx : align === 'right' ? lx - tw : lx - tw / 2;
            ctx.fillRect(bx - 3, ly - gfs * 0.62, tw + 6, gfs * 1.24);
            ctx.fillStyle = g.color;
            ctx.fillText(text, lx, ly);
          });
          ctx.globalAlpha = 1;

          // Подписи узлов при приближении (и всегда — у найденных и выбранных).
          var showAll = view.names && k > 1.3;
          var nfs = 10.5 * view.labels / k;
          ctx.font = '500 ' + nfs + 'px ' + MONO;
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          graph.nodes.forEach(function (n) {
            if (n.type !== 'leaf' || !visible(n)) return;
            var force_ = (q && state.matches[n.id]) || state.sel === n || (focus && focus[n.id] && state.hover && state.hover.type === 'leaf');
            if (!showAll && !force_) return;
            if (dimOthers && !focus[n.id]) return;
            var r = self.nodeR(n);
            ctx.fillStyle = alpha(theme.ink, force_ ? 1 : 0.78);
            ctx.fillText(cut(n.label, 34), n.x + r + 4 / k, n.y);
          });
        }
      };

      /* ---------- Взаимодействие ---------- */
      var state = { hover: null, sel: null, focus: null, query: '', matches: {} };
      var main = new Renderer($('brain-canvas'), false);
      // Мини-карты в командном центре может не быть.
      var mini = $('mini-canvas') ? new Renderer($('mini-canvas'), true) : null;
      var dirty = true;
      var needFit = true;
      var miniFit = true;

      function neighbors(n) {
        var f = {};
        f[n.id] = 1;
        graph.links.forEach(function (l) {
          if (l.a === n) f[l.b.id] = 1;
          if (l.b === n) f[l.a.id] = 1;
        });
        if (n.type === 'group') n.items.forEach(function (x) { f[x.id] = 1; });
        return f;
      }
      function updateFocus() {
        var n = state.hover || state.sel;
        if (n && n.type !== 'core') state.focus = neighbors(n);
        else if (state.query) state.focus = Object.keys(state.matches).length ? state.matches : {};
        else state.focus = null;
        dirty = true;
      }
      function hit(sx, sy) {
        var p = main.toWorld(sx, sy);
        var best = null, bestD = Infinity;
        var tol = 5 / main.cam.k;
        graph.nodes.forEach(function (n) {
          if (!visible(n)) return;
          var r = main.nodeR(n) + tol;
          var dx = n.x - p.x, dy = n.y - p.y;
          var d = dx * dx + dy * dy;
          if (d < r * r && d < bestD) { best = n; bestD = d; }
        });
        return best;
      }
      var tip = $('tooltip');
      function showTip(n, sx, sy) {
        if (!n) { tip.hidden = true; return; }
        tip.textContent = '';
        var b = document.createElement('b');
        var s = document.createElement('span');
        if (n.type === 'core') { b.textContent = 'Яэри'; s.textContent = 'ядро · ' + graph.groups.length + ' групп'; }
        else if (n.type === 'group') { b.textContent = n.label; s.textContent = groupKind(n) + ' · ' + n.items.length + ' узл.' + (n.t ? ' · обновлён ' + ago(n.t) : ''); }
        else {
          b.textContent = n.label;
          var size = n.kind === 'doc' ? sizeOf(n.item.chars) : sizeOf(String(n.item.text || '').length);
          s.textContent = KIND[n.kind] + ' · ' + n.group.label + ' · ' + size + (n.t ? ' · ' + ago(n.t) : '');
        }
        tip.appendChild(b);
        tip.appendChild(s);
        tip.hidden = false;
        var r = $('stage').getBoundingClientRect();
        var x = Math.min(sx, r.width - 300);
        tip.style.left = x + 'px';
        tip.style.top = Math.min(sy, r.height - 80) + 'px';
      }

      var canvas = main.canvas;
      var drag = null;
      var pointers = {};
      canvas.addEventListener('pointerdown', function (e) {
        canvas.setPointerCapture(e.pointerId);
        pointers[e.pointerId] = { x: e.offsetX, y: e.offsetY };
        var ids = Object.keys(pointers);
        if (ids.length === 2) {
          var a = pointers[ids[0]], b = pointers[ids[1]];
          drag = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), k: main.cam.k };
        } else {
          drag = { x: e.offsetX, y: e.offsetY, cx: main.cam.x, cy: main.cam.y, moved: false };
        }
        main.camTo = null;
      });
      canvas.addEventListener('pointermove', function (e) {
        if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.offsetX, y: e.offsetY };
        if (drag && drag.pinch) {
          var ids = Object.keys(pointers);
          if (ids.length === 2) {
            var a = pointers[ids[0]], b = pointers[ids[1]];
            var d = Math.hypot(a.x - b.x, a.y - b.y);
            main.cam.k = Math.max(0.05, Math.min(8, drag.k * d / (drag.d || 1)));
            dirty = true;
          }
          return;
        }
        if (drag) {
          var dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
          if (drag.moved) {
            canvas.classList.add('dragging');
            main.cam.x = drag.cx - dx / main.cam.k;
            main.cam.y = drag.cy - dy / main.cam.k;
            tip.hidden = true;
            dirty = true;
          }
          return;
        }
        var n = hit(e.offsetX, e.offsetY);
        if (n !== state.hover) { state.hover = n; updateFocus(); }
        canvas.classList.toggle('pointing', !!n);
        showTip(n, e.offsetX, e.offsetY);
      });
      function endPointer(e) {
        delete pointers[e.pointerId];
        canvas.classList.remove('dragging');
        if (drag && !drag.pinch && !drag.moved && e.type === 'pointerup') click(hit(e.offsetX, e.offsetY));
        if (!Object.keys(pointers).length) drag = null;
      }
      canvas.addEventListener('pointerup', endPointer);
      canvas.addEventListener('pointercancel', endPointer);
      canvas.addEventListener('pointerleave', function () { if (state.hover) { state.hover = null; updateFocus(); } tip.hidden = true; });
      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
      }, { passive: false });
      canvas.addEventListener('dblclick', function (e) { zoomAt(e.offsetX, e.offsetY, 1.8); });
      function zoomAt(sx, sy, f) {
        var before = main.toWorld(sx, sy);
        main.camTo = null;
        main.cam.k = Math.max(0.05, Math.min(8, main.cam.k * f));
        var after = main.toWorld(sx, sy);
        main.cam.x += before.x - after.x;
        main.cam.y += before.y - after.y;
        dirty = true;
      }
      $('zoom-in').addEventListener('click', function () { zoomAt(main.w / 2, main.h / 2, 1.4); });
      $('zoom-out').addEventListener('click', function () { zoomAt(main.w / 2, main.h / 2, 1 / 1.4); });
      $('zoom-fit').addEventListener('click', function () { main.fit(); dirty = true; });

      function click(n) {
        if (!n) { select(null); return; }
        if (n.type === 'core') { select(null); main.fit(); return; }
        select(n);
      }
      function toggleGroup(g) {
        var i = view.collapsed.indexOf(g.key);
        if (i > -1) view.collapsed.splice(i, 1); else view.collapsed.push(g.key);
        g.collapsed = i < 0;
        layout();
      }
      function flyTo(n, k) {
        var to = { x: n.tx !== undefined ? n.tx : n.x, y: n.ty !== undefined ? n.ty : n.y, k: Math.max(main.cam.k, k || 1.6) };
        if (App.motion()) main.camTo = to; else main.cam = to;
        dirty = true;
      }

      /* Карточка выбранного узла. */
      var detail = $('detail');
      function select(n) {
        state.sel = n && (n.type === 'leaf' || n.type === 'group') ? n : null;
        updateFocus();
        if (!state.sel) { detail.hidden = true; return; }
        if (n.type === 'group') { selectGroup(n); return; }
        var it = n.item;
        $('d-kind').textContent = KIND[n.kind];
        $('d-meta').textContent = n.group.label + (n.t ? ' · ' + new Date(n.t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
        var text = n.kind === 'note' ? it.text + (it.src === 'yaeri' ? '\n\n— записала Яэри' : '')
          : n.kind === 'doc' ? it.name + '\n' + (it.chars || 0).toLocaleString('ru-RU') + ' символов · ' + (it.chunks || 0) + ' фрагм.'
          : it.text;
        $('d-text').textContent = text;
        var act = $('d-actions');
        act.textContent = '';
        function btn(label, fn, solid) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'mini-btn' + (solid ? ' solid' : '');
          b.textContent = label;
          b.addEventListener('click', fn);
          act.appendChild(b);
        }
        if (n.kind === 'note') {
          btn(it.pinned ? 'Открепить' : 'Закрепить', function () { App.updateNote(it, { pinned: !it.pinned }); });
          btn('Изменить', function () {
            var t2 = window.prompt('Текст заметки:', it.text);
            if (t2 === null || !t2.trim()) return;
            var c2 = window.prompt('Раздел:', it.cat);
            if (c2 === null) return;
            App.updateNote(it, { text: t2.trim().slice(0, 500), cat: c2 });
          });
          btn('Удалить', function () { App.deleteNote(it).then(function (ok) { if (ok) select(null); }); });
        } else if (n.kind === 'memory') {
          btn('Спросить Яэри', function () { App.ask('Помнишь наш разговор: «' + memTitle(it.text) + '»? Давай продолжим.'); }, true);
          if (App.isOnline()) btn('Забыть', function () { App.deleteMemory(it).then(function (ok) { if (ok) select(null); }); });
        } else if (n.kind === 'soul') {
          btn('Открыть «Душу»', function () { App.showView('soul'); }, true);
          btn('Спросить Яэри', function () { App.ask('Расскажи мне про это: «' + cut(it.title || it.text, 80) + '». Что ты об этом думаешь?'); });
        } else if (n.kind === 'doc') {
          btn('Спросить по документу', function () { App.ask('Что важного в документе «' + it.name + '»?'); }, true);
          btn('Удалить', function () { App.deleteDoc(it).then(function (ok) { if (ok) select(null); }); });
        }
        detail.hidden = false;
      }
      $('d-close').addEventListener('click', function () { select(null); });
      function selectGroup(g) {
        // Карточка раздела: как в референсе — подсвечены связи ко всем его узлам.
        $('d-kind').textContent = g.label;
        $('d-meta').textContent = groupKind(g) + ' · ' + g.items.length + ' узл.' + (g.t ? ' · ' + ago(g.t) : '');
        var lines = g.items.slice().reverse().slice(0, 12).map(function (x) { return '· ' + x.label; });
        if (g.items.length > 12) lines.push('… и ещё ' + (g.items.length - 12));
        $('d-text').textContent = lines.join('\n') || 'Пусто.';
        var act = $('d-actions');
        act.textContent = '';
        function btn(label, fn, solid) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'mini-btn' + (solid ? ' solid' : '');
          b.textContent = label;
          b.addEventListener('click', fn);
          act.appendChild(b);
        }
        if (g.kind === 'note') btn('Спросить Яэри', function () { App.ask('Что ты помнишь в разделе «' + g.label + '»? Что из этого стоит сделать в ближайшее время?'); }, true);
        btn(g.collapsed ? 'Развернуть' : 'Свернуть', function () { toggleGroup(g); select(g); });
        btn('Приблизить', function () { flyTo(g, 1.4); });
        detail.hidden = false;
      }

      /* Поиск. */
      var search = $('brain-search');
      search.addEventListener('input', function () {
        state.query = search.value.trim().toLowerCase();
        state.matches = {};
        if (state.query) {
          graph.nodes.forEach(function (n) {
            var hay = n.type === 'leaf' ? (n.label + ' ' + (n.item.text || n.item.name || '') + ' ' + n.group.label) : n.type === 'group' ? n.label : '';
            if (hay.toLowerCase().indexOf(state.query) > -1) state.matches[n.id] = 1;
          });
        }
        updateFocus();
        renderSub();
      });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var first = graph.nodes.filter(function (n) { return state.matches[n.id] && n.type === 'leaf'; })[0];
          if (first) {
            if (first.group.collapsed) toggleGroup(first.group);
            select(first);
            flyTo(first, 2);
          }
        } else if (e.key === 'Escape') { search.value = ''; search.dispatchEvent(new Event('input')); search.blur(); }
      });
      document.addEventListener('keydown', function (e) {
        if (App.currentView() !== 'brain' || document.body.classList.contains('settings-open')) return;
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); search.focus(); search.select(); }
        else if (e.key === 'Escape' && tag !== 'INPUT') select(null);
      });

      /* ---------- Панель управления ---------- */
      function pressed(container, attr, value) {
        each($(container).querySelectorAll('[data-' + attr + ']'), function (b) { b.setAttribute('aria-pressed', b.dataset[attr] === value ? 'true' : 'false'); });
      }
      each($('layout-chips').querySelectorAll('[data-layout]'), function (b) {
        b.addEventListener('click', function () { view.layout = b.dataset.layout; pressed('layout-chips', 'layout', view.layout); layout(); renderSub(); });
      });
      each($('group-chips').querySelectorAll('[data-group]'), function (b) {
        b.addEventListener('click', function () { view.group = b.dataset.group; view.collapsed = []; pressed('group-chips', 'group', view.group); rebuild(); });
      });
      function bindRange(id, key, fmt) {
        var r = $('r-' + id), o = $('o-' + id);
        r.value = view[key];
        o.textContent = fmt(view[key]);
        r.addEventListener('input', function () { view[key] = parseFloat(r.value); o.textContent = fmt(view[key]); dirty = true; miniDirty = true; });
      }
      bindRange('spin', 'spin', function (v) { return v.toFixed(2); });
      bindRange('springs', 'springs', function (v) { return v.toFixed(1) + '×'; });
      var springsTimer = 0;
      $('r-springs').addEventListener('change', function () {
        clearTimeout(springsTimer);
        springsTimer = setTimeout(function () { if (view.layout === 'force') layout(); }, 50);
      });
      bindRange('links', 'links', function (v) { return v.toFixed(2); });
      bindRange('nodes', 'nodes', function (v) { return v.toFixed(1) + '×'; });
      bindRange('labels', 'labels', function (v) { return v.toFixed(1) + '×'; });
      $('c-names').checked = view.names;
      $('c-semantic').checked = view.semantic;
      $('c-names').addEventListener('change', function () { view.names = this.checked; dirty = true; });
      $('c-semantic').addEventListener('change', function () { view.semantic = this.checked; dirty = true; miniDirty = true; });
      $('b-expand').addEventListener('click', function () { view.collapsed = []; graph.groups.forEach(function (g) { g.collapsed = false; }); layout(); });
      $('b-collapse').addEventListener('click', function () { view.collapsed = graph.groups.map(function (g) { return g.key; }); graph.groups.forEach(function (g) { g.collapsed = true; }); select(null); layout(); });
      $('b-center').addEventListener('click', function () { main.fit(); dirty = true; });
      var savedTimer = 0;
      $('b-save').addEventListener('click', function () {
        try { localStorage.setItem('yaeri_brain_v1', JSON.stringify(view)); $('saved-note').textContent = 'Вид сохранён в этом браузере.'; }
        catch (error) { $('saved-note').textContent = 'Не удалось сохранить: хранилище браузера недоступно.'; }
        clearTimeout(savedTimer);
        savedTimer = setTimeout(function () { $('saved-note').textContent = ''; }, 3000);
      });
      $('b-png').addEventListener('click', function () {
        main.draw(performance.now());
        try {
          main.canvas.toBlob(function (blob) {
            if (!blob) return;
            var a = document.createElement('a');
            var d = new Date();
            a.href = URL.createObjectURL(blob);
            a.download = 'yaeri-brain-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '.png';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          }, 'image/png');
        } catch (error) { $('saved-note').textContent = 'Браузер не разрешил сохранить картинку.'; }
      });
      function renderThemes() {
        var box = $('themes');
        box.textContent = '';
        THEMES.forEach(function (t0) {
          var t = t0.site ? siteTheme() : t0;
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'theme';
          b.setAttribute('aria-pressed', view.theme === t.id ? 'true' : 'false');
          var sw = document.createElement('span');
          sw.className = 'theme-swatch';
          sw.style.background = t.bg;
          [t.ink].concat(t.colors.slice(0, 5)).forEach(function (c) { var i = document.createElement('i'); i.style.background = c; sw.appendChild(i); });
          var name = document.createElement('span');
          name.className = 'theme-name';
          name.textContent = t.name;
          var small = document.createElement('small');
          small.textContent = 'выбрана';
          name.appendChild(small);
          b.appendChild(sw);
          b.appendChild(name);
          b.addEventListener('click', function () { view.theme = t.id; pickTheme(); renderThemes(); rebuild(true); });
          box.appendChild(b);
        });
      }

      function renderSub() {
        var leaves = graph.nodes.filter(function (n) { return n.type === 'leaf'; }).length;
        var sem = graph.links.filter(function (l) { return l.kind === 'sem'; }).length;
        var names = { rings: 'кольца', stars: 'созвездие', hex: 'соты', force: 'силы', time: 'время' };
        var parts = [data.notes.length + ' заметок', data.memory.length + ' воспоминаний', data.docs.length + ' документов'];
        if ((data.soul || []).length) parts.push(data.soul.length + ' в душе');
        if (sem) parts.push(sem + ' связей по смыслу');
        if (state.query) parts.push('найдено: ' + Object.keys(state.matches).length);
        $('brain-sub').textContent = parts.join(' · ') + ' · ' + names[view.layout];
        var legend = $('legend');
        legend.textContent = '';
        graph.groups.slice(0, 14).forEach(function (g) {
          var s = document.createElement('span');
          var i = document.createElement('i');
          i.style.background = g.color;
          s.appendChild(i);
          s.appendChild(document.createTextNode(cut(g.label, 24) + ' ' + g.items.length));
          legend.appendChild(s);
        });
        var empty = $('brain-empty');
        empty.hidden = leaves > 0;
        empty.textContent = 'Память пока пуста. Добавьте заметки в рабочую память или поговорите с Яэри — здесь появится карта того, что она знает.';
        if (data.note) $('brain-sub').textContent += ' · ' + data.note;
      }

      function rebuild(keepCam) {
        var selId = state.sel && state.sel.id;
        build();
        layout();
        if (keepCam) needFit = false;
        state.sel = selId ? graph.byId[selId] || null : null;
        if (!state.sel) detail.hidden = true;
        state.hover = null;
        if (state.query) search.dispatchEvent(new Event('input'));
        updateFocus();
        renderSub();
        miniFit = true;
        dirty = true;
        miniDirty = true;
        if (App.renderNotes) App.renderNotes();
      }

      /* ---------- Цикл отрисовки ---------- */
      var miniDirty = true;
      var lastMini = 0;
      var lastFrame = 0;
      function spin(dt) {
        // Медленное вращение колец, как «giro dos anéis» в референсе. Замирает, пока узел под курсором.
        var speed = presenting ? Math.max(view.spin, 0.3) : view.spin;
        if (view.layout !== 'rings' || !speed || anim || state.hover || state.sel || drag) return false;
        var d = dt / 1000 * speed * 0.12;
        var c = Math.cos(d), s0 = Math.sin(d);
        graph.nodes.forEach(function (n) {
          var x = n.x, y = n.y;
          n.x = x * c - y * s0; n.y = x * s0 + y * c;
          x = n.tx; y = n.ty;
          if (x !== undefined) { n.tx = x * c - y * s0; n.ty = x * s0 + y * c; }
        });
        return true;
      }
      function frame(now) {
        requestAnimationFrame(frame);
        var view_ = App.currentView();
        var motion = App.motion();
        var dt = lastFrame ? Math.min(100, now - lastFrame) : 0;
        lastFrame = now;
        if (motion && dt && spin(dt)) { dirty = true; miniDirty = true; }
        for (var litKey in lit) { if (lit.hasOwnProperty(litKey)) { dirty = true; miniDirty = true; break; } }
        if (anim) {
          var p = Math.min(1, (now - anim.start) / anim.dur);
          var e = ease(p);
          graph.nodes.forEach(function (n) { n.x = n.x0 + (n.tx - n.x0) * e; n.y = n.y0 + (n.ty - n.y0) * e; });
          if (p >= 1) anim = null;
          dirty = true; miniDirty = true;
        }
        if (view_ === 'brain') {
          if (main.resize()) { dirty = true; if (!main.fitted) needFit = true; }
          if (needFit && main.w) { main.fit(!main.fitted); main.fitted = true; needFit = false; }
          if (main.camTo) {
            var c = main.cam, to = main.camTo;
            c.x += (to.x - c.x) * 0.14; c.y += (to.y - c.y) * 0.14; c.k += (to.k - c.k) * 0.14;
            if (Math.abs(to.x - c.x) < 0.5 && Math.abs(to.y - c.y) < 0.5 && Math.abs(to.k - c.k) < 0.002) { main.cam = to; main.camTo = null; }
            dirty = true;
          }
          if (dirty || motion) { main.draw(now); dirty = false; }
        } else if (view_ === 'deck' && mini && mini.canvas.offsetParent !== null) {
          if (mini.resize()) { miniDirty = true; miniFit = true; }
          if (miniFit && mini.w) { mini.fit(true); miniFit = false; }
          if (miniDirty || (motion && now - lastMini > 50)) {
            if (anim) mini.fit(true);
            mini.draw(now); miniDirty = false; lastMini = now;
          }
        }
      }

      /* Режим показа: только граф на весь экран, кольца вращаются. */
      var presenting = false;
      function present(on) {
        if (on === presenting) return;
        presenting = on;
        document.body.classList.toggle('presenting', on);
        select(null);
        if (on) {
          App.showView('brain');
          var target = $('brain');
          try { if (target.requestFullscreen) target.requestFullscreen().catch(function () {}); } catch (error) { /* Без полного экрана. */ }
        } else if (document.fullscreenElement) {
          try { document.exitFullscreen().catch(function () {}); } catch (error) { /* Уже вышли. */ }
        }
        setTimeout(function () { needFit = true; dirty = true; }, 120);
      }
      $('b-present').addEventListener('click', function () { present(true); });
      $('present-exit').addEventListener('click', function () { present(false); });
      document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && presenting) present(false); });
      document.addEventListener('keydown', function (e) { if (presenting && e.key === 'Escape') present(false); });

      if ($('mini-brain')) {
        $('mini-brain').addEventListener('click', function () { App.showView('brain'); });
        $('mini-brain').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); App.showView('brain'); } });
      }

      window.YBrain = {
        setData: function (d) {
          var hadLeaves = graph.nodes.some(function (n) { return n.type === 'leaf'; });
          data = d;
          rebuild(true);
          // Первые данные пришли, когда граф уже был открыт пустым: подгоняем камеру под них.
          if (!main.fitted || !hadLeaves) { needFit = true; miniFit = true; }
        },
        colorFor: function (kind, key) { return groupColor[key] || colorFor(kind, key); },
        restyle: function () { pickTheme(); renderThemes(); rebuild(true); },
        light: function (ids, ms) {
          var now = performance.now();
          (ids || []).forEach(function (id) { lit[id] = { start: now, until: now + (ms || 8000) }; });
          dirty = true; miniDirty = true;
        },
        onShow: function (name) { dirty = true; miniDirty = true; if (name === 'brain' && !main.fitted) needFit = true; }
      };

      pickTheme();
      pressed('layout-chips', 'layout', view.layout);
      pressed('group-chips', 'group', view.group);
      renderThemes();
      build();
      layout();
      renderSub();
      requestAnimationFrame(frame);
      App.showView(App.viewFromHash(), true);
    }());
  