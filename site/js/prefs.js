
    /* Применяем сохранённые настройки до отрисовки, чтобы страница не мигала. */
    (function () {
      try {
        var s = JSON.parse(localStorage.getItem('yaeri_settings_v1')) || {};
        var d = document.documentElement;
        if (['moon', 'fire', 'sakura', 'forest', 'sky'].indexOf(s.accent) > -1) d.dataset.accent = s.accent;
        if (['sm', 'md', 'lg'].indexOf(s.size) > -1) d.dataset.size = s.size;
        var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        d.dataset.motion = (typeof s.motion === 'boolean' ? s.motion : !reduce) ? 'on' : 'off';
        if (s.time === false) d.dataset.time = 'off';
      } catch (error) { /* Хранилище может быть недоступно. */ }
    }());
  