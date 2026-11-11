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
        return api('soul/depth').then(setDepth).catch(function () { /* Покажем при следующем обновлении. */ });
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
      $('soul-mini').addEventListener('click', openSoul);
      $('soul-mini').addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSoul(); }
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

