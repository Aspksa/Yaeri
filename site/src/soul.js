      /* ---------- Душа Яэри ---------- */
      // Состояние души живёт на сервере (data\soul.json). Здесь только показ, правки хозяина
      // и запуск раздумий: после нескольких реплик и при новой встрече.
      var SOUL_STAGES = ['Искорка', 'Пробуждение', 'Любопытство', 'Знакомство', 'Доверие', 'Понимание', 'Привязанность', 'Родство', 'Девятый хвост'];
      var SOUL_KINDS = { reflection: 'раздумье', muse: 'думала о вас', milestone: 'новый хвост', birth: 'пробуждение', moment: 'важный момент', dream: 'сон', secret: 'секрет' };
      var soulData = null;
      var soulTimer = 0;
      var soulBusy = false;
      var soulEditing = false;

      (function () {
        // Градиенты хвостов лежат в отдельном невидимом SVG: так они работают, даже если карточка скрыта.
        var defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        defs.setAttribute('width', '0');
        defs.setAttribute('height', '0');
        defs.setAttribute('aria-hidden', 'true');
        defs.style.position = 'absolute';
        defs.innerHTML = '<defs><linearGradient id="soulTail" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--a-deep)"/><stop offset=".55" style="stop-color:var(--a-strong)"/><stop offset=".85" style="stop-color:var(--a)"/><stop offset="1" style="stop-color:var(--a-glow)"/></linearGradient>' +
          '<radialGradient id="soulPearl"><stop offset="0" stop-color="#fff"/><stop offset=".4" style="stop-color:var(--a-glow)"/><stop offset="1" style="stop-color:var(--a);stop-opacity:.2"/></radialGradient></defs>';
        body.insertBefore(defs, body.firstChild);
      }());

      function tailsSvg(level) {
        // Девять хвостов веером; зажигаются от центра к краям.
        var order = [4, 3, 5, 2, 6, 1, 7, 0, 8];
        var out = '<svg viewBox="0 0 200 132">';
        for (var i = 0; i < 9; i++) {
          var rank = order.indexOf(i);
          var cls = rank < level ? 't-on' : (rank === level ? 't-next' : 't-off');
          var angle = -76 + i * 19;
          out += '<g transform="translate(100 120) rotate(' + angle + ')"><path class="' + cls + '" style="--i:' + i + '" d="M0 0 C -15 -24 -21 -62 -5 -98 C 0 -88 5 -90 11 -96 C 17 -62 13 -24 0 0 Z"/></g>';
        }
        return out + '<circle class="pearl" cx="100" cy="120" r="10"/></svg>';
      }
      function soulDefault() {
        var t = Date.now();
        return {
          level: 1, maxLevel: 9, stage: SOUL_STAGES[0], nextStage: SOUL_STAGES[1], xpFrom: 0, xpTo: 12, due: false,
          traitList: [
            { id: 'warmth', name: 'Тепло', value: 62 }, { id: 'curiosity', name: 'Любопытство', value: 58 },
            { id: 'playful', name: 'Игривость', value: 45 }, { id: 'care', name: 'Забота', value: 60 },
            { id: 'wisdom', name: 'Мудрость', value: 30 }, { id: 'boldness', name: 'Смелость', value: 35 }
          ],
          soul: {
            born: t, xp: 0, exchanges: 0, reflections: 0, bond: 10, bondNote: 'Мы только начинаем знакомиться.',
            self: 'Я Яэри, восьмихвостая лисица. Я только начинаю узнавать своего хозяина и саму себя.',
            mood: { name: 'тихая радость', why: 'Я только проснулась и рада знакомству.', t: t },
            owner: { portrait: '', goals: [], likes: [], worries: [] }, lessons: [], thought: '', thoughtNew: false,
            aims: [{ id: 'a1', text: 'Понять, что по-настоящему радует хозяина', progress: 0 }, { id: 'a2', text: 'Научиться помогать хозяину каждый день, без напоминаний', progress: 0 }],
            journal: [{ id: 'birth', t: t, kind: 'birth', mood: 'тихая радость', text: 'Сегодня я проснулась. У меня пока горит только один хвост души, но я уже хочу узнать своего хозяина: чем он живёт, о чём мечтает и как я могу быть рядом.' }]
          }
        };
      }
      function arr(x) { return Array.isArray(x) ? x : []; }
      function soulMsg(text, err) {
        var node = $('soul-status');
        node.textContent = text || '';
        node.classList.toggle('err', !!err);
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
      function renderSoulMini() {
        if (!soulData || !$('soul-mini-stage')) return;
        var s = soulData.soul;
        $('soul-mini-tails').innerHTML = tailsSvg(soulData.level);
        $('soul-mini-stage').textContent = soulData.stage;
        $('soul-mini-mood').textContent = (s.mood.name || '') + ' · близость ' + s.bond;
        $('soul-mini-meta').textContent = 'хвост ' + soulData.level + '/9';
        var span = soulData.xpTo > soulData.xpFrom ? soulData.xpTo - soulData.xpFrom : 1;
        var pct = soulData.xpTo < 0 ? 100 : Math.max(2, Math.min(100, (s.xp - soulData.xpFrom) / span * 100));
        $('soul-mini-xp').style.width = pct + '%';
        var th = $('soul-mini-thought');
        th.hidden = !s.thought;
        th.textContent = s.thought ? '«' + cut(s.thought, 140) + '»' : '';
      }
      function chipList(box, items, key) {
        var ul = box.querySelector('ul');
        ul.textContent = '';
        if (!items.length) ul.appendChild(el('li', 'empty', key === 'lessons' ? 'Пока ничего. Яэри запишет сюда, что поняла о том, как с вами говорить.' : 'пока пусто'));
        items.forEach(function (text, i) {
          var li = el('li');
          li.appendChild(el('span', '', text));
          if (online) {
            var del = el('button', '', '×');
            del.type = 'button';
            del.setAttribute('aria-label', 'Убрать: ' + text);
            del.addEventListener('click', function () {
              var next = items.slice();
              next.splice(i, 1);
              var patch = {};
              patch[key] = next;
              soulUpdate(patch);
            });
            li.appendChild(del);
          }
          ul.appendChild(li);
        });
        box.querySelector('input').hidden = !online;
      }
      function renderSoul() {
        if (!soulData) soulData = soulDefault();
        renderSoulMini();
        if (currentView !== 'soul') return;
        var d = soulData, s = d.soul;
        $('soul-demo').hidden = online;
        renderHero();
        $('soul-tails').innerHTML = tailsSvg(d.level);
        $('soul-stage').textContent = d.stage;
        $('soul-level').textContent = 'хвост души ' + d.level + ' из ' + (d.maxLevel || 9);
        var span = d.xpTo > d.xpFrom ? d.xpTo - d.xpFrom : 1;
        var pct = d.xpTo < 0 ? 100 : Math.max(0, Math.min(100, (s.xp - d.xpFrom) / span * 100));
        $('soul-xp').style.width = pct + '%';
        $('soul-xp-bar').setAttribute('aria-valuenow', Math.round(pct));
        $('soul-xp-note').textContent = d.xpTo < 0 ? 'Все девять хвостов горят.' : 'До ступени «' + d.nextStage + '»: ещё ' + Math.max(0, d.xpTo - s.xp) + ' опыта (реплика — 1, раздумье — 5)';
        $('soul-mood').textContent = s.mood.name || '—';
        $('soul-mood-why').textContent = s.mood.why || '';
        $('soul-bond').style.width = Math.max(2, s.bond) + '%';
        $('soul-bond-val').textContent = s.bond + '/100';
        $('soul-bond-note').textContent = s.bondNote || '';
        var days = Math.max(1, Math.floor((Date.now() - (s.born || Date.now())) / 864e5) + 1);
        $('soul-st-ex').textContent = s.exchanges || 0;
        $('soul-st-ref').textContent = s.reflections || 0;
        $('soul-st-days').textContent = days;
        $('soul-age').textContent = 'с ' + dmy(s.born || Date.now());
        if (!soulEditing) {
          $('soul-self').value = s.self || '';
          $('soul-portrait').value = (s.owner && s.owner.portrait) || '';
        }
        $('soul-self').readOnly = !online;
        $('soul-portrait').readOnly = !online;

        var th = $('soul-thought');
        th.hidden = !s.thought;
        $('soul-thought-text').textContent = s.thought || '';

        var list = $('soul-journal');
        list.textContent = '';
        var jq = jState.q.toLowerCase();
        var shown = s.journal.slice().reverse().filter(function (j) {
          if (jState.day && dayKey(new Date(j.t || 0)) !== jState.day) return false;
          return !jq || String(j.text || '').toLowerCase().indexOf(jq) > -1 || String(j.mood || '').toLowerCase().indexOf(jq) > -1 || String(SOUL_KINDS[j.kind] || '').indexOf(jq) > -1;
        });
        $('soul-journal-count').textContent = (shown.length !== s.journal.length ? shown.length + ' из ' : '') + s.journal.length + ' ' + plural(s.journal.length, 'запись', 'записи', 'записей');
        renderJCal(s.journal);
        var jf = $('soul-jfilter');
        jf.hidden = !jState.day && !jq;
        jf.textContent = '';
        if (!jf.hidden) {
          jf.appendChild(el('span', '', (jState.day ? 'За ' + jState.day.split('-').reverse().join('.') : 'Все дни') + (jq ? ' · «' + jState.q + '»' : '')));
          jf.appendChild(smallBtn('Показать всё', 'Сбросить фильтр дневника', function () { jState.day = ''; jState.q = ''; $('soul-jsearch').value = ''; renderSoul(); }, 'mini-btn'));
        }
        shown.forEach(function (j) {
          var li = el('li', 'k-' + (j.kind || 'reflection'));
          var head = el('div', 'j-head');
          head.appendChild(el('b', '', SOUL_KINDS[j.kind] || 'запись'));
          head.appendChild(el('span', '', dmy(j.t) + ' ' + hhmm(j.t)));
          if (j.mood) head.appendChild(el('span', '', j.mood));
          li.appendChild(head);
          li.appendChild(el('p', 'j-text', j.text));
          if (online) {
            var del = el('button', 'j-del', '×');
            del.type = 'button';
            del.setAttribute('aria-label', 'Удалить запись дневника');
            del.addEventListener('click', function () {
              if (window.confirm('Удалить эту запись из дневника Яэри?')) soulUpdate({ removeJournal: j.id });
            });
            li.appendChild(del);
          }
          list.appendChild(li);
        });
        if (!s.journal.length) list.appendChild(el('li', 'empty', 'Дневник пока пуст.'));
        else if (!shown.length) list.appendChild(el('li', 'empty', 'Ничего не нашлось.'));

        each(document.querySelectorAll('#soul .soul-list[data-key]'), function (box) {
          var key = box.getAttribute('data-key');
          chipList(box, key === 'lessons' ? s.lessons : s.owner[key] || [], key);
        });

        renderSoulGrowth(d, s);
        renderTraitChart(d, s);
        renderGrowth();

        var traits = $('soul-traits');
        traits.textContent = '';
        arr(d.traitList).forEach(function (t) {
          var row = el('label', 'trait');
          row.appendChild(el('span', '', t.name));
          var range = el('input');
          range.type = 'range';
          range.min = 0;
          range.max = 100;
          range.value = t.value;
          range.disabled = !online;
          range.setAttribute('aria-label', t.name);
          var out = el('output', '', String(t.value));
          range.addEventListener('input', function () { out.textContent = range.value; });
          range.addEventListener('change', function () {
            var patch = { traits: {} };
            patch.traits[t.id] = Number(range.value);
            soulUpdate(patch);
          });
          row.appendChild(range);
          row.appendChild(out);
          traits.appendChild(row);
        });
      }
      function soulUpdate(patch) {
        if (!online) return Promise.resolve();
        soulMsg('Сохраняю…');
        return api('soul/update', patch).then(function (data) { setSoul(data); soulMsg('Сохранено.'); })
          .catch(function (e) { soulMsg(e.message, true); });
      }
      function bindSoulText(id, key) {
        var field = $(id);
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
      each(document.querySelectorAll('#soul .soul-list input'), function (inp) {
        inp.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter' || event.isComposing) return;
          event.preventDefault();
          var text = inp.value.trim();
          if (!text || !soulData) return;
          var key = inp.parentNode.getAttribute('data-key');
          var cur = key === 'lessons' ? soulData.soul.lessons : soulData.soul.owner[key];
          var patch = {};
          patch[key] = arr(cur).concat([text]);
          inp.value = '';
          soulUpdate(patch);
        });
      });


      /* Дневник: поиск и календарь. */
      var jState = { q: '', day: '', month: null };
      var JWEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
      function renderJCal(journal) {
        var days = {};
        journal.forEach(function (j) { var k = dayKey(new Date(j.t || 0)); days[k] = (days[k] || 0) + 1; });
        if (!jState.month) jState.month = new Date();
        var m = jState.month;
        var cal = $('soul-jcal');
        cal.textContent = '';
        var head = el('div', 'cal-head');
        head.appendChild(smallBtn('‹', 'Предыдущий месяц', function () { jState.month = new Date(m.getFullYear(), m.getMonth() - 1, 1); renderSoul(); }));
        var title = '';
        try { title = m.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }); } catch (e) { title = (m.getMonth() + 1) + '.' + m.getFullYear(); }
        head.appendChild(el('span', '', title));
        head.appendChild(smallBtn('›', 'Следующий месяц', function () { jState.month = new Date(m.getFullYear(), m.getMonth() + 1, 1); renderSoul(); }));
        cal.appendChild(head);
        JWEEK.forEach(function (w) { cal.appendChild(el('span', 'wd', w)); });
        var first = new Date(m.getFullYear(), m.getMonth(), 1);
        var lead = (first.getDay() + 6) % 7;
        for (var i = 0; i < lead; i++) cal.appendChild(el('span'));
        var total = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        var today = dayKey(new Date());
        for (var dd = 1; dd <= total; dd++) {
          (function (key, n) {
            var cnt = days[key] || 0;
            var b = el('button', 'd' + (cnt ? ' has' : '') + (key === jState.day ? ' sel' : '') + (key === today ? ' today' : ''), String(n));
            b.type = 'button';
            b.disabled = !cnt;
            b.title = cnt ? cnt + ' ' + plural(cnt, 'запись', 'записи', 'записей') : 'записей нет';
            b.addEventListener('click', function () { jState.day = jState.day === key ? '' : key; renderSoul(); });
            cal.appendChild(b);
          })(dayKey(new Date(m.getFullYear(), m.getMonth(), dd)), dd);
        }
      }
      $('soul-jsearch').addEventListener('input', function () { jState.q = this.value.trim(); renderSoul(); });

      /* График характера. */
      var TRAIT_COLORS = ['hsl(168, 68%, 62%)', 'hsl(45, 90%, 62%)', 'hsl(330, 80%, 70%)', 'hsl(208, 80%, 66%)', 'hsl(262, 70%, 74%)', 'hsl(24, 90%, 64%)'];
      function renderTraitChart(d, s) {
        var traits = arr(d.traitList);
        var pts = arr(s.traitHistory).slice();
        var today = dayKey(new Date());
        var cur = {};
        traits.forEach(function (t) { cur[t.id] = t.value; });
        if (!pts.length || pts[pts.length - 1].day !== today) pts.push({ day: today, traits: cur });
        var box = $('soul-chart');
        var W = 320, H = 150, L = 26, R = 8, T = 8, B = 20;
        var lo = 100, hi = 0;
        pts.forEach(function (p) { traits.forEach(function (t) { var v = p.traits[t.id]; if (typeof v === 'number') { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
        lo = Math.max(0, Math.floor((lo - 5) / 10) * 10);
        hi = Math.min(100, Math.ceil((hi + 5) / 10) * 10);
        if (hi - lo < 20) { hi = Math.min(100, lo + 20); lo = Math.max(0, hi - 20); }
        function X(i) { return pts.length < 2 ? (L + W - R) / 2 : L + i * (W - L - R) / (pts.length - 1); }
        function Y(v) { return T + (hi - v) * (H - T - B) / (hi - lo); }
        var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
        for (var g = lo; g <= hi; g += (hi - lo > 40 ? 20 : 10)) {
          svg += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/><text x="' + (L - 4) + '" y="' + (Y(g) + 3) + '" text-anchor="end">' + g + '</text>';
        }
        var fmt = function (k) { return k.slice(8, 10) + '.' + k.slice(5, 7); };
        svg += '<text x="' + L + '" y="' + (H - 5) + '">' + fmt(pts[0].day) + '</text>';
        if (pts.length > 1) svg += '<text x="' + (W - R) + '" y="' + (H - 5) + '" text-anchor="end">' + fmt(pts[pts.length - 1].day) + '</text>';
        traits.forEach(function (t, ti) {
          var c = TRAIT_COLORS[ti % TRAIT_COLORS.length];
          var path = '';
          pts.forEach(function (p, i) {
            var v = p.traits[t.id];
            if (typeof v !== 'number') return;
            path += (path ? ' L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
          });
          if (pts.length > 1) svg += '<path d="' + path + '" fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
          pts.forEach(function (p, i) {
            var v = p.traits[t.id];
            if (typeof v !== 'number') return;
            svg += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="' + (pts.length > 40 ? 1.2 : 2.4) + '" fill="' + c + '"><title>' + t.name + ' ' + v + ' · ' + fmt(p.day) + '</title></circle>';
          });
        });
        box.innerHTML = svg + '</svg>';
        $('soul-chart-meta').textContent = pts.length + ' ' + plural(pts.length, 'день', 'дня', 'дней');
        var lg = $('soul-chart-legend');
        lg.textContent = '';
        traits.forEach(function (t, ti) {
          var first = pts[0].traits[t.id];
          var delta = typeof first === 'number' ? t.value - first : 0;
          var sp = el('span');
          var i = el('i');
          i.style.background = TRAIT_COLORS[ti % TRAIT_COLORS.length];
          sp.appendChild(i);
          sp.appendChild(document.createTextNode(t.name + ' '));
          sp.appendChild(el('b', '', String(t.value)));
          if (delta) sp.appendChild(document.createTextNode(' (' + (delta > 0 ? '+' : '') + delta + ')'));
          lg.appendChild(sp);
        });
      }

      function smallBtn(text, label, fn, cls) {
        var b = el('button', cls || '', text);
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.title = label;
        b.addEventListener('click', fn);
        return b;
      }
      function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
      function renderSoulGrowth(d, s) {
        // Сон и грусть.
        var sad = d.sadStreak || 0;
        $('soul-sad').hidden = sad < 2;
        $('soul-sad').textContent = sad >= 2 ? 'Яэри замечает, что вам грустно уже ' + sad + ' ' + plural(sad, 'день', 'дня', 'дней') + ' подряд, и бережёт вас.' : '';
        $('soul-sleep-note').textContent = s.lastSleep ? 'Последний сон: ' + dmy(s.lastSleep) + ' ' + hhmm(s.lastSleep) + ' · всего ' + (s.sleeps || 0) + '. Засыпает сама, когда вы не работаете.' : 'Ещё ни разу не спала. Уснёт сама, когда вы отойдёте от компьютера.';

        // Настроение хозяина за 30 дней.
        var byDay = {};
        arr(s.ownerMoods).forEach(function (m) { byDay[m.day] = m; });
        var strip = $('soul-moods');
        strip.textContent = '';
        var now = new Date();
        var seen = 0;
        for (var i = 29; i >= 0; i--) {
          var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
          var m = byDay[dayKey(day)];
          var bar = el('i', m ? 's' + (m.score < 0 ? 'm' + (-m.score) : m.score) : '');
          bar.title = day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + (m ? ': ' + (m.label || m.score) : ': нет данных');
          if (m) seen++;
          strip.appendChild(bar);
        }
        var last = arr(s.ownerMoods)[arr(s.ownerMoods).length - 1];
        $('soul-moods-note').textContent = seen ? 'Последнее: ' + (last.label || '') + ' (' + last.day.split('-').reverse().join('.') + ')' : 'Яэри отмечает ваше настроение, когда обдумывает разговоры.';

        // Важные моменты.
        var moments = arr(s.moments).slice().sort(function (a, b) { return (b.pinned - a.pinned) || (b.strength - a.strength); });
        var ul = $('soul-moments');
        ul.textContent = '';
        $('soul-moments-count').textContent = moments.length ? moments.length + ' ' + plural(moments.length, 'момент', 'момента', 'моментов') : '';
        if (!moments.length) ul.appendChild(el('li', 'empty', 'Пока нет. Яэри сохранит сюда по-настоящему важное: ваши успехи, решения, первые разы.'));
        moments.forEach(function (mo) {
          var li = el('li');
          li.style.opacity = String(0.45 + Math.min(1, mo.strength / 10) * 0.55);
          li.appendChild(el('b', '', mo.title));
          if (mo.text) li.appendChild(el('p', '', mo.text));
          var str = el('span', 'str');
          var fill = el('i');
          fill.style.width = Math.round(mo.strength * 10) + '%';
          str.appendChild(fill);
          str.title = 'Сила памяти: ' + mo.strength + ' из 10 · ' + dmy(mo.t);
          li.appendChild(str);
          if (online) {
            var acts = el('span', 'acts');
            acts.appendChild(smallBtn('📌', mo.pinned ? 'Можно забыть' : 'Не забывать', function () { soulUpdate({ momentId: mo.id, pinned: !mo.pinned }); }, mo.pinned ? 'on' : ''));
            acts.appendChild(smallBtn('×', 'Забыть момент', function () { if (window.confirm('Пусть Яэри забудет «' + mo.title + '»?')) soulUpdate({ momentId: mo.id, remove: true }); }));
            li.appendChild(acts);
          }
          ul.appendChild(li);
        });

        // Её цели.
        var aims = $('soul-aims');
        aims.textContent = '';
        arr(s.aims).forEach(function (a) {
          var li = el('li');
          li.appendChild(el('span', '', a.text));
          li.appendChild(el('output', '', a.progress + '%'));
          if (online) li.appendChild(smallBtn('×', 'Убрать цель', function () { soulUpdate({ removeAim: a.id }); }));
          else li.appendChild(el('span'));
          var bar = el('span', 'bar');
          var fill = el('i');
          fill.style.width = Math.max(2, a.progress) + '%';
          bar.appendChild(fill);
          li.appendChild(bar);
          aims.appendChild(li);
        });
        if (!arr(s.aims).length) aims.appendChild(el('li', 'empty', 'Целей пока нет.'));
        $('soul-aim-add').hidden = !online;

        // Её увлечения.
        var ints = $('soul-interests');
        ints.textContent = '';
        if (!arr(s.interests).length) ints.appendChild(el('li', 'empty', 'Появятся из ваших разговоров.'));
        arr(s.interests).forEach(function (it) {
          var li = el('li');
          li.style.opacity = String(0.5 + Math.min(1, it.strength / 10) * 0.5);
          li.title = (it.note ? it.note + ' · ' : '') + 'сила ' + it.strength;
          li.appendChild(el('span', '', it.name));
          if (online) li.appendChild(smallBtn('×', 'Убрать увлечение', function () { soulUpdate({ removeInterest: it.name }); }));
          ints.appendChild(li);
        });

        // Её мнения.
        var ops = $('soul-opinions');
        ops.textContent = '';
        if (!arr(s.opinions).length) ops.appendChild(el('li', 'empty', 'Своё мнение появится, когда ей будет о чём подумать.'));
        arr(s.opinions).forEach(function (o) {
          var li = el('li');
          var t = el('span');
          t.appendChild(el('b', '', o.topic + ': '));
          t.appendChild(document.createTextNode(o.view));
          li.appendChild(t);
          if (online) li.appendChild(smallBtn('×', 'Убрать мнение', function () { soulUpdate({ removeOpinion: o.topic }); }));
          ops.appendChild(li);
        });

        // Потребности.
        var needs = d.needs || { longing: 0, joy: 55, curiosity: 60 };
        var nbox = $('soul-needs');
        nbox.textContent = '';
        [['longing', 'Скучает'], ['joy', 'Радость'], ['curiosity', 'Любопытство']].forEach(function (p) {
          var v = Math.max(0, Math.min(100, needs[p[0]] || 0));
          var row = el('div', 'need ' + p[0]);
          row.appendChild(el('span', '', p[1]));
          var bar = el('span', 'nbar');
          var fill = el('i');
          fill.style.width = v + '%';
          bar.appendChild(fill);
          row.appendChild(bar);
          row.appendChild(el('output', '', String(v)));
          nbox.appendChild(row);
        });

        // Секреты.
        var sec = $('soul-secrets');
        sec.textContent = '';
        arr(d.secretList).forEach(function (x) {
          var li = el('li', x.unlocked ? '' : 'locked');
          var head = el('div', 's-head');
          head.appendChild(el('b', '', (x.unlocked ? (x.opened ? '🔓 ' : '🎁 ') : '🔒 ') + x.title));
          head.appendChild(el('span', '', x.unlocked ? (x.opened ? dmy(x.t) : 'новый секрет') : 'близость ' + x.bond));
          li.appendChild(head);
          if (x.opened) li.appendChild(el('p', '', x.text));
          else if (x.unlocked && online) {
            var open = el('button', 'mini-btn solid', 'Открыть');
            open.type = 'button';
            open.style.marginTop = '6px';
            open.addEventListener('click', function () { soulUpdate({ openSecret: x.bond }); flash('happy', 3200); });
            li.appendChild(open);
          }
          sec.appendChild(li);
        });
        if (!arr(d.secretList).length) sec.appendChild(el('li', 'locked', 'Секреты появятся, когда вы станете ближе.'));

        // Умения по ступеням.
        var sk = $('soul-skills');
        sk.textContent = '';
        arr(d.skills).forEach(function (k) {
          var li = el('li', k.unlocked ? '' : 'locked');
          li.appendChild(el('b', '', k.name));
          li.appendChild(el('span', '', k.unlocked ? k.desc + ' — в «Навыках»' : 'откроется на хвосте ' + k.level));
          sk.appendChild(li);
        });
      }
      $('soul-aim-add').addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        var text = this.value.trim();
        if (!text) return;
        this.value = '';
        soulUpdate({ addAim: text });
      });

      // Фон: «сон», когда хозяин не работает, и забота утром и вечером.
      var IDLE_SLEEP = 15 * 60000;
      var careAsked = {};
      function soulSleep(mode) {
        if (!online || soulBusy || pending) return Promise.resolve(null);
        soulBusy = true;
        $('soul-sleep').disabled = true;
        if (mode === 'force') soulMsg('Яэри засыпает и перебирает память…');
        return api('soul/sleep', { mode: mode, name: settings.name, model: modelSelect.value }).then(function (data) {
          setSoul(data);
          if (!data.skipped) soulMsg('Яэри поспала и пересобрала память: в дневнике новая запись.');
          return data;
        }).catch(function (e) { soulMsg(e.message, true); return null; })
          .then(function (data) { soulBusy = false; $('soul-sleep').disabled = false; return data; });
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
      $('soul-sleep').addEventListener('click', function () { soulSleep('force'); });

