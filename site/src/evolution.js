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

