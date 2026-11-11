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

