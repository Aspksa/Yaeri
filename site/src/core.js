
    (function () {
      'use strict';
      var CHAT_KEY = 'yaeri_demo_chat_v1';
      var SET_KEY = 'yaeri_settings_v1';
      var NOTES_KEY = 'yaeri_notes_v1';
      var SKILLS_KEY = 'yaeri_skills_v1';
      var BRAIN_KEY = 'yaeri_brain_v1';
      var ACCENTS = ['moon', 'fire', 'sakura', 'forest', 'sky'];
      var SIZES = ['sm', 'md', 'lg'];
      var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      var DEFAULTS = { name: 'Хозяин', accent: 'forest', size: 'md', motion: !reduce, enter: true, time: true, rag: true, remember: true, autoNotes: true, soul: true, care: true, inner: true, selfCheck: true, autoModel: true, model: '' };

      function $(id) { return document.getElementById(id); }
      function each(list, fn) { Array.prototype.forEach.call(list, fn); }
      function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
      }
      var html = document.documentElement;
      var body = document.body;
      var app = $('app');
      var chat = $('chat');
      var form = $('message-form');
      var input = $('message');
      var hint = $('composer-hint');

      function load(key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch (error) { return null; }
      }
      function store(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* Хранилище недоступно. */ }
      }
      function plural(n, one, few, many) {
        var a = Math.abs(n) % 100, b = a % 10;
        if (a > 10 && a < 20) return many;
        if (b > 1 && b < 5) return few;
        if (b === 1) return one;
        return many;
      }
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      function hhmm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
      function dmy(t) {
        try { return new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
        catch (error) { return ''; }
      }
      function cut(text, n) { text = String(text || '').replace(/\s+/g, ' ').trim(); return text.length > n ? text.slice(0, n - 1) + '…' : text; }

