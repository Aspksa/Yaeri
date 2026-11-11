      /* ---------- Яэри: позы и настроение ---------- */
      // Базовое настроение держится, пока не сменится (слушает, думает, дремлет);
      // вспышка (рада, смеётся, извиняется) показывается несколько секунд и уходит обратно к базовому.
      var MOODS = {
        idle:   { pose: 'idle',   cap: 'Слушаю вас',          text: 'слушает' },
        listen: { pose: 'listen', cap: 'Внимательно слушаю…', text: 'читает, что вы пишете' },
        think:  { pose: 'think',  cap: 'Думаю…',              text: 'думает' },
        happy:  { pose: 'happy',  cap: 'Готово!',             text: 'ответила' },
        memo:   { pose: 'happy',  cap: 'Записала в память',   text: 'записала в память' },
        greet:  { pose: 'greet',  cap: 'Добро пожаловать',    text: 'приветствует' },
        giggle: { pose: 'giggle', cap: 'Хи-хи, щекотно',      text: 'смеётся' },
        sleep:  { pose: 'sleep',  cap: 'Дремлю… разбудите',   text: 'дремлет' },
        sorry:  { pose: 'sorry',  cap: 'Простите, не вышло',  text: 'извиняется' },
        ponder: { pose: 'think',  cap: 'Думаю о вас…',        text: 'размышляет' },
        miss:   { pose: 'greet',  cap: 'Я скучала!',          text: 'рада вас видеть' },
        grow:   { pose: 'happy',  cap: 'Зажёгся новый хвост!', text: 'растёт' }
      };
      var stage = $('yaeri-stage');
      var mood = { base: 'idle', cur: '', flash: 0, swap: 0 };
      var poseCache = {};
      function preloadPoses() {
        Object.keys(MOODS).forEach(function (k) {
          var p = MOODS[k].pose;
          if (poseCache[p]) return;
          poseCache[p] = [new Image()];
          poseCache[p][0].src = 'yaeri/' + p + '-face.webp';
        });
      }
      function renderMood(name) {
        var m = MOODS[name] || MOODS.idle;
        var prev = MOODS[mood.cur];
        mood.cur = name;
        $('mood-text').textContent = m.text;
        stage.classList.toggle('busy', name === 'think');
        body.classList.toggle('is-thinking', name === 'think');
        if (prev && prev.pose === m.pose) return;
        each(document.querySelectorAll('.face-img'), function (img) { img.src = 'yaeri/' + m.pose + '-face.webp'; });
      }
      function setBase(name) {
        mood.base = name;
        // «Думаю» важнее любой вспышки: сразу видно, что ответ готовится.
        if (name === 'think') { clearTimeout(mood.flash); mood.flash = 0; }
        if (!mood.flash) renderMood(name);
      }
      function flash(name, ms) {
        if (mood.base === 'think') return;
        clearTimeout(mood.flash);
        renderMood(name);
        mood.flash = setTimeout(function () { mood.flash = 0; renderMood(mood.base); }, ms);
      }
      function restMood() { return input.value.trim() ? 'listen' : 'idle'; }

      // Через три минуты тишины Яэри задрёмывает, любое действие её будит.
      var lastActive = Date.now();
      function wake() {
        lastActive = Date.now();
        if (mood.base === 'sleep') { setBase(restMood()); flash('greet', 2200); }
      }
      ['pointerdown', 'keydown', 'wheel'].forEach(function (type) { document.addEventListener(type, wake, { passive: true }); });
      setInterval(function () {
        if (!pending && mood.base === 'idle' && !mood.flash && !document.hidden && Date.now() - lastActive > 180000) setBase('sleep');
      }, 15000);

      stage.addEventListener('click', function () {
        if (mood.base !== 'think') flash('giggle', 1800);
        input.focus();
      });

      /* ---------- Аватар-кнопка: чат поверх любого раздела ---------- */
      var chatCard = $('chat-card');
      var chatHome = chatCard.parentNode;
      var pop = $('chat-pop');
      var fab = $('yaeri-fab');
      var chatSeen = true;
      function openPop() {
        if (!pop.hidden) return;
        pop.appendChild(chatCard);
        pop.hidden = false;
        body.classList.add('pop-open');
        fab.setAttribute('aria-expanded', 'true');
        fab.setAttribute('aria-label', 'Свернуть чат с Яэри');
        chat.scrollTop = chat.scrollHeight;
        input.focus();
      }
      function closePop(focusFab) {
        if (pop.hidden) return;
        pop.hidden = true;
        body.classList.remove('pop-open');
        chatHome.insertBefore(chatCard, chatHome.firstChild);
        fab.setAttribute('aria-expanded', 'false');
        fab.setAttribute('aria-label', 'Открыть чат с Яэри');
        if (focusFab) fab.focus();
      }
      function syncFab() {
        if (!fab) return;
        if (currentView === 'deck') closePop(false);
        // В командном центре чат и так на виду; кнопка нужна, когда он ушёл за экран или открыт другой раздел.
        fab.hidden = currentView === 'deck' && chatSeen;
      }
      fab.addEventListener('click', function () {
        wake();
        if (currentView === 'deck') {
          chatCard.scrollIntoView({ block: 'start', behavior: settings.motion ? 'smooth' : 'auto' });
          input.focus({ preventScroll: true });
          flash('greet', 1800);
          return;
        }
        if (pop.hidden) { openPop(); flash('greet', 1800); } else closePop(true);
      });
      $('chat-close').addEventListener('click', function () { closePop(true); });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !pop.hidden && !isOpen()) { event.preventDefault(); closePop(true); }
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { if (pop.hidden) { chatSeen = e.isIntersecting; syncFab(); } });
        }, { threshold: 0.15 }).observe(chatCard);
      }

