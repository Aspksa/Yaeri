
    /* Применяем сохранённые настройки до отрисовки, чтобы страница не мигала. */
    (function () {
      try {
        var s = JSON.parse(localStorage.getItem('yaeri_settings_v1')) || {};
        var d = document.documentElement;
        if (!s.look2) { s.accent = 'gold'; if (s.size === 'sm' || s.size === 'md') s.size = 'lg'; }
        if (['gold', 'moon', 'fire', 'sakura', 'forest', 'sky'].indexOf(s.accent) > -1) d.dataset.accent = s.accent;
        if (['sm', 'md', 'lg', 'xl'].indexOf(s.size) > -1) d.dataset.size = s.size;
        if (['tight', 'normal', 'roomy'].indexOf(s.density) > -1) d.dataset.density = s.density;
        var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        d.dataset.motion = (typeof s.motion === 'boolean' ? s.motion : !reduce) ? 'on' : 'off';
        if (s.time === false) d.dataset.time = 'off';
      } catch (error) { /* Хранилище может быть недоступно. */ }
    }());
  