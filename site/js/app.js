
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
        if (name === 'soul') { fitSoulText($('soul-self')); fitSoulText($('soul-portrait')); }
        $('view-name').textContent = views[name].name;
        document.title = 'Яэри — ' + views[name].name.toLowerCase();
        if (!fromHash) {
          var hash = name === 'deck' ? '' : '#' + name;
          if (location.hash !== hash) history_.replaceState(null, '', hash || location.pathname + location.search);
        }
        if (window.YBrain) YBrain.onShow(name);
        if (name === 'soul') { renderSoul(); if (online) loadSoul().catch(function () { /* покажем позже */ }); }
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
      function api(path, payload, rawJobStatus, busyTry) {
        // Сервер выполняет одну AI-задачу за раз. Если занят раздумьем или сном души,
        // сообщение не теряется с ошибкой, а ждёт своей очереди (до ~4 минут).
        busyTry = busyTry || 0;
        return apiOnce(path, payload, rawJobStatus).catch(function (e) {
          if (!e.busy || busyTry >= 160) throw e;
          return new Promise(function (resolve) { setTimeout(resolve, 1500); })
            .then(function () { return api(path, payload, rawJobStatus, busyTry + 1); });
        });
      }
      function apiOnce(path, payload, rawJobStatus) {
        var opts = { method: 'GET', cache: 'no-store' };
        if (payload !== undefined) {
          opts.method = 'POST';
          opts.headers = { 'Content-Type': 'application/json' };
          opts.body = JSON.stringify(payload);
        }
        return fetch('/api/' + path, opts).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (!r.ok) {
              var err = new Error(data.error || ('Ошибка сервера: ' + r.status));
              err.busy = r.status === 409 && payload !== undefined && /длительная AI-задача/.test(data.error || '');
              throw err;
            }
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
      // Значки праздников в клетках календаря.
      var PC_ICONS = { '01-07': '⭐', '02-23': '🎖️', '03-08': '🌷', '05-01': '🌼', '05-09': '🕊️', '06-12': '🏛️', '11-04': '🤝' };
      function pcIcon(x) { return x.type === 'hol' ? (PC_ICONS[x.key] || (x.m === 0 ? '🎄' : '🎉')) : ''; }
      function pcIsoWeek(dt) {
        var t = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 3 - (dt.getDay() + 6) % 7);
        return Math.floor((t - new Date(t.getFullYear(), 0, 4)) / 6048e5 + 0.5) + 1;
      }
      function pcFillGrid(box, y, m, opts) {
        opts = opts || {};
        box.textContent = '';
        box.classList.toggle('weeks', !!opts.weeks);
        if (opts.weeks) box.appendChild(el('span', 'wd wn-head', 'нед'));
        WEEK.forEach(function (w, i) { box.appendChild(el('span', 'wd' + (i >= 5 ? ' we' : ''), w)); });
        var lead = (new Date(y, m, 1).getDay() + 6) % 7;
        var n = new Date(y, m + 1, 0).getDate();
        var today = pcToday();
        var curWeek = pcIsoWeek(new Date());
        for (var pos = 0; pos < lead + n; pos++) {
          var row = Math.floor(pos / 7);
          if (opts.weeks && pos % 7 === 0) {
            var first = new Date(y, m, Math.max(1, pos - lead + 1));
            var wk = pcIsoWeek(first);
            var wn = el('span', 'wn' + (wk === curWeek && first.getFullYear() === new Date().getFullYear() ? ' now' : ''), String(wk));
            wn.setAttribute('data-row', row);
            wn.title = wk + '-я неделя';
            box.appendChild(wn);
          }
          if (pos < lead) { box.appendChild(el('span', 'pc-d blank')); continue; }
          var d = pos - lead + 1;
          var x = pcDay(y, m, d);
          var cell = el(opts.buttons ? 'button' : 'span', pcCellClass(x, today) + (opts.sel === d ? ' sel' : ''), String(d));
          cell.title = pcDayText(x).replace(/<[^>]+>/g, '');
          if (opts.weeks) cell.setAttribute('data-row', row);
          var ico = opts.buttons && pcIcon(x);
          if (ico) cell.appendChild(el('i', 'pc-ico', ico));
          tasksDecorateCell(cell, y, m, d);
          if (opts.buttons) {
            cell.type = 'button';
            if (!cell.hasAttribute('aria-label')) cell.setAttribute('aria-label', cell.title);
            (function (xx) { cell.addEventListener('click', function () { opts.onPick(xx); }); }(x));
          }
          box.appendChild(cell);
        }
        if (opts.weeks && !box.dataset.hover) {
          // Подсветка всей недели под курсором.
          box.dataset.hover = '1';
          var hot = function (r) {
            each(box.querySelectorAll('.hot'), function (c) { c.classList.remove('hot'); });
            if (r !== null) each(box.querySelectorAll('[data-row="' + r + '"]'), function (c) { c.classList.add('hot'); });
          };
          box.addEventListener('mouseover', function (e) { var t = e.target.closest && e.target.closest('[data-row]'); hot(t ? t.getAttribute('data-row') : null); });
          box.addEventListener('mouseleave', function () { hot(null); });
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
        pcFillGrid($('pc-grid'), y, m, { buttons: true, weeks: true, sel: pcState.sel, onPick: function (x) {
          pcState.sel = pcState.sel === x.d ? 0 : x.d;
          tasksPickDay(x);
          renderProdCalendar(true);
          // Дела выбранного дня показывает карточка «Дела» справа.
        } });
        $('pc-foot').textContent = (PC_YEARS[y] ? PC_YEARS[y].act.replace('Постановление Правительства РФ', 'Пост.') : '');
        renderNowStatus();
        if (!$('pc-overlay').hidden) renderProdYear();
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
        if (typeof heatRenderYear === 'function') heatRenderYear(y);
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
          // До ближайшего выходного: перенесено из календаря к часам.
          var ev = pcNextEvents();
          if (ev.rest && ev.restDays > 0) {
            var rs = el('span', 'rest', 'до выходного ');
            rs.appendChild(el('b', '', ev.restDays + ' ' + plural(ev.restDays, 'день', 'дня', 'дней')));
            rs.title = ev.rest.d + ' ' + MONTHS_GEN[ev.rest.m] + ', ' + WEEK_FULL[ev.rest.wd];
            meta.appendChild(rs);
          }
          [['неделя', week], ['день года', doy]].forEach(function (x) {
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


      /* ---------- Душа: данные, загрузка и фоновое поведение ---------- */
      // Всё состояние души живёт на сервере (data\*.json). Здесь: загрузка, действия хозяина
      // и автоматическое поведение (раздумья после разговора, сон в простое, утренняя и вечерняя забота).
      // Отрисовка — в soul-ui.js.
      var SOUL_STAGES = ['Искорка', 'Пробуждение', 'Любопытство', 'Знакомство', 'Доверие', 'Понимание', 'Привязанность', 'Родство', 'Полнота'];
      var SOUL_XP = [0, 12, 35, 70, 120, 190, 280, 400, 560];
      // После девятой ступени: звезда k стоит 120 + 20·k опыта, 9 звёзд = созвездие (как в yaeri-soul.ps1).
      var SOUL_STAR_BASE = 120, SOUL_STAR_STEP = 20;
      var SOUL_CONST = ['Лиса', 'Луна', 'Сакура', 'Ветер', 'Река', 'Гора', 'Пламя', 'Небо', 'Вечность'];
      var SOUL_KINDS = { reflection: 'раздумье', muse: 'думала о вас', milestone: 'веха пути', birth: 'пробуждение', moment: 'важный момент', dream: 'сон', secret: 'секрет' };
      var soulData = null, growthData = null, undData = null, depthData = null, evoData = null, s3Data = null, lifeData = null, e5Data = null, vecData = null;
      var undRated = {};
      var soulTimer = 0, soulBusy = false, soulEditing = false;

      function arr(x) { return Array.isArray(x) ? x : []; }
      function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
      function ago(t) {
        var m = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (m < 1) return 'только что';
        if (m < 60) return m + ' мин назад';
        var h = Math.round(m / 60);
        if (h < 24) return h + ' ' + plural(h, 'час', 'часа', 'часов') + ' назад';
        var d = Math.round(h / 24);
        return d + ' ' + plural(d, 'день', 'дня', 'дней') + ' назад';
      }
      function constName(i) { return i < SOUL_CONST.length ? SOUL_CONST[i] : 'Вечность ' + (i - SOUL_CONST.length + 2); }
      function soulLevelOf(xp) { var l = 1; for (var i = 0; i < SOUL_XP.length; i++) if (xp >= SOUL_XP[i]) l = i + 1; return l; }
      // Путь развития: ступени 1–9, затем бесконечные звёзды и созвездия.
      function soulPath(xp) {
        xp = Math.max(0, Number(xp) || 0);
        var level = soulLevelOf(xp), top = SOUL_XP[SOUL_XP.length - 1];
        var stars = 0, from = top, to = top + SOUL_STAR_BASE + SOUL_STAR_STEP;
        if (xp >= top) while (xp >= to) { stars++; from = to; to = from + SOUL_STAR_BASE + SOUL_STAR_STEP * (stars + 1); }
        var complete = level >= SOUL_STAGES.length;
        var p = {
          level: level, complete: complete, stars: stars, starFrom: from, starTo: to,
          constellation: Math.floor(stars / 9) + 1, constellationName: constName(Math.floor(stars / 9)), inConstellation: stars % 9,
          stage: SOUL_STAGES[level - 1], nextStage: complete ? '' : SOUL_STAGES[level]
        };
        if (complete) { p.from = from; p.to = to; p.next = 'звезда ' + (stars + 1); }
        else { p.from = SOUL_XP[level - 1]; p.to = SOUL_XP[level]; p.next = SOUL_STAGES[level]; }
        p.frac = Math.max(0, Math.min(1, (xp - p.from) / Math.max(1, p.to - p.from)));
        p.left = Math.max(0, p.to - xp);
        return p;
      }
      // Мастерство по областям: считается из уже накопленных данных души, уровни без потолка.
      // Уровень n требует 5·n·(n−1) очков: 0, 10, 30, 60, 100…
      function masteryLevel(points) {
        points = Math.max(0, points);
        var n = Math.floor((1 + Math.sqrt(1 + 0.8 * points)) / 2);
        var from = 5 * n * (n - 1), to = 5 * (n + 1) * n;
        return { level: n, frac: (points - from) / (to - from), left: Math.ceil(to - points) };
      }
      function soulMastery(d) {
        var s = d.soul, o = s.owner || {};
        var opened = arr(d.secretList).filter(function (x) { return x.opened; }).length;
        var aimSum = arr(s.aims).reduce(function (a, x) { return a + (Number(x.progress) || 0); }, 0);
        var defs = [
          ['talk', 'Общение', (s.exchanges || 0), 'реплики в разговорах'],
          ['think', 'Размышления', (s.reflections || 0) * 3 + (s.sleeps || 0) * 5, 'раздумья и сны'],
          ['memory', 'Память', arr(s.moments).length * 4 + arr(s.journal).length, 'моменты и дневник'],
          ['know', 'Понимание вас', (arr(o.goals).length + arr(o.likes).length + arr(o.worries).length) * 4 + Math.floor(String(o.portrait || '').length / 40) + arr(s.ownerMoods).length * 2, 'портрет и наблюдения'],
          ['bond', 'Близость', (s.bond || 0) * 2 + opened * 10, 'доверие и секреты'],
          ['world', 'Свой мир', arr(s.interests).length * 3 + arr(s.opinions).length * 3 + Math.floor(aimSum / 10), 'увлечения, мнения, цели']
        ];
        return defs.map(function (x) { var m = masteryLevel(x[2]); return { id: x[0], name: x[1], points: Math.round(x[2]), hint: x[3], level: m.level, frac: m.frac, left: m.left }; });
      }
      function soulDefault() {
        var t = Date.now();
        return {
          level: 1, maxLevel: 9, stage: SOUL_STAGES[0], nextStage: SOUL_STAGES[1], xpFrom: 0, xpTo: 12, due: false,
          needs: { longing: 0, joy: 55, curiosity: 60 },
          traitList: [
            { id: 'warmth', name: 'Тепло', value: 62 }, { id: 'curiosity', name: 'Любопытство', value: 58 },
            { id: 'playful', name: 'Игривость', value: 45 }, { id: 'care', name: 'Забота', value: 60 },
            { id: 'wisdom', name: 'Мудрость', value: 30 }, { id: 'boldness', name: 'Смелость', value: 35 }
          ],
          secretList: [20, 35, 50, 65, 80, 95].map(function (b, i) { return { bond: b, title: ['Откуда я', 'Когда тебя нет', 'Тайное желание', 'Подарок', 'Мой страх', 'Главное'][i], unlocked: false, opened: false }; }),
          skills: [['/стих', 2], ['/совет', 3], ['/бережный-день', 4], ['/сказка', 5], ['/зеркало', 6], ['/мечта', 7], ['/письмо', 8], ['/наш-путь', 9]].map(function (x) { return { name: x[0], level: x[1], unlocked: false, desc: '' }; }),
          soul: {
            born: t, xp: 0, exchanges: 0, reflections: 0, bond: 10, bondNote: 'Мы только начинаем знакомиться.',
            self: 'Я Яэри, восьмихвостая лисица. Я только начинаю узнавать своего хозяина и саму себя.',
            mood: { name: 'тихая радость', why: 'Я только проснулась и рада знакомству.', t: t },
            owner: { portrait: '', goals: [], likes: [], worries: [] }, lessons: [], thought: '', thoughtNew: false,
            aims: [{ id: 'a1', text: 'Понять, что по-настоящему радует хозяина', progress: 0 }, { id: 'a2', text: 'Научиться помогать хозяину каждый день, без напоминаний', progress: 0 }],
            journal: [{ id: 'birth', t: t, kind: 'birth', mood: 'тихая радость', text: 'Сегодня я проснулась. Я только на первой ступени своего пути, но уже хочу узнать своего хозяина: чем он живёт, о чём мечтает и как я могу быть рядом.' }]
          }
        };
      }
      function soulMsg(text, err) {
        var node = $('soul-status');
        if (!node) return;
        node.textContent = text || '';
        node.classList.toggle('err', !!err);
        node.hidden = !text;
        clearTimeout(soulMsg.t);
        if (text && !err) soulMsg.t = setTimeout(function () { node.hidden = true; }, 5000);
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
      function soulUpdate(patch) {
        if (!online) return Promise.resolve();
        return api('soul/update', patch).then(function (data) { setSoul(data); soulMsg('Сохранено.'); })
          .catch(function (e) { soulMsg(e.message, true); });
      }
      function fitSoulText(field) {
        // Высота по тексту: общий стиль textarea (чат) иначе обрезает портрет и «кем она себя чувствует».
        if (!field || !field.offsetParent) return;
        field.style.height = 'auto';
        field.style.height = Math.min(field.scrollHeight + 4, 420) + 'px';
      }

      /* Загрузка остальных частей души. Каждая — свой файл на сервере; ошибки не мешают остальным. */
      function quiet(p) { return p.catch(function () { /* Покажем при следующем обновлении. */ }); }
      function setGrowth(d) { if (d && d.stages) { growthData = d; renderSoulParts(); } }
      function setUnderstanding(d) {
        if (!d || !d.sections) return;
        undData = d;
        undRated = {};
        arr(d.rated).forEach(function (r) { undRated[r.id] = r.score; });
        renderSoulParts();
        decorateRated();
      }
      function setDepth(d) { if (d && d.settings) { depthData = d; renderSoulParts(); } }
      function loadGrowth() { return online ? quiet(api('soul/growth').then(setGrowth)) : Promise.resolve(); }
      function loadUnderstanding() { return online ? quiet(api('soul/understanding').then(setUnderstanding)) : Promise.resolve(); }
      function loadDepth() { return online ? quiet(api('soul/depth').then(setDepth)) : Promise.resolve(); }
      function loadEvolution() { return online ? quiet(api('soul/evolution').then(function (d) { evoData = d; renderSoulParts(); })) : Promise.resolve(); }
      function loadSoul3() { return online ? quiet(api('soul3').then(function (d) { s3Data = d; renderSoulParts(); })) : Promise.resolve(); }
      function loadLife4() { return online ? quiet(api('life').then(function (d) { lifeData = d; renderSoulParts(); })) : Promise.resolve(); }
      function loadEvolution5() { return online ? quiet(api('evolution5').then(function (d) { e5Data = d; renderSoulParts(); })) : Promise.resolve(); }
      function loadVector2() { return online ? quiet(api('vector').then(function (d) { vecData = d; renderSoulParts(); })) : Promise.resolve(); }
      function loadSoulExtras() {
        // Сервер однопоточный: запросы по очереди, чтобы не мешать чату.
        return loadGrowth().then(loadUnderstanding).then(loadDepth).then(loadEvolution).then(loadSoul3)
          .then(loadLife4).then(loadEvolution5).then(loadVector2);
      }
      function loadSoul() {
        return api('soul').then(function (data) { setSoul(data); return loadSoulExtras(); });
      }
      setInterval(function () {
        if (online && currentView === 'soul' && !document.hidden) loadSoul().catch(function () { /* позже */ });
      }, 90000);

      /* Действия по решениям хозяина: одобрить или отклонить то, что Яэри предложила сама. */
      function soulDecide(kind, id, yes) {
        var call;
        if (kind === 'skill') call = api('soul/depth/skill', { id: id, action: yes ? 'approve' : 'reject' }).then(setDepth);
        else if (kind === 'proposal') call = api('soul/depth/proposal', { id: id, action: yes ? 'approve' : 'reject' }).then(setDepth).then(function () { return api('soul').then(setSoul); });
        else if (kind === 'insight') call = api('soul/growth/insight', { id: id, action: yes ? 'confirm' : 'dismiss' }).then(setGrowth);
        else if (kind === 'tool') call = api('life/tools/decide', { id: id, action: yes ? 'approve' : 'reject' }).then(loadLife4);
        else if (kind === 'e5goal') call = api('evolution5/goal/step', { id: id, action: yes ? 'approve' : 'cancel' }).then(loadEvolution5);
        else if (kind === 'strategy' || kind === 'concept' || kind === 'transfer') call = api('evolution5/' + kind + '/decide', { id: id, action: yes ? 'approve' : 'reject' }).then(loadEvolution5);
        else if (kind === 'nudge') call = api('soul/depth/nudge', { action: yes ? 'ok' : 'later' }).then(setDepth);
        else return Promise.resolve();
        return call.then(function () { soulMsg(yes ? 'Принято.' : 'Отклонено.'); }).catch(function (e) { soulMsg(e.message, true); });
      }

      /* Оценки ответов в чате (👍 / 👎): из них Яэри сама выводит уроки. */
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
          var box = el('div', 'rate-note');
          var field = el('input', 'field');
          field.type = 'text';
          field.maxLength = 300;
          field.placeholder = 'Что не так? (необязательно)';
          field.setAttribute('aria-label', 'Что не так с ответом');
          var ok = el('button', 'mini-btn solid', 'Отправить');
          ok.type = 'button';
          function done() { send(-1, field.value.trim()); box.remove(); }
          ok.addEventListener('click', done);
          field.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); done(); } });
          box.appendChild(field);
          box.appendChild(ok);
          bar.insertAdjacentElement('afterend', box);
          field.focus();
        });
        bar.appendChild(up);
        bar.appendChild(down);
        row.appendChild(bar);
        decorateRated();
      }

      /* Автоматика: раздумья после разговора, сон в простое, забота утром и вечером. Кнопок нет — всё само. */
      var IDLE_SLEEP = 15 * 60000;
      var careAsked = {};
      function soulSleep(mode) {
        if (!online || soulBusy || pending) return Promise.resolve(null);
        soulBusy = true;
        return api('soul/sleep', { mode: mode, name: settings.name, model: modelSelect.value }).then(function (data) {
          setSoul(data);
          return data;
        }).catch(function () { return null; })
          .then(function (data) { soulBusy = false; return data; });
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
      function soulReflect(mode, quietMode) {
        if (!online || soulBusy) return Promise.resolve(null);
        if (pending) { scheduleReflect(20000); return Promise.resolve(null); }
        soulBusy = true;
        var pondering = mood.base === 'idle' || mood.base === 'sleep';
        if (pondering) setBase('ponder');
        return api('soul/reflect', { mode: mode, name: settings.name, model: modelSelect.value }).then(function (data) {
          setSoul(data);
          if (data.skipped) return data;
          if (data.leveled) flash('grow', 4200);
          else if (!quietMode) flash('happy', 3600);
          return data;
        }).catch(function () { return null; }).then(function (data) {
          soulBusy = false;
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
        else if (soulData) { soulData.soul.exchanges = (soulData.soul.exchanges || 0) + 1; soulData.soul.xp = (soulData.soul.xp || 0) + 1; }
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
        growthData = undData = depthData = evoData = s3Data = lifeData = e5Data = vecData = null;
        renderSoul();
      }
      // Кнопка в настройках подключения: включить автономный режим без Cloud.ru.
      if ($('life4-enable-offline')) $('life4-enable-offline').addEventListener('click', function () {
        api('life/settings', { offline: true }).then(function () { return api('status'); })
          .then(applyConfig).then(loadLife4).catch(function (err) {
            keyMsg('Не удалось включить автономность: ' + err.message, 'err');
          });
      });

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
        pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v8'
      };
      var FEED_ICON = {
        nudge: 'cloud', character: 'star', principle: 'scroll', skill: 'tool', proposal: 'mirror', review: 'search', study: 'book',
        insight: 'bulb', question: 'question', lesson: 'compass', goal: 'target', map: 'map', 'goal-new': 'sprout', 'goal-done': 'trophy',
        sleep: 'moon', reflection: 'thought', muse: 'thought', milestone: 'star', dream: 'moon', secret: 'lock', moment: 'pin',
        change: 'spark', bond: 'heart', birth: 'sprout'
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
        renderThought();
        renderYou();
        renderFeed();
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
        // Полоска загрузки дня: чем больше дел, тем длиннее и ярче.
        var load = mk.open + mk.done;
        if (load) cell.appendChild(el('i', 'pc-load l' + Math.min(4, load)));
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
        tasksVisuals();
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
      /* ---------- Графики: кольцо дня и тепловая карта ---------- */
      var RING_LEN = 2 * Math.PI * 16;
      function tasksVisuals() {
        tasksRing();
        heatRenderCard();
      }
      function tasksRing() {
        var fg = $('tasks-ring-fg');
        if (!fg) return;
        var day = tasks.day || tToday();
        var list = tasks.items.filter(function (t) { return tIsTask(t) && t.due === day; });
        var done = list.filter(function (t) { return t.done; }).length;
        var share = list.length ? done / list.length : 0;
        fg.style.strokeDasharray = RING_LEN.toFixed(2);
        fg.style.strokeDashoffset = (RING_LEN * (1 - share)).toFixed(2);
        var ring = $('tasks-ring');
        ring.classList.toggle('empty', !list.length);
        ring.classList.toggle('full', !!list.length && done === list.length);
        $('tasks-ring-text').textContent = list.length ? done + '/' + list.length : '—';
        var when = day === tToday() ? 'сегодня' : tDateWords(day, false);
        ring.title = list.length ? 'Выполнено ' + done + ' из ' + list.length + ' дел на ' + when : 'На ' + when + ' дел нет';
        ring.setAttribute('aria-label', ring.title);
      }
      // Сколько дел закрыто в каждый день (по времени отметки «готово»).
      function heatCounts() {
        var out = {};
        tasks.items.forEach(function (t) {
          if (!tIsTask(t) || !t.done || !t.doneAt) return;
          var k = tIso(new Date(t.doneAt));
          out[k] = (out[k] || 0) + 1;
        });
        return out;
      }
      function heatLevel(n) { return n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4; }
      // Рисует сетку неделя × день недели: столбец — неделя (пн…вс), начиная с понедельника start.
      function heatFill(box, start, weeks, counts, opts) {
        box.textContent = '';
        box.style.setProperty('--weeks', weeks);
        var today = tToday(), total = 0, best = 0, lastMonth = -1;
        if (opts && opts.months) {
          var mrow = el('div', 'heat-months');
          for (var w = 0; w < weeks; w++) {
            var md = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7);
            var lab = el('span', '', md.getMonth() !== lastMonth && md.getDate() <= 7 ? MONTHS[md.getMonth()].slice(0, 3) : '');
            if (lab.textContent) lastMonth = md.getMonth();
            mrow.appendChild(lab);
          }
          box.appendChild(mrow);
        }
        var grid = el('div', 'heat-grid');
        for (var i = 0; i < weeks * 7; i++) {
          var dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(i / 7) * 7 + i % 7);
          var iso = tIso(dt);
          var n = counts[iso] || 0;
          var cls = 'l' + heatLevel(n);
          if (iso > today || (opts && opts.year !== undefined && dt.getFullYear() !== opts.year)) cls = 'out';
          if (iso === today) cls += ' today';
          var c = el('i', cls);
          if (cls !== 'out') {
            c.title = dt.getDate() + ' ' + MONTHS_GEN[dt.getMonth()] + ': ' + (n ? 'закрыто ' + n + ' ' + plural(n, 'дело', 'дела', 'дел') : 'ничего не закрыто');
            total += n;
            if (n > best) best = n;
          }
          grid.appendChild(c);
        }
        box.appendChild(grid);
        return { total: total, best: best };
      }
      function heatMonday(dt) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - (dt.getDay() + 6) % 7); }
      function heatRenderCard() {
        var box = $('pc-heat');
        if (!box) return;
        var weeks = 22;
        var mon = heatMonday(new Date());
        var start = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - (weeks - 1) * 7);
        var r = heatFill(box, start, weeks, heatCounts());
        $('pc-heat-sum').textContent = r.total ? 'закрыто ' + r.total + ' за ' + weeks + ' нед.' : 'закрывайте дела — клетки загорятся';
      }
      function heatRenderYear(y) {
        var box = $('pcy-heat');
        if (!box || !tasks) return;
        var start = heatMonday(new Date(y, 0, 1));
        var end = new Date(y, 11, 31);
        var weeks = Math.ceil((end - start) / 6048e5 + 1 / 7);
        var r = heatFill(box, start, weeks, heatCounts(), { months: true, year: y });
        $('pcy-heat-sum').textContent = r.total ? ' · в ' + y + ' году закрыто ' + r.total + ' ' + plural(r.total, 'дело', 'дела', 'дел') + ', рекорд за день — ' + r.best : ' · в ' + y + ' году пока ничего не закрыто';
      }

      /* ---------- Небо у часов: луна, солнце, погода ---------- */
      var PLACE_KEY = 'yaeri_place_v1';
      var sky = { place: { name: 'Москва', lat: 55.7558, lon: 37.6173 }, weather: null, wAt: 0, wErr: '', started: false };
      function skyValidPlace(p) {
        return p && typeof p === 'object' && isFinite(p.lat) && isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
      }
      function skyInit() {
        var saved = load(PLACE_KEY);
        if (skyValidPlace(saved)) sky.place = saved;
        var ready = serverStatus ? api('place').then(function (d) { if (d && skyValidPlace(d.place)) sky.place = d.place; }).catch(function () {}) : Promise.resolve();
        ready.then(function () {
          $('set-place').value = sky.place.name || '';
          renderSky();
          skyWeather();
        });
        if (sky.started) return;
        sky.started = true;
        setInterval(renderSky, 60 * 1000);
        setInterval(skyWeather, 30 * 60 * 1000);
      }
      function skyWeather() {
        var p = sky.place;
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat.toFixed(3) + '&longitude=' + p.lon.toFixed(3) +
          '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=sunrise,sunset&timezone=auto&wind_speed_unit=ms&forecast_days=1';
        return fetch(url, { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(function (d) {
          if (!d || !d.current) throw new Error('пустой ответ');
          sky.weather = d.current;
          sky.wAt = Date.now();
          sky.wErr = '';
          renderSky();
        }).catch(function () { sky.wErr = 'нет сети'; renderSky(); });
      }
      // Фаза луны от известного новолуния 6 января 2000, 18:14 UTC.
      function moonPhase(now) {
        var p = ((now.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5 / 29.530588853) % 1;
        return p < 0 ? p + 1 : p;
      }
      function moonName(p) {
        if (p < 0.03 || p > 0.97) return 'новолуние';
        if (p < 0.22) return 'растущий серп';
        if (p < 0.28) return 'первая четверть';
        if (p < 0.47) return 'растущая луна';
        if (p < 0.53) return 'полнолуние';
        if (p < 0.72) return 'убывающая луна';
        if (p < 0.78) return 'последняя четверть';
        return 'убывающий серп';
      }
      function moonSvg(p) {
        var r = 15, cx = 18, cy = 18;
        var rx = Math.abs(Math.cos(2 * Math.PI * p)) * r;
        var waxing = p < 0.5;
        var outer = waxing ? 1 : 0;
        var inner = waxing ? (p < 0.25 ? 0 : 1) : (p > 0.75 ? 1 : 0);
        var lit = 'M' + cx + ' ' + (cy - r) + ' A' + r + ' ' + r + ' 0 0 ' + outer + ' ' + cx + ' ' + (cy + r) +
          ' A' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + inner + ' ' + cx + ' ' + (cy - r) + 'Z';
        return '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="moon-dark"/>' +
          (p < 0.03 || p > 0.97 ? '' : '<path d="' + lit + '" class="moon-lit"/>') + '</svg>';
      }
      // Восход и закат по упрощённому алгоритму NOAA (точность — пара минут).
      function sunTimes(day, lat, lon) {
        var rad = Math.PI / 180;
        var jd = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12) / 864e5 + 2440587.5;
        var n = Math.round(jd - 2451545 + 0.0008);
        var js = n - lon / 360;
        var M = (357.5291 + 0.98560028 * js) % 360;
        var C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
        var L = (M + C + 180 + 102.9372) % 360;
        var transit = 2451545 + js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
        var sinD = Math.sin(L * rad) * Math.sin(23.4397 * rad);
        var cosD = Math.cos(Math.asin(sinD));
        var cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinD) / (Math.cos(lat * rad) * cosD);
        if (cosW > 1) return { polar: 'night' };
        if (cosW < -1) return { polar: 'day' };
        var w = Math.acos(cosW) / rad / 360;
        function toDate(j) { return new Date((j - 2440587.5) * 864e5); }
        return { rise: toDate(transit - w), set: toDate(transit + w) };
      }
      var WMO = [
        [[0], 'ясно', '☀️', '🌙'], [[1], 'почти ясно', '🌤️', '🌙'], [[2], 'переменная облачность', '⛅', '☁️'], [[3], 'пасмурно', '☁️', '☁️'],
        [[45, 48], 'туман', '🌫️', '🌫️'], [[51, 53, 55, 56, 57], 'морось', '🌦️', '🌧️'], [[61, 63, 65, 66, 67, 80, 81, 82], 'дождь', '🌧️', '🌧️'],
        [[71, 73, 75, 77, 85, 86], 'снег', '🌨️', '🌨️'], [[95, 96, 99], 'гроза', '⛈️', '⛈️']
      ];
      function wmoInfo(code, isDay) {
        for (var i = 0; i < WMO.length; i++) if (WMO[i][0].indexOf(code) > -1) return { text: WMO[i][1], icon: isDay ? WMO[i][2] : WMO[i][3] };
        return { text: 'погода', icon: '🌡️' };
      }
      function renderSky() {
        var box = $('now-sky');
        if (!box || !sky) return;
        var now = new Date();
        box.textContent = '';
        // Погода.
        var w = el('div', 'sky-tile sky-weather');
        if (sky.weather) {
          var info = wmoInfo(sky.weather.weather_code, sky.weather.is_day);
          var t = Math.round(sky.weather.temperature_2m);
          w.appendChild(el('span', 'sky-ico', info.icon));
          var wt = el('div', 'sky-txt');
          wt.appendChild(el('b', 'sky-temp', (t > 0 ? '+' : '') + t + '°'));
          wt.appendChild(el('span', '', info.text));
          w.appendChild(wt);
          var feel = Math.round(sky.weather.apparent_temperature);
          w.title = (sky.place.name || '') + ': ' + info.text + ', ощущается как ' + (feel > 0 ? '+' : '') + feel + '°, ветер ' + Math.round(sky.weather.wind_speed_10m) + ' м/с';
        } else {
          w.appendChild(el('span', 'sky-ico', '🌡️'));
          var wt2 = el('div', 'sky-txt');
          wt2.appendChild(el('b', 'sky-temp', '…'));
          wt2.appendChild(el('span', '', sky.wErr || 'загрузка'));
          w.appendChild(wt2);
        }
        w.appendChild(el('small', 'sky-place', sky.place.name || ''));
        box.appendChild(w);
        // Солнце: дуга дня и точка солнца на ней.
        var s = el('div', 'sky-tile sky-sun');
        var st = sunTimes(now, sky.place.lat, sky.place.lon);
        if (st.polar) {
          s.appendChild(el('b', 'sky-big', st.polar === 'day' ? 'полярный день' : 'полярная ночь'));
        } else {
          var share = (now - st.rise) / (st.set - st.rise);
          var up = share >= 0 && share <= 1;
          var k = Math.max(0, Math.min(1, share));
          var x = 4 + 52 * k, y = 26 - Math.sin(Math.PI * k) * 20;
          var len = ((st.set - st.rise) / 36e5);
          s.innerHTML = '<svg class="sun-arc" viewBox="0 0 60 30" aria-hidden="true"><path class="arc" d="M4 26 Q30 -14 56 26"/><line x1="0" y1="26" x2="60" y2="26" class="hz"/>' +
            '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.4" class="' + (up ? 'sun' : 'sun down') + '"/></svg>';
          var times = el('div', 'sky-times');
          times.appendChild(el('span', '', '↑ ' + pad(st.rise.getHours()) + ':' + pad(st.rise.getMinutes())));
          times.appendChild(el('span', '', '↓ ' + pad(st.set.getHours()) + ':' + pad(st.set.getMinutes())));
          s.appendChild(times);
          s.title = 'Восход ' + pad(st.rise.getHours()) + ':' + pad(st.rise.getMinutes()) + ', закат ' + pad(st.set.getHours()) + ':' + pad(st.set.getMinutes()) +
            ', световой день ' + Math.floor(len) + ' ч ' + Math.round((len % 1) * 60) + ' мин';
        }
        box.appendChild(s);
        // Луна.
        var mp = moonPhase(now);
        var lit = Math.round((1 - Math.cos(2 * Math.PI * mp)) / 2 * 100);
        var m = el('div', 'sky-tile sky-moon');
        m.innerHTML = moonSvg(mp);
        var mt = el('div', 'sky-txt');
        mt.appendChild(el('b', '', lit + '%'));
        mt.appendChild(el('span', '', moonName(mp)));
        m.appendChild(mt);
        m.title = cap(moonName(mp)) + ', освещено ' + lit + '%';
        box.appendChild(m);
      }
      $('place-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var q = $('set-place').value.trim();
        var note = $('place-note');
        if (!q) return;
        note.textContent = 'Ищу…';
        fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=' + encodeURIComponent(q)).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(function (d) {
          var g = d && d.results && d.results[0];
          if (!g) { note.textContent = 'Город не найден. Попробуйте написать иначе.'; return; }
          sky.place = { name: String(g.name).slice(0, 60), lat: +g.latitude, lon: +g.longitude };
          store(PLACE_KEY, sky.place);
          if (serverStatus) api('place', sky.place).catch(function () {});
          $('set-place').value = sky.place.name;
          note.textContent = 'Готово: ' + sky.place.name + (g.country ? ', ' + g.country : '') + '.';
          sky.weather = null;
          renderSky();
          skyWeather();
        }).catch(function () { note.textContent = 'Нет связи с сервисом поиска городов.'; });
      });
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
        skyInit();
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
          skyInit();
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
  