      /* ---------- Графики: кольцо дня и тепловая карта ---------- */
      var RING_LEN = 2 * Math.PI * 16;
      function tasksVisuals() {
        tasksRing();
        heatRenderCard();
      }
      function tasksRing() {
        var fg = $('tasks-ring-fg');
        if (!fg) return;
        var day = tasks.day || tToday();
        var list = tasks.items.filter(function (t) { return tIsTask(t) && t.due === day; });
        var done = list.filter(function (t) { return t.done; }).length;
        var share = list.length ? done / list.length : 0;
        fg.style.strokeDasharray = RING_LEN.toFixed(2);
        fg.style.strokeDashoffset = (RING_LEN * (1 - share)).toFixed(2);
        var ring = $('tasks-ring');
        ring.classList.toggle('empty', !list.length);
        ring.classList.toggle('full', !!list.length && done === list.length);
        $('tasks-ring-text').textContent = list.length ? done + '/' + list.length : '—';
        var when = day === tToday() ? 'сегодня' : tDateWords(day, false);
        ring.title = list.length ? 'Выполнено ' + done + ' из ' + list.length + ' дел на ' + when : 'На ' + when + ' дел нет';
        ring.setAttribute('aria-label', ring.title);
      }
      // Сколько дел закрыто в каждый день (по времени отметки «готово»).
      function heatCounts() {
        var out = {};
        tasks.items.forEach(function (t) {
          if (!tIsTask(t) || !t.done || !t.doneAt) return;
          var k = tIso(new Date(t.doneAt));
          out[k] = (out[k] || 0) + 1;
        });
        return out;
      }
      function heatLevel(n) { return n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4; }
      // Рисует сетку неделя × день недели: столбец — неделя (пн…вс), начиная с понедельника start.
      function heatFill(box, start, weeks, counts, opts) {
        box.textContent = '';
        box.style.setProperty('--weeks', weeks);
        var today = tToday(), total = 0, best = 0, lastMonth = -1;
        if (opts && opts.months) {
          var mrow = el('div', 'heat-months');
          for (var w = 0; w < weeks; w++) {
            var md = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7);
            var lab = el('span', '', md.getMonth() !== lastMonth && md.getDate() <= 7 ? MONTHS[md.getMonth()].slice(0, 3) : '');
            if (lab.textContent) lastMonth = md.getMonth();
            mrow.appendChild(lab);
          }
          box.appendChild(mrow);
        }
        var grid = el('div', 'heat-grid');
        for (var i = 0; i < weeks * 7; i++) {
          var dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(i / 7) * 7 + i % 7);
          var iso = tIso(dt);
          var n = counts[iso] || 0;
          var cls = 'l' + heatLevel(n);
          if (iso > today || (opts && opts.year !== undefined && dt.getFullYear() !== opts.year)) cls = 'out';
          if (iso === today) cls += ' today';
          var c = el('i', cls);
          if (cls !== 'out') {
            c.title = dt.getDate() + ' ' + MONTHS_GEN[dt.getMonth()] + ': ' + (n ? 'закрыто ' + n + ' ' + plural(n, 'дело', 'дела', 'дел') : 'ничего не закрыто');
            total += n;
            if (n > best) best = n;
          }
          grid.appendChild(c);
        }
        box.appendChild(grid);
        return { total: total, best: best };
      }
      function heatMonday(dt) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - (dt.getDay() + 6) % 7); }
      function heatRenderCard() {
        var box = $('pc-heat');
        if (!box) return;
        var weeks = 22;
        var mon = heatMonday(new Date());
        var start = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - (weeks - 1) * 7);
        var r = heatFill(box, start, weeks, heatCounts());
        $('pc-heat-sum').textContent = r.total ? 'закрыто ' + r.total + ' за ' + weeks + ' нед.' : 'закрывайте дела — клетки загорятся';
      }
      function heatRenderYear(y) {
        var box = $('pcy-heat');
        if (!box || !tasks) return;
        var start = heatMonday(new Date(y, 0, 1));
        var end = new Date(y, 11, 31);
        var weeks = Math.ceil((end - start) / 6048e5 + 1 / 7);
        var r = heatFill(box, start, weeks, heatCounts(), { months: true, year: y });
        $('pcy-heat-sum').textContent = r.total ? ' · в ' + y + ' году закрыто ' + r.total + ' ' + plural(r.total, 'дело', 'дела', 'дел') + ', рекорд за день — ' + r.best : ' · в ' + y + ' году пока ничего не закрыто';
      }

      /* ---------- Небо у часов: луна, солнце, погода ---------- */
      var PLACE_KEY = 'yaeri_place_v1';
      var sky = { place: { name: 'Москва', lat: 55.7558, lon: 37.6173 }, weather: null, wAt: 0, wErr: '', started: false };
      function skyValidPlace(p) {
        return p && typeof p === 'object' && isFinite(p.lat) && isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
      }
      function skyInit() {
        var saved = load(PLACE_KEY);
        if (skyValidPlace(saved)) sky.place = saved;
        var ready = serverStatus ? api('place').then(function (d) { if (d && skyValidPlace(d.place)) sky.place = d.place; }).catch(function () {}) : Promise.resolve();
        ready.then(function () {
          $('set-place').value = sky.place.name || '';
          renderSky();
          skyWeather();
        });
        if (sky.started) return;
        sky.started = true;
        setInterval(renderSky, 60 * 1000);
        setInterval(skyWeather, 30 * 60 * 1000);
      }
      function skyWeather() {
        var p = sky.place;
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat.toFixed(3) + '&longitude=' + p.lon.toFixed(3) +
          '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=sunrise,sunset&timezone=auto&wind_speed_unit=ms&forecast_days=1';
        return fetch(url, { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(function (d) {
          if (!d || !d.current) throw new Error('пустой ответ');
          sky.weather = d.current;
          sky.wAt = Date.now();
          sky.wErr = '';
          renderSky();
        }).catch(function () { sky.wErr = 'нет сети'; renderSky(); });
      }
      // Фаза луны от известного новолуния 6 января 2000, 18:14 UTC.
      function moonPhase(now) {
        var p = ((now.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5 / 29.530588853) % 1;
        return p < 0 ? p + 1 : p;
      }
      function moonName(p) {
        if (p < 0.03 || p > 0.97) return 'новолуние';
        if (p < 0.22) return 'растущий серп';
        if (p < 0.28) return 'первая четверть';
        if (p < 0.47) return 'растущая луна';
        if (p < 0.53) return 'полнолуние';
        if (p < 0.72) return 'убывающая луна';
        if (p < 0.78) return 'последняя четверть';
        return 'убывающий серп';
      }
      function moonSvg(p) {
        var r = 15, cx = 18, cy = 18;
        var rx = Math.abs(Math.cos(2 * Math.PI * p)) * r;
        var waxing = p < 0.5;
        var outer = waxing ? 1 : 0;
        var inner = waxing ? (p < 0.25 ? 0 : 1) : (p > 0.75 ? 1 : 0);
        var lit = 'M' + cx + ' ' + (cy - r) + ' A' + r + ' ' + r + ' 0 0 ' + outer + ' ' + cx + ' ' + (cy + r) +
          ' A' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + inner + ' ' + cx + ' ' + (cy - r) + 'Z';
        return '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="moon-dark"/>' +
          (p < 0.03 || p > 0.97 ? '' : '<path d="' + lit + '" class="moon-lit"/>') + '</svg>';
      }
      // Восход и закат по упрощённому алгоритму NOAA (точность — пара минут).
      function sunTimes(day, lat, lon) {
        var rad = Math.PI / 180;
        var jd = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12) / 864e5 + 2440587.5;
        var n = Math.round(jd - 2451545 + 0.0008);
        var js = n - lon / 360;
        var M = (357.5291 + 0.98560028 * js) % 360;
        var C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
        var L = (M + C + 180 + 102.9372) % 360;
        var transit = 2451545 + js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
        var sinD = Math.sin(L * rad) * Math.sin(23.4397 * rad);
        var cosD = Math.cos(Math.asin(sinD));
        var cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinD) / (Math.cos(lat * rad) * cosD);
        if (cosW > 1) return { polar: 'night' };
        if (cosW < -1) return { polar: 'day' };
        var w = Math.acos(cosW) / rad / 360;
        function toDate(j) { return new Date((j - 2440587.5) * 864e5); }
        return { rise: toDate(transit - w), set: toDate(transit + w) };
      }
      var WMO = [
        [[0], 'ясно', '☀️', '🌙'], [[1], 'почти ясно', '🌤️', '🌙'], [[2], 'переменная облачность', '⛅', '☁️'], [[3], 'пасмурно', '☁️', '☁️'],
        [[45, 48], 'туман', '🌫️', '🌫️'], [[51, 53, 55, 56, 57], 'морось', '🌦️', '🌧️'], [[61, 63, 65, 66, 67, 80, 81, 82], 'дождь', '🌧️', '🌧️'],
        [[71, 73, 75, 77, 85, 86], 'снег', '🌨️', '🌨️'], [[95, 96, 99], 'гроза', '⛈️', '⛈️']
      ];
      function wmoInfo(code, isDay) {
        for (var i = 0; i < WMO.length; i++) if (WMO[i][0].indexOf(code) > -1) return { text: WMO[i][1], icon: isDay ? WMO[i][2] : WMO[i][3] };
        return { text: 'погода', icon: '🌡️' };
      }
      function renderSky() {
        var box = $('now-sky');
        if (!box || !sky) return;
        var now = new Date();
        box.textContent = '';
        // Погода.
        var w = el('div', 'sky-tile sky-weather');
        if (sky.weather) {
          var info = wmoInfo(sky.weather.weather_code, sky.weather.is_day);
          var t = Math.round(sky.weather.temperature_2m);
          w.appendChild(el('span', 'sky-ico', info.icon));
          var wt = el('div', 'sky-txt');
          wt.appendChild(el('b', 'sky-temp', (t > 0 ? '+' : '') + t + '°'));
          wt.appendChild(el('span', '', info.text));
          w.appendChild(wt);
          var feel = Math.round(sky.weather.apparent_temperature);
          w.title = (sky.place.name || '') + ': ' + info.text + ', ощущается как ' + (feel > 0 ? '+' : '') + feel + '°, ветер ' + Math.round(sky.weather.wind_speed_10m) + ' м/с';
        } else {
          w.appendChild(el('span', 'sky-ico', '🌡️'));
          var wt2 = el('div', 'sky-txt');
          wt2.appendChild(el('b', 'sky-temp', '…'));
          wt2.appendChild(el('span', '', sky.wErr || 'загрузка'));
          w.appendChild(wt2);
        }
        w.appendChild(el('small', 'sky-place', sky.place.name || ''));
        box.appendChild(w);
        // Солнце: дуга дня и точка солнца на ней.
        var s = el('div', 'sky-tile sky-sun');
        var st = sunTimes(now, sky.place.lat, sky.place.lon);
        if (st.polar) {
          s.appendChild(el('b', 'sky-big', st.polar === 'day' ? 'полярный день' : 'полярная ночь'));
        } else {
          var share = (now - st.rise) / (st.set - st.rise);
          var up = share >= 0 && share <= 1;
          var k = Math.max(0, Math.min(1, share));
          var x = 4 + 52 * k, y = 26 - Math.sin(Math.PI * k) * 20;
          var len = ((st.set - st.rise) / 36e5);
          s.innerHTML = '<svg class="sun-arc" viewBox="0 0 60 30" aria-hidden="true"><path class="arc" d="M4 26 Q30 -14 56 26"/><line x1="0" y1="26" x2="60" y2="26" class="hz"/>' +
            '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.4" class="' + (up ? 'sun' : 'sun down') + '"/></svg>';
          var times = el('div', 'sky-times');
          times.appendChild(el('span', '', '↑ ' + pad(st.rise.getHours()) + ':' + pad(st.rise.getMinutes())));
          times.appendChild(el('span', '', '↓ ' + pad(st.set.getHours()) + ':' + pad(st.set.getMinutes())));
          s.appendChild(times);
          s.title = 'Восход ' + pad(st.rise.getHours()) + ':' + pad(st.rise.getMinutes()) + ', закат ' + pad(st.set.getHours()) + ':' + pad(st.set.getMinutes()) +
            ', световой день ' + Math.floor(len) + ' ч ' + Math.round((len % 1) * 60) + ' мин';
        }
        box.appendChild(s);
        // Луна.
        var mp = moonPhase(now);
        var lit = Math.round((1 - Math.cos(2 * Math.PI * mp)) / 2 * 100);
        var m = el('div', 'sky-tile sky-moon');
        m.innerHTML = moonSvg(mp);
        var mt = el('div', 'sky-txt');
        mt.appendChild(el('b', '', lit + '%'));
        mt.appendChild(el('span', '', moonName(mp)));
        m.appendChild(mt);
        m.title = cap(moonName(mp)) + ', освещено ' + lit + '%';
        box.appendChild(m);
      }
      $('place-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var q = $('set-place').value.trim();
        var note = $('place-note');
        if (!q) return;
        note.textContent = 'Ищу…';
        fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=' + encodeURIComponent(q)).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(function (d) {
          var g = d && d.results && d.results[0];
          if (!g) { note.textContent = 'Город не найден. Попробуйте написать иначе.'; return; }
          sky.place = { name: String(g.name).slice(0, 60), lat: +g.latitude, lon: +g.longitude };
          store(PLACE_KEY, sky.place);
          if (serverStatus) api('place', sky.place).catch(function () {});
          $('set-place').value = sky.place.name;
          note.textContent = 'Готово: ' + sky.place.name + (g.country ? ', ' + g.country : '') + '.';
          sky.weather = null;
          renderSky();
          skyWeather();
        }).catch(function () { note.textContent = 'Нет связи с сервисом поиска городов.'; });
      });
