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
