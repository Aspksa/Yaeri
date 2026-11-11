      /* ---------- Дела: дела со сроками и приоритетами, заметки ---------- */
      // С сервером дела лежат в data/tasks.json (Яэри видит их в чате), без сервера — в браузере.
      var TASKS_KEY = 'yaeri_tasks_v1';
      var TASKS_REMIND_KEY = 'yaeri_tasks_remind_v1';
      var PRIO_TEXT = { high: 'высокий', normal: 'обычный', low: 'низкий' };
      var tasks = { items: [], loaded: false, filter: 'all', day: '', editId: '', mode: 'task' };

      function tIso(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
      function tParse(v) { var p = String(v || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
      function tToday() { return tIso(new Date()); }
      function tAddDays(iso, n) { var d = tParse(iso) || new Date(); d.setDate(d.getDate() + n); return tIso(d); }
      function tDayInfo(iso) { var d = tParse(iso); return d ? pcDay(d.getFullYear(), d.getMonth(), d.getDate()) : null; }
      function tIsWork(iso) { var x = tDayInfo(iso); return !!x && pcIsWork(x); }
      // Ближайший рабочий день по производственному календарю, начиная с from (включительно).
      function tNextWork(from, inclusive) {
        var iso = inclusive ? from : tAddDays(from, 1);
        for (var i = 0; i < 40 && !tIsWork(iso); i++) iso = tAddDays(iso, 1);
        return iso;
      }
      function tDateWords(iso, withWeekday) {
        var today = tToday();
        if (iso === today) return 'сегодня';
        if (iso === tAddDays(today, 1)) return 'завтра';
        if (iso === tAddDays(today, -1)) return 'вчера';
        var d = tParse(iso);
        if (!d) return '';
        var s = d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
        return withWeekday ? s + ', ' + WEEK[(d.getDay() + 6) % 7] : s;
      }
      function tIsTask(t) { return t.kind !== 'note'; }
      function tLate(t) { return tIsTask(t) && !t.done && t.due && t.due < tToday(); }
      function tSortKey(t) { return (t.due || '9999-99-99') + ' ' + (t.time || '99:99') + ' ' + ({ high: 0, normal: 1, low: 2 }[t.prio] || 1); }
      function tOpen() { return tasks.items.filter(function (t) { return tIsTask(t) && !t.done; }); }
      function tForDay(iso) { return tasks.items.filter(function (t) { return t.due === iso; }); }

      /* Хранение */
      function tasksLocalSave() { if (!online) store(TASKS_KEY, tasks.items); }
      function tasksLoad() {
        var done = function () { tasks.loaded = true; tasksChanged(); tasksRemindCheck(true); };
        if (!online) {
          var saved = load(TASKS_KEY);
          tasks.items = Array.isArray(saved) ? saved.filter(function (t) { return t && t.id && t.text; }) : [];
          done();
          return Promise.resolve();
        }
        return api('tasks').then(function (data) {
          tasks.items = Array.isArray(data.items) ? data.items : [];
          done();
        }).catch(function (error) { tasksFlashHint('Дела не загрузились: ' + error.message, true); });
      }
      function tasksNewLocal(fields) {
        var now = Date.now();
        var item = { id: now.toString(36) + Math.random().toString(36).slice(2, 7), kind: fields.kind === 'note' ? 'note' : 'task', text: String(fields.text || '').trim(),
          due: fields.due || '', time: fields.due && fields.kind !== 'note' ? (fields.time || '') : '', prio: fields.kind === 'note' ? 'normal' : (fields.prio || 'normal'),
          done: !!fields.done, doneAt: fields.done ? now : 0, t: now, upd: now, src: fields.src || 'user' };
        tasks.items.push(item);
        return item;
      }
      // Изменения применяются сразу, сервер подтверждает их в фоне.
      function tasksSave(fields) {
        if (!online) {
          var item;
          if (fields.id) {
            item = tasksFind(fields.id);
            if (!item) return Promise.reject(new Error('Дело не найдено.'));
            Object.keys(fields).forEach(function (k) { if (k !== 'id') item[k] = fields[k]; });
            if ('done' in fields) item.doneAt = fields.done ? Date.now() : 0;
            if (!item.due) item.time = '';
            item.upd = Date.now();
          } else item = tasksNewLocal(fields);
          tasksLocalSave();
          tasksChanged();
          return Promise.resolve(item);
        }
        if (fields.id) {
          var cur = tasksFind(fields.id);
          if (cur) { Object.keys(fields).forEach(function (k) { if (k !== 'id') cur[k] = fields[k]; }); tasksChanged(); }
        }
        return api('tasks/save', fields).then(function (data) {
          var it = data.item;
          var i = tasksIndex(it.id);
          if (i > -1) tasks.items[i] = it; else tasks.items.push(it);
          tasksChanged();
          return it;
        }).catch(function (error) { tasksFlashHint(error.message, true); tasksLoad(); throw error; });
      }
      function tasksDelete(id) {
        var i = tasksIndex(id);
        if (i > -1) tasks.items.splice(i, 1);
        tasksChanged();
        if (!online) { tasksLocalSave(); return Promise.resolve(); }
        return api('tasks/delete', { id: id }).catch(function (error) { tasksFlashHint(error.message, true); tasksLoad(); });
      }
      function tasksIndex(id) { for (var i = 0; i < tasks.items.length; i++) if (tasks.items[i].id === id) return i; return -1; }
      function tasksFind(id) { var i = tasksIndex(id); return i > -1 ? tasks.items[i] : null; }

      /* Календарь: точки на днях и список дел выбранного дня */
      function tasksDayMarks(y, m, d) {
        // Календарь может отрисоваться раньше, чем загрузится этот модуль.
        if (!tasks || !tasks.items.length) return null;
        var iso = y + '-' + pad(m + 1) + '-' + pad(d);
        var open = 0, high = false, late = false, notes = 0, done = 0;
        tasks.items.forEach(function (t) {
          if (t.due !== iso) return;
          if (!tIsTask(t)) { notes++; return; }
          if (t.done) { done++; return; }
          open++;
          if (t.prio === 'high') high = true;
          if (tLate(t)) late = true;
        });
        if (!open && !notes && !done) return null;
        return { open: open, high: high, late: late, notes: notes, done: done };
      }
      function tasksDecorateCell(cell, y, m, d) {
        var mk = tasksDayMarks(y, m, d);
        if (!mk) return;
        cell.classList.add('has-tasks');
        if (mk.late) cell.classList.add('has-late');
        var dots = el('i', 'pc-dots');
        for (var i = 0; i < Math.min(3, mk.open); i++) dots.appendChild(el('b', i === 0 && mk.high ? 'hi' : (mk.late ? 'late' : '')));
        if (!mk.open && mk.done) dots.appendChild(el('b', 'ok'));
        if (mk.notes) dots.appendChild(el('b', 'note'));
        cell.appendChild(dots);
        var parts = [];
        if (mk.open) parts.push(mk.open + ' ' + plural(mk.open, 'дело', 'дела', 'дел'));
        if (mk.done) parts.push('выполнено: ' + mk.done);
        if (mk.notes) parts.push(mk.notes + ' ' + plural(mk.notes, 'заметка', 'заметки', 'заметок'));
        cell.title += ' · ' + parts.join(', ');
        if (cell.hasAttribute('aria-label')) cell.setAttribute('aria-label', cell.title);
      }
      function tasksDayDetail(box, y, m, d) {
        if (!tasks || !$('tasks-card')) return;
        var iso = y + '-' + pad(m + 1) + '-' + pad(d);
        var list = tForDay(iso).sort(function (a, b) { return tSortKey(a) < tSortKey(b) ? -1 : 1; });
        var wrap = el('div', 'pc-day-tasks');
        if (list.length) {
          var ul = el('ul');
          list.slice(0, 5).forEach(function (t) {
            var li = el('li', (tIsTask(t) ? 'p-' + (t.prio || 'normal') : 'note') + (t.done ? ' done' : ''));
            li.appendChild(el('span', 'mk', tIsTask(t) ? (t.done ? '✓' : '•') : '✎'));
            li.appendChild(el('span', '', (t.time ? t.time + ' ' : '') + cut(t.text, 70)));
            ul.appendChild(li);
          });
          if (list.length > 5) ul.appendChild(el('li', 'more', 'и ещё ' + (list.length - 5)));
          wrap.appendChild(ul);
        }
        var add = el('button', 'mini-btn', list.length ? 'Дела дня →' : '+ Дело на этот день');
        add.type = 'button';
        add.addEventListener('click', function () {
          tasksSetDay(iso);
          if (!list.length) { setTaskMode('task'); $('tasks-due').value = iso; tasksHintDate(); $('tasks-text').focus(); }
          $('tasks-card').scrollIntoView({ block: 'nearest', behavior: settings.motion ? 'smooth' : 'auto' });
        });
        wrap.appendChild(add);
        box.appendChild(wrap);
      }
      // Клик по дню в календаре показывает его дела в карточке «Дела».
      function tasksPickDay(x) {
        var iso = x.y + '-' + pad(x.m + 1) + '-' + pad(x.d);
        tasksSetDay(tasks.day === iso ? '' : iso, true);
      }
      function tasksSetDay(iso, fromCalendar) {
        tasks.day = iso || '';
        if (!fromCalendar) {
          var d = tParse(iso);
          if (d && d.getFullYear() >= PC_FIRST && d.getFullYear() <= PC_LAST) { pcState.y = d.getFullYear(); pcState.m = d.getMonth(); pcState.sel = d.getDate(); }
          else if (!iso) pcState.sel = 0;
          renderProdCalendar(true);
        }
        if (iso && !tasks.editId && !$('tasks-text').value) { $('tasks-due').value = iso; tasksHintDate(); }
        renderTasks();
      }

      /* Карточка «Дела» */
      function tasksChanged() {
        renderTasks();
        if (typeof renderProdCalendar === 'function') renderProdCalendar(true);
      }
      function tasksFilterList() {
        var today = tToday(), week = tAddDays(today, 7);
        var list;
        if (tasks.day) list = tForDay(tasks.day);
        else if (tasks.filter === 'notes') list = tasks.items.filter(function (t) { return !tIsTask(t); });
        else if (tasks.filter === 'done') list = tasks.items.filter(function (t) { return tIsTask(t) && t.done; });
        else if (tasks.filter === 'today') list = tOpen().filter(function (t) { return t.due && t.due <= today; });
        else if (tasks.filter === 'week') list = tOpen().filter(function (t) { return t.due && t.due <= week; });
        else list = tOpen();
        if (tasks.filter === 'done' && !tasks.day) return list.sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); }).slice(0, 60);
        if (tasks.filter === 'notes' && !tasks.day) return list.sort(function (a, b) { return (b.upd || b.t || 0) - (a.upd || a.t || 0); });
        return list.sort(function (a, b) {
          if (!!a.done !== !!b.done) return a.done ? 1 : -1;
          if (tIsTask(a) !== tIsTask(b)) return tIsTask(a) ? -1 : 1;
          return tSortKey(a) < tSortKey(b) ? -1 : (tSortKey(a) > tSortKey(b) ? 1 : 0);
        });
      }
      function renderTasks() {
        var listBox = $('tasks-list');
        if (!listBox) return;
        var today = tToday();
        var open = tOpen();
        var late = open.filter(tLate).length;
        var dueToday = open.filter(function (t) { return t.due === today; }).length;
        $('tasks-meta').textContent = open.length ? open.length + ' ' + plural(open.length, 'открытое', 'открытых', 'открытых') + (late ? ' · ' + late + ' просроч.' : '') : 'всё сделано';
        $('tasks-meta').classList.toggle('late', late > 0);
        var counts = { all: open.length, today: open.filter(function (t) { return t.due && t.due <= today; }).length,
          week: open.filter(function (t) { return t.due && t.due <= tAddDays(today, 7); }).length,
          notes: tasks.items.filter(function (t) { return !tIsTask(t); }).length, done: tasks.items.filter(function (t) { return tIsTask(t) && t.done; }).length };
        each(document.querySelectorAll('[data-tf]'), function (b) {
          var f = b.getAttribute('data-tf');
          b.setAttribute('aria-selected', String(!tasks.day && f === tasks.filter));
          var c = b.querySelector('i');
          if (c) c.textContent = counts[f] ? String(counts[f]) : '';
        });
        var dayBar = $('tasks-day');
        dayBar.hidden = !tasks.day;
        if (tasks.day) {
          var x = tDayInfo(tasks.day);
          $('tasks-day-text').textContent = cap(tDateWords(tasks.day, true)) + (x ? ' · ' + (pcIsWork(x) ? (x.type === 'short' ? 'сокращённый день' : 'рабочий день') : (x.name || 'выходной')) : '');
        }
        listBox.textContent = '';
        var list = tasksFilterList();
        if (!list.length) {
          var empty = el('li', 'tasks-empty');
          empty.textContent = tasks.day ? 'На этот день ничего нет. Добавьте дело формой выше.'
            : ({ notes: 'Заметок пока нет.', done: 'Выполненных дел пока нет.', today: 'На сегодня дел нет. Можно выдохнуть.', week: 'На неделю ничего не запланировано.' }[tasks.filter]
              || 'Дел нет. Добавьте первое или попросите Яэри в чате: «запиши дело на завтра…»');
          listBox.appendChild(empty);
        }
        list.forEach(function (t) { listBox.appendChild(taskRow(t, today)); });
        $('tasks-foot-text').textContent = dueToday ? 'Сегодня ' + dueToday + ' ' + plural(dueToday, 'дело', 'дела', 'дел') : (online ? 'Хранится в data/tasks.json' : 'Хранится в этом браузере');
      }
      function taskRow(t, today) {
        var isTask = tIsTask(t);
        var li = el('li', 'task ' + (isTask ? 'p-' + (t.prio || 'normal') : 'note') + (t.done ? ' done' : '') + (tLate(t) ? ' late' : '') + (t.id === tasks.editId ? ' editing' : ''));
        if (isTask) {
          var chk = el('button', 't-check');
          chk.type = 'button';
          chk.setAttribute('role', 'checkbox');
          chk.setAttribute('aria-checked', String(!!t.done));
          chk.setAttribute('aria-label', (t.done ? 'Вернуть в работу: ' : 'Выполнено: ') + t.text);
          chk.addEventListener('click', function () {
            tasksSave({ id: t.id, done: !t.done }).catch(function () {});
            if (!t.done) flash('happy', 1600);
          });
          li.appendChild(chk);
        } else li.appendChild(el('span', 't-note-mark', '✎'));
        var main = el('div', 't-main');
        var txt = el('span', 't-text', t.text);
        main.appendChild(txt);
        var meta = el('span', 't-meta');
        if (t.due) {
          var due = el('button', 't-due' + (tLate(t) ? ' late' : (t.due === today ? ' today' : '')), (tLate(t) ? 'просрочено · ' : '') + tDateWords(t.due, true) + (t.time ? ', ' + t.time : ''));
          due.type = 'button';
          due.title = 'Показать день в календаре';
          due.addEventListener('click', function () { tasksSetDay(t.due); });
          meta.appendChild(due);
          if (isTask && !t.done && !tIsWork(t.due)) meta.appendChild(el('span', 't-off', 'выходной'));
        } else if (isTask) meta.appendChild(el('span', 't-nodue', 'без срока'));
        if (isTask && t.prio === 'high') meta.appendChild(el('span', 't-prio', 'важно'));
        if (t.src === 'yaeri') meta.appendChild(el('span', 't-src', 'от Яэри'));
        main.appendChild(meta);
        li.appendChild(main);
        var acts = el('div', 't-acts');
        function act(label, title, fn) {
          var b = el('button', '', label);
          b.type = 'button';
          b.title = title;
          b.setAttribute('aria-label', title + ': ' + t.text);
          b.addEventListener('click', fn);
          acts.appendChild(b);
        }
        if (isTask && !t.done) {
          act('→', 'На следующий рабочий день', function () {
            var base = t.due && t.due > tToday() ? t.due : tToday();
            tasksSave({ id: t.id, due: tNextWork(base, false) }).catch(function () {});
          });
        }
        act('✎', 'Изменить', function () { tasksEdit(t); });
        act('×', 'Удалить', function () {
          if (!window.confirm('Удалить «' + cut(t.text, 60) + '»?')) return;
          if (tasks.editId === t.id) tasksResetForm();
          tasksDelete(t.id);
        });
        li.appendChild(acts);
        return li;
      }

      /* Форма */
      function setTaskMode(mode) {
        tasks.mode = mode === 'note' ? 'note' : 'task';
        var card = $('tasks-card');
        card.classList.toggle('note-mode', tasks.mode === 'note');
        $('tasks-text').placeholder = tasks.mode === 'note' ? 'Новая заметка…' : 'Новое дело…';
        $('tasks-text').maxLength = tasks.mode === 'note' ? 2000 : 300;
        if (!tasks.editId) $('tasks-submit').textContent = tasks.mode === 'note' ? 'Записать' : 'Добавить';
      }
      function tasksResetForm() {
        tasks.editId = '';
        $('tasks-text').value = '';
        $('tasks-time').value = '';
        $('tasks-prio').value = 'normal';
        $('tasks-due').value = tasks.day || '';
        $('tasks-cancel').hidden = true;
        setTaskMode(tasks.filter === 'notes' ? 'note' : 'task');
        tasksHintDate();
        renderTasks();
      }
      function tasksEdit(t) {
        tasks.editId = t.id;
        setTaskMode(t.kind);
        $('tasks-text').value = t.text;
        $('tasks-due').value = t.due || '';
        $('tasks-time').value = t.time || '';
        $('tasks-prio').value = t.prio || 'normal';
        $('tasks-submit').textContent = 'Сохранить';
        $('tasks-cancel').hidden = false;
        tasksHintDate();
        renderTasks();
        $('tasks-text').focus();
      }
      var tasksHintTimer = 0;
      function tasksFlashHint(text, bad) {
        var h = $('tasks-hint');
        if (!h) return;
        clearTimeout(tasksHintTimer);
        h.textContent = text;
        h.className = 'tasks-hint' + (bad ? ' bad' : ' ok');
        tasksHintTimer = setTimeout(tasksHintDate, 4000);
      }
      function tasksHintDate() {
        var h = $('tasks-hint');
        if (!h) return;
        var iso = $('tasks-due').value;
        h.className = 'tasks-hint';
        if (!iso) { h.textContent = 'без срока'; return; }
        var x = tDayInfo(iso);
        if (!x) { h.textContent = ''; return; }
        if (pcIsWork(x)) { h.textContent = tDateWords(iso, true) + ' · ' + (x.type === 'short' ? 'сокращённый' : 'рабочий'); return; }
        h.className = 'tasks-hint warn';
        h.textContent = tDateWords(iso, true) + ' · ' + (x.name ? x.name.toLowerCase() : 'выходной') + ' → рабочий: ' + tDateWords(tNextWork(iso, true), true);
      }
      function tasksSubmit() {
        var text = $('tasks-text').value.trim();
        if (!text) { $('tasks-text').focus(); return; }
        var fields = { text: text, due: $('tasks-due').value || '' };
        if (tasks.mode === 'task') { fields.time = fields.due ? $('tasks-time').value || '' : ''; fields.prio = $('tasks-prio').value; }
        if (tasks.editId) fields.id = tasks.editId; else fields.kind = tasks.mode;
        var wasEdit = !!tasks.editId;
        tasksSave(fields).then(function (item) {
          tasksFlashHint(wasEdit ? 'Сохранено.' : (item.kind === 'note' ? 'Заметка записана.' : 'Дело добавлено' + (item.due ? ' на ' + tDateWords(item.due) : '') + '.'));
          flash('happy', 1600);
        }).catch(function () {});
        tasksResetForm();
        $('tasks-text').focus();
      }
      $('tasks-form').addEventListener('submit', function (e) { e.preventDefault(); tasksSubmit(); });
      $('tasks-text').addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && tasks.editId) { e.preventDefault(); tasksResetForm(); }
      });
      $('tasks-cancel').addEventListener('click', tasksResetForm);
      $('tasks-due').addEventListener('input', tasksHintDate);
      $('tasks-workday').addEventListener('click', function () {
        // От выбранной даты (или сегодня) к ближайшему рабочему; повторное нажатие — на следующий рабочий.
        var cur = $('tasks-due').value;
        var next = tNextWork(cur || tToday(), true);
        if (next === cur) next = tNextWork(cur, false);
        $('tasks-due').value = next;
        tasksHintDate();
      });
      each(document.querySelectorAll('[data-tf]'), function (b) {
        b.addEventListener('click', function () {
          tasks.filter = b.getAttribute('data-tf');
          if (tasks.day) { tasks.day = ''; pcState.sel = 0; renderProdCalendar(true); }
          if (!tasks.editId) setTaskMode(tasks.filter === 'notes' ? 'note' : 'task');
          renderTasks();
        });
      });
      $('tasks-day-clear').addEventListener('click', function () { tasksSetDay(''); });
      $('tasks-ask').addEventListener('click', function () {
        var q = tasks.day ? 'Что у меня по делам на ' + tDateWords(tasks.day) + '?' : 'Что у меня по делам? Что горит в первую очередь?';
        send(q);
      });

      /* Связь с чатом */
      // Ближайшие дни по производственному календарю: Яэри по ним выбирает рабочие дни для сроков.
      function tasksCalendarDays(n) {
        var out = [];
        var d = new Date();
        for (var i = 0; i < n; i++) {
          var x = pcDay(d.getFullYear(), d.getMonth(), d.getDate());
          out.push({ d: tIso(d), type: x.type, name: x.name || '' });
          d.setDate(d.getDate() + 1);
        }
        return out;
      }
      function tasksAfterReply(m) {
        if (!m || !Array.isArray(m.tasks) || !m.tasks.length) return false;
        tasksLoad();
        return true;
      }
      // Без сервера Яэри понимает простые просьбы: «добавь дело …», «что у меня на завтра», «закрой …», «перенеси … на …».
      var WD_WORDS = ['понедельник', 'вторник', 'сред', 'четверг', 'пятниц', 'суббот', 'воскресень'];
      function tasksParseWhen(text) {
        var s = ' ' + text.toLowerCase() + ' ';
        var today = tToday(), due = '', time = '', m;
        if (/послезавтра/.test(s)) due = tAddDays(today, 2);
        else if (/завтра/.test(s)) due = tAddDays(today, 1);
        else if (/сегодня/.test(s)) due = today;
        else if (/ближайш\S* рабоч/.test(s)) due = tNextWork(today, false);
        else if ((m = s.match(/(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/))) {
          var y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
          var dt = new Date(y, +m[2] - 1, +m[1]);
          if (!m[3] && tIso(dt) < today) dt.setFullYear(y + 1);
          due = tIso(dt);
        } else {
          for (var i = 0; i < 7; i++) {
            if (new RegExp('(?:^|\\s)(?:в|во|на)\\s+' + WD_WORDS[i]).test(s)) {
              var cur = (new Date().getDay() + 6) % 7;
              due = tAddDays(today, ((i - cur + 7) % 7) || 7);
              break;
            }
          }
        }
        if ((m = s.match(/\sв\s(\d{1,2})[:.](\d{2})/)) || (m = s.match(/\s(\d{1,2}):(\d{2})/))) time = pad(+m[1]) + ':' + m[2];
        return { due: due, time: due ? time : '' };
      }
      function tasksStripWhen(text) {
        return text.replace(/\s*(на\s+)?(послезавтра|завтра|сегодня)/gi, '').replace(/\s*(на\s+)?ближайш\S*\s+рабоч\S*\s+день/gi, '')
          .replace(/\s*(к|на|до)?\s*\d{1,2}[.\/]\d{1,2}([.\/]\d{2,4})?/g, '').replace(/\s*(в|во|на)\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)/gi, '')
          .replace(/\s*в\s+\d{1,2}[:.]\d{2}/g, '').replace(/\s*(срочно|важно)[!,.]?/gi, '').replace(/^[\s:,—-]+|[\s,.—-]+$/g, '');
      }
      function tasksFindByText(q) {
        q = q.toLowerCase().replace(/[«»"]/g, '').trim();
        if (q.length < 3) return null;
        var open = tOpen();
        for (var i = 0; i < open.length; i++) { var tx = open[i].text.toLowerCase(); if (tx.indexOf(q) > -1 || q.indexOf(tx) > -1) return open[i]; }
        return null;
      }
      function tasksListText(list) {
        return list.map(function (t) { return '• ' + t.text + (t.due ? ' — ' + (tLate(t) ? 'просрочено, ' : '') + tDateWords(t.due) + (t.time ? ' ' + t.time : '') : '') + (t.prio === 'high' ? ' (важно)' : ''); }).join('\n');
      }
      function tasksDemoCommand(message) {
        var s = message.trim(), m;
        if ((m = s.match(/^(?:пожалуйста[,\s]+)?(?:добавь|создай|запиши|запланируй|напомни)(?:\s+мне)?(?:\s+(?:дело|задачу|задача))?[:\s]+(.{2,})$/i))) {
          var body = m[1];
          if (/^заметк/i.test(body)) {
            var nt = body.replace(/^заметк\S*[:\s]*/i, '').trim();
            if (!nt) return '';
            tasksNewLocal({ kind: 'note', text: nt, src: 'yaeri' });
            tasksLocalSave(); tasksChanged();
            return 'Записала заметку в «Дела».';
          }
          var w = tasksParseWhen(body);
          var text = tasksStripWhen(body) || body;
          var item = tasksNewLocal({ kind: 'task', text: text.charAt(0).toUpperCase() + text.slice(1), due: w.due, time: w.time, prio: /срочно|важно/i.test(body) ? 'high' : 'normal', src: 'yaeri' });
          tasksLocalSave(); tasksChanged();
          var warn = item.due && !tIsWork(item.due) ? ' Это выходной; ближайший рабочий — ' + tDateWords(tNextWork(item.due, true), true) + '.' : '';
          return 'Записала дело «' + item.text + '»' + (item.due ? ' на ' + tDateWords(item.due, true) + (item.time ? ', ' + item.time : '') : ' без срока') + '.' + warn;
        }
        if (/^(?:что|какие)(?:\s|$).*(?:дел|задач|план|у меня|запланир)/i.test(s) || /^мои дела/i.test(s)) {
          var w2 = tasksParseWhen(s);
          var list = w2.due ? tOpen().filter(function (t) { return t.due === w2.due || (w2.due === tToday() && tLate(t)); }) : tOpen();
          list.sort(function (a, b) { return tSortKey(a) < tSortKey(b) ? -1 : 1; });
          if (!list.length) return w2.due ? 'На ' + tDateWords(w2.due) + ' дел нет.' : 'Открытых дел нет.';
          return (w2.due ? 'На ' + tDateWords(w2.due) + ':' : 'Ваши дела:') + '\n' + tasksListText(list.slice(0, 12));
        }
        if ((m = s.match(/^(?:закрой|выполнено|сделал[аи]?|готово|отметь)[:\s]+(.+)$/i))) {
          var t = tasksFindByText(m[1].replace(/\s*(как\s+)?(выполнен\S*|сделан\S*)$/i, ''));
          if (!t) return 'Не нашла такое дело среди открытых.';
          t.done = true; t.doneAt = Date.now(); t.upd = Date.now();
          tasksLocalSave(); tasksChanged();
          return 'Отметила выполненным: «' + t.text + '».';
        }
        if ((m = s.match(/^(?:перенеси|сдвинь)\s+(.+?)\s+на\s+(.+)$/i))) {
          var t2 = tasksFindByText(m[1]);
          if (!t2) return 'Не нашла такое дело среди открытых.';
          var w3 = tasksParseWhen('на ' + m[2]);
          if (!w3.due && /рабоч/i.test(m[2])) w3.due = tNextWork(t2.due && t2.due > tToday() ? t2.due : tToday(), false);
          if (!w3.due) return 'Не поняла, на какую дату перенести.';
          t2.due = w3.due; if (w3.time) t2.time = w3.time; t2.upd = Date.now();
          tasksLocalSave(); tasksChanged();
          return 'Перенесла «' + t2.text + '» на ' + tDateWords(t2.due, true) + '.';
        }
        return '';
      }

      /* Напоминания о сроках */
      function tasksRemindState() {
        var st = load(TASKS_REMIND_KEY);
        if (!st || st.day !== tToday()) st = { day: tToday(), digest: false, ids: [] };
        return st;
      }
      function tasksRemind(text) {
        bubble({ role: 'assistant', kind: 'remind', text: text, t: Date.now() }, true);
        flash('remind', 4200);
        try {
          if (document.hidden && window.Notification && Notification.permission === 'granted') new Notification('Яэри напоминает', { body: text, tag: 'yaeri-tasks' });
        } catch (error) { /* Уведомления недоступны. */ }
      }
      function tasksRemindCheck(startup) {
        if (!tasks.loaded) return;
        var st = tasksRemindState();
        var today = tToday();
        var open = tOpen();
        // Сводка — один раз в день: при открытии страницы или с наступлением нового дня.
        if (startup && !st.digest) {
          var late = open.filter(tLate), now = open.filter(function (t) { return t.due === today; });
          if (late.length || now.length) {
            var parts = [];
            if (now.length) parts.push('Сегодня ' + now.length + ' ' + plural(now.length, 'дело', 'дела', 'дел') + ':\n' + tasksListText(now.slice(0, 6)));
            if (late.length) parts.push('Просрочено ' + late.length + ':\n' + tasksListText(late.slice(0, 6)));
            setTimeout(function () { tasksRemind(settings.name + ', напоминаю о делах. ' + parts.join('\n')); }, 2500);
            st.digest = true;
          }
        }
        // Дело со временем: напоминаем за 15 минут.
        var nowMs = Date.now();
        open.forEach(function (t) {
          if (t.due !== today || !t.time || st.ids.indexOf(t.id) > -1) return;
          var p = t.time.split(':');
          var at = new Date(); at.setHours(+p[0], +p[1], 0, 0);
          var left = at.getTime() - nowMs;
          if (left <= 15 * 60000 && left > -60 * 60000) {
            st.ids.push(t.id);
            tasksRemind(left > 60000 ? 'Через ' + Math.round(left / 60000) + ' мин: «' + t.text + '» (' + t.time + ').' : 'Пора: «' + t.text + '» (' + t.time + ').');
          }
        });
        store(TASKS_REMIND_KEY, st);
      }
      var tasksDayStamp = tToday();
      setInterval(function () {
        tasksRemindCheck(false);
        // В полночь «сегодня», «завтра» и просрочка пересчитываются.
        if (tasksDayStamp !== tToday()) { tasksDayStamp = tToday(); tasksChanged(); tasksHintDate(); tasksRemindCheck(true); }
      }, 30000);
      var bell = $('tasks-bell');
      function syncBell() { bell.hidden = !window.Notification || Notification.permission !== 'default'; }
      bell.addEventListener('click', function () {
        try { Notification.requestPermission().then(syncBell, syncBell); } catch (error) { syncBell(); }
      });
      syncBell();
      setTaskMode('task');
      tasksHintDate();
