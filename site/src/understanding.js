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

