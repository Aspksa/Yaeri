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
  