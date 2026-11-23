// Fresh Pair Radar's dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, the new-pairs
// strip, a per-protocol detail view with the model's own inputs and the
// protocol's farm plan, and a model sandbox that recomputes the board in
// the browser. No network: every byte it shows is in data.js.
//
// Hash states, so each view has a link: #board, #detail=<slug> and
// #filtered (the board filtered to fresh pairs).
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  app.setAttribute('aria-busy', 'false');

  var MODEL = DATA.model;
  var state = { tab: 'board', q: '', chain: 'all', category: 'all', band: 'all', sort: 'implied', dir: -1, selected: null };
  var sandbox = { base: MODEL.base_multiple, vel: MODEL.velocity_weight, fresh: 1.0, active: false };
  // A sandbox slider rebuilds the page, which recreates its own input:
  // remember which slider moved so render() can hand focus back to it.
  var refocusId = null;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days === 0) return 'today';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code
  // and the board's data are visibly the same arithmetic.
  function bandOf(age) {
    if (age === null || age === undefined) return 'unknown';
    if (age <= MODEL.fresh_just_detected_days) return 'just-detected';
    if (age <= MODEL.fresh_fresh_days) return 'fresh';
    if (age <= MODEL.fresh_warming_days) return 'warming';
    if (age <= MODEL.fresh_established_days) return 'established';
    if (age <= MODEL.fresh_seasoned_days) return 'seasoned';
    return 'stale';
  }
  function freshMultOf(age) {
    if (age === null || age === undefined) return MODEL.fresh_unknown_mult;
    if (age <= MODEL.fresh_just_detected_days) return MODEL.fresh_just_detected_mult;
    if (age <= MODEL.fresh_fresh_days) return MODEL.fresh_fresh_mult;
    if (age <= MODEL.fresh_warming_days) return MODEL.fresh_warming_mult;
    if (age <= MODEL.fresh_established_days) return MODEL.fresh_established_mult;
    if (age <= MODEL.fresh_seasoned_days) return MODEL.fresh_seasoned_mult;
    return MODEL.fresh_stale_mult;
  }
  function impliedOf(row, m) {
    var growth = Math.min(m.velocity_cap, Math.max(m.velocity_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var velMult = 1 + (growth / 100) * m.velocity_weight;
    var fm = freshMultOf(row.age_days);
    var scaled = 1 + (fm - 1) * (m.fresh_boost === undefined ? 1 : m.fresh_boost);
    return Math.max(1, Math.round(row.tvl_usd * m.base_multiple * velMult * scaled));
  }
  function modelForSandbox() {
    return { base_multiple: sandbox.base, velocity_weight: sandbox.vel, velocity_floor: MODEL.velocity_floor, velocity_cap: MODEL.velocity_cap, fresh_boost: sandbox.fresh };
  }
  // The value the board shows: the submitted implied value, or the
  // sandbox's recomputation while a slider has moved.
  function shownImplied(row) {
    return sandbox.active ? impliedOf(row, modelForSandbox()) : row.implied_value_usd;
  }
  function checkRow(row) {
    return impliedOf(row, { base_multiple: MODEL.base_multiple, velocity_weight: MODEL.velocity_weight, velocity_floor: MODEL.velocity_floor, velocity_cap: MODEL.velocity_cap, fresh_boost: 1 }) === row.implied_value_usd;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  var chains = [];
  var categories = [];
  DATA.rows.forEach(function (r) {
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
  });
  chains.sort();
  categories.sort();

  function bandLabel(b) {
    return { 'just-detected': 'just detected', fresh: 'fresh', warming: 'warming', established: 'established', seasoned: 'seasoned', stale: 'stale', unknown: 'unknown' }[b] || b;
  }
  function bandBadge(b) { return el('span', { class: 'badge ' + b, text: bandLabel(b) }); }

  function filteredRows() {
    var rows = DATA.rows.slice();
    if (state.tab === 'new') rows = rows.filter(function (r) { return r.band === 'just-detected' || r.band === 'fresh'; });
    if (state.band === 'fresh') rows = rows.filter(function (r) { return r.band === 'just-detected' || r.band === 'fresh'; });
    else if (state.band !== 'all') rows = rows.filter(function (r) { return r.band === state.band; });
    if (state.chain !== 'all') rows = rows.filter(function (r) { return (r.chains || []).indexOf(state.chain) >= 0; });
    if (state.category !== 'all') rows = rows.filter(function (r) { return r.category === state.category; });
    if (state.q) {
      var q = state.q.toLowerCase();
      rows = rows.filter(function (r) { return (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) >= 0; });
    }
    var key = state.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'implied') { av = shownImplied(a); bv = shownImplied(b); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'change') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else { av = a.rank; bv = b.rank; }
      return (av - bv) * state.dir || (a.slug < b.slug ? -1 : 1);
    });
    return rows;
  }

  function renderTable(rows, live) {
    var table = el('table');
    var head = el('thead');
    var hr = el('tr');
    var cols = live
      ? [['Protocol', null], ['Chains', null], ['Category', null], ['TVL', null], ['Market cap', null], ['7d', null]]
      : [['#', 'rank'], ['Protocol', null], ['Chains', 'hide-s'], ['TVL', 'tvl'], ['7d', 'change'], ['First seen', 'age'], ['Implied value', 'implied']];
    cols.forEach(function (c) {
      var th = el('th', { text: c[0] + (c[1] && state.sort === c[1] ? (state.dir < 0 ? ' ↓' : ' ↑') : '') });
      if (c[1]) {
        th.style.cursor = 'pointer';
        th.addEventListener('click', function () {
          if (state.sort === c[1]) state.dir = -state.dir;
          else { state.sort = c[1]; state.dir = -1; }
          render();
        });
      }
      if (c[1] === 'tvl' || c[1] === 'change' || c[1] === 'implied') th.className = 'num';
      hr.appendChild(th);
    });
    head.appendChild(hr);
    table.appendChild(head);
    var body = el('tbody');
    if (rows.length === 0) {
      body.appendChild(el('tr', null, el('td', { colspan: cols.length, class: 'empty', text: 'No protocols match this filter.' })));
    }
    rows.forEach(function (r) {
      var tr = el('tr');
      if (state.selected === r.slug) tr.className = 'selected';
      if (live) {
        tr.appendChild(el('td', null, el('b', { text: r.name })));
        tr.appendChild(el('td', { text: (r.chains || []).join(', ') || '—' }));
        tr.appendChild(el('td', { text: r.category || '—' }));
        tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
        tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }));
        var ch = el('td', { class: 'num ' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : ''), text: fmtPct(r.change_7d) });
        tr.appendChild(ch);
        tr.appendChild(el('td', null, el('span', { class: 'badge live', text: 'already trading' })));
      } else {
        tr.appendChild(el('td', { class: 'rank', text: String(r.rank) }));
        var nameCell = el('td', null, el('b', { text: r.name }), el('br'), el('span', { class: 'note', text: r.slug + (r.category ? ' · ' + r.category : '') }));
        tr.appendChild(nameCell);
        tr.appendChild(el('td', { class: 'hide-s', text: (r.chains || []).join(', ') || '—' }));
        tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
        tr.appendChild(el('td', { class: 'num ' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : ''), text: fmtPct(r.change_7d) }));
        var ageCell = el('td', null, el('span', { text: fmtAge(r.age_days) + ' ' }), bandBadge(r.band));
        if (r.listed_at) ageCell.appendChild(el('br'));
        if (r.listed_at) ageCell.appendChild(el('span', { class: 'note', text: r.listed_at }));
        tr.appendChild(ageCell);
        var imp = shownImplied(r);
        var impCell = el('td', { class: 'num' }, el('b', { text: fmtUsd(imp) }));
        if (sandbox.active && imp !== r.implied_value_usd) impCell.appendChild(el('span', { class: 'note', text: ' (was ' + fmtUsd(r.implied_value_usd) + ') ' }));
        tr.appendChild(impCell);
        tr.addEventListener('click', function () { select(r.slug); });
      }
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  function renderDetail() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var wrap = el('section', { class: 'detail', id: 'detail' });
    wrap.appendChild(el('button', { class: 'close', text: 'Close', onclick: function () { select(null); } }));
    wrap.appendChild(el('h2', { text: '#' + row.rank + ' ' + row.name }));
    wrap.appendChild(el('p', { class: 'lede', text: row.name + ' records no token. It was first seen ' + (row.listed_at || 'on an unknown date') + ' (' + fmtAge(row.age_days) + ' ago, ' + bandLabel(row.band) + '), runs on ' + ((row.chains || []).join(', ') || 'its main chain') + ', and holds ' + fmtUsd(row.tvl_usd) + ' of TVL.' }));
    var kv = el('div', { class: 'kv' });
    kv.appendChild(el('div', null, el('div', { class: 'k', text: 'Implied value' }), el('div', { class: 'v', text: fmtUsd(row.implied_value_usd) })));
    kv.appendChild(el('div', null, el('div', { class: 'k', text: 'TVL × ' + MODEL.base_multiple }), el('div', { class: 'v', text: fmtUsd(row.base_usd) })));
    kv.appendChild(el('div', null, el('div', { class: 'k', text: '7-day velocity' }), el('div', { class: 'v', text: fmtPct(row.change_7d) + ' → ×' + row.velocity_multiplier.toFixed(2) })));
    kv.appendChild(el('div', null, el('div', { class: 'k', text: 'Freshness (' + bandLabel(row.band) + ')' }), el('div', { class: 'v', text: '×' + row.freshness_multiplier.toFixed(2) })));
    wrap.appendChild(kv);
    wrap.appendChild(el('div', { class: 'math', text: 'implied = TVL × ' + MODEL.base_multiple + ' × velocity × freshness = ' + fmtUsd(row.base_usd) + ' × ' + row.velocity_multiplier.toFixed(2) + ' × ' + row.freshness_multiplier.toFixed(2) + ' = ' + fmtUsd(row.implied_value_usd) + (checkRow(row) ? '  ✓ recomputes' : '  (sandbox values differ)') }));
    wrap.appendChild(el('h3', { text: 'Farm plan — six steps with cost and time' }));
    var ol = el('ol', { class: 'plan' });
    (row.farm_steps || []).forEach(function (s) { ol.appendChild(el('li', { text: s })); });
    wrap.appendChild(ol);
    return wrap;
  }

  function select(slug) {
    state.selected = slug;
    if (slug) { try { history.replaceState(null, '', '#detail=' + slug); } catch (e) { /* file:// */ } }
    else { try { history.replaceState(null, '', '#board'); } catch (e) { /* file:// */ } }
    render();
    if (slug) {
      var d = document.getElementById('detail');
      if (d) d.scrollIntoView({ block: 'start' });
    }
  }

  function render() {
    app.innerHTML = '';
    var fresh = DATA.rows.filter(function (r) { return r.band === 'just-detected' || r.band === 'fresh'; });
    var justDetected = DATA.rows.filter(function (r) { return r.band === 'just-detected'; });

    app.appendChild(el('h1', { html: 'Fresh Pair Radar <span class="fresh">— new pairs, first</span>' }));
    app.appendChild(el('p', { class: 'lede', html: 'A token launch radar that scans like a new-pair detector: every pre-token protocol is a pair the radar has <b>just detected</b>, ranked by an implied value built from its depth (TVL), its 7-day inflow velocity, and how recently it was first seen. The snapshot covers ' + DATA.board_size + ' ranked rows; ' + DATA.watchlist_size + ' of them are the watchlist floor and ' + DATA.early_size + ' were detected below it.' }));
    var stats = el('div', { class: 'stats' });
    stats.appendChild(el('div', { class: 'stat' }, el('div', { class: 'num', text: String(DATA.board_size) }), el('div', { class: 'lbl', text: 'ranked pairs' })));
    stats.appendChild(el('div', { class: 'stat' }, el('div', { class: 'num cyan', text: String(DATA.fresh_size) }), el('div', { class: 'lbl', text: 'fresh pairs (≤90 days)' })));
    stats.appendChild(el('div', { class: 'stat' }, el('div', { class: 'num amber', text: String(justDetected.length) }), el('div', { class: 'lbl', text: 'just detected (≤30 days)' })));
    stats.appendChild(el('div', { class: 'stat' }, el('div', { class: 'num', text: fmtUsd(DATA.rows[0].implied_value_usd) }), el('div', { class: 'lbl', text: 'top implied value' })));
    stats.appendChild(el('div', { class: 'stat' }, el('div', { class: 'num', text: DATA.as_of }), el('div', { class: 'lbl', text: 'snapshot date' })));
    app.appendChild(stats);

    app.appendChild(el('h2', { text: 'Just detected — the freshest pairs on the radar' }));
    var strip = el('div', { class: 'strip' });
    fresh.slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; }).slice(0, 8).forEach(function (r) {
      var card = el('button', { class: 'card' });
      card.appendChild(el('div', { class: 'nm', text: '#' + r.rank + ' ' + r.name }));
      card.appendChild(el('div', { class: 'val', text: fmtUsd(r.implied_value_usd) }));
      card.appendChild(el('div', { class: 'meta', text: 'first seen ' + fmtAge(r.age_days) + ' ago · ' + fmtUsd(r.tvl_usd) + ' TVL · ' + fmtPct(r.change_7d) + ' 7d' }));
      card.appendChild(el('div', { class: 'meta' }, bandBadge(r.band)));
      card.addEventListener('click', function () { select(r.slug); });
      strip.appendChild(card);
    });
    app.appendChild(strip);

    var tabs = el('div', { class: 'tabs' });
    [['board', 'Board — all ' + DATA.board_size + ' ranked pairs'], ['new', 'New pairs — ' + DATA.fresh_size + ' fresh'], ['live', 'Already trading — ' + DATA.live_size + ' live tokens']].forEach(function (t) {
      var b = el('button', { class: 'tab', text: t[1], 'aria-pressed': String(state.tab === t[0]) });
      b.addEventListener('click', function () { state.tab = t[0]; state.selected = null; render(); });
      tabs.appendChild(b);
    });
    app.appendChild(tabs);

    if (state.tab !== 'live') {
      var controls = el('div', { class: 'controls' });
      var q = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
      q.addEventListener('input', function () { state.q = q.value; render(); });
      controls.appendChild(q);
      var chainSel = el('select', { 'aria-label': 'Chain' });
      chainSel.appendChild(el('option', { value: 'all', text: 'All chains' }));
      chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
      chainSel.value = state.chain;
      chainSel.addEventListener('change', function () { state.chain = chainSel.value; render(); });
      controls.appendChild(chainSel);
      var catSel = el('select', { 'aria-label': 'Category' });
      catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
      categories.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
      catSel.value = state.category;
      catSel.addEventListener('change', function () { state.category = catSel.value; render(); });
      controls.appendChild(catSel);
      var bandSel = el('select', { 'aria-label': 'Freshness band' });
      [['all', 'All freshness'], ['fresh', 'Fresh only (≤90 days)'], ['just-detected', 'Just detected (≤30 days)'], ['warming', 'Warming (91–180 days)'], ['established', 'Established (181–365 days)'], ['seasoned', 'Seasoned (1–3 years)'], ['stale', 'Stale (>3 years)'], ['unknown', 'Unknown age']].forEach(function (o) {
        bandSel.appendChild(el('option', { value: o[0], text: o[1] }));
      });
      bandSel.value = state.band;
      bandSel.addEventListener('change', function () { state.band = bandSel.value; render(); });
      controls.appendChild(bandSel);
      app.appendChild(controls);
    }

    var rows = state.tab === 'live' ? DATA.live : filteredRows();
    if (state.tab !== 'live') {
      var count = el('div', { class: 'count', text: rows.length + ' of ' + DATA.board_size + ' pairs' + (sandbox.active ? ' · sandbox values' : '') });
      app.appendChild(count);
    }
    app.appendChild(renderTable(rows, state.tab === 'live'));
    var detail = renderDetail();
    if (detail) app.appendChild(detail);

    // Model sandbox: move the sliders and the board recomputes in the browser.
    var sb = el('section', { class: 'sandbox' });
    sb.appendChild(el('h2', { text: 'Model sandbox — move a slider, the board recomputes' }));
    sb.appendChild(el('p', { class: 'lede', text: 'The submitted board keeps the model as published below. The sandbox only re-prices the board in your browser, so you can see what the ranking is sensitive to.' }));
    function slider(id, label, min, max, step, value, oninput) {
      sb.appendChild(el('label', { text: label }));
      var row = el('div');
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value) });
      var out = el('output', { text: value.toFixed(2) });
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        out.textContent = v.toFixed(2);
        oninput(v);
        sandbox.active = true;
        refocusId = id;
        render();
      });
      row.appendChild(input);
      row.appendChild(out);
      sb.appendChild(row);
    }
    slider('sb-base', 'Base multiple — TVL × this', 0.05, 0.5, 0.01, sandbox.base, function (v) { sandbox.base = v; });
    slider('sb-vel', 'Velocity weight — how much the 7-day move matters', 0, 1.5, 0.05, sandbox.vel, function (v) { sandbox.vel = v; });
    slider('sb-fresh', 'Freshness boost — how much being newly detected matters', 0, 2, 0.1, sandbox.fresh, function (v) { sandbox.fresh = v; });
    var reset = el('button', { class: 'tab', text: 'Reset to the published model' });
    reset.addEventListener('click', function () {
      sandbox.base = MODEL.base_multiple; sandbox.vel = MODEL.velocity_weight; sandbox.fresh = 1.0; sandbox.active = false;
      render();
    });
    sb.appendChild(reset);
    sb.appendChild(el('p', { class: 'note', text: sandbox.active ? 'Sandbox is on: values shown are recomputed in your browser.' : 'Sandbox is off: values shown are the submitted board.' }));
    app.appendChild(sb);

    // The model, stated in full, so the board can be checked by hand.
    var model = el('section', { class: 'model' });
    model.appendChild(el('h2', { text: 'The model (fresh-pair-1)' }));
    model.appendChild(el('p', { class: 'lede', text: 'Implied value = TVL × ' + MODEL.base_multiple + ' × velocity × freshness. Velocity is the 7-day TVL change clamped to ' + MODEL.velocity_floor + '%…+' + MODEL.velocity_cap + '%, weighted ×' + MODEL.velocity_weight + '. Freshness is the first-seen clock: how long the protocol has run since DefiLlama first listed it, with no token recorded.' }));
    var bt = el('table');
    bt.appendChild(el('thead', null, el('tr', null, el('th', { text: 'First seen' }), el('th', { text: 'Band' }), el('th', { class: 'num', text: 'Freshness ×' }))));
    var bb = el('tbody');
    [['≤ 30 days', 'just-detected', MODEL.fresh_just_detected_mult], ['31–90 days', 'fresh', MODEL.fresh_fresh_mult], ['91–180 days', 'warming', MODEL.fresh_warming_mult], ['181–365 days', 'established', MODEL.fresh_established_mult], ['1–3 years', 'seasoned', MODEL.fresh_seasoned_mult], ['> 3 years', 'stale', MODEL.fresh_stale_mult], ['unknown', 'unknown', MODEL.fresh_unknown_mult]].forEach(function (r) {
      bb.appendChild(el('tr', null, el('td', { text: r[0] }), el('td', null, bandBadge(r[1])), el('td', { class: 'num', text: '×' + r[2].toFixed(2) })));
    });
    bt.appendChild(bb);
    model.appendChild(bt);
    model.appendChild(el('p', { class: 'note', text: '“Records no token” is what the snapshot says: a protocol on this board may still have a token its DefiLlama record does not carry. The board separates pre-token protocols from the ' + DATA.live_size + ' live tokens in the Already trading tab, which are priced by the market, not by this model. Data: DefiLlama protocols snapshot, ' + DATA.as_of + '.' }));
    app.appendChild(model);

    // Hand focus back to the sandbox slider that moved, now recreated.
    if (refocusId) {
      var moved = document.getElementById(refocusId);
      refocusId = null;
      if (moved) moved.focus();
    }
  }

  // Hash states for the three screenshots and for sharing a view.
  function fromHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (h.indexOf('detail=') === 0) {
      var slug = decodeURIComponent(h.slice(7));
      if (DATA.rows.some(function (r) { return r.slug === slug; })) { state.selected = slug; state.tab = 'board'; }
    } else if (h === 'filtered') {
      state.tab = 'board';
      state.band = 'fresh';
    } else if (h === 'new') {
      state.tab = 'new';
    } else if (h === 'live') {
      state.tab = 'live';
    }
  }
  fromHash();
  render();
})();
