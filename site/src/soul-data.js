      /* ---------- Душа: данные, загрузка и фоновое поведение ---------- */
      // Всё состояние души живёт на сервере (data\*.json). Здесь: загрузка, действия хозяина
      // и автоматическое поведение (раздумья после разговора, сон в простое, утренняя и вечерняя забота).
      // Отрисовка — в soul-ui.js.
      var SOUL_STAGES = ['Искорка', 'Пробуждение', 'Любопытство', 'Знакомство', 'Доверие', 'Понимание', 'Привязанность', 'Родство', 'Полнота'];
      var SOUL_XP = [0, 12, 35, 70, 120, 190, 280, 400, 560];
      // После девятой ступени: звезда k стоит 120 + 20·k опыта, 9 звёзд = созвездие (как в yaeri-soul.ps1).
      var SOUL_STAR_BASE = 120, SOUL_STAR_STEP = 20;
      var SOUL_CONST = ['Лиса', 'Луна', 'Сакура', 'Ветер', 'Река', 'Гора', 'Пламя', 'Небо', 'Вечность'];
      var SOUL_KINDS = { reflection: 'раздумье', muse: 'думала о вас', milestone: 'веха пути', birth: 'пробуждение', moment: 'важный момент', dream: 'сон', secret: 'секрет' };
      var soulData = null, growthData = null, undData = null, depthData = null, evoData = null, s3Data = null, lifeData = null, e5Data = null, vecData = null;
      var undRated = {};
      var soulTimer = 0, soulBusy = false, soulEditing = false;

      function arr(x) { return Array.isArray(x) ? x : []; }
      function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
      function ago(t) {
        var m = Math.max(0, Math.round((Date.now() - t) / 60000));
        if (m < 1) return 'только что';
        if (m < 60) return m + ' мин назад';
        var h = Math.round(m / 60);
        if (h < 24) return h + ' ' + plural(h, 'час', 'часа', 'часов') + ' назад';
        var d = Math.round(h / 24);
        return d + ' ' + plural(d, 'день', 'дня', 'дней') + ' назад';
      }
      function constName(i) { return i < SOUL_CONST.length ? SOUL_CONST[i] : 'Вечность ' + (i - SOUL_CONST.length + 2); }
      function soulLevelOf(xp) { var l = 1; for (var i = 0; i < SOUL_XP.length; i++) if (xp >= SOUL_XP[i]) l = i + 1; return l; }
      // Путь развития: ступени 1–9, затем бесконечные звёзды и созвездия.
      function soulPath(xp) {
        xp = Math.max(0, Number(xp) || 0);
        var level = soulLevelOf(xp), top = SOUL_XP[SOUL_XP.length - 1];
        var stars = 0, from = top, to = top + SOUL_STAR_BASE + SOUL_STAR_STEP;
        if (xp >= top) while (xp >= to) { stars++; from = to; to = from + SOUL_STAR_BASE + SOUL_STAR_STEP * (stars + 1); }
        var complete = level >= SOUL_STAGES.length;
        var p = {
          level: level, complete: complete, stars: stars, starFrom: from, starTo: to,
          constellation: Math.floor(stars / 9) + 1, constellationName: constName(Math.floor(stars / 9)), inConstellation: stars % 9,
          stage: SOUL_STAGES[level - 1], nextStage: complete ? '' : SOUL_STAGES[level]
        };
        if (complete) { p.from = from; p.to = to; p.next = 'звезда ' + (stars + 1); }
        else { p.from = SOUL_XP[level - 1]; p.to = SOUL_XP[level]; p.next = SOUL_STAGES[level]; }
        p.frac = Math.max(0, Math.min(1, (xp - p.from) / Math.max(1, p.to - p.from)));
        p.left = Math.max(0, p.to - xp);
        return p;
      }
      // Мастерство по областям: считается из уже накопленных данных души, уровни без потолка.
      // Уровень n требует 5·n·(n−1) очков: 0, 10, 30, 60, 100…
      function masteryLevel(points) {
        points = Math.max(0, points);
        var n = Math.floor((1 + Math.sqrt(1 + 0.8 * points)) / 2);
        var from = 5 * n * (n - 1), to = 5 * (n + 1) * n;
        return { level: n, frac: (points - from) / (to - from), left: Math.ceil(to - points) };
      }
      function soulMastery(d) {
        var s = d.soul, o = s.owner || {};
        var opened = arr(d.secretList).filter(function (x) { return x.opened; }).length;
        var aimSum = arr(s.aims).reduce(function (a, x) { return a + (Number(x.progress) || 0); }, 0);
        var defs = [
          ['talk', 'Общение', (s.exchanges || 0), 'реплики в разговорах'],
          ['think', 'Размышления', (s.reflections || 0) * 3 + (s.sleeps || 0) * 5, 'раздумья и сны'],
          ['memory', 'Память', arr(s.moments).length * 4 + arr(s.journal).length, 'моменты и дневник'],
          ['know', 'Понимание вас', (arr(o.goals).length + arr(o.likes).length + arr(o.worries).length) * 4 + Math.floor(String(o.portrait || '').length / 40) + arr(s.ownerMoods).length * 2, 'портрет и наблюдения'],
          ['bond', 'Близость', (s.bond || 0) * 2 + opened * 10, 'доверие и секреты'],
          ['world', 'Свой мир', arr(s.interests).length * 3 + arr(s.opinions).length * 3 + Math.floor(aimSum / 10), 'увлечения, мнения, цели']
        ];
        return defs.map(function (x) { var m = masteryLevel(x[2]); return { id: x[0], name: x[1], points: Math.round(x[2]), hint: x[3], level: m.level, frac: m.frac, left: m.left }; });
      }
      function soulDefault() {
        var t = Date.now();
        return {
          level: 1, maxLevel: 9, stage: SOUL_STAGES[0], nextStage: SOUL_STAGES[1], xpFrom: 0, xpTo: 12, due: false,
          needs: { longing: 0, joy: 55, curiosity: 60 },
          traitList: [
            { id: 'warmth', name: 'Тепло', value: 62 }, { id: 'curiosity', name: 'Любопытство', value: 58 },
            { id: 'playful', name: 'Игривость', value: 45 }, { id: 'care', name: 'Забота', value: 60 },
            { id: 'wisdom', name: 'Мудрость', value: 30 }, { id: 'boldness', name: 'Смелость', value: 35 }
          ],
          secretList: [20, 35, 50, 65, 80, 95].map(function (b, i) { return { bond: b, title: ['Откуда я', 'Когда тебя нет', 'Тайное желание', 'Подарок', 'Мой страх', 'Главное'][i], unlocked: false, opened: false }; }),
          skills: [['/стих', 2], ['/совет', 3], ['/бережный-день', 4], ['/сказка', 5], ['/зеркало', 6], ['/мечта', 7], ['/письмо', 8], ['/наш-путь', 9]].map(function (x) { return { name: x[0], level: x[1], unlocked: false, desc: '' }; }),
          soul: {
            born: t, xp: 0, exchanges: 0, reflections: 0, bond: 10, bondNote: 'Мы только начинаем знакомиться.',
            self: 'Я Яэри, восьмихвостая лисица. Я только начинаю узнавать своего хозяина и саму себя.',
            mood: { name: 'тихая радость', why: 'Я только проснулась и рада знакомству.', t: t },
            owner: { portrait: '', goals: [], likes: [], worries: [] }, lessons: [], thought: '', thoughtNew: false,
            aims: [{ id: 'a1', text: 'Понять, что по-настоящему радует хозяина', progress: 0 }, { id: 'a2', text: 'Научиться помогать хозяину каждый день, без напоминаний', progress: 0 }],
            journal: [{ id: 'birth', t: t, kind: 'birth', mood: 'тихая радость', text: 'Сегодня я проснулась. Я только на первой ступени своего пути, но уже хочу узнать своего хозяина: чем он живёт, о чём мечтает и как я могу быть рядом.' }]
          }
        };
      }
      function soulMsg(text, err) {
        var node = $('soul-status');
        if (!node) return;
        node.textContent = text || '';
        node.classList.toggle('err', !!err);
        node.hidden = !text;
        clearTimeout(soulMsg.t);
        if (text && !err) soulMsg.t = setTimeout(function () { node.hidden = true; }, 5000);
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
      function soulUpdate(patch) {
        if (!online) return Promise.resolve();
        return api('soul/update', patch).then(function (data) { setSoul(data); soulMsg('Сохранено.'); })
          .catch(function (e) { soulMsg(e.message, true); });
      }
      function fitSoulText(field) {
        // Высота по тексту: общий стиль textarea (чат) иначе обрезает портрет и «кем она себя чувствует».
        if (!field || !field.offsetParent) return;
        field.style.height = 'auto';
        field.style.height = Math.min(field.scrollHeight + 4, 420) + 'px';
      }

      /* Загрузка остальных частей души. Каждая — свой файл на сервере; ошибки не мешают остальным. */
      function quiet(p) { return p.catch(function () { /* Покажем при следующем обновлении. */ }); }
      function setGrowth(d) { if (d && d.stages) { growthData = d; renderSoulParts(); } }
      function setUnderstanding(d) {
        if (!d || !d.sections) return;
        undData = d;
        undRated = {};
        arr(d.rated).forEach(function (r) { undRated[r.id] = r.score; });
        renderSoulParts();
        decorateRated();
      }
      function setDepth(d) { if (d && d.settings) { depthData = d; renderSoulParts(); } }
      function loadGrowth() { return online ? quiet(api('soul/growth').then(setGrowth)) : Promise.resolve(); }
      function loadUnderstanding() { return online ? quiet(api('soul/understanding').then(setUnderstanding)) : Promise.resolve(); }
      function loadDepth() { return online ? quiet(api('soul/depth').then(setDepth)) : Promise.resolve(); }
      function loadEvolution() { return online ? quiet(api('soul/evolution').then(function (d) { evoData = d; renderSoulParts(); })) : Promise.resolve(); }
      function loadSoul3() { return online ? quiet(api('soul3').then(function (d) { s3Data = d; renderSoulParts(); })) : Promise.resolve(); }
      function loadLife4() { return online ? quiet(api('life').then(function (d) { lifeData = d; renderSoulParts(); })) : Promise.resolve(); }
      function loadEvolution5() { return online ? quiet(api('evolution5').then(function (d) { e5Data = d; renderSoulParts(); })) : Promise.resolve(); }
      function loadVector2() { return online ? quiet(api('vector').then(function (d) { vecData = d; renderSoulParts(); })) : Promise.resolve(); }
      function loadSoulExtras() {
        // Сервер однопоточный: запросы по очереди, чтобы не мешать чату.
        return loadGrowth().then(loadUnderstanding).then(loadDepth).then(loadEvolution).then(loadSoul3)
          .then(loadLife4).then(loadEvolution5).then(loadVector2);
      }
      function loadSoul() {
        return api('soul').then(function (data) { setSoul(data); return loadSoulExtras(); });
      }
      setInterval(function () {
        if (online && currentView === 'soul' && !document.hidden) loadSoul().catch(function () { /* позже */ });
      }, 90000);

      /* Действия по решениям хозяина: одобрить или отклонить то, что Яэри предложила сама. */
      function soulDecide(kind, id, yes) {
        var call;
        if (kind === 'skill') call = api('soul/depth/skill', { id: id, action: yes ? 'approve' : 'reject' }).then(setDepth);
        else if (kind === 'proposal') call = api('soul/depth/proposal', { id: id, action: yes ? 'approve' : 'reject' }).then(setDepth).then(function () { return api('soul').then(setSoul); });
        else if (kind === 'insight') call = api('soul/growth/insight', { id: id, action: yes ? 'confirm' : 'dismiss' }).then(setGrowth);
        else if (kind === 'tool') call = api('life/tools/decide', { id: id, action: yes ? 'approve' : 'reject' }).then(loadLife4);
        else if (kind === 'e5goal') call = api('evolution5/goal/step', { id: id, action: yes ? 'approve' : 'cancel' }).then(loadEvolution5);
        else if (kind === 'strategy' || kind === 'concept' || kind === 'transfer') call = api('evolution5/' + kind + '/decide', { id: id, action: yes ? 'approve' : 'reject' }).then(loadEvolution5);
        else if (kind === 'nudge') call = api('soul/depth/nudge', { action: yes ? 'ok' : 'later' }).then(setDepth);
        else return Promise.resolve();
        return call.then(function () { soulMsg(yes ? 'Принято.' : 'Отклонено.'); }).catch(function (e) { soulMsg(e.message, true); });
      }

      /* Оценки ответов в чате (👍 / 👎): из них Яэри сама выводит уроки. */
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
          var box = el('div', 'rate-note');
          var field = el('input', 'field');
          field.type = 'text';
          field.maxLength = 300;
          field.placeholder = 'Что не так? (необязательно)';
          field.setAttribute('aria-label', 'Что не так с ответом');
          var ok = el('button', 'mini-btn solid', 'Отправить');
          ok.type = 'button';
          function done() { send(-1, field.value.trim()); box.remove(); }
          ok.addEventListener('click', done);
          field.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); done(); } });
          box.appendChild(field);
          box.appendChild(ok);
          bar.insertAdjacentElement('afterend', box);
          field.focus();
        });
        bar.appendChild(up);
        bar.appendChild(down);
        row.appendChild(bar);
        decorateRated();
      }

      /* Автоматика: раздумья после разговора, сон в простое, забота утром и вечером. Кнопок нет — всё само. */
      var IDLE_SLEEP = 15 * 60000;
      var careAsked = {};
      function soulSleep(mode) {
        if (!online || soulBusy || pending) return Promise.resolve(null);
        soulBusy = true;
        return api('soul/sleep', { mode: mode, name: settings.name, model: modelSelect.value }).then(function (data) {
          setSoul(data);
          return data;
        }).catch(function () { return null; })
          .then(function (data) { soulBusy = false; return data; });
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
      function soulReflect(mode, quietMode) {
        if (!online || soulBusy) return Promise.resolve(null);
        if (pending) { scheduleReflect(20000); return Promise.resolve(null); }
        soulBusy = true;
        var pondering = mood.base === 'idle' || mood.base === 'sleep';
        if (pondering) setBase('ponder');
        return api('soul/reflect', { mode: mode, name: settings.name, model: modelSelect.value }).then(function (data) {
          setSoul(data);
          if (data.skipped) return data;
          if (data.leveled) flash('grow', 4200);
          else if (!quietMode) flash('happy', 3600);
          return data;
        }).catch(function () { return null; }).then(function (data) {
          soulBusy = false;
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
        else if (soulData) { soulData.soul.exchanges = (soulData.soul.exchanges || 0) + 1; soulData.soul.xp = (soulData.soul.xp || 0) + 1; }
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
        growthData = undData = depthData = evoData = s3Data = lifeData = e5Data = vecData = null;
        renderSoul();
      }
      // Кнопка в настройках подключения: включить автономный режим без Cloud.ru.
      if ($('life4-enable-offline')) $('life4-enable-offline').addEventListener('click', function () {
        api('life/settings', { offline: true }).then(function () { return api('status'); })
          .then(applyConfig).then(loadLife4).catch(function (err) {
            keyMsg('Не удалось включить автономность: ' + err.message, 'err');
          });
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
