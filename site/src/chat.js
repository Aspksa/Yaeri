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
      var GIFT_KIND = { poem: 'стихотворение', story: 'история', drawing: 'рисунок', find: 'находка в памяти' };
      var WILL_TAG = { decline: '✋ мягко отказалась', disagree: '⚖ не согласна', hurt: '☁ обиделась', forgive: '♡ простила' };
      // Рисунок Яэри — SVG, уже очищенный сервером; через <img> скрипты в нём не исполняются никогда.
      function giftArt(svg, title) {
        var fig = el('figure', 'gift-art');
        var img = el('img');
        img.alt = title ? 'Рисунок Яэри: ' + title : 'Рисунок Яэри';
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(svg));
        fig.appendChild(img);
        return fig;
      }
      function bubble(m, animate) {
        var row = el('div', 'msg ' + (m.role === 'user' ? 'user' : 'assistant') + (m.error ? ' error' : '') + (animate ? ' enter' : ''));
        row.appendChild(el('div', 'who', m.role === 'user' ? settings.name : 'Яэри'));
        if (m.kind === 'thought') { row.classList.add('thought'); row.appendChild(el('div', 'thought-tag', '✦ думала о вас')); }
        if (m.kind === 'remind') { row.classList.add('thought', 'remind'); row.appendChild(el('div', 'thought-tag', '⏰ напоминание о делах')); }
        if (m.kind === 'care') { row.classList.add('thought'); row.appendChild(el('div', 'thought-tag', m.dream ? '☾ мой сон' : (m.slot === 'evening' ? '☾ вечер' : '☀ утро'))); }
        if (m.kind === 'gift') { row.classList.add('thought', 'gift'); row.appendChild(el('div', 'thought-tag', '🎁 подарок · ' + (GIFT_KIND[m.gift && m.gift.kind] || 'от скуки'))); }
        row.appendChild(el('div', 'text', m.text));
        if (m.kind === 'gift' && m.gift && m.gift.svg) row.appendChild(giftArt(m.gift.svg, m.gift.title));
        if (m.will && m.will.reason) {
          var wl = el('div', 'will-chip w-' + (m.will.type || 'x'));
          wl.appendChild(el('b', '', WILL_TAG[m.will.type] || 'её воля'));
          wl.appendChild(document.createTextNode(m.will.reason));
          row.appendChild(wl);
        }
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

