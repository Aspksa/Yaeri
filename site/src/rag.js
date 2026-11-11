      /* ---------- Документы для RAG ---------- */
      var docList = $('doc-list');
      var docStatus = $('doc-status');
      var docFile = $('doc-file');
      var reindexBtn = $('reindex');

      function renderDocs(data) {
        docList.textContent = '';
        reindexBtn.hidden = !data.reindexNeeded;
        if (data.reindexNeeded) docStatus.textContent = 'Модель эмбеддингов изменилась: нажмите «Переиндексировать».';
        (data.docs || []).forEach(function (d) {
          var li = el('li');
          var name = el('span', 'd-name', d.name);
          name.title = d.name;
          var del = el('button', '', '×');
          del.type = 'button';
          del.setAttribute('aria-label', 'Удалить документ ' + d.name);
          del.addEventListener('click', function () { deleteDoc(d); });
          li.appendChild(name);
          li.appendChild(el('span', 'd-info', d.chunks + ' фрагм.'));
          li.appendChild(del);
          docList.appendChild(li);
        });
        if (!data.reindexNeeded && !(data.docs || []).length && !docStatus.textContent) docStatus.textContent = 'Документов пока нет.';
      }
      function loadDocs() {
        refreshBrain(100);
        return api('docs').then(renderDocs).catch(function (error) { docStatus.textContent = error.message; });
      }
      function deleteDoc(d) {
        if (!window.confirm('Удалить «' + d.name + '» из знаний Яэри?')) return Promise.resolve(false);
        return api('docs/delete', { id: d.id }).then(function () { loadDocs(); return true; })
          .catch(function (error) { docStatus.textContent = error.message; window.alert(error.message); return false; });
      }
      function readText(file) {
        if (file.text) return file.text();
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(String(reader.result)); };
          reader.onerror = function () { reject(reader.error); };
          reader.readAsText(file, 'utf-8');
        });
      }
      $('doc-add').addEventListener('click', function () { docFile.click(); });
      docFile.addEventListener('change', function () {
        var files = Array.prototype.slice.call(docFile.files || []);
        docFile.value = '';
        var ok = 0;
        var chain = Promise.resolve();
        files.forEach(function (file, i) {
          chain = chain.then(function () {
            docStatus.textContent = 'Индексирую «' + file.name + '» (' + (i + 1) + ' из ' + files.length + ')…';
            return readText(file).then(function (text) {
              if (text.length > 1000000) throw new Error('«' + file.name + '» больше 1 000 000 символов.');
              return api('docs', { name: file.name, text: text });
            }).then(function () { ok++; }).catch(function (error) {
              docStatus.textContent = error.message;
              throw error;
            });
          });
        });
        chain.then(function () {
          docStatus.textContent = ok ? 'Готово: добавлено документов — ' + ok + '.' : '';
        }).catch(function () { /* Сообщение уже показано. */ }).then(loadDocs);
      });
      reindexBtn.addEventListener('click', function () {
        reindexBtn.disabled = true;
        docStatus.textContent = 'Пересчитываю эмбеддинги…';
        api('reindex', {}).then(function () { docStatus.textContent = 'Индекс обновлён.'; })
          .catch(function (error) { docStatus.textContent = error.message; })
          .then(function () { reindexBtn.disabled = false; loadDocs(); });
      });


