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
        }).then(loadEvidence).then(loadVector2).catch(soul3Error);
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


