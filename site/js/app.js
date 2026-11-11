
    (function () {
      'use strict';
      var CHAT_KEY = 'yaeri_demo_chat_v1';
      var SET_KEY = 'yaeri_settings_v1';
      var NOTES_KEY = 'yaeri_notes_v1';
      var SKILLS_KEY = 'yaeri_skills_v1';
      var BRAIN_KEY = 'yaeri_brain_v1';
      var ACCENTS = ['gold', 'moon', 'fire', 'sakura', 'forest', 'sky'];
      var SIZES = ['sm', 'md', 'lg', 'xl'];
      var DENSITIES = ['tight', 'normal', 'roomy'];
      var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      var DEFAULTS = { name: 'Хозяин', accent: 'gold', size: 'lg', density: 'normal', motion: !reduce, enter: true, time: true, rag: true, remember: true, autoNotes: true, soul: true, care: true, inner: true, selfCheck: true, autoModel: true, model: '' };

      function $(id) { return document.getElementById(id); }
      function each(list, fn) { Array.prototype.forEach.call(list, fn); }
      function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
      }
      var html = document.documentElement;
      var body = document.body;
      var app = $('app');
      var chat = $('chat');
      var form = $('message-form');
      var input = $('message');
      var hint = $('composer-hint');

      function load(key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch (error) { return null; }
      }
      function store(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* Хранилище недоступно. */ }
      }
      function plural(n, one, few, many) {
        var a = Math.abs(n) % 100, b = a % 10;
        if (a > 10 && a < 20) return many;
        if (b > 1 && b < 5) return few;
        if (b === 1) return one;
        return many;
      }
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      function hhmm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
      function dmy(t) {
        try { return new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
        catch (error) { return ''; }
      }
      function cut(text, n) { text = String(text || '').replace(/\s+/g, ' ').trim(); return text.length > n ? text.slice(0, n - 1) + '…' : text; }

      /* ---------- Настройки ---------- */
      function normalize(s) {
        s = s && typeof s === 'object' ? s : {};
        var name = typeof s.name === 'string' ? s.name.trim().slice(0, 30) : '';
        function bool(k) { return typeof s[k] === 'boolean' ? s[k] : DEFAULTS[k]; }
        // Оформление 2: по умолчанию чёрный с золотом и крупный текст (старые настройки переводятся один раз).
        if (!s.look2) { s.accent = 'gold'; if (s.size === 'sm' || s.size === 'md') s.size = 'lg'; }
        return {
          name: name || DEFAULTS.name,
          accent: ACCENTS.indexOf(s.accent) > -1 ? s.accent : DEFAULTS.accent,
          size: SIZES.indexOf(s.size) > -1 ? s.size : DEFAULTS.size,
          density: DENSITIES.indexOf(s.density) > -1 ? s.density : DEFAULTS.density,
          look2: true,
          motion: bool('motion'), enter: bool('enter'), time: bool('time'),
          rag: bool('rag'), remember: bool('remember'), autoNotes: bool('autoNotes'), soul: bool('soul'), care: bool('care'), inner: bool('inner'), selfCheck: bool('selfCheck'), autoModel: bool('autoModel'),
          model: typeof s.model === 'string' ? s.model.slice(0, 120) : DEFAULTS.model
        };
      }
      var settings = normalize(load(SET_KEY));

      var nameField = $('set-name');
      var boxes = { motion: $('set-motion'), enter: $('set-enter'), time: $('set-time'), rag: $('set-rag'), remember: $('set-remember'), autoNotes: $('set-autonotes'), soul: $('set-soul'), care: $('set-care'), inner: $('set-inner'), selfCheck: $('set-selfcheck'), autoModel: $('set-automodel') };

      function applySettings() {
        html.dataset.accent = settings.accent;
        html.dataset.size = settings.size;
        html.dataset.density = settings.density;
        html.dataset.motion = settings.motion ? 'on' : 'off';
        html.dataset.time = settings.time ? 'on' : 'off';
        input.placeholder = 'Напишите Яэри';
        hint.textContent = settings.enter
          ? 'Enter отправляет, Shift+Enter переносит строку.'
          : 'Enter переносит строку, Ctrl+Enter отправляет.';
        if (window.YBrain) YBrain.restyle();
      }
      function syncControls() {
        nameField.value = settings.name;
        Object.keys(boxes).forEach(function (k) { boxes[k].checked = settings[k]; });
        each(document.querySelectorAll('input[name="accent"]'), function (r) { r.checked = r.value === settings.accent; });
        each(document.querySelectorAll('input[name="size"]'), function (r) { r.checked = r.value === settings.size; });
        each(document.querySelectorAll('input[name="density"]'), function (r) { r.checked = r.value === settings.density; });
      }
      function changed() { store(SET_KEY, settings); applySettings(); }

      nameField.addEventListener('input', function () {
        settings.name = nameField.value.trim().slice(0, 30) || DEFAULTS.name;
        changed();
      });
      each(document.querySelectorAll('input[name="accent"]'), function (r) {
        r.addEventListener('change', function () { if (r.checked) { settings.accent = r.value; changed(); } });
      });
      each(document.querySelectorAll('input[name="density"]'), function (r) {
        r.addEventListener('change', function () { if (r.checked) { settings.density = r.value; changed(); } });
      });
      each(document.querySelectorAll('input[name="size"]'), function (r) {
        r.addEventListener('change', function () { if (r.checked) { settings.size = r.value; changed(); } });
      });
      Object.keys(boxes).forEach(function (k) {
        boxes[k].addEventListener('change', function () {
          settings[k] = boxes[k].checked;
          changed();
          if (k === 'soul' && online) {
            api('soul/evolution', { enabled: settings.soul }).then(loadEvolution).catch(function () {});
          }
        });
      });
      $('reset-settings').addEventListener('click', function () {
        settings = normalize(null);
        syncControls();
        changed();
      });
      $('about-host').textContent = location.host || 'файл на этом компьютере';

      /* ---------- Панель настроек ---------- */
      var drawer = $('settings');
      var openBtn = $('open-settings');
      var closeBtn = $('close-settings');

      function isOpen() { return body.classList.contains('settings-open'); }
      function openSettings(target) {
        body.classList.add('settings-open');
        app.inert = true;
        openBtn.setAttribute('aria-expanded', 'true');
        var node = target && $(target);
        if (node && node.offsetParent !== null) {
          node.scrollIntoView({ block: 'center' });
          node.focus({ preventScroll: true });
        } else {
          drawer.querySelector('.drawer-body').scrollTop = 0;
          closeBtn.focus();
        }
      }
      function closeSettings() {
        body.classList.remove('settings-open');
        app.inert = false;
        openBtn.setAttribute('aria-expanded', 'false');
        openBtn.focus();
      }
      openBtn.addEventListener('click', function () { openSettings(); });
      closeBtn.addEventListener('click', closeSettings);
      $('scrim').addEventListener('click', closeSettings);
      document.addEventListener('keydown', function (event) {
        if (!isOpen()) return;
        if (event.key === 'Escape') { event.preventDefault(); closeSettings(); return; }
        if (event.key !== 'Tab') return;
        var items = Array.prototype.filter.call(
          drawer.querySelectorAll('button, input, select, [href], [tabindex]:not([tabindex="-1"])'),
          function (node) { return !node.disabled && node.offsetParent !== null; }
        );
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });

      /* ---------- Разделы: командный центр и второй мозг ---------- */
      var views = { deck: { tab: $('tab-deck'), panel: $('deck'), name: 'Командный центр' }, brain: { tab: $('tab-brain'), panel: $('brain'), name: 'Второй мозг' }, soul: { tab: $('tab-soul'), panel: $('soul'), name: 'Душа' } };
      function viewFromHash() { var h = location.hash.slice(1); return views[h] ? h : 'deck'; }
      var currentView = 'deck';
      function showView(name, fromHash) {
        if (!views[name]) name = 'deck';
        currentView = name;
        Object.keys(views).forEach(function (k) {
          var v = views[k];
          v.tab.setAttribute('aria-selected', k === name ? 'true' : 'false');
          v.panel.hidden = k !== name;
        });
        $('view-name').textContent = views[name].name;
        document.title = 'Яэри — ' + views[name].name.toLowerCase();
        if (!fromHash) {
          var hash = name === 'deck' ? '' : '#' + name;
          if (location.hash !== hash) history_.replaceState(null, '', hash || location.pathname + location.search);
        }
        if (window.YBrain) YBrain.onShow(name);
        if (name === 'soul') { renderSoul(); if (online) { loadEvolution(); loadGrowth(); loadUnderstanding(); loadDepth(); } }
        syncFab();
        if (!fromHash && window.scrollY) window.scrollTo(0, 0);
      }
      var history_ = window.history;
      $('tab-deck').addEventListener('click', function () { showView('deck'); });
      $('tab-brain').addEventListener('click', function () { showView('brain'); });
      $('tab-soul').addEventListener('click', function () { showView('soul'); });
      $('brand').addEventListener('click', function (event) { event.preventDefault(); showView('deck'); });
      window.addEventListener('hashchange', function () { showView(viewFromHash(), true); });

      /* ---------- Режим работы ---------- */
      // online: сервер Яэри отвечает и ключ Cloud.ru задан; иначе демо-режим.
      var online = false;
      var serverStatus = null;
      var statusPill = $('status');
      var statusText = $('status-text');
      var panelHint = $('panel-hint');
      var modelSelect = $('model');
      var sendBtn = $('send');

      function pollJob(id, attempt) {
        if (attempt >= 900) return Promise.reject(new Error('AI-задача слишком долго выполняется. Проверьте сервер Яэри.'));
        return new Promise(function (resolve) { setTimeout(resolve, 750); }).then(function () {
          return api('jobs/' + id, undefined, true);
        }).then(function (state) {
          if (state.pending) return pollJob(id, attempt + 1);
          if (state.ready) return state.result;
          throw new Error('AI-задача завершилась без результата.');
        });
      }
      function api(path, payload, rawJobStatus) {
        var opts = { method: 'GET', cache: 'no-store' };
        if (payload !== undefined) {
          opts.method = 'POST';
          opts.headers = { 'Content-Type': 'application/json' };
          opts.body = JSON.stringify(payload);
        }
        return fetch('/api/' + path, opts).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (!r.ok) throw new Error(data.error || ('Ошибка сервера: ' + r.status));
            return data;
          });
        }).then(function (data) {
          if (!rawJobStatus && data.pending && data.jobId) return pollJob(data.jobId, 0);
          return data;
        });
      }
      function shortModel(id) {
        id = String(id || '');
        return id.slice(id.lastIndexOf('/') + 1) || id;
      }
      function showServerParts(on) {
        each(document.querySelectorAll('.server-only'), function (node) { node.hidden = !on; });
      }
      function setStatus(kind, text, title) {
        statusPill.classList.toggle('online', kind === 'online');
        statusPill.classList.toggle('warn', kind === 'warn');
        statusText.textContent = text;
        statusPill.title = title;
      }
      function applyMode() {
        showServerParts(online);
        body.classList.toggle('is-online', online);
        $('connect-banner').hidden = online || location.protocol === 'file:';
        if (online) {
          if (serverStatus && serverStatus.offline) {
            setStatus('online', 'Офлайн · память', 'Автономный режим: облачные запросы запрещены. Генерация возможна только с локальной GGUF-моделью.');
            $('ai-note').textContent = 'Яэри использует локальную память. Для свободной генерации можно отдельно подключить llama.cpp с GGUF-моделью.';
          } else {
            setStatus('online', 'Cloud.ru · онлайн', 'AI подключён: Cloud.ru Foundation Models. Нажмите, чтобы открыть подключение');
            $('ai-note').textContent = 'Яэри подключена к Cloud.ru. Здесь можно решить, что ей запоминать и где искать ответы.';
          }
          $('about-model').textContent = modelSelect.value || serverStatus.chatModel;
          $('about-embed').textContent = serverStatus.embeddingModel;
          $('about-storage').textContent = 'папка data на этом компьютере';
        } else {
          setStatus(serverStatus ? 'warn' : '', location.protocol === 'file:' ? 'Демо-режим' : 'Подключить AI', serverStatus ? 'Ключ Cloud.ru не задан. Нажмите, чтобы подключить' : 'Сервер Яэри не найден: запустите Yaeri.bat');
          $('ai-note').textContent = 'Эти настройки появятся, когда Яэри подключится к Cloud.ru.';
          $('about-model').textContent = 'не подключена';
          $('about-embed').textContent = '—';
          $('about-storage').textContent = 'только в этом браузере';
        }
        renderConn();
      }

      /* ---------- Подключение: ключ и модель в настройках ---------- */
      var keyForm = $('key-form');
      var keyField = $('set-key');
      var keyStatus = $('key-status');
      var keyBusy = false;
      var statusError = '';
      function keyMsg(text, kind) {
        keyStatus.textContent = text || '';
        keyStatus.className = 'form-status' + (kind ? ' ' + kind : '');
      }
      function renderConn(checkText) {
        var state = $('conn-state');
        var src = serverStatus && serverStatus.keySource;
        // Поле ключа видно всегда, когда сайт открыт через Yaeri.bat (http), даже если статус не пришёл.
        var served = location.protocol !== 'file:';
        keyForm.hidden = !served;
        $('no-server-note').hidden = served;
        state.classList.toggle('ok', online);
        state.classList.toggle('warn', !!serverStatus && !online);
        if (!serverStatus) $('conn-state-text').textContent = !served ? 'Сайт открыт как файл, без сервера Яэри' : ('Сервер Яэри не ответил на проверку' + (statusError ? ': ' + statusError : '') + '. Ключ всё равно можно вставить ниже.');
        else if (online) $('conn-state-text').textContent = checkText || ('Подключено' + (src === 'env' ? ' (ключ из переменной CLOUDRU_API_KEY)' : '') + ' · ' + shortModel(modelSelect.value || serverStatus.chatModel));
        else $('conn-state-text').textContent = 'Ключ не задан: Яэри работает в демо-режиме';
        $('key-label').textContent = online ? 'Заменить ключ' : 'API-ключ';
        keyField.placeholder = online ? 'Новый ключ (старый сохранён и скрыт)' : 'Вставьте ключ Cloud.ru';
        $('key-test').hidden = !online;
        $('key-remove').hidden = !online || src !== 'file';
      }
      function applyConfig(st) {
        serverStatus = st;
        var wasOnline = online;
        if (st.configured && !wasOnline) return startOnline();
        if (!st.configured && wasOnline) { startDemo(); return Promise.resolve(); }
        applyMode();
        if (st.configured) loadModels().catch(function () {});
        return Promise.resolve();
      }
      function busyKey(on) {
        keyBusy = on;
        each(keyForm.querySelectorAll('button'), function (b) { b.disabled = on; });
      }
      keyForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var key = keyField.value.trim();
        if (keyBusy) return;
        if (!key) { keyMsg('Вставьте ключ в поле выше.', 'err'); keyField.focus(); return; }
        busyKey(true);
        keyMsg('Сохраняю и проверяю связь с Cloud.ru…');
        api('config', { apiKey: key }).then(function (st) {
          keyField.value = '';
          keyField.type = 'password';
          $('key-eye').setAttribute('aria-pressed', 'false');
          return api('config/test', {}).then(function (check) {
            return applyConfig(st).then(function () {
              if (check.ok) {
                keyMsg('Готово: ключ сохранён, Cloud.ru ответил (' + check.models + ' ' + plural(check.models, 'модель', 'модели', 'моделей') + '). Выберите модель ниже.', 'ok');
                showModelPick();
              } else {
                keyMsg('Ключ сохранён, но Cloud.ru его не принял: ' + (check.error || 'нет ответа') + '. Проверьте ключ и сохраните ещё раз.', 'err');
              }
            });
          });
        }).catch(function (error) { keyMsg(error.message, 'err'); })
          .then(function () { busyKey(false); });
      });
      $('key-eye').addEventListener('click', function () {
        var show = keyField.type === 'password';
        keyField.type = show ? 'text' : 'password';
        this.setAttribute('aria-pressed', show ? 'true' : 'false');
        this.setAttribute('aria-label', show ? 'Скрыть ключ' : 'Показать ключ');
      });
      $('key-test').addEventListener('click', function () {
        busyKey(true);
        keyMsg('Проверяю связь…');
        api('config/test', {}).then(function (r) {
          if (r.ok) keyMsg('Связь есть: Cloud.ru отвечает, доступно ' + r.models + ' ' + plural(r.models, 'модель', 'модели', 'моделей') + '.', 'ok');
          else keyMsg('Нет связи: ' + r.error, 'err');
        }).catch(function (error) { keyMsg(error.message, 'err'); })
          .then(function () { busyKey(false); });
      });
      $('key-remove').addEventListener('click', function () {
        if (!window.confirm('Удалить ключ Cloud.ru с этого компьютера? Яэри перейдёт в демо-режим. Память и переписка останутся.')) return;
        busyKey(true);
        api('config', { apiKey: '' }).then(function (st) {
          return applyConfig(st).then(function () {
            keyMsg(st.configured ? 'Ключ из файла удалён, но задан ещё в переменной CLOUDRU_API_KEY.' : 'Ключ удалён.', st.configured ? 'err' : 'ok');
          });
        }).catch(function (error) { keyMsg(error.message, 'err'); })
          .then(function () { busyKey(false); });
      });
      statusPill.addEventListener('click', function () { openSettings(online ? 'model' : 'set-key'); });
      $('connect-open').addEventListener('click', function () { openSettings('set-key'); });
      $('model-chip').addEventListener('click', function () { openSettings('model'); });

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
        pcFillGrid($('pc-grid'), y, m, { buttons: true, sel: pcState.sel, onPick: function (x) {
          pcState.sel = pcState.sel === x.d ? 0 : x.d;
          tasksPickDay(x);
          renderProdCalendar(true);
          // Дела выбранного дня показывает карточка «Дела» справа.
        } });
        // Подпись под сеткой: выбранный день, иначе ближайший праздник месяца.
        var detail = $('pc-detail');
        if (sel) detail.innerHTML = pcDayText(pcDay(y, m, sel));
        else {
          var hols = [];
          var n = new Date(y, m + 1, 0).getDate();
          for (var d = 1; d <= n; d++) { var x = pcDay(y, m, d); if (x.type === 'hol' || x.type === 'move') hols.push(x); }
          detail.innerHTML = hols.length ? pcDayText(hols[0]) + (hols.length > 1 ? ' И ещё ' + (hols.length - 1) + ' нерабоч. ' + plural(hols.length - 1, 'день', 'дня', 'дней') + ' в месяце.' : '') : 'В этом месяце нет праздников и переносов. Нажмите на день, чтобы узнать подробности.';
        }
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
        // Цифры-барабаны и полоса прошедшей части суток.
        var sec = now.getSeconds();
        var digits = pad(now.getHours()) + pad(now.getMinutes()) + pad(sec);
        ['h1', 'h2', 'm1', 'm2', 's1', 's2'].forEach(function (k, i) { clockDigit(k, +digits.charAt(i)); });
        clockFx(now);
        var dayPart = (now.getHours() * 3600 + now.getMinutes() * 60 + sec) / 86400;
        $('dday-fill').style.width = (dayPart * 100).toFixed(2) + '%';
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
      // Перекидные часы: верхняя половина старой цифры падает, снизу раскрывается новая.
      var clockCells = {};
      function flapHalf(cls, d) { var h = el('span', 'fl ' + cls); h.appendChild(el('b', '', String(d))); return h; }
      each(document.querySelectorAll('.dclock .dg'), function (cell) {
        clockCells[cell.getAttribute('data-d')] = { cell: cell, v: -1, timer: 0 };
      });
      function clockDigit(key, v) {
        var c = clockCells[key];
        if (!c || c.v === v) return;
        var old = c.v < 0 ? v : c.v, cell = c.cell;
        clearTimeout(c.timer);
        cell.textContent = '';
        cell.appendChild(flapHalf('top', v));
        cell.appendChild(flapHalf('bot', old));
        if (settings.motion && c.v >= 0) {
          cell.appendChild(flapHalf('ftop', old));
          cell.appendChild(flapHalf('fbot', v));
          c.timer = setTimeout(function () {
            cell.textContent = '';
            cell.appendChild(flapHalf('top', v));
            cell.appendChild(flapHalf('bot', v));
          }, 620);
        } else {
          cell.replaceChild(flapHalf('bot', v), cell.children[1]);
        }
        c.v = v;
      }
      // Шкала секунд: 60 делений, текущее светится.
      var secTicks = [];
      (function () {
        var bar = $('dsecbar');
        for (var i = 0; i < 60; i++) { var t = el('i', i % 5 === 0 ? 'q' : ''); bar.appendChild(t); secTicks.push(t); }
      }());
      var clockLast = { sec: -1, min: -1 };
      function clockFx(now) {
        var s = now.getSeconds(), m = now.getMinutes();
        if (s !== clockLast.sec) {
          secTicks.forEach(function (t, i) { t.className = (i % 5 === 0 ? 'q' : '') + (i < s ? ' on' : '') + (i === s ? ' cur' : ''); });
          clockLast.sec = s;
        }
        if (m !== clockLast.min) {
          var box = $('dclock');
          if (clockLast.min >= 0 && settings.motion) {
            box.classList.remove('shine');
            void box.offsetWidth;
            box.classList.add('shine');
          }
          // Оттенок свечения по времени суток: ночь, утро, день, вечер.
          var h = now.getHours();
          box.setAttribute('data-part', h < 5 ? 'night' : h < 10 ? 'morning' : h < 18 ? 'day' : h < 22 ? 'evening' : 'night');
          clockLast.min = m;
        }
      }
      tick();
      setInterval(tick, 1000);

      /* ---------- Яэри: позы и настроение ---------- */
      // Базовое настроение держится, пока не сменится (слушает, думает, дремлет);
      // вспышка (рада, смеётся, извиняется) показывается несколько секунд и уходит обратно к базовому.
      var MOODS = {
        idle:   { pose: 'idle',   cap: 'Слушаю вас',          text: 'слушает' },
        listen: { pose: 'listen', cap: 'Внимательно слушаю…', text: 'читает, что вы пишете' },
        think:  { pose: 'think',  cap: 'Думаю…',              text: 'думает' },
        happy:  { pose: 'happy',  cap: 'Готово!',             text: 'ответила' },
        memo:   { pose: 'happy',  cap: 'Записала в память',   text: 'записала в память' },
        greet:  { pose: 'greet',  cap: 'Добро пожаловать',    text: 'приветствует' },
        giggle: { pose: 'giggle', cap: 'Хи-хи, щекотно',      text: 'смеётся' },
        sleep:  { pose: 'sleep',  cap: 'Дремлю… разбудите',   text: 'дремлет' },
        sorry:  { pose: 'sorry',  cap: 'Простите, не вышло',  text: 'извиняется' },
        ponder: { pose: 'think',  cap: 'Думаю о вас…',        text: 'размышляет' },
        miss:   { pose: 'greet',  cap: 'Я скучала!',          text: 'рада вас видеть' },
        grow:   { pose: 'happy',  cap: 'Зажёгся новый хвост!', text: 'растёт' },
        tasks:  { pose: 'happy',  cap: 'Обновила дела',       text: 'обновила дела' },
        remind: { pose: 'greet',  cap: 'Напоминаю о делах',   text: 'напоминает о делах' }
      };
      var stage = $('yaeri-stage');
      var mood = { base: 'idle', cur: '', flash: 0, swap: 0 };
      var poseCache = {};
      function preloadPoses() {
        Object.keys(MOODS).forEach(function (k) {
          var p = MOODS[k].pose;
          if (poseCache[p]) return;
          poseCache[p] = [new Image()];
          poseCache[p][0].src = 'yaeri/' + p + '-face.webp';
        });
      }
      function renderMood(name) {
        var m = MOODS[name] || MOODS.idle;
        var prev = MOODS[mood.cur];
        mood.cur = name;
        $('mood-text').textContent = m.text;
        stage.classList.toggle('busy', name === 'think');
        body.classList.toggle('is-thinking', name === 'think');
        if (prev && prev.pose === m.pose) return;
        each(document.querySelectorAll('.face-img'), function (img) { img.src = 'yaeri/' + m.pose + '-face.webp'; });
      }
      function setBase(name) {
        mood.base = name;
        // «Думаю» важнее любой вспышки: сразу видно, что ответ готовится.
        if (name === 'think') { clearTimeout(mood.flash); mood.flash = 0; }
        if (!mood.flash) renderMood(name);
      }
      function flash(name, ms) {
        if (mood.base === 'think') return;
        clearTimeout(mood.flash);
        renderMood(name);
        mood.flash = setTimeout(function () { mood.flash = 0; renderMood(mood.base); }, ms);
      }
      function restMood() { return input.value.trim() ? 'listen' : 'idle'; }

      // Через три минуты тишины Яэри задрёмывает, любое действие её будит.
      var lastActive = Date.now();
      function wake() {
        lastActive = Date.now();
        if (mood.base === 'sleep') { setBase(restMood()); flash('greet', 2200); }
      }
      ['pointerdown', 'keydown', 'wheel'].forEach(function (type) { document.addEventListener(type, wake, { passive: true }); });
      setInterval(function () {
        if (!pending && mood.base === 'idle' && !mood.flash && !document.hidden && Date.now() - lastActive > 180000) setBase('sleep');
      }, 15000);

      stage.addEventListener('click', function () {
        if (mood.base !== 'think') flash('giggle', 1800);
        input.focus();
      });

      /* ---------- Аватар-кнопка: чат поверх любого раздела ---------- */
      var chatCard = $('chat-card');
      var chatHome = chatCard.parentNode;
      var pop = $('chat-pop');
      var fab = $('yaeri-fab');
      var chatSeen = true;
      function openPop() {
        if (!pop.hidden) return;
        pop.appendChild(chatCard);
        pop.hidden = false;
        body.classList.add('pop-open');
        fab.setAttribute('aria-expanded', 'true');
        fab.setAttribute('aria-label', 'Свернуть чат с Яэри');
        chat.scrollTop = chat.scrollHeight;
        input.focus();
      }
      function closePop(focusFab) {
        if (pop.hidden) return;
        pop.hidden = true;
        body.classList.remove('pop-open');
        chatHome.insertBefore(chatCard, chatHome.firstChild);
        fab.setAttribute('aria-expanded', 'false');
        fab.setAttribute('aria-label', 'Открыть чат с Яэри');
        if (focusFab) fab.focus();
      }
      function syncFab() {
        if (!fab) return;
        if (currentView === 'deck') closePop(false);
        // В командном центре чат и так на виду; кнопка нужна, когда он ушёл за экран или открыт другой раздел.
        fab.hidden = currentView === 'deck' && chatSeen;
      }
      fab.addEventListener('click', function () {
        wake();
        if (currentView === 'deck') {
          chatCard.scrollIntoView({ block: 'start', behavior: settings.motion ? 'smooth' : 'auto' });
          input.focus({ preventScroll: true });
          flash('greet', 1800);
          return;
        }
        if (pop.hidden) { openPop(); flash('greet', 1800); } else closePop(true);
      });
      $('chat-close').addEventListener('click', function () { closePop(true); });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !pop.hidden && !isOpen()) { event.preventDefault(); closePop(true); }
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { if (pop.hidden) { chatSeen = e.isIntersecting; syncFab(); } });
        }, { threshold: 0.15 }).observe(chatCard);
      }

      /* ---------- Чат ---------- */
      var history = [];
      var typingNode = null;
      var pending = 0;
      var timers = [];

      function valid(m) {
        return m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string';
      }
      function save() { if (!online) store(CHAT_KEY, history.slice(-100)); }
      function clock(t) {
        try { return new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
        catch (error) { return ''; }
      }
      function toBottom() {
        chat.scrollTo({ top: chat.scrollHeight, behavior: settings.motion ? 'smooth' : 'auto' });
      }
      function bubble(m, animate) {
        var row = el('div', 'msg ' + (m.role === 'user' ? 'user' : 'assistant') + (m.error ? ' error' : '') + (animate ? ' enter' : ''));
        row.appendChild(el('div', 'who', m.role === 'user' ? settings.name : 'Яэри'));
        if (m.kind === 'thought') { row.classList.add('thought'); row.appendChild(el('div', 'thought-tag', '✦ думала о вас')); }
        if (m.kind === 'remind') { row.classList.add('thought', 'remind'); row.appendChild(el('div', 'thought-tag', '⏰ напоминание о делах')); }
        if (m.kind === 'care') { row.classList.add('thought'); row.appendChild(el('div', 'thought-tag', m.dream ? '☾ мой сон' : (m.slot === 'evening' ? '☾ вечер' : '☀ утро'))); }
        row.appendChild(el('div', 'text', m.text));
        if (Array.isArray(m.remembered) && m.remembered.length) {
          row.appendChild(el('div', 'remembered', '✦ Записала в память: ' + m.remembered.join('; ')));
        }
        if (Array.isArray(m.tasks) && m.tasks.length) {
          var tl = el('button', 'remembered tasks-done', '✓ Дела: ' + m.tasks.join('; '));
          tl.type = 'button';
          tl.title = 'Открыть «Дела»';
          tl.addEventListener('click', function () { if (currentView !== 'deck') showView('deck'); var c = $('tasks-card'); if (c) c.scrollIntoView({ block: 'nearest' }); });
          row.appendChild(tl);
        }
        if (m.inner) {
          var det = el('details', 'inner');
          det.appendChild(el('summary', '', 'мысли Яэри'));
          det.appendChild(el('p', '', m.inner));
          row.appendChild(det);
        }
        if (m.futures && Array.isArray(m.futures.options) && m.futures.options.length) {
          var fd = el('details', 'futures');
          fd.appendChild(el('summary', '', '⟡ прогнала варианты будущего: ' + m.futures.options.length));
          fd.appendChild(futList(m.futures));
          row.appendChild(fd);
        }
        var parts = [];
        if (m.model) parts.push(shortModel(m.model) + (m.route === 'smart' ? ' (умная)' : ''));
        if (Array.isArray(m.skills) && m.skills.length) parts.push('навык: ' + m.skills.join(', '));
        if (m.checked === 'fixed') parts.push('✓ перечитала и поправила себя');
        if (Array.isArray(m.sources) && m.sources.length) {
          parts.push('источники: ' + m.sources.map(function (x) { return x && x.label; }).filter(Boolean).join(', '));
        }
        if (m.note) parts.push(m.note);
        if (parts.length) row.appendChild(el('div', 'meta', parts.join(' · ')));
        if (typeof m.t === 'number') row.appendChild(el('div', 'time', clock(m.t)));
        if (online && m.role === 'assistant' && m.id && !m.kind && !m.error) rateBar(m, row);
        if (typingNode) chat.insertBefore(row, typingNode); else chat.appendChild(row);
        toBottom();
      }
      function add(role, text) {
        var m = { role: role, text: text, t: Date.now() };
        history.push(m);
        bubble(m, true);
        save();
        refreshBrain(300);
      }
      function greet() {
        flash('greet', 3600);
        if (online) {
          // Приветствие только на экране: в базу и в контекст модели оно не попадает.
          bubble({ role: 'assistant', text: 'Здравствуйте, ' + settings.name + '! Я Яэри, ваша восьмихвостая лисица. Я подключена к Cloud.ru, веду рабочую память и помню наши разговоры. Всё, что я знаю, видно в «Рабочей памяти» и во «Втором мозге».', t: Date.now() }, true);
          return;
        }
        add('assistant', 'Здравствуйте, ' + settings.name + '! Я Яэри, ваша восьмихвостая лисица. Сейчас чат работает в демонстрационном режиме: чтобы я отвечала по-настоящему, вставьте API-ключ Cloud.ru в настройках (кнопка «Подключить Cloud.ru» под чатом). Рабочую память можно заполнять уже сейчас.');
      }
      function showTyping() {
        if (typingNode) return;
        typingNode = el('div', 'msg assistant typing');
        typingNode.setAttribute('aria-hidden', 'true');
        for (var n = 0; n < 8; n++) {
          var dot = el('i');
          dot.style.setProperty('--n', n);
          typingNode.appendChild(dot);
        }
        chat.appendChild(typingNode);
        toBottom();
      }
      function hideTyping() {
        if (typingNode) { typingNode.remove(); typingNode = null; }
      }
      function demoReply() {
        pending++;
        showTyping();
        setBase('think');
        var id = setTimeout(function () {
          timers = timers.filter(function (x) { return x !== id; });
          pending--;
          if (!pending) hideTyping();
          add('assistant', settings.name + ', я получила ваше сообщение. Пока ключ Cloud.ru не задан, отвечать по-настоящему я не могу, зато интерфейс, рабочая память и второй мозг уже работают.');
          if (!pending) { setBase(restMood()); flash('happy', 2600); }
        }, settings.motion ? 900 : 250);
        timers.push(id);
      }
      var chatEpoch = 0;
      function aiReply(message) {
        var epoch = chatEpoch;
        var userMsg = { role: 'user', text: message, t: Date.now() };
        history.push(userMsg);
        bubble(userMsg, true);
        pending++;
        sendBtn.disabled = true;
        showTyping();
        setBase('think');
        api('chat', { text: message, model: modelSelect.value, rag: settings.rag, remember: settings.remember, autoNotes: settings.autoNotes, soul: settings.soul, innerVoice: settings.inner, selfCheck: settings.selfCheck, autoModel: settings.autoModel, name: settings.name, tasks: true, days: tasksCalendarDays(21) })
          .then(function (data) {
            if (epoch !== chatEpoch) return;
            var m = data.reply;
            if (data.note) m.note = data.note;
            history.push(m);
            hideTyping();
            bubble(m, true);
            refreshBrain();
            setBase(restMood());
            var tasksTouched = tasksAfterReply(m);
            if (data.soul && data.soul.leveled) flash('grow', 5200);
            else if (tasksTouched) flash('tasks', 4200);
            else if (Array.isArray(m.remembered) && m.remembered.length) flash('memo', 4200);
            else flash('happy', 3200);
            if (data.soul) soulAfterChat(data.soul);
            litSources(m);
          })
          .catch(function (error) {
            if (epoch !== chatEpoch) return;
            hideTyping();
            bubble({ role: 'assistant', error: true, text: 'Не получилось ответить: ' + error.message }, true);
            setBase(restMood());
            flash('sorry', 5000);
          })
          .then(function () {
            pending = Math.max(0, pending - 1);
            if (!pending) sendBtn.disabled = false;
            if (!pending && mood.base === 'think') setBase(restMood());
          });
      }
      function litSources(m) {
        // Подсветить на графе воспоминания, на которые Яэри опиралась в ответе.
        var ids = (Array.isArray(m.sources) ? m.sources : []).map(function (x) { return x && x.id; }).filter(Boolean);
        if (!ids.length || !window.YBrain || !YBrain.light) return;
        // Граф обновится через refreshBrain: подождём, чтобы новые узлы уже были на месте.
        setTimeout(function () { YBrain.light(ids, 9000); }, 900);
      }
      function resetView() {
        timers.forEach(clearTimeout);
        timers = [];
        pending = 0;
        sendBtn.disabled = false;
        hideTyping();
        history = [];
        chat.textContent = '';
        setBase(restMood());
      }
      function clearChat() {
        if (history.length > 1 && !window.confirm(online
          ? 'Очистить переписку? Рабочая память и воспоминания сохранятся, их можно стереть отдельно.'
          : 'Очистить весь разговор?')) return;
        var done = function () {
          chatEpoch++;
          resetView();
          save();
          greet();
          refreshBrain();
          if (!isOpen()) input.focus();
        };
        if (online) {
          api('history/clear', {}).then(done).catch(function (error) { window.alert(error.message); });
        } else {
          done();
        }
      }
      $('clear').addEventListener('click', clearChat);
      $('clear-from-settings').addEventListener('click', clearChat);
      $('clear-memory').addEventListener('click', function () {
        if (!window.confirm('Стереть долговременную память Яэри о прошлых разговорах? Рабочая память и документы останутся.')) return;
        api('memory/clear', {}).then(function () { window.alert('Воспоминания о разговорах стёрты.'); refreshBrain(); })
          .catch(function (error) { window.alert(error.message); });
      });

      function grow() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight + 2, 180) + 'px';
      }
      function send(message) {
        message = String(message || '').trim();
        if (!message) return false;
        if (online && pending) return false;
        if (currentView !== 'deck' && pop.hidden) showView('deck');
        if (online) {
          aiReply(message);
        } else {
          add('user', message);
          var local = tasksDemoCommand(message);
          if (local) {
            add('assistant', local);
            flash('tasks', 3200);
          } else demoReply();
        }
        return true;
      }
      function submit() {
        if (!input.value.trim()) return;
        if (!send(input.value)) return;
        input.value = '';
        grow();
        input.focus();
      }
      form.addEventListener('submit', function (event) { event.preventDefault(); submit(); });
      input.addEventListener('input', function () {
        grow();
        if (mood.base === 'idle' || mood.base === 'listen' || mood.base === 'sleep') setBase(restMood());
      });
      input.addEventListener('keydown', function (event) {
        // Enter во время ввода через IME (японский, китайский) подтверждает слово, а не отправляет.
        if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
        var go = settings.enter ? !event.shiftKey : (event.ctrlKey || event.metaKey);
        if (go) { event.preventDefault(); submit(); }
      });

      /* ---------- Модели ---------- */
      function fillModels(list, preferred) {
        modelSelect.textContent = '';
        list.forEach(function (id) {
          var option = document.createElement('option');
          option.value = id;
          option.textContent = shortModel(id);
          option.title = id;
          modelSelect.appendChild(option);
        });
        modelSelect.value = list.indexOf(preferred) > -1 ? preferred : list[0];
        var smart = $('smart-model');
        var want = (serverStatus && serverStatus.smartModel) || '';
        smart.textContent = '';
        var none = document.createElement('option');
        none.value = '';
        none.textContent = 'нет — всё отвечает основная';
        smart.appendChild(none);
        list.concat(want && list.indexOf(want) < 0 ? [want] : []).forEach(function (id) {
          var o = document.createElement('option');
          o.value = id;
          o.textContent = shortModel(id);
          o.title = id;
          smart.appendChild(o);
        });
        smart.value = want;
        syncSmart();
        syncModel();
        renderConn();
      }
      function loadModels(fresh) {
        if (!modelSelect.options.length) fillModels([serverStatus.chatModel], serverStatus.chatModel);
        return (fresh ? api('models/refresh', {}) : api('models')).then(function (data) {
          var list = Array.isArray(data.models) && data.models.length ? data.models : [serverStatus.chatModel];
          fillModels(list, settings.model || data.default);
          $('model-note').textContent = data.error
            ? 'Полный список моделей не загрузился: ' + data.error
            : 'Загружено из Cloud.ru: ' + list.length + ' ' + plural(list.length, 'модель', 'модели', 'моделей') + '. Выбор сохраняется на этом компьютере.';
          return data;
        }).catch(function (error) {
          $('model-note').textContent = 'Список моделей не загрузился: ' + error.message;
          throw error;
        });
      }
      function showModelPick() {
        var pick = drawer.querySelector('.model-pick');
        if (!pick || pick.hidden || !isOpen()) return;
        pick.scrollIntoView({ block: 'nearest', behavior: settings.motion ? 'smooth' : 'auto' });
      }
      // «Загрузить модели»: с новым ключом в поле сначала сохраняет его, иначе обновляет список текущим ключом.
      $('key-models').addEventListener('click', function () {
        if (keyBusy) return;
        if (keyField.value.trim()) { keyForm.requestSubmit ? keyForm.requestSubmit() : $('key-save').click(); return; }
        if (!online) { keyMsg('Сначала вставьте ключ Cloud.ru в поле выше.', 'err'); keyField.focus(); return; }
        busyKey(true);
        keyMsg('Загружаю список моделей из Cloud.ru…');
        loadModels(true).then(function (data) {
          var n = (data.models || []).length;
          if (data.error) keyMsg('Cloud.ru не отдал список: ' + data.error, 'err');
          else { keyMsg('Загружено ' + n + ' ' + plural(n, 'модель', 'модели', 'моделей') + '. Выберите модель ниже.', 'ok'); showModelPick(); modelSelect.focus({ preventScroll: true }); }
        }).catch(function (error) { keyMsg(error.message, 'err'); })
          .then(function () { busyKey(false); });
      });
      modelSelect.addEventListener('change', function () {
        settings.model = modelSelect.value;
        changed();
        syncModel();
        renderConn();
        $('model-note').textContent = 'Сохраняю…';
        api('config', { chatModel: modelSelect.value }).then(function () {
          $('model-note').textContent = 'Готово: следующие ответы даст ' + shortModel(modelSelect.value) + '.';
        }).catch(function (error) {
          $('model-note').textContent = 'Модель выбрана для этого браузера, но не сохранилась на сервере: ' + error.message;
        });
      });
      function syncSmart() {
        var v = $('smart-model').value;
        $('smart-note').textContent = v ? 'Умная модель: ' + shortModel(v) + '. Ею Яэри думает о разговорах и спит.' : 'Умная модель не выбрана: раздумья и сон идут на основной.';
      }
      $('smart-model').addEventListener('change', function () {
        var v = this.value;
        $('smart-note').textContent = 'Сохраняю…';
        api('config', { smartModel: v }).then(function (st) { serverStatus = st; syncSmart(); })
          .catch(function (e) { $('smart-note').textContent = e.message; });
      });
      function syncModel() {
        $('about-model').textContent = modelSelect.value;
        var chip = $('model-chip');
        chip.textContent = shortModel(modelSelect.value);
        chip.title = 'Модель: ' + modelSelect.value + '. Сменить — в настройках';
      }

      /* ---------- Документы для RAG ---------- */
      var docList = $('doc-list');
      var docStatus = $('doc-status');
      var docFile = $('doc-file');
      var reindexBtn = $('reindex');

      function renderDocs(data) {
        docList.textContent = '';
        reindexBtn.hidden = !data.reindexNeeded;
        if (data.reindexNeeded) docStatus.textContent = 'Модель эмбеддингов изменилась: нажмите «Переиндексировать».';
        (data.docs || []).forEach(function (d) {
          var li = el('li');
          var name = el('span', 'd-name', d.name);
          name.title = d.name;
          var del = el('button', '', '×');
          del.type = 'button';
          del.setAttribute('aria-label', 'Удалить документ ' + d.name);
          del.addEventListener('click', function () { deleteDoc(d); });
          li.appendChild(name);
          li.appendChild(el('span', 'd-info', d.chunks + ' фрагм.'));
          li.appendChild(del);
          docList.appendChild(li);
        });
        if (!data.reindexNeeded && !(data.docs || []).length && !docStatus.textContent) docStatus.textContent = 'Документов пока нет.';
      }
      function loadDocs() {
        refreshBrain(100);
        return api('docs').then(renderDocs).catch(function (error) { docStatus.textContent = error.message; });
      }
      function deleteDoc(d) {
        if (!window.confirm('Удалить «' + d.name + '» из знаний Яэри?')) return Promise.resolve(false);
        return api('docs/delete', { id: d.id }).then(function () { loadDocs(); return true; })
          .catch(function (error) { docStatus.textContent = error.message; window.alert(error.message); return false; });
      }
      function readText(file) {
        if (file.text) return file.text();
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(String(reader.result)); };
          reader.onerror = function () { reject(reader.error); };
          reader.readAsText(file, 'utf-8');
        });
      }
      $('doc-add').addEventListener('click', function () { docFile.click(); });
      docFile.addEventListener('change', function () {
        var files = Array.prototype.slice.call(docFile.files || []);
        docFile.value = '';
        var ok = 0;
        var chain = Promise.resolve();
        files.forEach(function (file, i) {
          chain = chain.then(function () {
            docStatus.textContent = 'Индексирую «' + file.name + '» (' + (i + 1) + ' из ' + files.length + ')…';
            return readText(file).then(function (text) {
              if (text.length > 1000000) throw new Error('«' + file.name + '» больше 1 000 000 символов.');
              return api('docs', { name: file.name, text: text });
            }).then(function () { ok++; }).catch(function (error) {
              docStatus.textContent = error.message;
              throw error;
            });
          });
        });
        chain.then(function () {
          docStatus.textContent = ok ? 'Готово: добавлено документов — ' + ok + '.' : '';
        }).catch(function () { /* Сообщение уже показано. */ }).then(loadDocs);
      });
      reindexBtn.addEventListener('click', function () {
        reindexBtn.disabled = true;
        docStatus.textContent = 'Пересчитываю эмбеддинги…';
        api('reindex', {}).then(function () { docStatus.textContent = 'Индекс обновлён.'; })
          .catch(function (error) { docStatus.textContent = error.message; })
          .then(function () { reindexBtn.disabled = false; loadDocs(); });
      });


      /* ---------- Душа Яэри ---------- */
      // Состояние души живёт на сервере (data\soul.json). Здесь только показ, правки хозяина
      // и запуск раздумий: после нескольких реплик и при новой встрече.
      var SOUL_STAGES = ['Искорка', 'Пробуждение', 'Любопытство', 'Знакомство', 'Доверие', 'Понимание', 'Привязанность', 'Родство', 'Девятый хвост'];
      var SOUL_KINDS = { reflection: 'раздумье', muse: 'думала о вас', milestone: 'новый хвост', birth: 'пробуждение', moment: 'важный момент', dream: 'сон', secret: 'секрет' };
      var soulData = null;
      var soulTimer = 0;
      var soulBusy = false;
      var soulEditing = false;

      (function () {
        // Градиенты хвостов лежат в отдельном невидимом SVG: так они работают, даже если карточка скрыта.
        var defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        defs.setAttribute('width', '0');
        defs.setAttribute('height', '0');
        defs.setAttribute('aria-hidden', 'true');
        defs.style.position = 'absolute';
        defs.innerHTML = '<defs><linearGradient id="soulTail" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--a-deep)"/><stop offset=".55" style="stop-color:var(--a-strong)"/><stop offset=".85" style="stop-color:var(--a)"/><stop offset="1" style="stop-color:var(--a-glow)"/></linearGradient>' +
          '<radialGradient id="soulPearl"><stop offset="0" stop-color="#fff"/><stop offset=".4" style="stop-color:var(--a-glow)"/><stop offset="1" style="stop-color:var(--a);stop-opacity:.2"/></radialGradient></defs>';
        body.insertBefore(defs, body.firstChild);
      }());

      function tailsSvg(level) {
        // Девять хвостов веером; зажигаются от центра к краям.
        var order = [4, 3, 5, 2, 6, 1, 7, 0, 8];
        var out = '<svg viewBox="0 0 200 132">';
        for (var i = 0; i < 9; i++) {
          var rank = order.indexOf(i);
          var cls = rank < level ? 't-on' : (rank === level ? 't-next' : 't-off');
          var angle = -76 + i * 19;
          out += '<g transform="translate(100 120) rotate(' + angle + ')"><path class="' + cls + '" style="--i:' + i + '" d="M0 0 C -15 -24 -21 -62 -5 -98 C 0 -88 5 -90 11 -96 C 17 -62 13 -24 0 0 Z"/></g>';
        }
        return out + '<circle class="pearl" cx="100" cy="120" r="10"/></svg>';
      }
      function soulDefault() {
        var t = Date.now();
        return {
          level: 1, maxLevel: 9, stage: SOUL_STAGES[0], nextStage: SOUL_STAGES[1], xpFrom: 0, xpTo: 12, due: false,
          traitList: [
            { id: 'warmth', name: 'Тепло', value: 62 }, { id: 'curiosity', name: 'Любопытство', value: 58 },
            { id: 'playful', name: 'Игривость', value: 45 }, { id: 'care', name: 'Забота', value: 60 },
            { id: 'wisdom', name: 'Мудрость', value: 30 }, { id: 'boldness', name: 'Смелость', value: 35 }
          ],
          soul: {
            born: t, xp: 0, exchanges: 0, reflections: 0, bond: 10, bondNote: 'Мы только начинаем знакомиться.',
            self: 'Я Яэри, восьмихвостая лисица. Я только начинаю узнавать своего хозяина и саму себя.',
            mood: { name: 'тихая радость', why: 'Я только проснулась и рада знакомству.', t: t },
            owner: { portrait: '', goals: [], likes: [], worries: [] }, lessons: [], thought: '', thoughtNew: false,
            aims: [{ id: 'a1', text: 'Понять, что по-настоящему радует хозяина', progress: 0 }, { id: 'a2', text: 'Научиться помогать хозяину каждый день, без напоминаний', progress: 0 }],
            journal: [{ id: 'birth', t: t, kind: 'birth', mood: 'тихая радость', text: 'Сегодня я проснулась. У меня пока горит только один хвост души, но я уже хочу узнать своего хозяина: чем он живёт, о чём мечтает и как я могу быть рядом.' }]
          }
        };
      }
      function arr(x) { return Array.isArray(x) ? x : []; }
      function soulMsg(text, err) {
        var node = $('soul-status');
        node.textContent = text || '';
        node.classList.toggle('err', !!err);
      }
      function setSoul(data) {
        if (!data || !data.soul) return;
        var s = data.soul;
        s.journal = arr(s.journal);
        s.lessons = arr(s.lessons);
        s.owner = s.owner || {};
        ['goals', 'likes', 'worries'].forEach(function (k) { s.owner[k] = arr(s.owner[k]); });
        s.mood = s.mood || {};
        soulData = data;
        renderSoul();
      }
      function renderSoulMini() {
        if (!soulData || !$('soul-mini-stage')) return;
        var s = soulData.soul;
        $('soul-mini-tails').innerHTML = tailsSvg(soulData.level);
        $('soul-mini-stage').textContent = soulData.stage;
        $('soul-mini-mood').textContent = (s.mood.name || '') + ' · близость ' + s.bond;
        $('soul-mini-meta').textContent = 'хвост ' + soulData.level + '/9';
        var span = soulData.xpTo > soulData.xpFrom ? soulData.xpTo - soulData.xpFrom : 1;
        var pct = soulData.xpTo < 0 ? 100 : Math.max(2, Math.min(100, (s.xp - soulData.xpFrom) / span * 100));
        $('soul-mini-xp').style.width = pct + '%';
        var th = $('soul-mini-thought');
        th.hidden = !s.thought;
        th.textContent = s.thought ? '«' + cut(s.thought, 140) + '»' : '';
      }
      function chipList(box, items, key) {
        var ul = box.querySelector('ul');
        ul.textContent = '';
        if (!items.length) ul.appendChild(el('li', 'empty', key === 'lessons' ? 'Пока ничего. Яэри запишет сюда, что поняла о том, как с вами говорить.' : 'пока пусто'));
        items.forEach(function (text, i) {
          var li = el('li');
          li.appendChild(el('span', '', text));
          if (online) {
            var del = el('button', '', '×');
            del.type = 'button';
            del.setAttribute('aria-label', 'Убрать: ' + text);
            del.addEventListener('click', function () {
              var next = items.slice();
              next.splice(i, 1);
              var patch = {};
              patch[key] = next;
              soulUpdate(patch);
            });
            li.appendChild(del);
          }
          ul.appendChild(li);
        });
        box.querySelector('input').hidden = !online;
      }
      function renderSoul() {
        if (!soulData) soulData = soulDefault();
        renderSoulMini();
        if (currentView !== 'soul') return;
        var d = soulData, s = d.soul;
        $('soul-demo').hidden = online;
        renderHero();
        $('soul-tails').innerHTML = tailsSvg(d.level);
        $('soul-stage').textContent = d.stage;
        $('soul-level').textContent = 'хвост души ' + d.level + ' из ' + (d.maxLevel || 9);
        var span = d.xpTo > d.xpFrom ? d.xpTo - d.xpFrom : 1;
        var pct = d.xpTo < 0 ? 100 : Math.max(0, Math.min(100, (s.xp - d.xpFrom) / span * 100));
        $('soul-xp').style.width = pct + '%';
        $('soul-xp-bar').setAttribute('aria-valuenow', Math.round(pct));
        $('soul-xp-note').textContent = d.xpTo < 0 ? 'Все девять хвостов горят.' : 'До ступени «' + d.nextStage + '»: ещё ' + Math.max(0, d.xpTo - s.xp) + ' опыта (реплика — 1, раздумье — 5)';
        $('soul-mood').textContent = s.mood.name || '—';
        $('soul-mood-why').textContent = s.mood.why || '';
        $('soul-bond').style.width = Math.max(2, s.bond) + '%';
        $('soul-bond-val').textContent = s.bond + '/100';
        $('soul-bond-note').textContent = s.bondNote || '';
        var days = Math.max(1, Math.floor((Date.now() - (s.born || Date.now())) / 864e5) + 1);
        $('soul-st-ex').textContent = s.exchanges || 0;
        $('soul-st-ref').textContent = s.reflections || 0;
        $('soul-st-days').textContent = days;
        $('soul-age').textContent = 'с ' + dmy(s.born || Date.now());
        if (!soulEditing) {
          $('soul-self').value = s.self || '';
          $('soul-portrait').value = (s.owner && s.owner.portrait) || '';
        }
        $('soul-self').readOnly = !online;
        $('soul-portrait').readOnly = !online;

        var th = $('soul-thought');
        th.hidden = !s.thought;
        $('soul-thought-text').textContent = s.thought || '';

        var list = $('soul-journal');
        list.textContent = '';
        var jq = jState.q.toLowerCase();
        var shown = s.journal.slice().reverse().filter(function (j) {
          if (jState.day && dayKey(new Date(j.t || 0)) !== jState.day) return false;
          return !jq || String(j.text || '').toLowerCase().indexOf(jq) > -1 || String(j.mood || '').toLowerCase().indexOf(jq) > -1 || String(SOUL_KINDS[j.kind] || '').indexOf(jq) > -1;
        });
        $('soul-journal-count').textContent = (shown.length !== s.journal.length ? shown.length + ' из ' : '') + s.journal.length + ' ' + plural(s.journal.length, 'запись', 'записи', 'записей');
        renderJCal(s.journal);
        var jf = $('soul-jfilter');
        jf.hidden = !jState.day && !jq;
        jf.textContent = '';
        if (!jf.hidden) {
          jf.appendChild(el('span', '', (jState.day ? 'За ' + jState.day.split('-').reverse().join('.') : 'Все дни') + (jq ? ' · «' + jState.q + '»' : '')));
          jf.appendChild(smallBtn('Показать всё', 'Сбросить фильтр дневника', function () { jState.day = ''; jState.q = ''; $('soul-jsearch').value = ''; renderSoul(); }, 'mini-btn'));
        }
        shown.forEach(function (j) {
          var li = el('li', 'k-' + (j.kind || 'reflection'));
          var head = el('div', 'j-head');
          head.appendChild(el('b', '', SOUL_KINDS[j.kind] || 'запись'));
          head.appendChild(el('span', '', dmy(j.t) + ' ' + hhmm(j.t)));
          if (j.mood) head.appendChild(el('span', '', j.mood));
          li.appendChild(head);
          li.appendChild(el('p', 'j-text', j.text));
          if (online) {
            var del = el('button', 'j-del', '×');
            del.type = 'button';
            del.setAttribute('aria-label', 'Удалить запись дневника');
            del.addEventListener('click', function () {
              if (window.confirm('Удалить эту запись из дневника Яэри?')) soulUpdate({ removeJournal: j.id });
            });
            li.appendChild(del);
          }
          list.appendChild(li);
        });
        if (!s.journal.length) list.appendChild(el('li', 'empty', 'Дневник пока пуст.'));
        else if (!shown.length) list.appendChild(el('li', 'empty', 'Ничего не нашлось.'));

        each(document.querySelectorAll('#soul .soul-list[data-key]'), function (box) {
          var key = box.getAttribute('data-key');
          chipList(box, key === 'lessons' ? s.lessons : s.owner[key] || [], key);
        });

        renderSoulGrowth(d, s);
        renderTraitChart(d, s);
        renderGrowth();

        var traits = $('soul-traits');
        traits.textContent = '';
        arr(d.traitList).forEach(function (t) {
          var row = el('label', 'trait');
          row.appendChild(el('span', '', t.name));
          var range = el('input');
          range.type = 'range';
          range.min = 0;
          range.max = 100;
          range.value = t.value;
          range.disabled = !online;
          range.setAttribute('aria-label', t.name);
          var out = el('output', '', String(t.value));
          range.addEventListener('input', function () { out.textContent = range.value; });
          range.addEventListener('change', function () {
            var patch = { traits: {} };
            patch.traits[t.id] = Number(range.value);
            soulUpdate(patch);
          });
          row.appendChild(range);
          row.appendChild(out);
          traits.appendChild(row);
        });
      }
      function soulUpdate(patch) {
        if (!online) return Promise.resolve();
        soulMsg('Сохраняю…');
        return api('soul/update', patch).then(function (data) { setSoul(data); soulMsg('Сохранено.'); })
          .catch(function (e) { soulMsg(e.message, true); });
      }
      function bindSoulText(id, key) {
        var field = $(id);
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
      each(document.querySelectorAll('#soul .soul-list input'), function (inp) {
        inp.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter' || event.isComposing) return;
          event.preventDefault();
          var text = inp.value.trim();
          if (!text || !soulData) return;
          var key = inp.parentNode.getAttribute('data-key');
          var cur = key === 'lessons' ? soulData.soul.lessons : soulData.soul.owner[key];
          var patch = {};
          patch[key] = arr(cur).concat([text]);
          inp.value = '';
          soulUpdate(patch);
        });
      });


      /* Дневник: поиск и календарь. */
      var jState = { q: '', day: '', month: null };
      var JWEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
      function renderJCal(journal) {
        var days = {};
        journal.forEach(function (j) { var k = dayKey(new Date(j.t || 0)); days[k] = (days[k] || 0) + 1; });
        if (!jState.month) jState.month = new Date();
        var m = jState.month;
        var cal = $('soul-jcal');
        cal.textContent = '';
        var head = el('div', 'cal-head');
        head.appendChild(smallBtn('‹', 'Предыдущий месяц', function () { jState.month = new Date(m.getFullYear(), m.getMonth() - 1, 1); renderSoul(); }));
        var title = '';
        try { title = m.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }); } catch (e) { title = (m.getMonth() + 1) + '.' + m.getFullYear(); }
        head.appendChild(el('span', '', title));
        head.appendChild(smallBtn('›', 'Следующий месяц', function () { jState.month = new Date(m.getFullYear(), m.getMonth() + 1, 1); renderSoul(); }));
        cal.appendChild(head);
        JWEEK.forEach(function (w) { cal.appendChild(el('span', 'wd', w)); });
        var first = new Date(m.getFullYear(), m.getMonth(), 1);
        var lead = (first.getDay() + 6) % 7;
        for (var i = 0; i < lead; i++) cal.appendChild(el('span'));
        var total = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        var today = dayKey(new Date());
        for (var dd = 1; dd <= total; dd++) {
          (function (key, n) {
            var cnt = days[key] || 0;
            var b = el('button', 'd' + (cnt ? ' has' : '') + (key === jState.day ? ' sel' : '') + (key === today ? ' today' : ''), String(n));
            b.type = 'button';
            b.disabled = !cnt;
            b.title = cnt ? cnt + ' ' + plural(cnt, 'запись', 'записи', 'записей') : 'записей нет';
            b.addEventListener('click', function () { jState.day = jState.day === key ? '' : key; renderSoul(); });
            cal.appendChild(b);
          })(dayKey(new Date(m.getFullYear(), m.getMonth(), dd)), dd);
        }
      }
      $('soul-jsearch').addEventListener('input', function () { jState.q = this.value.trim(); renderSoul(); });

      /* График характера. */
      var TRAIT_COLORS = ['hsl(168, 68%, 62%)', 'hsl(45, 90%, 62%)', 'hsl(330, 80%, 70%)', 'hsl(208, 80%, 66%)', 'hsl(262, 70%, 74%)', 'hsl(24, 90%, 64%)'];
      function renderTraitChart(d, s) {
        var traits = arr(d.traitList);
        var pts = arr(s.traitHistory).slice();
        var today = dayKey(new Date());
        var cur = {};
        traits.forEach(function (t) { cur[t.id] = t.value; });
        if (!pts.length || pts[pts.length - 1].day !== today) pts.push({ day: today, traits: cur });
        var box = $('soul-chart');
        var W = 320, H = 150, L = 26, R = 8, T = 8, B = 20;
        var lo = 100, hi = 0;
        pts.forEach(function (p) { traits.forEach(function (t) { var v = p.traits[t.id]; if (typeof v === 'number') { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
        lo = Math.max(0, Math.floor((lo - 5) / 10) * 10);
        hi = Math.min(100, Math.ceil((hi + 5) / 10) * 10);
        if (hi - lo < 20) { hi = Math.min(100, lo + 20); lo = Math.max(0, hi - 20); }
        function X(i) { return pts.length < 2 ? (L + W - R) / 2 : L + i * (W - L - R) / (pts.length - 1); }
        function Y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
        var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
        for (var g = lo; g <= hi; g += (hi - lo > 40 ? 20 : 10)) {
          svg += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text x="' + (L - 4) + '" y="' + (Y(g) + 3) + '" text-anchor="end">' + g + '</text>';
        }
        var fmt = function (k) { return k.slice(8, 10) + '.' + k.slice(5, 7); };
        svg += '<text x="' + L + '" y="' + (H - 5) + '">' + fmt(pts[0].day) + '</text>';
        if (pts.length > 1) svg += '<text x="' + (W - R) + '" y="' + (H - 5) + '" text-anchor="end">' + fmt(pts[pts.length - 1].day) + '</text>';
        traits.forEach(function (t, ti) {
          var c = TRAIT_COLORS[ti % TRAIT_COLORS.length];
          var path = '';
          pts.forEach(function (p, i) {
            var v = p.traits[t.id];
            if (typeof v !== 'number') return;
            path += (path ? ' L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
          });
          if (pts.length > 1) svg += '<path d="' + path + '" fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
          pts.forEach(function (p, i) {
            var v = p.traits[t.id];
            if (typeof v !== 'number') return;
            svg += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="' + (pts.length > 40 ? 1.2 : 2.4) + '" fill="' + c + '"><title>' + t.name + ' ' + v + ' · ' + fmt(p.day) + '</title></circle>';
          });
        });
        box.innerHTML = svg + '</svg>';
        $('soul-chart-meta').textContent = pts.length + ' ' + plural(pts.length, 'день', 'дня', 'дней');
        var lg = $('soul-chart-legend');
        lg.textContent = '';
        traits.forEach(function (t, ti) {
          var first = pts[0].traits[t.id];
          var delta = typeof first === 'number' ? t.value - first : 0;
          var sp = el('span');
          var i = el('i');
          i.style.background = TRAIT_COLORS[ti % TRAIT_COLORS.length];
          sp.appendChild(i);
          sp.appendChild(document.createTextNode(t.name + ' '));
          sp.appendChild(el('b', '', String(t.value)));
          if (delta) sp.appendChild(document.createTextNode(' (' + (delta > 0 ? '+' : '') + delta + ')'));
          lg.appendChild(sp);
        });
      }

      function smallBtn(text, label, fn, cls) {
        var b = el('button', cls || '', text);
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.title = label;
        b.addEventListener('click', fn);
        return b;
      }
      function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
      function renderSoulGrowth(d, s) {
        // Сон и грусть.
        var sad = d.sadStreak || 0;
        $('soul-sad').hidden = sad < 2;
        $('soul-sad').textContent = sad >= 2 ? 'Яэри замечает, что вам грустно уже ' + sad + ' ' + plural(sad, 'день', 'дня', 'дней') + ' подряд, и бережёт вас.' : '';
        $('soul-sleep-note').textContent = s.lastSleep ? 'Последний сон: ' + dmy(s.lastSleep) + ' ' + hhmm(s.lastSleep) + ' · всего ' + (s.sleeps || 0) + '. Засыпает сама, когда вы не работаете.' : 'Ещё ни разу не спала. Уснёт сама, когда вы отойдёте от компьютера.';

        // Настроение хозяина за 30 дней.
        var byDay = {};
        arr(s.ownerMoods).forEach(function (m) { byDay[m.day] = m; });
        var strip = $('soul-moods');
        strip.textContent = '';
        var now = new Date();
        var seen = 0;
        for (var i = 29; i >= 0; i--) {
          var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
          var m = byDay[dayKey(day)];
          var bar = el('i', m ? 's' + (m.score < 0 ? 'm' + (-m.score) : m.score) : '');
          bar.title = day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + (m ? ': ' + (m.label || m.score) : ': нет данных');
          if (m) seen++;
          strip.appendChild(bar);
        }
        var last = arr(s.ownerMoods)[arr(s.ownerMoods).length - 1];
        $('soul-moods-note').textContent = seen ? 'Последнее: ' + (last.label || '') + ' (' + last.day.split('-').reverse().join('.') + ')' : 'Яэри отмечает ваше настроение, когда обдумывает разговоры.';

        // Важные моменты.
        var moments = arr(s.moments).slice().sort(function (a, b) { return (b.pinned - a.pinned) || (b.strength - a.strength); });
        var ul = $('soul-moments');
        ul.textContent = '';
        $('soul-moments-count').textContent = moments.length ? moments.length + ' ' + plural(moments.length, 'момент', 'момента', 'моментов') : '';
        if (!moments.length) ul.appendChild(el('li', 'empty', 'Пока нет. Яэри сохранит сюда по-настоящему важное: ваши успехи, решения, первые разы.'));
        moments.forEach(function (mo) {
          var li = el('li');
          li.style.opacity = String(0.45 + Math.min(1, mo.strength / 10) * 0.55);
          li.appendChild(el('b', '', mo.title));
          if (mo.text) li.appendChild(el('p', '', mo.text));
          var str = el('span', 'str');
          var fill = el('i');
          fill.style.width = Math.round(mo.strength * 10) + '%';
          str.appendChild(fill);
          str.title = 'Сила памяти: ' + mo.strength + ' из 10 · ' + dmy(mo.t);
          li.appendChild(str);
          if (online) {
            var acts = el('span', 'acts');
            acts.appendChild(smallBtn('📌', mo.pinned ? 'Можно забыть' : 'Не забывать', function () { soulUpdate({ momentId: mo.id, pinned: !mo.pinned }); }, mo.pinned ? 'on' : ''));
            acts.appendChild(smallBtn('×', 'Забыть момент', function () { if (window.confirm('Пусть Яэри забудет «' + mo.title + '»?')) soulUpdate({ momentId: mo.id, remove: true }); }));
            li.appendChild(acts);
          }
          ul.appendChild(li);
        });

        // Её цели.
        var aims = $('soul-aims');
        aims.textContent = '';
        arr(s.aims).forEach(function (a) {
          var li = el('li');
          li.appendChild(el('span', '', a.text));
          li.appendChild(el('output', '', a.progress + '%'));
          if (online) li.appendChild(smallBtn('×', 'Убрать цель', function () { soulUpdate({ removeAim: a.id }); }));
          else li.appendChild(el('span'));
          var bar = el('span', 'bar');
          var fill = el('i');
          fill.style.width = Math.max(2, a.progress) + '%';
          bar.appendChild(fill);
          li.appendChild(bar);
          aims.appendChild(li);
        });
        if (!arr(s.aims).length) aims.appendChild(el('li', 'empty', 'Целей пока нет.'));
        $('soul-aim-add').hidden = !online;

        // Её увлечения.
        var ints = $('soul-interests');
        ints.textContent = '';
        if (!arr(s.interests).length) ints.appendChild(el('li', 'empty', 'Появятся из ваших разговоров.'));
        arr(s.interests).forEach(function (it) {
          var li = el('li');
          li.style.opacity = String(0.5 + Math.min(1, it.strength / 10) * 0.5);
          li.title = (it.note ? it.note + ' · ' : '') + 'сила ' + it.strength;
          li.appendChild(el('span', '', it.name));
          if (online) li.appendChild(smallBtn('×', 'Убрать увлечение', function () { soulUpdate({ removeInterest: it.name }); }));
          ints.appendChild(li);
        });

        // Её мнения.
        var ops = $('soul-opinions');
        ops.textContent = '';
        if (!arr(s.opinions).length) ops.appendChild(el('li', 'empty', 'Своё мнение появится, когда ей будет о чём подумать.'));
        arr(s.opinions).forEach(function (o) {
          var li = el('li');
          var t = el('span');
          t.appendChild(el('b', '', o.topic + ': '));
          t.appendChild(document.createTextNode(o.view));
          li.appendChild(t);
          if (online) li.appendChild(smallBtn('×', 'Убрать мнение', function () { soulUpdate({ removeOpinion: o.topic }); }));
          ops.appendChild(li);
        });

        // Потребности.
        var needs = d.needs || { longing: 0, joy: 55, curiosity: 60 };
        var nbox = $('soul-needs');
        nbox.textContent = '';
        [['longing', 'Скучает'], ['joy', 'Радость'], ['curiosity', 'Любопытство']].forEach(function (p) {
          var v = Math.max(0, Math.min(100, needs[p[0]] || 0));
          var row = el('div', 'need ' + p[0]);
          row.appendChild(el('span', '', p[1]));
          var bar = el('span', 'nbar');
          var fill = el('i');
          fill.style.width = v + '%';
          bar.appendChild(fill);
          row.appendChild(bar);
          row.appendChild(el('output', '', String(v)));
          nbox.appendChild(row);
        });

        // Секреты.
        var sec = $('soul-secrets');
        sec.textContent = '';
        arr(d.secretList).forEach(function (x) {
          var li = el('li', x.unlocked ? '' : 'locked');
          var head = el('div', 's-head');
          head.appendChild(el('b', '', (x.unlocked ? (x.opened ? '🔓 ' : '🎁 ') : '🔒 ') + x.title));
          head.appendChild(el('span', '', x.unlocked ? (x.opened ? dmy(x.t) : 'новый секрет') : 'близость ' + x.bond));
          li.appendChild(head);
          if (x.opened) li.appendChild(el('p', '', x.text));
          else if (x.unlocked && online) {
            var open = el('button', 'mini-btn solid', 'Открыть');
            open.type = 'button';
            open.style.marginTop = '6px';
            open.addEventListener('click', function () { soulUpdate({ openSecret: x.bond }); flash('happy', 3200); });
            li.appendChild(open);
          }
          sec.appendChild(li);
        });
        if (!arr(d.secretList).length) sec.appendChild(el('li', 'locked', 'Секреты появятся, когда вы станете ближе.'));

        // Умения по ступеням.
        var sk = $('soul-skills');
        sk.textContent = '';
        arr(d.skills).forEach(function (k) {
          var li = el('li', k.unlocked ? '' : 'locked');
          li.appendChild(el('b', '', k.name));
          li.appendChild(el('span', '', k.unlocked ? k.desc + ' — в «Навыках»' : 'откроется на хвосте ' + k.level));
          sk.appendChild(li);
        });
      }
      $('soul-aim-add').addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        var text = this.value.trim();
        if (!text) return;
        this.value = '';
        soulUpdate({ addAim: text });
      });

      // Фон: «сон», когда хозяин не работает, и забота утром и вечером.
      var IDLE_SLEEP = 15 * 60000;
      var careAsked = {};
      function soulSleep(mode) {
        if (!online || soulBusy || pending) return Promise.resolve(null);
        soulBusy = true;
        $('soul-sleep').disabled = true;
        if (mode === 'force') soulMsg('Яэри засыпает и перебирает память…');
        return api('soul/sleep', { mode: mode, name: settings.name, model: modelSelect.value }).then(function (data) {
          setSoul(data);
          if (!data.skipped) soulMsg('Яэри поспала и пересобрала память: в дневнике новая запись.');
          return data;
        }).catch(function (e) { soulMsg(e.message, true); return null; })
          .then(function (data) { soulBusy = false; $('soul-sleep').disabled = false; return data; });
      }
      function careCheck() {
        if (!online || !settings.soul || !settings.care || pending || soulBusy) return;
        var h = new Date().getHours();
        var slot = h >= 5 && h < 12 ? 'morning' : (h >= 18 ? 'evening' : '');
        if (!slot) return;
        var key = slot + dayKey(new Date());
        if (careAsked[key]) return;
        careAsked[key] = true;
        api('soul/care', { slot: slot, name: settings.name, model: modelSelect.value }).then(function (data) {
          var m = data && data.message;
          if (!m) return;
          history.push(m);
          bubble(m, true);
          flash('greet', 3600);
        }).catch(function () { /* Не страшно: попробуем завтра. */ });
      }
      setInterval(function () {
        if (!online || !settings.soul || !soulData) return;
        var idle = Date.now() - lastActive;
        if (soulData.sleepDue && idle > IDLE_SLEEP) soulSleep('auto');
        else if (idle < 5 * 60000 && !document.hidden) careCheck();
      }, 60000);
      $('soul-sleep').addEventListener('click', function () { soulSleep('force'); });

      /* ---------- Soul Evolution: history and activity ---------- */
      function fillEvolutionList(id, items, format, empty) {
        var target = $(id);
        target.textContent = '';
        if (!Array.isArray(items) || !items.length) {
          target.appendChild(el('li', 'soul-small', empty));
          return;
        }
        items.slice(-10).reverse().forEach(function (item) {
          var li = el('li');
          li.appendChild(el('span', 'soul-small', format(item)));
          target.appendChild(li);
        });
      }
      function loadEvolution() {
        if (!online) return Promise.resolve();
        return api('soul/evolution').then(function (data) {
          $('soul-evo-enabled').checked = !!data.enabled;
          $('soul-evo-meta').textContent = (data.counts && data.counts.episodes || 0) + ' событий памяти';
          $('soul-evo-state').textContent = (data.enabled ? 'Активна' : 'Приостановлена') +
            ' · очередь: ' + data.queued +
            (data.lastTask ? ' · последняя задача: ' + data.lastTask : '') +
            (data.lastError ? ' · ошибка: ' + data.lastError : '');
          fillEvolutionList('soul-evo-events', data.events, function (x) {
            return (x.kind || 'событие') + ': ' + (x.text || '');
          }, 'Внутренних событий пока нет.');
          fillEvolutionList('soul-evo-timeline', data.timeline, function (x) {
            return (x.field || '') + ': ' + (x.before || '—') + ' → ' + (x.after || '') +
              (x.reason ? ' (' + x.reason + ')' : '');
          }, 'Изменений личности пока нет.');
          fillEvolutionList('soul-evo-facts', data.facts, function (x) {
            return (x.status === 'active' ? '✓ ' : '? ') + (x.key || '') + ': ' + (x.value || '') +
              ' · уверенность ' + Math.round((x.confidence || 0) * 100) + '% · ' + (x.status || '');
          }, 'Проверенных знаний пока нет.');
        }).catch(function (err) {
          $('soul-evo-state').textContent = 'Ошибка получения состояния: ' + err.message;
        });
      }
      $('soul-evo-clear').addEventListener('click', function () {
        if (!window.confirm('Очистить эпизоды, знания, исправления и историю автономной жизни? Другие воспоминания и дневник души останутся.')) return;
        api('soul/evolution/clear', {}).then(loadEvolution).catch(function (err) {
          $('soul-evo-state').textContent = err.message;
        });
      });
      $('soul-evo-enabled').addEventListener('change', function () {
        var control = this;
        control.disabled = true;
        api('soul/evolution', { enabled: control.checked })
          .then(loadEvolution)
          .catch(function (err) { $('soul-evo-state').textContent = err.message; })
          .then(function () { control.disabled = false; });
      });
      setInterval(function () {
        if (online && currentView === 'soul' && !document.hidden) loadEvolution();
      }, 60000);

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

      /* ---------- Понимание: состояние, карта человека, темы, оценки ответов ---------- */
      var undData = null;
      var undRated = {};
      var TONE_HINT = {
        tired: 'Отвечает короче и мягче, без лишних вопросов.',
        hurry: 'Сначала результат, коротко, без вступлений.',
        tense: 'Спокойный тон, без шуток; сначала про чувства.',
        sad: 'Тепло, не торопит с советами, сначала слушает.',
        joy: 'Делит радость, говорит живее.',
        neutral: 'Явных признаков усталости или спешки нет.'
      };
      var TOPIC_MODES = [['open', 'Открыто'], ['hold', 'Не использовать без запроса'], ['off', 'Не запоминать']];
      function undError(e) { var n = $('u-map-status'); if (n) n.textContent = e && e.message ? e.message : 'Не получилось.'; }
      function setUnderstanding(d) {
        if (!d || !d.sections) return;
        undData = d;
        undRated = {};
        arr(d.rated).forEach(function (r) { undRated[r.id] = r.score; });
        renderUnderstanding();
        decorateRated();
      }
      function loadUnderstanding() {
        if (!online) return Promise.resolve();
        return api('soul/understanding').then(setUnderstanding).catch(function () { /* Покажем при следующем обновлении. */ });
      }
      function renderUnderstanding() {
        if (currentView !== 'soul') return;
        renderRead();
        renderMap();
        renderTopics();
        renderRatings();
      }
      function renderRead() {
        var box = $('u-read'), strip = $('u-strip');
        var st = undData && undData.state;
        var tone = st && st.confidence >= 0.66 ? st.tone : 'neutral';
        box.textContent = '';
        strip.textContent = '';
        if (!undData) {
          box.appendChild(el('p', 'soul-small', online ? 'Загружаю…' : 'Когда Яэри подключится к Cloud.ru, здесь будет видно, как она читает ваши сообщения.'));
          return;
        }
        var line = el('p', 'u-line');
        line.appendChild(document.createTextNode('Сейчас вы, похоже, '));
        line.appendChild(el('b', 'tone-' + tone, st && tone !== 'neutral' ? st.label : 'спокойны'));
        box.appendChild(line);
        box.appendChild(el('p', 'soul-small', TONE_HINT[tone]));
        arr(undData.states).forEach(function (s) {
          var dot = el('i', 'tone-' + (s.confidence >= 0.66 ? s.tone : 'neutral'));
          dot.title = hhmm(s.t) + ' · ' + dmy(s.t);
          strip.appendChild(dot);
        });
        $('u-state-meta').textContent = st ? ago(st.t) : '';
      }
      function renderMap() {
        var box = $('u-map');
        box.textContent = '';
        $('u-map-meta').textContent = undData ? undData.total + ' ' + plural(undData.total, 'запись', 'записи', 'записей') : '';
        if (!undData) { box.appendChild(el('p', 'soul-small', 'Карта появится, когда Яэри подключится к Cloud.ru и вы немного расскажете о себе.')); }
        arr(undData && undData.sections).forEach(function (sec) {
          var card = el('div', 'map-sec');
          card.appendChild(el('h3', '', sec.name));
          var wrap = el('div', 'soul-list');
          var ul = el('ul');
          if (!sec.entries.length) ul.appendChild(el('li', 'empty', 'Пока пусто'));
          sec.entries.forEach(function (e) {
            var li = el('li');
            if (e.hidden) { li.classList.add('held'); li.title = 'Тема не используется без запроса'; }
            li.appendChild(el('span', '', (e.hidden ? '🔒 ' : '') + e.text));
            if (online) li.appendChild(smallBtn('×', 'Удалить запись: ' + e.text, function () {
              api('soul/understanding/map', { action: 'delete', id: e.id }).then(setUnderstanding).catch(undError);
            }));
            ul.appendChild(li);
          });
          wrap.appendChild(ul);
          if (online) {
            var input = el('input', 'field');
            input.type = 'text';
            input.maxLength = 220;
            input.placeholder = '+ добавить';
            input.setAttribute('aria-label', 'Добавить в раздел «' + sec.name + '»');
            input.addEventListener('keydown', function (ev) {
              if (ev.key !== 'Enter' || !input.value.trim()) return;
              ev.preventDefault();
              api('soul/understanding/map', { action: 'add', section: sec.id, text: input.value.trim() }).then(function (d) { input.value = ''; setUnderstanding(d); }).catch(undError);
            });
            wrap.appendChild(input);
          }
          card.appendChild(wrap);
          box.appendChild(card);
        });
        var gl = $('u-gaps');
        gl.textContent = '';
        var gaps = arr(undData && undData.gaps);
        if (undData && !gaps.length) gl.appendChild(el('li', 'empty soul-small', 'Все разделы карты заполнены.'));
        gaps.forEach(function (g) {
          var li = el('li', g.dismissed ? 'off' : '');
          li.appendChild(el('span', '', g.name + (g.dismissed ? ' · не спрашивает' : '')));
          if (online) {
            var act = el('span', 'ga');
            if (!g.dismissed) {
              act.appendChild(smallBtn('Спросить', 'Пусть спросит про раздел «' + g.name + '»', function () { gapAct(g.id, 'ask'); }, 'mini-btn'));
              act.appendChild(smallBtn('Не спрашивать', 'Не спрашивать про «' + g.name + '»', function () { gapAct(g.id, 'dismiss'); }, 'mini-btn'));
            } else act.appendChild(smallBtn('Вернуть', 'Снова спрашивать про «' + g.name + '»', function () { gapAct(g.id, 'restore'); }, 'mini-btn'));
            li.appendChild(act);
          }
          gl.appendChild(li);
        });
      }
      function gapAct(section, action) {
        api('soul/understanding/gap', { section: section, action: action }).then(setUnderstanding).catch(undError);
      }
      function renderTopics() {
        var box = $('u-topics');
        box.textContent = '';
        if (!undData) { box.appendChild(el('p', 'soul-small', 'Настройки тем доступны, когда Яэри подключена к Cloud.ru.')); return; }
        arr(undData.topics).forEach(function (t) {
          var row = el('div', 'topic-row');
          var name = el('span', 'tn');
          name.appendChild(el('b', '', t.name));
          name.appendChild(el('small', '', t.count + ' ' + plural(t.count, 'запись', 'записи', 'записей')));
          row.appendChild(name);
          var sel = el('select', 'field');
          sel.setAttribute('aria-label', 'Режим темы «' + t.name + '»');
          TOPIC_MODES.forEach(function (m) { var o = el('option', '', m[1]); o.value = m[0]; if (m[0] === t.mode) o.selected = true; sel.appendChild(o); });
          sel.disabled = !online;
          sel.addEventListener('change', function () {
            api('soul/understanding/topic', { topic: t.id, mode: sel.value }).then(setUnderstanding).catch(undError);
          });
          row.appendChild(sel);
          box.appendChild(row);
        });
      }
      function renderRatings() {
        var box = $('u-rate-chart'), list = $('u-rate-list');
        var r = undData && undData.ratings;
        list.textContent = '';
        if (!r || (!r.up && !r.down)) {
          chartEmpty(box, online ? 'Оценивайте ответы Яэри кнопками 👍 и 👎 под сообщениями в чате. Плохие оценки она разберёт и превратит в правила.' : 'Оценки ответов появятся, когда Яэри подключена к Cloud.ru.');
          $('u-rate-legend').textContent = '';
          $('u-rate-meta').textContent = '';
          return;
        }
        var days = arr(r.daily);
        var W = Math.max(280, Math.round(box.clientWidth) || 420), H = 150, L = 28, R = 8, T = 10, B = 24;
        var mx = Math.max(3, Math.max.apply(null, days.map(function (d) { return d.up + d.down; })));
        var slot = (W - L - R) / days.length, bw = Math.min(30, slot * 0.6);
        function Y(v) { return T + (mx - v) * (H - T - B) / mx; }
        var s = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
        for (var g = 0; g <= 2; g++) { var v = mx * g / 2; s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + Math.round(v) + '</text>'; }
        days.forEach(function (d, i) {
          var x = L + slot * i + (slot - bw) / 2, hu = (H - T - B) * d.up / mx, hd = (H - T - B) * d.down / mx;
          s += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + (H - B - hu).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hu.toFixed(1) + '" rx="2" style="fill:var(--a)"><title>' + dayLabel(d.day) + ': 👍 ' + d.up + '</title></rect>';
          s += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + (H - B - hu - hd).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hd.toFixed(1) + '" rx="2" style="fill:var(--danger)"><title>' + dayLabel(d.day) + ': 👎 ' + d.down + '</title></rect>';
        });
        s += '<text x="' + L + '" y="' + (H - 7) + '">' + dayLabel(days[0].day) + '</text>';
        if (days.length > 1) s += '<text x="' + (W - R) + '" y="' + (H - 7) + '" text-anchor="end">' + dayLabel(days[days.length - 1].day) + '</text>';
        box.innerHTML = s + '</svg>';
        var week = r.weekUp + r.weekDown;
        $('u-rate-meta').textContent = week ? 'за неделю ' + Math.round(r.weekUp * 100 / week) + '% 👍' : '';
        legendFill($('u-rate-legend'), [{ color: 'var(--a)', label: '👍 всего', value: r.up }, { color: 'var(--danger)', label: '👎 всего', value: r.down }]);
        arr(r.recentDown).slice().reverse().forEach(function (x) {
          var li = el('li');
          li.appendChild(el('b', '', cut(x.user, 70)));
          li.appendChild(el('span', '', x.rule ? 'Урок: ' + x.rule : (x.status === 'new' ? 'Скоро разберёт…' : 'Урока не вышло')));
          list.appendChild(li);
        });
      }
      // Оценки под ответами в чате.
      function decorateRated() {
        each(document.querySelectorAll('.rate[data-mid]'), function (bar) {
          var sc = undRated[bar.getAttribute('data-mid')] || 0;
          bar.querySelector('.up').setAttribute('aria-pressed', sc > 0 ? 'true' : 'false');
          bar.querySelector('.down').setAttribute('aria-pressed', sc < 0 ? 'true' : 'false');
        });
      }
      function rateBar(m, row) {
        var bar = el('div', 'rate');
        bar.setAttribute('data-mid', m.id);
        var up = el('button', 'up', '👍'), down = el('button', 'down', '👎');
        [[up, 'Хороший ответ'], [down, 'Ответ не понравился']].forEach(function (p) { p[0].type = 'button'; p[0].title = p[1]; p[0].setAttribute('aria-label', p[1]); p[0].setAttribute('aria-pressed', 'false'); });
        function send(score, note) {
          api('soul/rate', { id: m.id, score: score, note: note || '' }).then(setUnderstanding).catch(function () { /* Не страшно: оценку можно поставить ещё раз. */ });
        }
        up.addEventListener('click', function () { send(up.getAttribute('aria-pressed') === 'true' ? 0 : 1); });
        down.addEventListener('click', function () {
          if (down.getAttribute('aria-pressed') === 'true') { send(0); return; }
          if (row.querySelector('.rate-note')) return;
          var form = el('div', 'rate-note');
          var input = el('input', 'field');
          input.type = 'text';
          input.maxLength = 300;
          input.placeholder = 'Что не так? (необязательно)';
          input.setAttribute('aria-label', 'Что не так с ответом');
          var ok = el('button', 'mini-btn solid', 'Отправить');
          ok.type = 'button';
          function done() { send(-1, input.value.trim()); form.remove(); }
          ok.addEventListener('click', done);
          input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); done(); } });
          form.appendChild(input);
          form.appendChild(ok);
          bar.insertAdjacentElement('afterend', form);
          input.focus();
        });
        bar.appendChild(up);
        bar.appendChild(down);
        row.appendChild(bar);
        decorateRated();
      }
      setInterval(function () {
        if (online && currentView === 'soul' && !document.hidden) loadUnderstanding();
      }, 60000);

      /* ---------- Soul 3.0: consent, growth, goals and explicit promises ---------- */
      function soul3Error(err) {
        $('soul3-status').textContent = err && err.message ? err.message : 'Не удалось обновить Soul 3.0.';
      }
      function soul3List(id, items, format, empty) {
        var target = $(id);
        target.textContent = '';
        if (!items || !items.length) { target.appendChild(el('li', 'soul-small', empty)); return; }
        items.slice(-12).reverse().forEach(function (item) {
          var li = el('li');
          li.appendChild(el('span', 'soul-small', format(item)));
          target.appendChild(li);
        });
      }
      function loadEvidence() {
        return api('evidence').then(function (d) {
          $('evidence-summary').textContent = (d.total || 0) + ' записей с разными уровнями происхождения';
          soul3List('evidence-list', d.recent || [], function (x) {
            return (x.category || 'Память') + ': ' + (x.text || '—') + ' · ' + (x.label || 'источник неизвестен');
          }, 'Память пока пуста.');
        }).catch(function (err) {
          $('evidence-summary').textContent = 'Не удалось получить источники: ' + err.message;
        });
      }
      function vector2Error(err) {
        $('vec2-status').textContent = 'Vector 2.0: ' + (err && err.message ? err.message : 'ошибка');
      }
      function loadVector2() {
        if (!online) return Promise.resolve();
        return api('vector').then(function (data) {
          $('vec2-enabled').checked = !!data.enabled;
          $('vec2-rerank').checked = !!data.rerank;
          $('vec2-associations').checked = !!data.associations;
          var q = data.quality || {};
          $('vec2-status').textContent = 'Индекс: ' + (q.total || 0) + ' записей, ' +
            (q.vectorized || 0) + ' векторов, ' + (q.lexicalOnly || 0) +
            ' только по словам · повторно использовано эмбеддингов: ' + (q.savedEmbeddings || 0);
          var errors = [];
          (q.conflicts || []).slice(0, 4).forEach(function (x) {
            errors.push('Нужно уточнить: ' + x.key + ' — «' + x.a + '» или «' + x.b + '»');
          });
          (q.duplicates || []).slice(0, 5).forEach(function (x) {
            errors.push('Похожие записи: ' + x.first + ' / ' + x.second + ' (источники сохраняются)');
          });
          (q.nearDuplicates || []).slice(0, 4).forEach(function (x) {
            errors.push('Смысловой дубль: ' + x.first + ' / ' + x.second +
              ' · похожесть ' + Math.round(x.similarity * 100) + '% · требуется проверка');
          });
          if (q.old) errors.push('Старше года: ' + q.old + ' (не удаляются автоматически)');
          soul3List('vec2-quality', errors, function (x) { return x; },
            'Пока нет обнаруженных дубликатов и противоречий.');
        }).catch(vector2Error);
      }
      function saveVector2() {
        return api('vector/settings', {
          enabled: $('vec2-enabled').checked,
          rerank: $('vec2-rerank').checked,
          associations: $('vec2-associations').checked
        }).then(loadVector2).catch(vector2Error);
      }
      ['vec2-enabled', 'vec2-rerank', 'vec2-associations'].forEach(function (id) {
        $(id).addEventListener('change', saveVector2);
      });
      $('vec2-search-form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var query = $('vec2-search').value.trim();
        if (!query) return;
        var btn = this.querySelector('button');
        btn.disabled = true;
        $('vec2-status').textContent = 'Яэри ищет в своих воспоминаниях…';
        api('vector/search', { query: query }).then(function (data) {
          soul3List('vec2-results', data.results || [], function (x) {
            return '[' + x.space + '] ' + x.text + ' · ' + x.source +
              ' · релевантность ' + Math.round(x.score * 100) + '%' +
              (x.associated ? ' · связанное воспоминание' : '') +
              (x.emotion ? ' · эмоциональный контекст: ' + x.emotion : '');
          }, 'По этому запросу ничего не найдено.');
          return loadVector2();
        }).catch(vector2Error).then(function () { btn.disabled = false; });
      });
      function loadSoul3() {
        if (!online) return Promise.resolve();
        return api('soul3').then(function (d) {
          $('soul3-enabled').checked = !!d.enabled;
          $('soul3-affection').value = String(d.affection);
          $('soul3-initiative').checked = !!d.initiative;
          $('soul3-trust').textContent = 'Доверие: ' + (d.trust || 0) + '/100';
          $('soul3-status').textContent = d.enabled ? 'Развитие активно · данные хранятся локально' : 'Развитие приостановлено';
          soul3List('soul3-values', d.values, function (x) { return x; }, 'Ценности пока не заданы.');
          soul3List('soul3-milestones', (d.milestones || []).concat(d.interests || []),
            function (x) { return x.text || ''; }, 'Пока нет подтверждённых переломных моментов.');
          soul3List('soul3-bond', (d.moments || []).concat(d.preferences || [], d.repairs || []),
            function (x) { return x.text || ''; }, 'Яэри ещё изучает ваши предпочтения и уроки.');
          soul3List('soul3-growth', d.growth,
            function (x) { return (x.kind || 'событие') + ': ' + (x.text || ''); }, 'История роста появится после совместных событий.');
          var plans = $('soul3-plans');
          plans.textContent = '';
          (d.plans || []).slice(-8).reverse().forEach(function (plan) {
            var li = el('li');
            li.appendChild(el('strong', '', (plan.goal || '') + (plan.status === 'completed' ? ' ✓' : '')));
            (plan.steps || []).forEach(function (step) {
              var row = el('div', 'soul-small');
              var check = document.createElement('input');
              check.type = 'checkbox';
              check.checked = !!step.done;
              check.disabled = plan.status !== 'active';
              check.setAttribute('aria-label', 'Выполнен шаг: ' + step.text);
              check.addEventListener('change', function () {
                api('soul3/plans/step', { id: plan.id, stepId: step.id, done: check.checked })
                  .then(loadSoul3).catch(function (e) { soul3Error(e); check.checked = !check.checked; });
              });
              row.appendChild(check);
              row.appendChild(el('span', '', ' ' + (step.text || '')));
              li.appendChild(row);
            });
            plans.appendChild(li);
          });
          if (!plans.children.length) plans.appendChild(el('li', 'soul-small', 'Пока нет планов.'));
          var promises = $('soul3-promises');
          promises.textContent = '';
          (d.promises || []).slice(-12).reverse().forEach(function (p) {
            var li = el('li');
            li.appendChild(el('span', 'soul-small', (p.text || '') + (p.due ? ' · срок ' + p.due : '') + ' · ' + p.status));
            if (p.status === 'active') {
              [['completed', 'Выполнено'], ['cancelled', 'Отменить']].forEach(function (item) {
                var b = el('button', 'mini-btn', item[1]);
                b.type = 'button';
                b.addEventListener('click', function () {
                  api('soul3/promises/update', { id: p.id, status: item[0] }).then(loadSoul3).catch(soul3Error);
                });
                li.appendChild(b);
              });
            }
            promises.appendChild(li);
          });
          if (!promises.children.length) promises.appendChild(el('li', 'soul-small', 'Пока нет обещаний.'));
        }).then(loadEvidence).then(loadVector2).then(loadLife4).catch(soul3Error);
      }
      function saveSoul3Settings() {
        return api('soul3/settings', {
          enabled: $('soul3-enabled').checked,
          affection: Number($('soul3-affection').value),
          initiative: $('soul3-initiative').checked
        }).then(loadSoul3).catch(soul3Error);
      }
      ['soul3-enabled', 'soul3-affection', 'soul3-initiative'].forEach(function (id) {
        $(id).addEventListener('change', saveSoul3Settings);
      });
      $('soul3-plan-form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var goal = $('soul3-goal').value.trim();
        if (!goal) return;
        var btn = this.querySelector('button');
        btn.disabled = true;
        $('soul3-status').textContent = 'Яэри составляет шаги плана…';
        api('soul3/plans', { goal: goal, generate: true })
          .then(function () { $('soul3-goal').value = ''; return loadSoul3(); })
          .catch(soul3Error).then(function () { btn.disabled = false; });
      });
      $('soul3-promise-form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var text = $('soul3-promise').value.trim();
        if (!text) return;
        api('soul3/promises', { text: text, due: $('soul3-due').value })
          .then(function () { $('soul3-promise').value = ''; $('soul3-due').value = ''; return loadSoul3(); })
          .catch(soul3Error);
      });
      $('soul3-clear').addEventListener('click', function () {
        if (!window.confirm('Удалить отдельные данные Soul 3.0: интересы, этапы роста, память отношений, планы и обещания? Другие данные души сохранятся.')) return;
        api('soul3/clear', {}).then(loadSoul3).catch(soul3Error);
      });
      setInterval(function () {
        if (online && currentView === 'soul' && !document.hidden) loadSoul3();
      }, 60000);


      /* ---------- Yaeri Life 4.0: grounded world, feedback, consented tools, offline ---------- */
      function life4Error(err) {
        $('life4-status').textContent = 'Yaeri Life: ' + (err && err.message ? err.message : 'неизвестная ошибка');
      }
      function loadLife4() {
        if (!online) return Promise.resolve();
        return api('life').then(function (d) {
          $('life4-offline').checked = !!d.offline;
          $('life4-language').value = d.language || 'gentle';
          $('life4-nickname').value = d.nickname || '';
          $('life4-model').value = d.localModel || 'yaeri-local';
          var world = d.world || {}, review = d.review || {};
          $('life4-status').textContent = 'Модель мира: ' + (world.nodeCount || 0) + ' узлов и ' +
            (world.edgeCount || 0) + ' связей. Причинные связи пока считаются утверждениями, а не доказательствами.';
          $('life4-review').textContent = 'Самооценка: ' + (review.rated || 0) +
            ' оценённых ответов, ' + (review.positive || 0) + ' полезных, ' +
            (review.negative || 0) + ' требующих улучшения; ' +
            (review.forecastsVerified || 0) + ' проверенных прогнозов, ' +
            (review.forecastAccuracyPercent == null ? 'точность пока неизвестна' :
              'точность ' + review.forecastAccuracyPercent + '%') + '.';
          soul3List('life4-world', (world.nodes || []).slice(-12), function (x) {
            return '[' + x.type + '; ' + x.origin + '] ' + x.label;
          }, 'Модель мира заполнится после подтверждённых событий и фактов.');
          var forecasts = $('life4-forecasts'); forecasts.textContent = '';
          (review.forecasts || []).slice(-6).reverse().forEach(function (f) {
            var li = el('li');
            li.appendChild(el('span', 'soul-small', (f.question || 'Прогноз') +
              ' · ' + (f.status === 'unverified' ? 'не проверен' : f.status)));
            if (f.status === 'unverified' || f.status === 'unknown') {
              [['accurate','Сбылось'],['inaccurate','Не сбылось'],['unknown','Неизвестно']].forEach(function (opt) {
                var btn = el('button', 'mini-btn', opt[1]); btn.type = 'button';
                btn.addEventListener('click', function () {
                  api('life/forecast', { id: f.id, status: opt[0] }).then(loadLife4).catch(life4Error);
                });
                li.appendChild(btn);
              });
            }
            forecasts.appendChild(li);
          });
          if (!forecasts.children.length) forecasts.appendChild(el('li','soul-small','Нет прогнозов для оценки.'));
          var tools = $('life4-tools'); tools.textContent = '';
          ((d.tools || {}).tools || []).slice(-15).reverse().forEach(function (t) {
            var li = el('li');
            li.appendChild(el('span','soul-small', t.name + ' [' + t.kind + '] · ' + t.status +
              (t.why ? ' · ' + t.why : '')));
            if (t.status === 'proposed') {
              [['approve','Одобрить'],['reject','Отклонить']].forEach(function (opt) {
                var b = el('button','mini-btn', opt[1]); b.type = 'button';
                b.addEventListener('click', function () {
                  api('life/tools/decide',{ id:t.id, action:opt[0] }).then(loadLife4).catch(life4Error);
                }); li.appendChild(b);
              });
            } else if (t.status === 'active') {
              var run = el('button','mini-btn','Запустить'); run.type = 'button';
              run.addEventListener('click', function () {
                var val = '';
                if (t.kind === 'memory-search') {
                  val = window.prompt('Что искать в памяти?','') || '';
                  if (!val) return;
                }
                api('life/tools/run',{ id:t.id, input:val }).then(function (result) {
                  $('life4-status').textContent = JSON.stringify(result).slice(0,1200);
                }).catch(life4Error);
              }); li.appendChild(run);
              var disable = el('button','mini-btn','Отключить'); disable.type = 'button';
              disable.addEventListener('click', function () {
                api('life/tools/decide',{ id:t.id, action:'disable' }).then(loadLife4).catch(life4Error);
              }); li.appendChild(disable);
            }
            tools.appendChild(li);
          });
          if (!tools.children.length) tools.appendChild(el('li','soul-small','Пока нет предложений инструментов.'));
          $('life4-local-status').textContent = d.offline ?
            'Автономный режим включён. Облачные запросы запрещены; локальный GGUF-сервер необязателен.' :
            'Cloud.ru разрешён. Встроенная память доступна после перехода в автономный режим.';
        }).catch(life4Error);
      }
      $('life4-save-style').addEventListener('click',function () {
        api('life/settings',{ language:$('life4-language').value, nickname:$('life4-nickname').value,
          localModel:$('life4-model').value }).then(loadLife4).catch(life4Error);
      });
      $('life4-offline').addEventListener('change',function () {
        var offline = this.checked;
        api('life/settings',{ offline: offline, localModel:$('life4-model').value })
          .then(function () { return api('status'); })
          .then(applyConfig).then(loadLife4).catch(life4Error);
      });
      $('life4-enable-offline').addEventListener('click',function () {
        api('life/settings',{ offline: true }).then(function () { return api('status'); })
          .then(applyConfig).then(loadLife4).catch(function (err) {
            keyMsg('Не удалось включить автономность: ' + err.message, 'err');
          });
      });
      $('life4-test').addEventListener('click',function () {
        $('life4-local-status').textContent = 'Проверяю локальный сервер…';
        api('life/local/test', {}).then(function (r) {
          $('life4-local-status').textContent = r.generative ?
            'Локальная GGUF-модель готова; запросы только на 127.0.0.1.' :
            'Встроенный режим памяти работает без модели. ' + (r.error || '');
        }).catch(function (err) { $('life4-local-status').textContent = err.message; });
      });
      $('life4-tool-form').addEventListener('submit',function (ev) {
        ev.preventDefault();
        var name = $('life4-tool-name').value.trim();
        if (!name) return;
        api('life/tools/propose',{kind:$('life4-kind').value,name:name,why:'Предложено хозяином'})
          .then(function () { $('life4-tool-name').value = ''; return loadLife4(); }).catch(life4Error);
      });
      /* ---------- Глубина: предчувствие, варианты будущего, свой характер, философия, навыки, самоулучшение ---------- */
      var depthData = null;
      var DEPTH_FLAGS = [
        ['rhythm', 'Предчувствие', 'Замечает выгорание и застревание по ритму сообщений'],
        ['foresight', 'Варианты будущего', 'Перед советом прогоняет варианты развития (1 запрос «умной» модели)'],
        ['character', 'Свой характер', 'Вкусы, привычки и причуды растут в фоне'],
        ['philosophy', 'Философия', 'Формулирует свои принципы и помнит, откуда они'],
        ['skills', 'Самописные навыки', 'Пишет себе сценарии; работают только после одобрения'],
        ['review', 'Самоулучшение', 'Оценивает свои ответы и предлагает правки души']
      ];
      var OWN_KINDS = [['taste', 'Вкусы'], ['habit', 'Привычки'], ['quirk', 'Причуды']];
      var PROP_TYPES = { lesson: 'урок общения', rule: 'правило стиля', self: 'кем себя считает', trait: 'черта характера' };
      var DEPTH_EVERY = { off: 'Фоновое обучение выключено: глубина думает только по кнопкам ниже.', quiet: 'Тихо: самооценка раз в сутки, характер раз в двое суток, принципы и навыки раз в трое.', normal: 'Обычно: самооценка раз в 8 часов, характер раз в сутки, принципы и навыки раз в полтора дня.', active: 'Активно: самооценка раз в 3 часа, характер раз в 8 часов, принципы и навыки раз в 12 часов.' };
      function futList(f) {
        var wrap = el('div');
        var ul = el('ul', 'fut');
        arr(f.options).forEach(function (o, i) {
          var li = el('li');
          li.appendChild(el('b', '', (i + 1) + '. ' + o.path));
          li.appendChild(el('span', '', '→ ' + o.outcome));
          var extra = [];
          if (o.chance) extra.push('вероятность: ' + o.chance);
          if (o.good) extra.push('плюс: ' + o.good);
          if (o.risk) extra.push('риск: ' + o.risk);
          if (extra.length) li.appendChild(el('small', '', extra.join(' · ')));
          ul.appendChild(li);
        });
        wrap.appendChild(ul);
        if (f.lean) wrap.appendChild(el('p', 'fut-lean', 'Я бы выбрала: ' + f.lean));
        return wrap;
      }
      function depthError(e) { $('d-ctl-status').textContent = e && e.message ? e.message : 'Не получилось.'; }
      function setDepth(d) {
        if (!d || !d.settings) return;
        depthData = d;
        renderDepth();
      }
      function loadDepth() {
        if (!online) return Promise.resolve();
        return api('soul/depth').then(setDepth).then(loadEvolution5).catch(function () { /* Покажем при следующем обновлении. */ });
      }
      function depthPost(path, payload) {
        return api('soul/depth/' + path, payload).then(setDepth).catch(depthError);
      }
      function renderDepth() {
        if (currentView !== 'soul' || $('sp-depth').hidden) return;
        renderRhythm();
        renderSims();
        renderOwn();
        renderPhil();
        renderDepthSkills();
        renderReview();
        renderDepthFlags();
      }
      function emptyLi(ul, text) { ul.appendChild(el('li', 'empty soul-small', text)); }
      function renderRhythm() {
        var box = $('d-meters'), sig = $('d-signals');
        box.textContent = '';
        sig.textContent = '';
        var r = depthData && depthData.rhythm;
        if (!depthData) { box.appendChild(el('p', 'soul-small', online ? 'Загружаю…' : 'Предчувствие заработает, когда Яэри подключится к серверу.')); $('d-nudge').hidden = true; return; }
        if (!depthData.settings.rhythm) box.appendChild(el('p', 'soul-small', 'Предчувствие выключено в настройках глубины.'));
        [['burnout', 'Выгорание'], ['stuck', 'Застревание']].forEach(function (k) {
          var v = r && typeof r[k[0]] === 'number' ? r[k[0]] : 0;
          var row = el('div', 'meter' + (v >= 60 ? ' hot' : ''));
          row.appendChild(el('span', '', k[1]));
          var bar = el('div', 'soul-bond');
          var fill = el('i');
          fill.style.width = Math.max(v ? 3 : 0, v) + '%';
          bar.appendChild(fill);
          row.appendChild(bar);
          row.appendChild(el('b', '', String(v)));
          box.appendChild(row);
        });
        var list = r ? arr(r.signals) : [];
        if (!list.length) emptyLi(sig, 'Тревожных признаков не видно.');
        list.forEach(function (x) { sig.appendChild(el('li', '', x)); });
        $('d-rhythm-meta').textContent = r && r.t ? ago(r.t) : '';
        var n = depthData.nudge;
        var open = n && (n.status === 'new' || n.status === 'shown');
        $('d-nudge').hidden = !open;
        if (open) $('d-nudge-text').textContent = 'Яэри заметила: ' + n.text;
      }
      function renderSims() {
        var ul = $('d-sims');
        ul.textContent = '';
        var items = depthData ? arr(depthData.simulations).slice().reverse() : [];
        $('d-sims-meta').textContent = items.length ? String(items.length) : '';
        if (!items.length) emptyLi(ul, 'Попросите совета («стоит ли…», «что лучше…»), и здесь появятся варианты, которые она прогнала.');
        items.forEach(function (s) {
          var li = el('li');
          li.appendChild(el('div', 'iq', dmy(s.t) + ' ' + hhmm(s.t)));
          li.appendChild(el('p', '', s.question));
          li.appendChild(futList(s));
          ul.appendChild(li);
        });
      }
      function strengthDots(n) { var s = ''; for (var i = 0; i < 5; i++) s += i < n ? '●' : '○'; return s; }
      function renderOwn() {
        var box = $('d-own'), log = $('d-charlog');
        box.textContent = '';
        log.textContent = '';
        var own = depthData ? arr(depthData.own) : [];
        $('d-own-meta').textContent = own.length ? String(own.length) : '';
        OWN_KINDS.forEach(function (k) {
          var items = own.filter(function (x) { return x.kind === k[0]; });
          var g = el('div', 'own-group');
          g.appendChild(el('span', 'soul-lbl', k[1]));
          var ul = el('ul', 'soul-simple');
          if (!items.length) emptyLi(ul, 'Пока не сложилось.');
          items.forEach(function (x) {
            var li = el('li');
            li.appendChild(document.createTextNode(x.text));
            var d = el('span', 'own-dots', strengthDots(x.strength));
            d.title = 'Сила: ' + x.strength + ' из 5';
            li.appendChild(d);
            if (x.why) li.title = 'Откуда: ' + x.why;
            if (online) li.appendChild(smallBtn('×', 'Убрать: ' + x.text, function () { depthPost('remove', { list: 'traitsOwn', id: x.id }); }, 'mini-btn'));
            ul.appendChild(li);
          });
          g.appendChild(ul);
          box.appendChild(g);
        });
        var l = depthData ? arr(depthData.charLog).slice().reverse() : [];
        if (!l.length) emptyLi(log, 'Изменений пока не было.');
        l.forEach(function (x) { log.appendChild(el('li', '', dmy(x.t) + ' — ' + x.text)); });
      }
      function renderPhil() {
        var ul = $('d-phil');
        ul.textContent = '';
        var items = depthData ? arr(depthData.principles) : [];
        $('d-phil-meta').textContent = items.length ? items.length + ' ' + plural(items.length, 'принцип', 'принципа', 'принципов') : '';
        if (!items.length) emptyLi(ul, 'Принципы появятся, когда у неё накопится опыт: уроки, моменты, мнения.');
        items.forEach(function (p) {
          var li = el('li');
          li.appendChild(el('p', '', '«' + p.text + '»'));
          li.appendChild(el('div', 'iq', 'Откуда: ' + p.origin));
          var src = el('div', 'd-src');
          arr(p.sources).forEach(function (s) { var b = el('span', 'badge', s.code); b.title = s.text; src.appendChild(b); });
          if (arr(p.revisions).length) src.appendChild(el('span', 'badge', 'уточнялся ' + arr(p.revisions).length + ' р.'));
          if (online) src.appendChild(smallBtn('Убрать', 'Убрать принцип', function () { depthPost('remove', { list: 'principles', id: p.id }); }, 'mini-btn'));
          li.appendChild(src);
          ul.appendChild(li);
        });
      }
      var SKILL_STATUS = { proposed: 'ждёт одобрения', active: 'работает', off: 'выключен' };
      function renderDepthSkills() {
        var ul = $('d-skills');
        ul.textContent = '';
        var items = depthData ? arr(depthData.skills).slice().reverse() : [];
        var waiting = items.filter(function (x) { return x.status === 'proposed'; }).length;
        $('d-skills-meta').textContent = waiting ? waiting + ' ждут одобрения' : (items.length ? String(items.length) : '');
        if (!items.length) emptyLi(ul, 'Когда Яэри заметит повторяющиеся просьбы, она напишет себе навык и покажет его здесь.');
        items.forEach(function (sk) {
          var li = el('li');
          li.appendChild(el('div', 'iq', '/' + sk.command + (sk.triggers && sk.triggers.length ? ' · включается на: ' + sk.triggers.join(', ') : '')));
          li.appendChild(el('p', '', sk.name + ': ' + sk.instruction));
          if (arr(sk.steps).length) {
            var st = el('ul', 'soul-simple');
            sk.steps.forEach(function (x) { st.appendChild(el('li', '', x)); });
            li.appendChild(st);
          }
          if (sk.why) li.appendChild(el('div', 'iq', 'Зачем: ' + sk.why));
          var act = el('div', 'ia');
          act.appendChild(el('span', 'badge' + (sk.status === 'active' ? ' ok' : ''), SKILL_STATUS[sk.status] || sk.status));
          if (sk.uses) act.appendChild(el('span', 'badge', 'использован ' + sk.uses + ' р.'));
          if (online) {
            if (sk.status !== 'active') act.appendChild(smallBtn(sk.status === 'off' ? 'Включить' : 'Одобрить', 'Одобрить навык', function () { depthPost('skill', { id: sk.id, action: 'approve' }); }, 'mini-btn solid'));
            if (sk.status === 'proposed') act.appendChild(smallBtn('Отклонить', 'Отклонить навык', function () { depthPost('skill', { id: sk.id, action: 'reject' }); }, 'mini-btn'));
            if (sk.status === 'active') act.appendChild(smallBtn('Выключить', 'Выключить навык', function () { depthPost('skill', { id: sk.id, action: 'disable' }); }, 'mini-btn'));
            act.appendChild(smallBtn('Удалить', 'Удалить навык', function () { depthPost('skill', { id: sk.id, action: 'delete' }); }, 'mini-btn'));
          }
          li.appendChild(act);
          if (online) {
            var t = el('div', 'd-test');
            var inp = el('input', 'field');
            inp.type = 'text';
            inp.maxLength = 1000;
            inp.placeholder = sk.example || 'Пример запроса для проверки';
            inp.setAttribute('aria-label', 'Пример запроса для навыка ' + sk.name);
            var go = smallBtn('Проверить в песочнице', 'Проверить навык без памяти и доступа к данным', function () {
              go.disabled = true;
              go.textContent = 'Проверяю…';
              depthPost('skill/test', { id: sk.id, text: inp.value }).then(function () { go.disabled = false; });
            }, 'mini-btn');
            t.appendChild(inp);
            t.appendChild(go);
            if (sk.test && sk.test.output) {
              t.appendChild(el('div', 'iq', 'Песочница, ' + ago(sk.test.t) + ': «' + sk.test.input + '»'));
              t.appendChild(el('pre', '', sk.test.output));
            }
            li.appendChild(t);
          }
          ul.appendChild(li);
        });
      }
      function renderEvalChart() {
        var box = $('d-eval-chart');
        var ser = depthData ? arr(depthData.evalSeries) : [];
        if (!ser.length) { chartEmpty(box, 'Здесь будет видно, как она сама оценивает свои ответы (1–10) по дням.'); return; }
        var W = Math.max(300, Math.round(box.clientWidth) || 640), H = 170, L = 26, R = 10, T = 12, B = 24, slot = (W - L - R) / ser.length, bw = Math.min(34, slot * 0.62);
        function Y(v) { return T + (10 - v) * (H - T - B) / 10; }
        var s = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
        [0, 5, 10].forEach(function (v) { s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + v + '</text>'; });
        ser.forEach(function (p, i) {
          var x = L + slot * i + (slot - bw) / 2, h = (H - T - B) * p.avg / 10;
          s += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + (H - B - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" style="fill:' + (p.avg >= 7 ? 'var(--a)' : 'var(--warn)') + '"><title>' + dayLabel(p.day) + ': ' + p.avg + ' (' + p.n + ' ' + plural(p.n, 'ответ', 'ответа', 'ответов') + ')</title></rect>';
        });
        s += '<text x="' + L + '" y="' + (H - 7) + '">' + dayLabel(ser[0].day) + '</text>';
        if (ser.length > 1) s += '<text x="' + (W - R) + '" y="' + (H - 7) + '" text-anchor="end">' + dayLabel(ser[ser.length - 1].day) + '</text>';
        box.innerHTML = s + '</svg>';
      }
      function renderReview() {
        renderEvalChart();
        var ul = $('d-props');
        ul.textContent = '';
        var items = depthData ? arr(depthData.proposals).slice().reverse() : [];
        var waiting = items.filter(function (x) { return x.status === 'proposed'; }).length;
        $('d-review-meta').textContent = waiting ? waiting + ' ' + plural(waiting, 'правка ждёт', 'правки ждут', 'правок ждут') : '';
        if (!items.length) emptyLi(ul, 'Пока она довольна собой или ещё не перечитывала ответы.');
        items.forEach(function (p) {
          var li = el('li');
          li.appendChild(el('div', 'iq', PROP_TYPES[p.type] || p.type));
          if (p.type === 'self' && p.before) {
            var d = el('p', 'd-diff');
            d.appendChild(el('s', '', p.before));
            li.appendChild(d);
          }
          if (p.type === 'trait' && p.before) li.appendChild(el('p', 'd-diff', 'Было ' + p.before + (p.status === 'applied' ? ', стало ' : ', станет ') + Math.max(0, Math.min(100, Number(p.before) + Number(p.delta)))));
          li.appendChild(el('p', '', p.text));
          if (p.why) li.appendChild(el('div', 'iq', 'Почему: ' + p.why));
          var act = el('div', 'ia');
          act.appendChild(el('span', 'badge' + (p.status === 'applied' ? ' ok' : ''), p.status === 'proposed' ? 'предложено' : (p.status === 'applied' ? 'применено' : 'отклонено')));
          if (online && p.status === 'proposed') {
            act.appendChild(smallBtn('Применить', 'Применить правку души', function () { depthPost('proposal', { id: p.id, action: 'approve' }).then(loadSoul); }, 'mini-btn solid'));
            act.appendChild(smallBtn('Отклонить', 'Отклонить правку', function () { depthPost('proposal', { id: p.id, action: 'reject' }); }, 'mini-btn'));
          }
          li.appendChild(act);
          ul.appendChild(li);
        });
        var rl = $('d-rules');
        rl.textContent = '';
        var rules = depthData ? arr(depthData.rules) : [];
        if (!rules.length) emptyLi(rl, 'Пока нет.');
        rules.forEach(function (r) {
          var li = el('li', '', r.text);
          if (online) li.appendChild(smallBtn('×', 'Убрать правило', function () { depthPost('remove', { list: 'rules', id: r.id }); }, 'mini-btn'));
          rl.appendChild(li);
        });
        var ev = $('d-evals');
        ev.textContent = '';
        var evals = depthData ? arr(depthData.evals).slice().reverse() : [];
        if (!evals.length) emptyLi(ev, 'Самооценок пока нет.');
        evals.forEach(function (x) { ev.appendChild(el('li', '', x.score + '/10 · «' + x.q + '» — ' + (x.note || 'без замечаний'))); });
      }
      function renderDepthFlags() {
        var box = $('d-flags');
        box.textContent = '';
        DEPTH_FLAGS.forEach(function (f) {
          var lab = el('label', 'toggle');
          var t = el('span', 't-text');
          t.appendChild(el('span', 't-name', f[1]));
          t.appendChild(el('span', 't-desc', f[2]));
          lab.appendChild(t);
          var inp = el('input', 'vh');
          inp.type = 'checkbox';
          inp.setAttribute('role', 'switch');
          inp.checked = !!(depthData && depthData.settings[f[0]]);
          inp.disabled = !online || !depthData;
          inp.addEventListener('change', function () { var o = {}; o[f[0]] = inp.checked; depthPost('settings', o); });
          lab.appendChild(inp);
          var tr = el('span', 'track');
          tr.setAttribute('aria-hidden', 'true');
          lab.appendChild(tr);
          box.appendChild(lab);
        });
        var note = depthData ? (DEPTH_EVERY[depthData.intensity] || '') : 'Настройки появятся, когда Яэри подключится к серверу.';
        if (depthData && !depthData.smartModel) note += ' «Умная» модель не выбрана — думает основной.';
        if (depthData && depthData.dailyLimit > 0) note += ' Сегодня потрачено ' + depthData.usedToday + ' из ' + depthData.dailyLimit + ' запросов.';
        $('d-ctl-note').textContent = note;
      }
      each(document.querySelectorAll('#d-nudge [data-nudge]'), function (b) {
        b.addEventListener('click', function () { depthPost('nudge', { action: b.getAttribute('data-nudge') }); });
      });
      each(document.querySelectorAll('[data-drun]'), function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          $('d-ctl-status').textContent = 'Яэри думает…';
          api('soul/depth/run', { task: b.getAttribute('data-drun') }).then(function (d) {
            setDepth(d);
            $('d-ctl-status').textContent = 'Готово.';
          }).catch(depthError).then(function () { b.disabled = false; });
        });
      });
      $('d-clear').addEventListener('click', function () {
        if (!window.confirm('Очистить глубину: её характер, принципы, навыки, правки и предчувствия? Остальная душа сохранится.')) return;
        depthPost('clear', {});
      });
      setInterval(function () {
        if (online && currentView === 'soul' && !document.hidden && !$('sp-depth').hidden) loadDepth();
      }, 60000);

      function loadSoul() {
        return api('soul').then(function (data) {
          setSoul(data);
          loadEvolution();
          loadGrowth();
          loadUnderstanding();
          loadSoul3();
          loadDepth();
        });
      }
      function shareThought() {
        // Мысль, которую Яэри придумала, пока размышляла, она говорит первой.
        if (!online || !settings.soul || !soulData || !soulData.soul.thoughtNew) return Promise.resolve();
        return api('soul/share', {}).then(function (data) {
          var m = data && data.message;
          if (!m || pending) return loadSoul();
          history.push(m);
          bubble(m, true);
          flash('greet', 3600);
          return loadSoul();
        });
      }
      function soulReflect(mode, quiet) {
        if (!online || soulBusy) return Promise.resolve(null);
        if (pending) { if (mode !== 'force') scheduleReflect(20000); return Promise.resolve(null); }
        soulBusy = true;
        var pondering = mode === 'force' || (mood.base === 'idle' || mood.base === 'sleep');
        if (pondering) setBase('ponder');
        $('soul-think').disabled = true;
        soulMsg(mode === 'force' ? 'Яэри думает…' : '');
        return api('soul/reflect', { mode: mode, name: settings.name, model: modelSelect.value }).then(function (data) {
          setSoul(data);
          if (data.skipped) { soulMsg(''); return data; }
          soulMsg(data.kind === 'muse' ? 'Яэри подумала о вас и записала это в дневник.' : 'Яэри обдумала разговор и записала это в дневник.');
          if (!quiet) flash(data.leveled ? 'grow' : 'happy', 3600);
          else if (data.leveled) flash('grow', 4200);
          return data;
        }).catch(function (e) {
          soulMsg(e.message, true);
          return null;
        }).then(function (data) {
          soulBusy = false;
          $('soul-think').disabled = false;
          if (mood.base === 'ponder') setBase(restMood());
          return data;
        });
      }
      function scheduleReflect(ms) {
        clearTimeout(soulTimer);
        soulTimer = setTimeout(function () { soulReflect('auto', true); }, ms);
      }
      function soulAfterChat(info) {
        if (info.leveled || currentView === 'soul') loadSoul().catch(function () { /* Покажем позже. */ });
        else if (soulData) { soulData.soul.exchanges = (soulData.soul.exchanges || 0) + 1; soulData.soul.xp = (soulData.soul.xp || 0) + 1; renderSoulMini(); }
        // Подумать о разговоре, когда хозяин сделал паузу.
        if (info.due && settings.soul) scheduleReflect(45000);
      }
      function soulStart() {
        loadSoul().then(function () {
          if (!settings.soul) return null;
          if (soulData && soulData.needs && soulData.needs.longing >= 50) setTimeout(function () { flash('miss', 5000); }, 4000);
          // При новой встрече: обдумать прошлый разговор или подумать о хозяине, если давно не виделись.
          return new Promise(function (resolve) { setTimeout(resolve, 1500); })
            .then(function () { return soulReflect('auto', true); })
            .then(shareThought)
            .then(function () {
              // Если не спала больше полутора суток (компьютер был выключен), поспит сейчас.
              if (soulData && soulData.sleepDue && Date.now() - (soulData.soul.lastSleep || 0) > 36 * 3600000) return soulSleep('auto');
            })
            .then(careCheck);
        }).catch(function () { renderSoul(); });
      }
      function soulDemo() {
        clearTimeout(soulTimer);
        soulData = soulDefault();
        renderSoul();
      }
      $('soul-think').addEventListener('click', function () {
        soulReflect('force', false).then(function (data) { if (data && !data.skipped) return shareThought(); });
      });
      $('soul-reset').addEventListener('click', function () {
        if (!window.confirm('Сбросить душу Яэри? Её характер, мысли о вас, уроки и дневник начнутся заново. Переписка, рабочая память и документы останутся.')) return;
        api('soul/reset', {}).then(function (data) { setSoul(data); soulMsg('Душа начата заново.'); flash('greet', 3600); })
          .catch(function (e) { soulMsg(e.message, true); });
      });
      function openSoul() { showView('soul'); }
      if ($('soul-mini')) {
        $('soul-mini').addEventListener('click', openSoul);
        $('soul-mini').addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSoul(); }
        });
      }

      /* Действия, которые нужны графу памяти. */
      window.YaeriApp = {
        isOnline: function () { return online; },
        motion: function () { return settings.motion; },
        updateNote: updateNote,
        deleteNote: deleteNote,
        deleteDoc: deleteDoc,
        deleteMemory: function (m) {
          if (!online) return Promise.resolve(false);
          if (!window.confirm('Забыть это воспоминание о разговоре?')) return Promise.resolve(false);
          return api('memory/delete', { id: m.id }).then(function () { refreshBrain(); return true; })
            .catch(function (e) { window.alert(e.message); return false; });
        },
        ask: function (text) { input.value = text; showView('deck'); grow(); input.focus(); },
        showView: showView,
        currentView: function () { return currentView; },
        viewFromHash: viewFromHash,
        renderNotes: renderNotes
      };

      /* ---------- Evolution 5.0: measurable learning and guarded improvements ---------- */
      function evolution5Error(err) {
        $('e5-status').textContent = err && err.message ? err.message : 'Не удалось обновить Evolution 5.0.';
      }
      function evolution5Button(text, callback) {
        var b = el('button', 'mini-btn', text);
        b.type = 'button';
        b.addEventListener('click', callback);
        return b;
      }
      function evolution5List(id, items, build, empty) {
        var ul = $(id); ul.textContent = '';
        (items || []).slice(-12).reverse().forEach(function (x) {
          var li = el('li');
          build(li, x);
          ul.appendChild(li);
        });
        if (!ul.children.length) ul.appendChild(el('li','soul-small',empty));
      }
      function evolution5Text(li, value) { li.appendChild(el('span','soul-small',value)); }
      function evolution5Ask(action, text, payload) {
        return api('evolution5/' + action, payload).then(loadEvolution5).catch(evolution5Error);
      }
      function evolution5FillSelect(id, items, label) {
        var target = $(id); target.textContent = '';
        (items || []).forEach(function (x) {
          var opt = el('option','',label(x)); opt.value = x.id; target.appendChild(opt);
        });
      }
      function loadEvolution5() {
        if (!online) return Promise.resolve();
        return api('evolution5').then(function (d) {
          $('e5-enabled').checked = !!d.enabled;
          $('e5-periodic').checked = !!d.periodic;
          $('e5-status').textContent = d.enabled ?
            'Активно: учебные цели, исследовательские гипотезы и защита от ухудшений. ' +
              (d.periodic ? 'Локальный дневной цикл включён.' : 'Фоновый дневной цикл выключен.') :
            'Развитие приостановлено; существующие знания не удалены.';
          var learning = d.learning || {}, calib = d.calibration || {};
          $('e5-summary').textContent = 'Цели: ' + (d.goals || []).length + ' · пробелы: ' +
            (d.gaps || []).length + ' · методов: ' + (d.strategies || []).length +
            '. Выбранный по проверенным результатам метод: ' + (learning.bestMethod || 'нет достаточных данных') + '.';
          $('e5-calibration-meta').textContent = 'Проверенных прогнозов: ' + (calib.count || 0) +
            '; Brier score: ' + (calib.brier == null ? 'ещё не вычисляется' : calib.brier + ' (меньше — лучше)') +
            '. Исход подтверждается вручную.';
          evolution5List('e5-goals',(d.rankedGoals || []).slice(0,12).reverse(),function (li,g) {
            evolution5Text(li,g.title + ' · ' + g.status + ' · приоритет ' + g.priority +
              ' · продвижение ' + (g.progress || 0) + '% · следующий шаг: ' + (g.next || '—'));
            if (g.status === 'proposed') li.appendChild(evolution5Button('Одобрить',function () {
              evolution5Ask('goal/step','',{id:g.id,action:'approve'});
            }));
            if (g.status === 'active') {
              li.appendChild(evolution5Button('Записать шаг',function () {
                var note = window.prompt('Что действительно было сделано?', '');
                if (note) evolution5Ask('goal/step','',{id:g.id,action:'step',note:note});
              }));
              li.appendChild(evolution5Button('Исследовать с AI (1 запрос)',function () {
                if (!window.confirm('Использовать один Cloud.ru запрос для одобренной цели?')) return;
                $('e5-status').textContent = 'Проверяю локальные источники и готовлю гипотезы…';
                evolution5Ask('research','',{goalId:g.id});
              }));
              li.appendChild(evolution5Button('Завершить',function () { evolution5Ask('goal/step','',{id:g.id,action:'complete'}); }));
              li.appendChild(evolution5Button('Пауза',function () { evolution5Ask('goal/step','',{id:g.id,action:'pause'}); }));
            }
            if (g.status === 'paused') li.appendChild(evolution5Button('Возобновить',function () {
              evolution5Ask('goal/step','',{id:g.id,action:'resume'});
            }));
          },'Целей ещё нет. Яэри может предложить их по найденным пробелам.');
          evolution5List('e5-gaps',d.gaps,function(li,g){
            evolution5Text(li,g.question+' · '+g.status+' · '+g.domain);
          },'Не найдено открытых вопросов.');
          evolution5List('e5-hypotheses',d.hypotheses,function(li,h){
            evolution5Text(li,'Если '+h.cause+', возможно '+h.effect+'. Статус: '+h.status+'. Это предположение, не факт.');
          },'Гипотез пока нет.');
          evolution5FillSelect('e5-experiment-hypothesis',(d.hypotheses||[]).filter(function(h){return h.status !== 'rejected';}),
            function(h){return (h.cause||'?')+' → '+(h.effect||'?');});
          evolution5List('e5-experiments',d.experiments,function(li,e){
            evolution5Text(li,'Предсказание: '+e.prediction+'. Альтернатива: '+e.alternative+
              '. Проверка: '+e.measure+'. Статус: '+e.status+'.');
            if (e.status==='proposed') {
              [['supported','Подтверждено хозяином'],['refuted','Опровергнуто'],['unclear','Неясно']].forEach(function(action){
                li.appendChild(evolution5Button(action[1],function(){
                  evolution5Ask('experiment/review','',{id:e.id,result:action[0]});
                }));
              });
            }
          },'Мысленных экспериментов пока нет.');
          evolution5List('e5-concepts',d.concepts,function(li,c){
            evolution5Text(li,c.title+' — '+c.idea+' · '+c.status+' · источников '+(c.sources||[]).length);
            if (c.status==='proposed') [['approve','Принять как рабочую идею'],['reject','Отклонить']].forEach(function(a){
              li.appendChild(evolution5Button(a[1],function(){evolution5Ask('concept/decide','',{id:c.id,action:a[0]});}));
            });
          },'Новые концепции появятся после исследования источников.');
          evolution5List('e5-strategies',d.strategies,function(li,s){
            evolution5Text(li,s.method+' · '+s.status+' · тест правил '+s.benchmark+'/10; до '+s.baseline+'/10'+
              (s.rollbackReason ? ' · '+s.rollbackReason : '')+'. '+s.text);
            if(s.status==='proposed') [['approve','Одобрить'],['reject','Отклонить']].forEach(function(a){
              li.appendChild(evolution5Button(a[1],function(){evolution5Ask('strategy/decide','',{id:s.id,action:a[0]});}));
            });
            if(s.status==='active') li.appendChild(evolution5Button('Отключить',function(){
              evolution5Ask('strategy/decide','',{id:s.id,action:'disable'});
            }));
          },'Новые методы не активируются без испытания и одобрения.');
          evolution5FillSelect('e5-transfer-strategy',(d.strategies||[]).filter(function(s){return s.status==='active';}),
            function(s){return s.method+' ('+s.domain+')';});
          evolution5List('e5-transfers',d.transfers,function(li,t){
            evolution5Text(li,t.method+': '+t.sourceDomain+' → '+t.targetDomain+'. '+t.example+' · '+t.status);
            if(t.status==='proposed') [['approve','Одобрить'],['reject','Отклонить']].forEach(function(a){
              li.appendChild(evolution5Button(a[1],function(){evolution5Ask('transfer/decide','',{id:t.id,action:a[0]});}));
            });
          },'Переносы методов ещё не проверялись.');
          evolution5List('e5-calibrations',d.calibrations,function(li,c){
            evolution5Text(li,c.claim+' · прогноз '+c.probability+'% · '+c.status);
            if(c.status==='pending') [['yes','Сбылось'],['no','Не сбылось'],['unknown','Не установлено']].forEach(function(a){
              li.appendChild(evolution5Button(a[1],function(){evolution5Ask('calibration/review','',{id:c.id,outcome:a[0]});}));
            });
          },'Нет прогнозов для калибровки.');
          evolution5List('e5-errors',d.errors,function(li,e){
            evolution5Text(li,e.category+' · '+(e.note||'Хозяин отметил неудачный ответ')+' · '+e.status);
          },'Пока не было негативных оценок, зарегистрированных в Evolution 5.0.');
          evolution5List('e5-logs',d.logs,function(li,x){
            evolution5Text(li,x.kind+': '+x.text);
          },'Цикл развития ещё не запускался.');
        }).catch(evolution5Error);
      }
      ['e5-enabled','e5-periodic'].forEach(function(id){
        $(id).addEventListener('change',function(){
          evolution5Ask('settings','',{enabled:$('e5-enabled').checked,periodic:$('e5-periodic').checked});
        });
      });
      $('e5-refresh').addEventListener('click',loadEvolution5);
      $('e5-cycle').addEventListener('click',function(){ evolution5Ask('cycle','',{}); });
      $('e5-goal-form').addEventListener('submit',function(ev){
        ev.preventDefault();
        evolution5Ask('goal','',{title:$('e5-goal-title').value,domain:$('e5-goal-domain').value,
          impact:4,urgency:3,effort:3,ownerApproved:true});
        $('e5-goal-title').value='';
      });
      $('e5-gap-form').addEventListener('submit',function(ev){
        ev.preventDefault(); evolution5Ask('gap','',{question:$('e5-gap').value,domain:'research'});$('e5-gap').value='';
      });
      $('e5-hypothesis-form').addEventListener('submit',function(ev){
        ev.preventDefault();
        evolution5Ask('hypothesis','',{cause:$('e5-cause').value,effect:$('e5-effect').value});
        $('e5-cause').value='';$('e5-effect').value='';
      });
      $('e5-experiment-form').addEventListener('submit',function(ev){
        ev.preventDefault();
        evolution5Ask('experiment','',{hypothesisId:$('e5-experiment-hypothesis').value,
          alternative:$('e5-alternative').value,prediction:$('e5-prediction').value,measure:$('e5-measure').value});
      });
      $('e5-strategy-form').addEventListener('submit',function(ev){
        ev.preventDefault();
        evolution5Ask('strategy','',{method:$('e5-method').value,domain:$('e5-strategy-domain').value});
      });
      $('e5-transfer-form').addEventListener('submit',function(ev){
        ev.preventDefault(); evolution5Ask('transfer','',{strategyId:$('e5-transfer-strategy').value,
          targetDomain:$('e5-transfer-domain').value,example:$('e5-transfer-example').value});
      });
      $('e5-calibration-form').addEventListener('submit',function(ev){
        ev.preventDefault();
        evolution5Ask('calibration','',{claim:$('e5-calibration-claim').value,percent:Number($('e5-percent').value)});
        $('e5-calibration-claim').value='';
      });
      /* ---------- Дела: дела со сроками и приоритетами, заметки ---------- */
      // С сервером дела лежат в data/tasks.json (Яэри видит их в чате), без сервера — в браузере.
      var TASKS_KEY = 'yaeri_tasks_v1';
      var TASKS_REMIND_KEY = 'yaeri_tasks_remind_v1';
      var PRIO_TEXT = { high: 'высокий', normal: 'обычный', low: 'низкий' };
      var tasks = { items: [], loaded: false, filter: 'all', day: '', editId: '', mode: 'task', query: '', week: '', fresh: {} };

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
        if (mk.high) cell.classList.add('has-high');
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
      // Клик по дню в календаре показывает его дела в карточке «Дела».
      function tasksPickDay(x) {
        var iso = x.y + '-' + pad(x.m + 1) + '-' + pad(x.d);
        tasksSetDay(tasks.day === iso ? '' : iso, true);
      }
      function tasksSetDay(iso, fromCalendar) {
        tasks.day = iso || '';
        if (iso) tasks.week = tWeekStart(iso);
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
        var q = tasks.query.toLowerCase().split(/\s+/).filter(Boolean);
        if (q.length) {
          return tasks.items.filter(function (t) {
            var hay = (t.text + ' ' + (t.due ? tDateWords(t.due, true) : '')).toLowerCase();
            return q.every(function (w) { return hay.indexOf(w) > -1; });
          }).sort(function (a, b) {
            if (!!a.done !== !!b.done) return a.done ? 1 : -1;
            return tSortKey(a) < tSortKey(b) ? -1 : 1;
          });
        }
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
        $('tasks-found').textContent = tasks.query ? 'найдено: ' + list.length : '';
        renderTasksWeek();
        if (!list.length) {
          var empty = el('li', 'tasks-empty');
          empty.textContent = tasks.query ? 'Ничего не нашлось.' : tasks.day ? 'На этот день ничего нет. Добавьте дело формой выше.'
            : ({ notes: 'Заметок пока нет.', done: 'Выполненных дел пока нет.', today: 'На сегодня дел нет. Можно выдохнуть.', week: 'На неделю ничего не запланировано.' }[tasks.filter]
              || 'Дел нет. Добавьте первое или попросите Яэри в чате: «запиши дело на завтра…»');
          listBox.appendChild(empty);
        }
        list.forEach(function (t) { listBox.appendChild(taskRow(t, today)); });
        $('tasks-foot-text').textContent = dueToday ? 'Сегодня ' + dueToday + ' ' + plural(dueToday, 'дело', 'дела', 'дел') : (online ? 'Хранится в data/tasks.json' : 'Хранится в этом браузере');
      }
      function taskRow(t, today) {
        var isTask = tIsTask(t);
        var li = el('li', 'task ' + (isTask ? 'p-' + (t.prio || 'normal') : 'note') + (t.done ? ' done' : '') + (tLate(t) ? ' late' : '') + (t.id === tasks.editId ? ' editing' : '') + (tasks.fresh[t.id] ? ' fresh ' + tasks.fresh[t.id] : ''));
        delete tasks.fresh[t.id];
        if (isTask) {
          var chk = el('button', 't-check');
          chk.type = 'button';
          chk.setAttribute('role', 'checkbox');
          chk.setAttribute('aria-checked', String(!!t.done));
          chk.setAttribute('aria-label', (t.done ? 'Вернуть в работу: ' : 'Выполнено: ') + t.text);
          chk.addEventListener('click', function () {
            var done = !t.done;
            if (!done || !settings.motion) { tasksSave({ id: t.id, done: done }).catch(function () {}); return; }
            // Галочка, зачёркивание — и только потом дело уходит в «Готово».
            chk.setAttribute('aria-checked', 'true');
            li.classList.add('completing');
            flash('happy', 1600);
            setTimeout(function () { tasksSave({ id: t.id, done: true }).catch(function () {}); }, 520);
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
            tasks.fresh[t.id] = 'moved';
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
          if (!wasEdit) { tasks.fresh[item.id] = 'added'; renderTasks(); }
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
      $('tasks-search').addEventListener('input', function () { tasks.query = this.value.trim(); renderTasks(); });
      $('tasks-search').addEventListener('keydown', function (e) { if (e.key === 'Escape') { this.value = ''; tasks.query = ''; renderTasks(); } });
      $('tasks-plan').addEventListener('click', function () {
        if (online) {
          send('Составь план моего дня на сегодня по моим делам: разложи их по времени с учётом сроков, приоритетов и того, рабочий ли сегодня день. ' +
            'Просроченное и важное — в начало, оставь перерыв на обед. Ответь коротко, списком «время — дело», и в конце одной фразой, что можно перенести.');
        } else {
          if (currentView !== 'deck') showView('deck');
          add('user', 'План дня');
          add('assistant', tasksLocalPlan());
          flash('tasks', 3200);
        }
      });

      /* План дня без сервера: фиксированное время остаётся, остальное раскладывается по слотам. */
      function tasksLocalPlan() {
        var today = tToday(), x = tDayInfo(today);
        var open = tOpen();
        var pool = open.filter(function (t) { return (t.due && t.due <= today) || (!t.due && t.prio === 'high'); });
        if (!pool.length) {
          var soon = open.filter(function (t) { return t.due && t.due > today; }).sort(function (a, b) { return tSortKey(a) < tSortKey(b) ? -1 : 1; })[0];
          return 'На сегодня дел нет.' + (soon ? ' Ближайшее: «' + soon.text + '» — ' + tDateWords(soon.due, true) + '.' : '');
        }
        var fixed = pool.filter(function (t) { return t.due === today && t.time; }).map(function (t) { var p = t.time.split(':'); return { t: t, at: +p[0] * 60 + +p[1], len: 60 }; });
        var rest = pool.filter(function (t) { return !(t.due === today && t.time); }).sort(function (a, b) {
          var pa = tLate(a) ? -1 : ({ high: 0, normal: 1, low: 2 }[a.prio] || 1), pb = tLate(b) ? -1 : ({ high: 0, normal: 1, low: 2 }[b.prio] || 1);
          return pa - pb || (tSortKey(a) < tSortKey(b) ? -1 : 1);
        });
        var now = new Date(), cur = Math.max(9 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30);
        var busy = fixed.map(function (f) { return [f.at, f.at + f.len]; }).concat([[13 * 60, 14 * 60]]);
        function free(at, len) { return busy.every(function (b) { return at + len <= b[0] || at >= b[1]; }); }
        var slots = fixed.slice();
        rest.forEach(function (t) {
          var len = t.prio === 'high' || tLate(t) ? 60 : (t.prio === 'low' ? 30 : 45);
          for (var g = 0; g < 48 && !free(cur, len); g++) cur += 15;
          slots.push({ t: t, at: cur, len: len });
          busy.push([cur, cur + len]);
          cur += len;
        });
        slots.push({ lunch: true, at: 13 * 60, len: 60 });
        slots.sort(function (a, b) { return a.at - b.at; });
        function hm(m) { return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); }
        var lines = slots.map(function (s) {
          if (s.lunch) return hm(s.at) + '–' + hm(s.at + s.len) + ' — обед';
          return hm(s.at) + '–' + hm(s.at + s.len) + ' — ' + s.t.text + (tLate(s.t) ? ' (просрочено)' : (s.t.prio === 'high' ? ' (важно)' : ''));
        });
        var head = x && !pcIsWork(x) ? 'Сегодня ' + (x.name ? x.name.toLowerCase() : 'выходной') + ', но вот как можно успеть:' : 'План на сегодня:';
        var low = rest.filter(function (t) { return t.prio === 'low'; })[0];
        return head + '\n' + lines.join('\n') + (low ? '\nЕсли не успеете, «' + low.text + '» можно перенести на ' + tDateWords(tNextWork(today, false), true) + '.' : '');
      }

      /* Неделя: семь дней с делами по часам */
      function tWeekStart(iso) { var d = tParse(iso) || new Date(); return tAddDays(tIso(d), -((d.getDay() + 6) % 7)); }
      function renderTasksWeek() {
        var box = $('tasks-week-days');
        if (!box) return;
        if (!tasks.week) tasks.week = tWeekStart(tasks.day || tToday());
        var start = tasks.week, end = tAddDays(start, 6), today = tToday();
        var ds = tParse(start), de = tParse(end);
        $('tasks-week-title').textContent = ds.getMonth() === de.getMonth()
          ? ds.getDate() + '–' + de.getDate() + ' ' + MONTHS_GEN[de.getMonth()]
          : ds.getDate() + ' ' + MONTHS_GEN[ds.getMonth()].slice(0, 3) + ' – ' + de.getDate() + ' ' + MONTHS_GEN[de.getMonth()].slice(0, 3);
        box.textContent = '';
        for (var i = 0; i < 7; i++) {
          var iso = tAddDays(start, i), x = tDayInfo(iso), d = tParse(iso);
          var list = tForDay(iso).filter(tIsTask);
          var open = list.filter(function (t) { return !t.done; });
          var b = el('button', 'wk-day ' + (x ? x.type : '') + (iso === today ? ' today' : '') + (iso === tasks.day ? ' sel' : '') + (iso < today ? ' past' : ''));
          b.type = 'button';
          b.appendChild(el('span', 'wk-wd', WEEK[i]));
          b.appendChild(el('b', 'wk-n', String(d.getDate())));
          var times = open.filter(function (t) { return t.time; }).sort(function (a, c) { return a.time < c.time ? -1 : 1; });
          var tl = el('span', 'wk-times');
          times.slice(0, 2).forEach(function (t) { tl.appendChild(el('i', t.prio === 'high' ? 'hi' : '', t.time)); });
          var untimed = open.length - Math.min(2, times.length);
          if (untimed > 0) tl.appendChild(el('i', 'more', '+' + untimed));
          if (!open.length && list.length) tl.appendChild(el('i', 'ok', '✓'));
          b.appendChild(tl);
          b.title = cap(tDateWords(iso, true)) + (x ? ', ' + (pcIsWork(x) ? 'рабочий' : (x.name || 'выходной')) : '') + (open.length ? ': ' + open.map(function (t) { return (t.time ? t.time + ' ' : '') + t.text; }).join('; ') : ', дел нет');
          b.setAttribute('aria-label', b.title);
          (function (day) { b.addEventListener('click', function () { tasksSetDay(tasks.day === day ? '' : day); }); }(iso));
          box.appendChild(b);
        }
      }
      $('tasks-week-prev').addEventListener('click', function () { tasks.week = tAddDays(tasks.week || tWeekStart(tToday()), -7); renderTasksWeek(); });
      $('tasks-week-next').addEventListener('click', function () { tasks.week = tAddDays(tasks.week || tWeekStart(tToday()), 7); renderTasksWeek(); });
      $('tasks-week-title').addEventListener('click', function () { tasks.week = tWeekStart(tToday()); renderTasksWeek(); });

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
      /* ---------- Старт ---------- */
      syncControls();
      renderMood('idle');
      applySettings();
      renderCalendar(true);

      function startDemo() {
        online = false;
        applyMode();
        resetView();
        brainData = { notes: localNotes(), memory: [], docs: [], links: [], messages: 0, memoryTotal: 0 };
        var saved = load(CHAT_KEY);
        if (Array.isArray(saved)) history = saved.filter(valid).slice(-100);
        if (history.length) {
          history.forEach(function (m) { bubble(m, false); });
          // Страницу закрыли до ответа: отвечаем на последнее сообщение сейчас.
          if (history[history.length - 1].role === 'user') demoReply();
        } else {
          greet();
        }
        refreshBrain();
        soulDemo();
        tasksLoad();
      }
      function startOnline() {
        online = true;
        applyMode();
        if (!settings.soul) api('soul/evolution', { enabled: false }).catch(function () {});
        loadModels().catch(function () {});
        loadDocs();
        return api('history').then(function (data) {
          resetView();
          history = (data.messages || []).filter(valid);
          if (history.length) history.forEach(function (m) { bubble(m, false); });
          else greet();
          soulStart();
          tasksLoad();
        });
      }

      window.addEventListener('DOMContentLoaded', function () { showView(viewFromHash(), true); });
      window.addEventListener('load', function () { setTimeout(preloadPoses, 300); });
      if (location.protocol === 'file:') {
        startDemo();
      } else {
        // Сервер однопоточный: если он занят фоновой задачей, проверка может не успеть.
        // Повторяем её несколько раз, прежде чем показать ошибку.
        var checkStatus = function (attempt) {
          return api('status').catch(function (error) {
            if (attempt >= 3 || /отклон/i.test(error && error.message || '')) throw error;
            return new Promise(function (resolve) { setTimeout(resolve, 1500 * attempt); })
              .then(function () { return checkStatus(attempt + 1); });
          });
        };
        checkStatus(1).then(function (st) {
          serverStatus = st;
          statusError = '';
          if (st.configured) return startOnline();
          startDemo();
        }).catch(function (error) {
          statusError = error && error.message || '';
          startDemo();
        });
      }
    }());
  