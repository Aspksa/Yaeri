      /* ---------- Данные памяти ---------- */
      // notes: рабочая память; memory: воспоминания о разговорах; docs: документы RAG.
      var brainData = { notes: [], memory: [], docs: [], links: [], messages: 0, memoryTotal: 0 };

      function localNotes() {
        var list = load(NOTES_KEY);
        return Array.isArray(list) ? list.filter(function (n) { return n && typeof n.text === 'string' && n.id; }) : [];
      }
      function saveLocalNotes() { if (!online) store(NOTES_KEY, brainData.notes); }
      function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
      function normCat(cat) {
        cat = String(cat || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!cat) return 'Общее';
        for (var i = 0; i < brainData.notes.length; i++) {
          if (brainData.notes[i].cat.toLowerCase() === cat.toLowerCase()) return brainData.notes[i].cat;
        }
        return cat.charAt(0).toUpperCase() + cat.slice(1);
      }
      function demoMemory() {
        // В демо-режиме «воспоминания» — пары реплик из локального чата.
        var out = [];
        for (var i = 0; i < history.length; i++) {
          var m = history[i];
          if (m.role !== 'user') continue;
          var next = history[i + 1];
          out.push({ id: 'local' + i, t: m.t || Date.now(), text: 'Пользователь: ' + m.text + (next && next.role === 'assistant' ? '\nЯэри: ' + next.text : '') });
        }
        return out;
      }
      var refreshTimer = 0;
      function refreshBrain(delay) {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(function () {
          if (!online) {
            brainData.memory = demoMemory();
            brainData.messages = history.length;
            brainData.memoryTotal = brainData.memory.length;
            brainData.links = [];
            dataChanged();
            return;
          }
          api('brain').then(function (data) {
            brainData = {
              notes: Array.isArray(data.notes) ? data.notes : [],
              memory: Array.isArray(data.memory) ? data.memory : [],
              docs: Array.isArray(data.docs) ? data.docs : [],
              links: Array.isArray(data.links) ? data.links : [],
              messages: data.messages || 0,
              memoryTotal: data.memoryTotal || 0,
              note: data.note || '',
              soul: Array.isArray(data.soul) ? data.soul : []
            };
            dataChanged();
          }).catch(function () { /* Покажем то, что уже есть. */ });
        }, delay || 0);
      }
      function dataChanged() {
        renderNotes();
        renderStats();
        renderCalendar();
        if (window.YBrain) YBrain.setData(brainData);
      }

      /* ---------- Рабочая память: список ---------- */
      var memList = $('mem-list');
      var memFilter = $('mem-filter');
      function catColor(cat) { return window.YBrain ? YBrain.colorFor('note', cat) : 'var(--a)'; }
      function renderNotes() {
        if (!memList) return;
        var q = memFilter.value.trim().toLowerCase();
        var notes = brainData.notes.slice().sort(function (a, b) {
          return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.t || 0) - (a.t || 0);
        });
        var groups = {};
        var order = [];
        notes.forEach(function (n) {
          if (q && (n.text + ' ' + n.cat).toLowerCase().indexOf(q) < 0) return;
          if (!groups[n.cat]) { groups[n.cat] = []; order.push(n.cat); }
          groups[n.cat].push(n);
        });
        order.sort(function (a, b) { return a.localeCompare(b, 'ru'); });
        memList.textContent = '';
        $('mem-count').textContent = brainData.notes.length + ' ' + plural(brainData.notes.length, 'заметка', 'заметки', 'заметок');
        if (!order.length) {
          var empty = el('li', 'empty', q ? 'Ничего не найдено.' : (online
            ? 'Пока пусто. Добавьте заметку выше или просто расскажите Яэри о планах — она запишет важное сама.'
            : 'Пока пусто. Добавьте заметку выше: что Яэри стоит помнить о вас и ваших делах.'));
          memList.appendChild(empty);
        }
        order.forEach(function (cat) {
          var li = el('li', 'mem-group');
          var head = el('div', 'mem-group-head');
          var dot = el('i');
          dot.style.background = catColor(cat);
          head.appendChild(dot);
          head.appendChild(el('span', '', cat));
          head.appendChild(el('span', '', String(groups[cat].length)));
          li.appendChild(head);
          groups[cat].forEach(function (n) {
            var row = el('div', 'mem-item' + (n.pinned ? ' pinned' : ''));
            var text = el('span', 'm-text', n.text);
            text.appendChild(el('span', 'm-src', (n.src === 'yaeri' ? 'записала Яэри · ' : '') + dmy(n.t)));
            var pin = el('button', 'pin', n.pinned ? '★' : '☆');
            pin.type = 'button';
            pin.title = n.pinned ? 'Открепить' : 'Закрепить: всегда в начале памяти';
            pin.setAttribute('aria-label', pin.title);
            pin.addEventListener('click', function () { updateNote(n, { pinned: !n.pinned }); });
            var del = el('button', 'del', '×');
            del.type = 'button';
            del.title = 'Удалить заметку';
            del.setAttribute('aria-label', 'Удалить заметку: ' + n.text);
            del.addEventListener('click', function () { deleteNote(n); });
            row.appendChild(text);
            row.appendChild(pin);
            row.appendChild(del);
            li.appendChild(row);
          });
          memList.appendChild(li);
        });
        var cats = $('mem-cats');
        cats.textContent = '';
        var seen = {};
        ['Задачи', 'Планы', 'Профиль', 'Люди', 'Проекты', 'Предпочтения'].concat(order).forEach(function (c) {
          if (seen[c]) return;
          seen[c] = 1;
          var o = document.createElement('option');
          o.value = c;
          cats.appendChild(o);
        });
      }
      if (memFilter) memFilter.addEventListener('input', renderNotes);

      function addNote(cat, text) {
        text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
        if (!text) return Promise.resolve();
        if (online) {
          return api('notes', { cat: cat, text: text }).then(function () { refreshBrain(); });
        }
        var dup = brainData.notes.some(function (n) { return n.text.toLowerCase() === text.toLowerCase(); });
        if (dup) return Promise.reject(new Error('Такая заметка уже есть.'));
        brainData.notes.push({ id: newId(), cat: normCat(cat), text: text, t: Date.now(), src: 'user', pinned: false });
        saveLocalNotes();
        dataChanged();
        return Promise.resolve();
      }
      function updateNote(n, patch) {
        if (online) {
          patch.id = n.id;
          return api('notes/update', patch).then(function () { refreshBrain(); }).catch(function (e) { window.alert(e.message); });
        }
        Object.keys(patch).forEach(function (k) { n[k] = k === 'cat' ? normCat(patch[k]) : patch[k]; });
        saveLocalNotes();
        dataChanged();
        return Promise.resolve();
      }
      function deleteNote(n) {
        if (!window.confirm('Удалить из рабочей памяти: «' + cut(n.text, 80) + '»?')) return Promise.resolve(false);
        if (online) {
          return api('notes/delete', { id: n.id }).then(function () { refreshBrain(); return true; }).catch(function (e) { window.alert(e.message); return false; });
        }
        brainData.notes = brainData.notes.filter(function (x) { return x !== n; });
        saveLocalNotes();
        dataChanged();
        return Promise.resolve(true);
      }
      if ($('mem-form')) $('mem-form').addEventListener('submit', function (event) {
        event.preventDefault();
        var text = $('mem-text');
        var cat = $('mem-cat');
        if (!text.value.trim()) { text.focus(); return; }
        addNote(cat.value, text.value).then(function () { text.value = ''; text.focus(); })
          .catch(function (e) { window.alert(e.message); });
      });

      /* ---------- Сводка, журнал, часы ---------- */
      function renderStats() {
        if (!$('st-notes')) return;
        $('st-notes').textContent = brainData.notes.length;
        $('st-mem').textContent = brainData.memoryTotal || brainData.memory.length;
        $('st-docs').textContent = brainData.docs.length;
        $('st-msgs').textContent = brainData.messages || history.length;
        $('mini-meta').textContent = 'синхр. ' + hhmm(Date.now());
      }
      /* ---------- Производственный календарь России ---------- */
      var WEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
      var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
      var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      var WEEK_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
      // Праздники по ст. 112 ТК РФ: одинаковы каждый год.
      var PC_HOLIDAYS = {
        '01-01': 'Новогодние каникулы', '01-02': 'Новогодние каникулы', '01-03': 'Новогодние каникулы', '01-04': 'Новогодние каникулы',
        '01-05': 'Новогодние каникулы', '01-06': 'Новогодние каникулы', '01-07': 'Рождество Христово', '01-08': 'Новогодние каникулы',
        '02-23': 'День защитника Отечества', '03-08': 'Международный женский день', '05-01': 'Праздник Весны и Труда',
        '05-09': 'День Победы', '06-12': 'День России', '11-04': 'День народного единства'
      };
      // Переносы и сокращённые дни по постановлениям Правительства РФ.
      var PC_YEARS = {
        2026: {
          act: 'Постановление Правительства РФ от 24.09.2025 № 1466',
          off: { '01-09': 'перенос с субботы 3 января', '03-09': 'перенос с 8 марта (воскресенье)', '05-11': 'перенос с 9 мая (суббота)', '12-31': 'перенос с воскресенья 4 января' },
          work: {},
          short: { '04-30': 'перед 1 мая', '05-08': 'перед Днём Победы', '06-11': 'перед Днём России', '11-03': 'перед Днём народного единства' },
          total: { work: 247, off: 118, h40: 1972 }
        },
        2027: {
          act: 'Постановление Правительства РФ от 17.09.2026 № 1187',
          off: { '02-22': 'перенос с субботы 20 февраля', '05-03': 'перенос с 1 мая (суббота)', '05-10': 'перенос с 9 мая (воскресенье)', '06-14': 'перенос с 12 июня (суббота)', '11-05': 'перенос с субботы 2 января', '12-31': 'перенос с воскресенья 3 января' },
          work: { '02-20': 'рабочая суббота: выходной перенесён на 22 февраля' },
          short: { '02-20': 'перед Днём защитника Отечества', '04-30': 'перед 1 мая', '06-11': 'перед Днём России', '11-03': 'перед Днём народного единства' },
          total: { work: 247, off: 118, h40: 1972 }
        }
      };
      var PC_FIRST = 2026, PC_LAST = 2027;
      function pcKey(m, d) { return pad(m + 1) + '-' + pad(d); }
      // Тип дня: work, short (рабочий −1 ч), off (выходной), hol (праздник), move (перенесённый выходной).
      function pcDay(y, m, d) {
        var info = PC_YEARS[y] || { off: {}, work: {}, short: {} };
        var k = pcKey(m, d);
        var wd = (new Date(y, m, d).getDay() + 6) % 7;
        var r = { y: y, m: m, d: d, wd: wd, key: k, type: 'work', name: '', note: '', weekend: wd >= 5 };
        if (info.work[k]) { r.type = info.short[k] ? 'short' : 'work'; r.note = info.work[k]; r.wwork = true; return r; }
        if (PC_HOLIDAYS[k]) { r.type = 'hol'; r.name = PC_HOLIDAYS[k]; return r; }
        if (info.off[k]) { r.type = 'move'; r.note = info.off[k]; return r; }
        if (wd >= 5) { r.type = 'off'; return r; }
        if (info.short[k]) { r.type = 'short'; r.note = 'сокращённый день, ' + info.short[k]; }
        return r;
      }
      function pcIsWork(x) { return x.type === 'work' || x.type === 'short'; }
      function pcHours(x, week) { if (!pcIsWork(x)) return 0; return week / 5 - (x.type === 'short' ? 1 : 0); }
      function pcStats(y, m0, m1) {
        var st = { work: 0, off: 0, short: 0, h40: 0, h36: 0, h24: 0, cal: 0 };
        for (var m = m0; m <= m1; m++) {
          var n = new Date(y, m + 1, 0).getDate();
          for (var d = 1; d <= n; d++) {
            var x = pcDay(y, m, d);
            st.cal++;
            if (pcIsWork(x)) { st.work++; if (x.type === 'short') st.short++; st.h40 += pcHours(x, 40); st.h36 += pcHours(x, 36); st.h24 += pcHours(x, 24); }
            else st.off++;
          }
        }
        st.h36 = Math.round(st.h36 * 10) / 10;
        st.h24 = Math.round(st.h24 * 10) / 10;
        return st;
      }
      function pcFmtH(v) { return String(v).replace('.', ','); }
      function pcDayText(x) {
        var date = x.d + ' ' + MONTHS_GEN[x.m] + ', ' + WEEK_FULL[x.wd];
        var t = { work: 'рабочий день, 8 часов', short: 'рабочий день, 7 часов (сокращённый)', off: 'выходной', hol: 'праздник, нерабочий день', move: 'выходной (перенос)' }[x.type];
        return '<b>' + date + '</b> — ' + t + (x.name ? '. ' + x.name : '') + (x.note ? '. ' + cap(x.note) : '') + '.';
      }
      function cap(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
      function pcCellClass(x, today) {
        var c = 'pc-d ' + x.type;
        if (x.type === 'short') c += ' short';
        if (x.wwork) c += ' wwork';
        var t = new Date(x.y, x.m, x.d).getTime();
        if (t < today) c += ' past';
        if (t === today) c += ' today';
        return c;
      }
      function pcToday() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(); }
      function pcFillGrid(box, y, m, opts) {
        box.textContent = '';
        WEEK.forEach(function (w, i) { box.appendChild(el('span', 'wd' + (i >= 5 ? ' we' : ''), w)); });
        var lead = (new Date(y, m, 1).getDay() + 6) % 7;
        for (var i = 0; i < lead; i++) box.appendChild(el('span', 'pc-d blank'));
        var n = new Date(y, m + 1, 0).getDate();
        var today = pcToday();
        for (var d = 1; d <= n; d++) {
          var x = pcDay(y, m, d);
          var cell = el(opts && opts.buttons ? 'button' : 'span', pcCellClass(x, today) + (opts && opts.sel === d ? ' sel' : ''), String(d));
          cell.title = pcDayText(x).replace(/<[^>]+>/g, '');
          tasksDecorateCell(cell, y, m, d);
          if (opts && opts.buttons) {
            cell.type = 'button';
            if (!cell.hasAttribute('aria-label')) cell.setAttribute('aria-label', cell.title);
            (function (xx) { cell.addEventListener('click', function () { opts.onPick(xx); }); }(x));
          }
          box.appendChild(cell);
        }
      }
      var pcState = (function () {
        var n = new Date();
        var y = Math.min(PC_LAST, Math.max(PC_FIRST, n.getFullYear()));
        return { y: y, m: y === n.getFullYear() ? n.getMonth() : 0, sel: y === n.getFullYear() && 0 || 0, key: '' };
      }());
      function pcNextEvents() {
        // Ближайший праздник и ближайший выходной от сегодняшнего дня (в пределах 2026–2027).
        var now = new Date();
        var out = { hol: null, holDays: 0, rest: null, restDays: 0 };
        for (var i = 0; i < 800; i++) {
          var dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
          if (dt.getFullYear() > PC_LAST) break;
          if (dt.getFullYear() < PC_FIRST) continue;
          var x = pcDay(dt.getFullYear(), dt.getMonth(), dt.getDate());
          if (!out.rest && i > 0 && !pcIsWork(x)) { out.rest = x; out.restDays = i; }
          if (!out.hol && i > 0 && (x.type === 'hol')) { out.hol = x; out.holDays = i; }
          if (out.hol && out.rest) break;
        }
        return out;
      }
      function pcLeft(y, fromMonth) {
        // Рабочие дни, оставшиеся с завтрашнего дня до конца месяца и года.
        var now = new Date(), month = 0, year = 0;
        for (var m = fromMonth; m < 12; m++) {
          var n = new Date(y, m + 1, 0).getDate();
          for (var d = 1; d <= n; d++) {
            var t = new Date(y, m, d);
            if (t <= now) continue;
            if (pcIsWork(pcDay(y, m, d))) { year++; if (m === now.getMonth()) month++; }
          }
        }
        return { month: month, year: year };
      }
      function renderNowStatus() {
        var n = new Date();
        var box = $('now-status');
        if (!box) return;
        var x = pcDay(n.getFullYear(), n.getMonth(), n.getDate());
        box.className = 'now-status' + (pcIsWork(x) ? (x.type === 'short' ? ' short' : '') : ' off');
        box.innerHTML = '';
        box.appendChild(el('i'));
        var t = el('span');
        t.appendChild(el('b', '', pcIsWork(x) ? (x.type === 'short' ? 'Сокращённый день · 7 ч' : 'Рабочий день · 8 ч') : (x.type === 'hol' ? x.name : (x.type === 'move' ? 'Выходной (перенос)' : 'Выходной'))));
        box.appendChild(t);
      }
      function renderProdCalendar(force) {
        var key = pcToday() + ':' + pcState.y + ':' + pcState.m + ':' + pcState.sel;
        if (key === pcState.key && !force) return;
        pcState.key = key;
        var y = pcState.y, m = pcState.m;
        each(document.querySelectorAll('[data-pcy]'), function (b) { b.setAttribute('aria-checked', String(Number(b.getAttribute('data-pcy')) === y)); });
        var ms = pcStats(y, m, m);
        var mb = $('pc-month');
        mb.textContent = '';
        mb.appendChild(document.createTextNode(MONTHS[m] + ' ' + y));
        mb.appendChild(el('small', '', ms.work + ' ' + plural(ms.work, 'рабочий день', 'рабочих дня', 'рабочих дней') + ' · ' + pcFmtH(ms.h40) + ' ч'));
        $('pc-prev').disabled = y === PC_FIRST && m === 0;
        $('pc-next').disabled = y === PC_LAST && m === 11;
        var now = new Date();
        var sel = pcState.sel || (now.getFullYear() === y && now.getMonth() === m ? now.getDate() : 0);
        pcFillGrid($('pc-grid'), y, m, { buttons: true, sel: pcState.sel, onPick: function (x) { pcState.sel = pcState.sel === x.d ? 0 : x.d; tasksPickDay(x); renderProdCalendar(true); } });
        // Подпись под сеткой: выбранный день, иначе ближайший праздник месяца.
        var detail = $('pc-detail');
        if (sel) { detail.innerHTML = pcDayText(pcDay(y, m, sel)); tasksDayDetail(detail, y, m, sel); }
        else {
          var hols = [];
          var n = new Date(y, m + 1, 0).getDate();
          for (var d = 1; d <= n; d++) { var x = pcDay(y, m, d); if (x.type === 'hol' || x.type === 'move') hols.push(x); }
          detail.innerHTML = hols.length ? pcDayText(hols[0]) + (hols.length > 1 ? ' И ещё ' + (hols.length - 1) + ' нерабоч. ' + plural(hols.length - 1, 'день', 'дня', 'дней') + ' в месяце.' : '') : 'В этом месяце нет праздников и переносов. Нажмите на день, чтобы узнать подробности.';
        }
        var stats = $('pc-stats');
        stats.textContent = '';
        [[ms.work, 'рабочих', ms.short ? 'из них −1 ч: ' + ms.short : ''], [ms.off, 'выходных', '', 'hol'], [pcFmtH(ms.h40), 'часов · 40ч', '36ч: ' + pcFmtH(ms.h36) + ' · 24ч: ' + pcFmtH(ms.h24)]].forEach(function (s) {
          var c = el('div', 'pc-stat' + (s[3] ? ' ' + s[3] : ''));
          c.appendChild(el('b', '', String(s[0])));
          c.appendChild(el('span', '', s[1]));
          if (s[2]) c.appendChild(el('small', '', s[2]));
          stats.appendChild(c);
        });
        var nb = $('pc-next-box');
        nb.textContent = '';
        var ev = pcNextEvents();
        if (ev.hol) nb.appendChild(pcCountdown('hol', ev.holDays, ev.hol.name, ev.hol.d + ' ' + MONTHS_GEN[ev.hol.m] + ' ' + ev.hol.y + ', ' + WEEK_FULL[ev.hol.wd]));
        if (ev.rest && ev.restDays > 0 && (!ev.hol || ev.rest.key !== ev.hol.key)) nb.appendChild(pcCountdown('rest', ev.restDays, 'До выходного', ev.rest.d + ' ' + MONTHS_GEN[ev.rest.m] + ', ' + WEEK_FULL[ev.rest.wd]));
        if (now.getFullYear() >= PC_FIRST && now.getFullYear() <= PC_LAST) {
          var left = pcLeft(now.getFullYear(), now.getMonth());
          var ys = pcStats(now.getFullYear(), 0, 11);
          var done = ys.work - left.year;
          var c = el('div', 'pc-cd');
          var num = el('div', 'num', String(left.year));
          num.appendChild(el('small', '', 'раб. дн.'));
          c.appendChild(num);
          c.appendChild(el('b', '', 'Осталось в ' + now.getFullYear() + ' году'));
          c.appendChild(el('span', '', 'в этом месяце ещё ' + left.month + ' · пройдено ' + Math.round(done * 100 / ys.work) + '%'));
          var bar = el('div', 'pc-progress');
          var fill = el('i');
          fill.style.width = Math.round(done * 100 / ys.work) + '%';
          bar.appendChild(fill);
          c.appendChild(bar);
          nb.appendChild(c);
        }
        $('pc-foot').textContent = (PC_YEARS[y] ? PC_YEARS[y].act.replace('Постановление Правительства РФ', 'Пост.') : '');
        renderNowStatus();
        if (!$('pc-overlay').hidden) renderProdYear();
      }
      function pcCountdown(kind, days, title, sub) {
        var c = el('div', 'pc-cd ' + kind);
        var num = el('div', 'num', String(days));
        num.appendChild(el('small', '', plural(days, 'день', 'дня', 'дней')));
        c.appendChild(num);
        c.appendChild(el('b', '', title));
        c.appendChild(el('span', '', sub));
        return c;
      }
      function renderProdYear() {
        var y = pcState.y;
        $('pcy-title').textContent = y;
        var ys = pcStats(y, 0, 11);
        var k = $('pcy-kpis');
        k.textContent = '';
        [[ys.cal, 'календарных дней'], [ys.work, 'рабочих дней'], [ys.off, 'выходных и праздников', 'hol'], [pcFmtH(ys.h40), 'часов · 40-часовая неделя'], [pcFmtH(ys.h36), 'часов · 36 ч'], [pcFmtH(ys.h24), 'часов · 24 ч']].forEach(function (s) {
          var c = el('div', 'pc-kpi' + (s[2] ? ' ' + s[2] : ''));
          c.appendChild(el('b', '', String(s[0])));
          c.appendChild(el('span', '', s[1]));
          k.appendChild(c);
        });
        var box = $('pcy-months');
        box.textContent = '';
        var now = new Date();
        for (var m = 0; m < 12; m++) {
          var st = pcStats(y, m, m);
          var card = el('div', 'pc-m' + (now.getFullYear() === y && now.getMonth() === m ? ' cur' : ''));
          card.tabIndex = 0;
          card.setAttribute('role', 'button');
          card.setAttribute('aria-label', 'Открыть ' + MONTHS[m] + ' ' + y);
          var h = el('h4', '', MONTHS[m]);
          h.appendChild(el('span', '', st.work + ' дн · ' + pcFmtH(st.h40) + ' ч'));
          card.appendChild(h);
          var g = el('div', 'pc-grid');
          pcFillGrid(g, y, m);
          card.appendChild(g);
          (function (mm) {
            function go() { pcState.m = mm; pcState.sel = 0; closeProdYear(); renderProdCalendar(true); }
            card.addEventListener('click', go);
            card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
          }(m));
          box.appendChild(card);
        }
        // Нормы по месяцам, кварталам, полугодиям и году.
        var rows = '<thead><tr><th>Период</th><th>Раб.</th><th>Вых.</th><th>40 ч</th><th>36 ч</th><th>24 ч</th></tr></thead><tbody>';
        function row(name, st, cls) { return '<tr class="' + (cls || '') + '"><td>' + name + '</td><td>' + st.work + '</td><td>' + st.off + '</td><td>' + pcFmtH(st.h40) + '</td><td>' + pcFmtH(st.h36) + '</td><td>' + pcFmtH(st.h24) + '</td></tr>'; }
        for (var q = 0; q < 4; q++) {
          for (var mm = q * 3; mm < q * 3 + 3; mm++) rows += row(cap(MONTHS[mm]), pcStats(y, mm, mm), now.getFullYear() === y && now.getMonth() === mm ? 'now' : '');
          rows += row(['I', 'II', 'III', 'IV'][q] + ' квартал', pcStats(y, q * 3, q * 3 + 2), 'q');
          if (q === 1) rows += row('1-е полугодие', pcStats(y, 0, 5), 'q');
        }
        rows += row('2-е полугодие', pcStats(y, 6, 11), 'q');
        rows += row(y + ' год', ys, 'y') + '</tbody>';
        $('pcy-table').innerHTML = rows;
        var hl = $('pcy-hols');
        hl.textContent = '';
        for (var mo = 0; mo < 12; mo++) {
          var n = new Date(y, mo + 1, 0).getDate();
          for (var d = 1; d <= n; d++) {
            var x = pcDay(y, mo, d);
            var txt = '';
            var cls = '';
            if (x.type === 'hol') txt = x.name + (x.wd >= 5 ? ' (выпадает на ' + WEEK_FULL[x.wd] + ')' : '');
            else if (x.type === 'move') { txt = 'Выходной: ' + x.note; cls = 'mv'; }
            else if (x.wwork) { txt = cap(x.note) + (x.type === 'short' ? ', на час короче' : ''); cls = 'mv'; }
            else if (x.type === 'short') { txt = 'Сокращённый день, ' + PC_YEARS[y].short[x.key]; cls = 'sh'; }
            if (!txt) continue;
            if (x.type === 'hol' && x.key > '01-01' && x.key <= '01-08') continue;
            var li = el('li', cls);
            li.appendChild(el('time', '', x.type === 'hol' && x.key === '01-01' ? '1–8 янв.' : pad(x.d) + '.' + pad(mo + 1) + ', ' + WEEK[x.wd]));
            li.appendChild(el('span', '', x.key === '01-01' ? 'Новогодние каникулы и Рождество' : txt));
            hl.appendChild(li);
          }
        }
        var t = PC_YEARS[y].total;
        var ok = ys.work === t.work && ys.off === t.off && ys.h40 === t.h40;
        $('pcy-src').textContent = PC_YEARS[y].act + '. Ст. 112 ТК РФ: праздник в выходной переносится на следующий рабочий день.' + (ok ? '' : ' Внимание: итоги не совпали с утверждёнными.');
        pcCalc();
      }
      function pcParse(v) { var p = String(v || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
      function pcIso(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
      function pcCalc() {
        var a = pcParse($('pcc-from').value), b = pcParse($('pcc-to').value), out = $('pcc-out');
        if (!a || !b) { out.textContent = 'Выберите две даты.'; }
        else {
          if (a > b) { var tmp = a; a = b; b = tmp; }
          var w = 0, off = 0, h = 0, cal = 0, outside = false;
          for (var dt = new Date(a); dt <= b; dt.setDate(dt.getDate() + 1)) {
            if (dt.getFullYear() < PC_FIRST || dt.getFullYear() > PC_LAST) { outside = true; continue; }
            var x = pcDay(dt.getFullYear(), dt.getMonth(), dt.getDate());
            cal++;
            if (pcIsWork(x)) { w++; h += pcHours(x, 40); } else off++;
          }
          out.innerHTML = 'Рабочих дней: <b>' + w + '</b> · выходных: <b>' + off + '</b> · часов (40 ч): <b>' + h + '</b> · всего дней: <b>' + cal + '</b>' + (outside ? '<br>Учтены только 2026–2027 годы.' : '');
        }
        var nDays = Math.max(1, Math.min(400, Number($('pcc-n').value) || 0));
        var dt2 = new Date(), cnt = 0, guard = 0;
        dt2 = new Date(dt2.getFullYear(), dt2.getMonth(), dt2.getDate());
        while (cnt < nDays && guard < 900) {
          dt2.setDate(dt2.getDate() + 1);
          guard++;
          if (dt2.getFullYear() > PC_LAST) break;
          if (dt2.getFullYear() >= PC_FIRST && pcIsWork(pcDay(dt2.getFullYear(), dt2.getMonth(), dt2.getDate()))) cnt++;
        }
        $('pcc-due').innerHTML = cnt === nDays
          ? nDays + '-й рабочий день: <b>' + dt2.getDate() + ' ' + MONTHS_GEN[dt2.getMonth()] + ' ' + dt2.getFullYear() + '</b>, ' + WEEK_FULL[(dt2.getDay() + 6) % 7]
          : 'Срок выходит за пределы 2027 года.';
      }
      var pcLastFocus = null;
      function openProdYear() {
        pcLastFocus = document.activeElement;
        $('pc-overlay').hidden = false;
        if (!$('pcc-from').value) {
          var n = new Date();
          var y0 = Math.min(PC_LAST, Math.max(PC_FIRST, n.getFullYear()));
          $('pcc-from').value = y0 === n.getFullYear() ? pcIso(n) : y0 + '-01-01';
          $('pcc-to').value = y0 + '-12-31';
        }
        renderProdYear();
        $('pc-close').focus();
      }
      function closeProdYear() {
        $('pc-overlay').hidden = true;
        if (pcLastFocus && pcLastFocus.focus) pcLastFocus.focus();
      }
      $('pc-open').addEventListener('click', openProdYear);
      $('pc-close').addEventListener('click', closeProdYear);
      $('pc-overlay').addEventListener('click', function (e) { if (e.target === this) closeProdYear(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('pc-overlay').hidden) closeProdYear(); });
      ['pcc-from', 'pcc-to', 'pcc-n'].forEach(function (id) { $(id).addEventListener('input', pcCalc); });
      each(document.querySelectorAll('[data-pcy]'), function (b) {
        b.addEventListener('click', function () {
          var y = Number(b.getAttribute('data-pcy'));
          if (y === pcState.y) return;
          pcState.y = y;
          var n = new Date();
          pcState.m = n.getFullYear() === y ? n.getMonth() : (y > n.getFullYear() ? 0 : 11);
          pcState.sel = 0;
          renderProdCalendar(true);
        });
      });
      function pcShift(delta) {
        var m = pcState.m + delta, y = pcState.y;
        if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
        if (y < PC_FIRST || y > PC_LAST) return;
        pcState.y = y; pcState.m = m; pcState.sel = 0;
        renderProdCalendar(true);
      }
      $('pc-prev').addEventListener('click', function () { pcShift(-1); });
      $('pc-next').addEventListener('click', function () { pcShift(1); });
      $('pc-month').addEventListener('click', function () {
        var n = new Date();
        if (n.getFullYear() < PC_FIRST || n.getFullYear() > PC_LAST) return;
        pcState.y = n.getFullYear(); pcState.m = n.getMonth(); pcState.sel = 0;
        renderProdCalendar(true);
      });
      function renderCalendar(force) { renderProdCalendar(force); }
      function tick() {
        var now = new Date();
        $('now-time').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
        $('now-sec').textContent = pad(now.getSeconds());
        var wd = (now.getDay() + 6) % 7;
        $('now-weekday').textContent = WEEK_FULL[wd];
        $('now-date').textContent = now.getDate() + ' ' + MONTHS_GEN[now.getMonth()] + ' ' + now.getFullYear();
        // Стрелки и дуга прошедшей части суток.
        var sec = now.getSeconds(), min = now.getMinutes() + sec / 60, hr = (now.getHours() % 12) + min / 60;
        $('hand-s').style.transform = 'rotate(' + sec * 6 + 'deg)';
        $('hand-m').style.transform = 'rotate(' + min * 6 + 'deg)';
        $('hand-h').style.transform = 'rotate(' + hr * 30 + 'deg)';
        var dayPart = (now.getHours() * 3600 + now.getMinutes() * 60 + sec) / 86400;
        $('dial-day').style.strokeDashoffset = String(578.05 * (1 - dayPart));
        if (sec === 0 || !$('now-meta').firstChild) {
          var start = new Date(now.getFullYear(), 0, 1);
          var doy = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 864e5) + 1;
          var thu = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3 - wd);
          var week = Math.floor((thu - new Date(thu.getFullYear(), 0, 4)) / 6048e5 + 0.5) + 1;
          var meta = $('now-meta');
          meta.textContent = '';
          [['неделя', week], ['день года', doy], ['суток прошло', Math.round(dayPart * 100) + '%']].forEach(function (x) {
            var sp = el('span', '', x[0] + ' ');
            sp.appendChild(el('b', '', String(x[1])));
            meta.appendChild(sp);
          });
        }
        if (now.getSeconds() === 0) renderCalendar();
      }
      try { $('now-zone').textContent = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').split('/').pop().replace(/_/g, ' '); } catch (error) { /* Без часового пояса. */ }
      (function () {
        // Деления циферблата: 60 штрихов и цифры 12, 3, 6, 9.
        var g = $('dial-ticks'), NS = 'http://www.w3.org/2000/svg';
        for (var i = 0; i < 60; i++) {
          var big = i % 5 === 0;
          var ln = document.createElementNS(NS, 'line');
          ln.setAttribute('x1', '100'); ln.setAttribute('x2', '100');
          ln.setAttribute('y1', big ? '16' : '17'); ln.setAttribute('y2', big ? '25' : '21');
          ln.setAttribute('class', 'tick' + (big ? ' big' : ''));
          ln.setAttribute('transform', 'rotate(' + i * 6 + ' 100 100)');
          g.appendChild(ln);
        }
        [[12, 100, 38], [3, 163, 100], [6, 100, 163], [9, 37, 100]].forEach(function (n) {
          var t = document.createElementNS(NS, 'text');
          t.setAttribute('x', String(n[1])); t.setAttribute('y', String(n[2]));
          t.textContent = String(n[0]);
          g.appendChild(t);
        });
      }());
      tick();
      setInterval(tick, 1000);

