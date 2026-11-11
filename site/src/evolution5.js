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
          evolution5List('e5-goals',d.rankedGoals,function (li,g) {
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
