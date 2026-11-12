(function () {
  const M = (window.Meru = window.Meru || {});
  const $ = M.$;

  const QUOTES = [
    { text: 'Simplicity is the soul of efficiency.', by: 'Austin Freeman' },
    { text: 'The secret of getting ahead is getting started.', by: 'Mark Twain' },
    { text: 'It always seems impossible until it is done.', by: 'Nelson Mandela' },
    { text: 'Well done is better than well said.', by: 'Benjamin Franklin' },
    { text: 'Action is the foundational key to all success.', by: 'Pablo Picasso' },
    { text: 'Small deeds done are better than great deeds planned.', by: 'Peter Marshall' },
    { text: 'Focus on being productive instead of busy.', by: 'Tim Ferriss' },
    { text: 'The best way out is always through.', by: 'Robert Frost' },
    { text: 'You miss 100% of the shots you do not take.', by: 'Wayne Gretzky' },
    { text: 'Order and simplification are the first steps toward mastery.', by: 'Thomas Mann' }
  ];

  const WEATHER = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm',
    99: 'Thunderstorm with hail'
  };

  let calMonth = new Date();
  calMonth.setDate(1);
  let weatherBusy = false;

  function applyWidgets() {
    const w = M.state.settings.widgets;
    M.$$('.widget').forEach(el => {
      const on = !!w[el.dataset.widget];
      el.style.display = on ? '' : 'none';
    });
  }

  function setFocus(on) {
    M.state.focus = !!on;
    M.save('focus');
    document.body.classList.toggle('focus-mode', M.state.focus);
    $('#focusBtn').classList.toggle('on', M.state.focus);
    M.toast(M.state.focus ? 'Focus mode on' : 'Focus mode off');
  }

  function toggleFocus() { setFocus(!M.state.focus); }

  function initNotes() {
    const ta = $('#notes');
    ta.value = M.state.notes || '';
    const stat = () => {
      const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
      $('#notesStat').textContent = words + (words === 1 ? ' word' : ' words');
    };
    stat();
    const save = M.debounce(() => { M.state.notes = ta.value; M.save('notes'); }, 400);
    ta.addEventListener('input', () => { stat(); save(); });
  }

  function renderTodos() {
    const list = $('#todoList');
    list.innerHTML = '';
    const todos = M.state.todos;
    const done = todos.filter(t => t.done).length;
    $('#todoStat').textContent = todos.length ? done + '/' + todos.length + ' done' : '';
    if (!todos.length) {
      list.append(M.el('li', { class: 'muted', text: 'No tasks yet.' }));
      return;
    }
    todos.forEach((t, i) => {
      const li = M.el('li', { class: t.done ? 'done' : '' });
      const cb = M.el('input', { type: 'checkbox', 'aria-label': 'Done' });
      cb.checked = !!t.done;
      cb.addEventListener('change', () => {
        t.done = cb.checked;
        M.save('todos');
        renderTodos();
      });
      const rm = M.el('button', { type: 'button', class: 'rm', text: '\u00d7', 'aria-label': 'Delete task' });
      rm.addEventListener('click', () => {
        M.state.todos.splice(i, 1);
        M.save('todos');
        renderTodos();
      });
      li.append(cb, M.el('span', { text: t.text }), rm);
      list.append(li);
    });
  }

  function initTodo() {
    renderTodos();
    $('#todoForm').addEventListener('submit', e => {
      e.preventDefault();
      const text = $('#todoInput').value.trim();
      if (!text) return;
      M.state.todos.push({ text, done: false });
      M.save('todos');
      $('#todoInput').value = '';
      renderTodos();
    });
  }

  function renderCalendar() {
    const box = $('#cal');
    box.innerHTML = '';
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    $('#calTitle').textContent = calMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => box.append(M.el('div', { class: 'dow', text: d })));
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    for (let i = 0; i < first; i++) box.append(M.el('div', { class: 'day off' }));
    for (let d = 1; d <= days; d++) {
      const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
      box.append(M.el('div', { class: 'day' + (isToday ? ' today' : ''), text: String(d) }));
    }
  }

  function initCalendar() {
    renderCalendar();
    $('#calPrev').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); });
    $('#calNext').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); });
  }

  function weatherForm(city) {
    const form = M.el('form');
    const input = M.el('input', { type: 'text', placeholder: 'City, e.g. Nairobi', value: city || '', 'aria-label': 'City' });
    const btn = M.el('button', { type: 'submit', text: 'Set' });
    form.append(input, btn);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) await setCity(q);
    });
    return form;
  }

  async function setCity(city) {
    if (weatherBusy) return;
    weatherBusy = true;
    const body = $('#weatherBody');
    body.innerHTML = '';
    body.append(M.el('p', { class: 'muted', text: 'Looking up ' + city + '\u2026' }));
    try {
      const g = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(city));
      const gj = await g.json();
      const place = gj && gj.results && gj.results[0];
      if (!place) {
        body.innerHTML = '';
        body.append(M.el('p', { class: 'muted', text: 'Could not find that city.' }), weatherForm(city));
        return;
      }
      M.state.weather = { lat: place.latitude, lon: place.longitude, city: place.name + (place.country_code ? ', ' + place.country_code : '') };
      M.save('weather');
      await renderWeather();
    } catch (e) {
      body.innerHTML = '';
      body.append(M.el('p', { class: 'muted', text: 'Weather is unavailable right now.' }), weatherForm(city));
    } finally {
      weatherBusy = false;
    }
  }

  async function renderWeather() {
    const body = $('#weatherBody');
    const w = M.state.weather;
    if (w.lat === null || w.lon === null) {
      body.innerHTML = '';
      body.append(M.el('p', { class: 'muted', text: 'Set a city to see the weather.' }), weatherForm(''));
      return;
    }
    body.innerHTML = '';
    body.append(M.el('p', { class: 'muted', text: 'Loading\u2026' }));
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto&latitude=' +
        encodeURIComponent(w.lat) + '&longitude=' + encodeURIComponent(w.lon);
      const r = await fetch(url);
      const j = await r.json();
      const c = j.current || {};
      body.innerHTML = '';
      body.append(
        M.el('div', { class: 'temp', text: Math.round(c.temperature_2m) + '\u00b0' }),
        M.el('div', { class: 'row2' },
          M.el('span', { text: WEATHER[c.weather_code] || 'Weather' }),
          M.el('span', { text: 'Wind ' + Math.round(c.wind_speed_10m) + ' km/h' }),
          M.el('span', { text: 'Humidity ' + Math.round(c.relative_humidity_2m) + '%' })
        ),
        M.el('div', { class: 'row2' }, M.el('span', { text: w.city || '' })),
        weatherForm(w.city || '')
      );
    } catch (e) {
      body.innerHTML = '';
      body.append(M.el('p', { class: 'muted', text: 'Could not load the weather.' }), weatherForm(w.city || ''));
    }
  }

  function initWeather() {
    renderWeather();
    $('#weatherEdit').addEventListener('click', () => {
      const body = $('#weatherBody');
      body.innerHTML = '';
      body.append(M.el('p', { class: 'muted', text: 'Enter a city to show its weather.' }), weatherForm(M.state.weather.city || ''));
      const input = body.querySelector('input');
      if (input) input.focus();
    });
  }

  function renderQuote() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const day = Math.floor((now - start) / 86400000);
    const q = QUOTES[day % QUOTES.length];
    $('#quoteText').textContent = '\u201c' + q.text + '\u201d';
    $('#quoteBy').textContent = '\u2014 ' + q.by;
  }

  function renderClipboard(items) {
    const list = $('#clipList');
    if (!list) return;
    list.innerHTML = '';
    if (!items || !items.length) {
      list.append(M.el('li', { class: 'muted', text: 'Copy something and it will appear here.' }));
      return;
    }
    items.forEach(c => {
      const li = M.el('li');
      const txt = M.el('button', { type: 'button', class: 'txt', text: c.text, title: c.text });
      txt.addEventListener('click', async () => {
        if (window.meru && window.meru.clipboardWrite) await window.meru.clipboardWrite(c.text);
        M.toast('Copied to clipboard');
      });
      const rm = M.el('button', { type: 'button', class: 'rm', text: '\u00d7', 'aria-label': 'Remove' });
      rm.addEventListener('click', async () => {
        if (window.meru && window.meru.clipboardDelete) {
          const next = await window.meru.clipboardDelete(c.time);
          renderClipboard(next);
        }
      });
      li.append(txt, rm);
      list.append(li);
    });
  }

  async function initClipboard() {
    if (window.meru && window.meru.clipboardHistory) {
      try { renderClipboard(await window.meru.clipboardHistory()); } catch (e) { renderClipboard([]); }
      if (window.meru.onClipboard) window.meru.onClipboard(renderClipboard);
    } else {
      renderClipboard([]);
    }
    $('#clipClear').addEventListener('click', async () => {
      if (window.meru && window.meru.clipboardClear) await window.meru.clipboardClear();
      renderClipboard([]);
    });
  }

  M.initWidgets = function () {
    initNotes();
    initTodo();
    initCalendar();
    initWeather();
    renderQuote();
    initClipboard();
    applyWidgets();
    document.body.classList.toggle('focus-mode', M.state.focus);
    $('#focusBtn').classList.toggle('on', M.state.focus);
  };

  M.applyWidgets = applyWidgets;
  M.toggleFocus = toggleFocus;
  M.setFocus = setFocus;
  M.renderWeather = renderWeather;
  M.renderClipboard = renderClipboard;
})();
