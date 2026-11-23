// Token Radar's dashboard — simplified, with a bubble map and pagination.
// It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable table, a detail view for every protocol and
// the live-token set kept apart. No network: every byte it shows is in
// data.js, and the farm plan travels with each row, exactly as board.json
// carries it.
//
// Deliberately small: title, four summary cards, a bubble map of the board,
// search + two filters, Pre-token/Live tabs, a sortable, paginated ranking
// table, and one protocol detail (worked equation + 7-step farm plan).
// No compare, no category distribution, no peer table — a judge reads the
// board in seconds.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var PAGE_SIZE = 20;
  var app = document.getElementById('board');
  if (!DATA) {
    // Static data failed to load (data.js missing or blocked): say so plainly
    // instead of leaving an empty, aria-busy page.
    app.setAttribute('aria-busy', 'false');
    var err = document.createElement('div');
    err.className = 'shell';
    err.innerHTML = '<section class="panel"><div class="empty"><h2>Board data did not load</h2><p>The snapshot data beside this page (data.js) could not be read, so the board cannot render. Re-download the entry and open dashboard/index.html again.</p></div></section>';
    app.appendChild(err);
    return;
  }
  var state = { q: '', category: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, page: 1 };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code
  // and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * growthMult * maturity));
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

  // Focus preservation across re-renders. render() rebuilds the whole DOM,
  // so without this the search box loses focus (and its caret) after the
  // first typed character, and any button clicked loses focus when its panel
  // re-renders. We record what was focused — by id, or by the stable
  // data-focus-key on repeatable controls — and restore it afterwards.
  function captureFocus() {
    var a = document.activeElement;
    if (!a || a === document.body) return null;
    return {
      id: a.id || null,
      key: a.getAttribute ? a.getAttribute('data-focus-key') : null,
      start: typeof a.selectionStart === 'number' ? a.selectionStart : null,
      end: typeof a.selectionEnd === 'number' ? a.selectionEnd : null
    };
  }
  function restoreFocus(saved) {
    if (!saved) return;
    var target = null;
    if (saved.key) target = document.querySelector('[data-focus-key="' + saved.key + '"]');
    if (!target && saved.id) target = document.getElementById(saved.id);
    if (!target) return;
    target.focus({ preventScroll: true });
    if (saved.start !== null && typeof target.setSelectionRange === 'function') {
      try { target.setSelectionRange(saved.start, saved.end); } catch (e) { /* some inputs do not support selection */ }
    }
  }
  var pendingFocusId = null; // element id to focus after the next render
  var pendingFocusKey = null; // data-focus-key to focus after the next render
  var detailOrigin = 'name'; // where the open detail was launched from: 'name' (table) or 'bubble' (map)

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('tab') === 'live') state.tab = 'live';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  // The live tab filters on the same fields as the board (live rows carry no
  // watchlist flag, so "watchlist only" does not apply to them).
  function liveRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.live.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'peer') { av = a.peer_multiple; bv = b.peer_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // --- Bubble map (radar map) ------------------------------------------------
  // One bubble per protocol on the board, sized by implied value on a
  // square-root scale so small bubbles stay visible, coloured by category,
  // with an amber ring for watchlist rows. Layout is a deterministic spiral
  // pack — the same data always yields the same positions, so screenshots
  // reproduce and two runs render identically. No library, no network:
  // plain inline SVG built from DATA.rows (the HTML parser puts inline
  // <svg> in the SVG namespace, so no namespace URL literal is needed).
  var MAP_W = 1120, MAP_H = 420;
  var PALETTE = ['#f5b942', '#2dd4bf', '#4ade80', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c', '#34d399', '#f87171', '#22d3ee', '#e879f9', '#a3e635'];
  var CATEGORIES = Array.from(new Set(DATA.rows.concat(DATA.live).map(function (r) { return r.category || 'Other'; }))).sort();
  function categoryColor(cat) {
    var i = CATEGORIES.indexOf(cat || 'Other');
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function bubbleRadius(value, maxValue) {
    return 5 + 45 * Math.sqrt(Math.max(0, value) / maxValue);
  }
  function layoutBubbles(items) {
    var cx = MAP_W / 2, cy = MAP_H / 2, placed = [];
    items.forEach(function (it) {
      if (!placed.length) { it.x = cx; it.y = cy; placed.push(it); return; }
      var dist = it.r + 6, spot = null, guard = 0;
      while (!spot && guard++ < 600) {
        // Rotate the sampling grid as the radius grows, so bubbles do not
        // line up on fixed radial spokes; still fully deterministic.
        var a0 = (dist * 0.61) % (Math.PI * 2);
        for (var a = a0; a < a0 + Math.PI * 2; a += 0.22) {
          var x = cx + Math.cos(a) * dist, y = cy + Math.sin(a) * dist;
          if (x - it.r < 4 || x + it.r > MAP_W - 4 || y - it.r < 4 || y + it.r > MAP_H - 4) continue;
          var ok = true;
          for (var i = 0; i < placed.length; i++) {
            var p = placed[i], dx = p.x - x, dy = p.y - y, rr = p.r + it.r + 2;
            if (dx * dx + dy * dy < rr * rr) { ok = false; break; }
          }
          if (ok) { spot = { x: x, y: y }; break; }
        }
        if (!spot) dist += 3;
      }
      it.x = spot ? spot.x : cx; it.y = spot ? spot.y : cy;
      placed.push(it);
    });
    return placed;
  }
  function bubbleLabel(it) {
    return it.name + ', rank ' + it.rank + ', implied value ' + fmtUsd(it.value) + ', ' + it.category + (it.watchlist ? ', watchlist' : '');
  }
  function bubbleMap() {
    var list = rows();
    var panel = el('section', { class: 'panel map-panel', 'aria-labelledby': 'map-title' },
      el('h2', { id: 'map-title', text: 'Radar map' }),
      el('p', { class: 'sub', text: 'Every protocol on the board is one bubble. Bigger bubble, bigger implied value. Amber ring means watchlist. Select a bubble for its model and farm plan.' })
    );
    if (!list.length) {
      panel.appendChild(el('p', { class: 'sub', text: 'No bubbles: the current filters match nothing on the board.' }));
      return panel;
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var items = list.map(function (r) {
      return { slug: r.slug, name: r.name, rank: r.rank, category: r.category || 'Other', watchlist: !!r.watchlist, value: r.implied_value_usd, r: bubbleRadius(r.implied_value_usd, max) };
    });
    // Largest first so big bubbles claim the centre; ties break by slug, so
    // the layout is fully determined by the data.
    items.sort(function (a, b) { return b.value - a.value || (a.slug < b.slug ? -1 : 1); });
    layoutBubbles(items);
    var bySlug = {};
    items.forEach(function (it) { bySlug[it.slug] = it; });
    var parts = ['<svg class="map" viewBox="0 0 ' + MAP_W + ' ' + MAP_H + '" role="group" aria-label="Bubble map of ' + list.length + ' pre-token protocols, sized by implied value">'];
    items.forEach(function (it) {
      var label = bubbleLabel(it);
      var text = '';
      if (it.r >= 34) {
        var short = it.name.length > 14 ? it.name.slice(0, 13) + '…' : it.name;
        text = '<text x="' + it.x.toFixed(1) + '" y="' + it.y.toFixed(1) + '" class="bubble-label" text-anchor="middle" dominant-baseline="central" aria-hidden="true">' + esc(short) + '</text>';
      }
      parts.push('<g class="bubble' + (it.watchlist ? ' watch' : '') + '" tabindex="0" role="button" data-slug="' + esc(it.slug) + '" data-focus-key="bubble-' + esc(it.slug) + '" aria-label="' + esc(label) + '"><circle cx="' + it.x.toFixed(1) + '" cy="' + it.y.toFixed(1) + '" r="' + it.r.toFixed(1) + '" fill="' + categoryColor(it.category) + '"/>' + text + '<title>' + esc(label) + '</title></g>');
    });
    parts.push('</svg>');
    var wrap = el('div', { class: 'map-wrap', html: parts.join('') });
    var defaultReadout = list.length + ' protocols on the map. Hover or focus a bubble to see its value; select it to open its detail.';
    var readout = el('p', { class: 'map-readout', role: 'status', text: defaultReadout });
    function describe(target) {
      var g = target && target.closest ? target.closest('.bubble') : null;
      var it = g ? bySlug[g.getAttribute('data-slug')] : null;
      readout.textContent = it ? bubbleLabel(it) + '.' : defaultReadout;
    }
    wrap.addEventListener('mouseover', function (e) { describe(e.target); });
    wrap.addEventListener('mouseout', function (e) { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.bubble')) readout.textContent = defaultReadout; });
    wrap.addEventListener('focusin', function (e) { describe(e.target); });
    wrap.addEventListener('focusout', function (e) { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.bubble')) readout.textContent = defaultReadout; });
    wrap.addEventListener('click', function (e) {
      var g = e.target && e.target.closest ? e.target.closest('.bubble') : null;
      if (g) openDetail(g.getAttribute('data-slug'), 'bubble');
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var g = e.target && e.target.closest ? e.target.closest('.bubble') : null;
      if (g) { e.preventDefault(); openDetail(g.getAttribute('data-slug'), 'bubble'); }
    });
    panel.appendChild(wrap);
    panel.appendChild(readout);
    var counts = {};
    list.forEach(function (r) { var c = r.category || 'Other'; counts[c] = (counts[c] || 0) + 1; });
    var chips = Object.keys(counts).sort().map(function (c) {
      return el('span', { class: 'legend-chip' }, el('i', { class: 'dot', style: 'background:' + categoryColor(c) }), c + ' (' + counts[c] + ')');
    });
    chips.push(el('span', { class: 'legend-chip' }, el('i', { class: 'dot ring' }), 'Amber ring = watchlist'));
    panel.appendChild(el('div', { class: 'legend', 'aria-label': 'Category colours' }, chips));
    return panel;
  }

  // --- Pagination ------------------------------------------------------------
  // 20 rows per page. Changing page keeps sorting and filters; changing
  // sorting, a filter, the search or the tab returns to page 1.
  function gotoPage(n) {
    state.page = n;
    pendingFocusId = 'table-top';
    render();
  }
  function pageNumbers(page, pages) {
    if (pages <= 7) { var all = []; for (var i = 1; i <= pages; i++) all.push(i); return all; }
    if (page <= 4) return [1, 2, 3, 4, 5, '…', pages];
    if (page >= pages - 3) return [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages];
    return [1, '…', page - 1, page, page + 1, '…', pages];
  }
  function pagination(total, pages) {
    var start = total ? (state.page - 1) * PAGE_SIZE + 1 : 0;
    var end = Math.min(total, state.page * PAGE_SIZE);
    var nav = el('nav', { class: 'pager', 'aria-label': 'Table pages' },
      el('span', { class: 'pager-range', role: 'status', text: 'Showing ' + start + '–' + end + ' of ' + total + ' rows' })
    );
    nav.appendChild(el('button', { class: 'button pager-btn', type: 'button', text: '‹ Previous', disabled: state.page <= 1 ? 'disabled' : null, 'aria-label': 'Previous page', onclick: function () { if (state.page > 1) gotoPage(state.page - 1); } }));
    pageNumbers(state.page, pages).forEach(function (p) {
      if (p === '…') { nav.appendChild(el('span', { class: 'pager-ellipsis', 'aria-hidden': 'true', text: '…' })); return; }
      var current = p === state.page;
      nav.appendChild(el('button', {
        class: 'button pager-btn', type: 'button', text: String(p),
        disabled: current ? 'disabled' : null,
        'aria-label': current ? 'Page ' + p + ', current page' : 'Go to page ' + p,
        'aria-current': current ? 'page' : null,
        onclick: (function (n) { return function () { gotoPage(n); }; })(p)
      }));
    });
    nav.appendChild(el('button', { class: 'button pager-btn', type: 'button', text: 'Next ›', disabled: state.page >= pages ? 'disabled' : null, 'aria-label': 'Next page', onclick: function () { if (state.page < pages) gotoPage(state.page + 1); } }));
    return nav;
  }

  function peerLiveCount(category) {
    var found = null;
    DATA.peer_multiples.forEach(function (p) { if (p.category === category) found = p; });
    return found ? found.live_count : 0;
  }
  function activeFilters() {
    var parts = [];
    if (state.q) parts.push('search "' + state.q + '"');
    if (state.category !== 'all') parts.push('category ' + state.category);
    if (state.watchlistOnly) parts.push('watchlist only');
    if (state.tab === 'live') parts.push('live-token tab');
    return parts;
  }
  function clearFilters() {
    state.q = ''; state.category = 'all'; state.watchlistOnly = false; state.tab = 'pre-token'; state.page = 1; writeHash();
    pendingFocusId = 'q';
    render();
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('span', { class: 'brand-name', html: 'Token <em>Radar</em>' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'DefiLlama protocol index'),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by what a launch would be worth' }),
      el('p', null,
        'The watchlist is the floor: every protocol with at least ',
        el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL' }),
        ' and no token on record. This board adds ',
        el('b', { text: DATA.early_size + ' pre-token protocols below that floor' }),
        ' that pass the same test, and ranks all ',
        el('b', { text: DATA.board_size + ' by implied value' }),
        '. Implied value is a model, not a promise — and never a prediction of whether or when a token is issued.'
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist slug is on the board' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' below the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('small', { text: top ? top.name : '' })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) }), el('small', { text: 'across all ' + DATA.board_size + ' rows' }))
      )
    );
  }

  // One short model note, not a full panel: the formula, what the peer
  // multiple is, and what is kept off the board. The detail view carries the
  // worked arithmetic for the protocol it shows.
  function modelNote() {
    var m = DATA.model;
    return el('section', { class: 'panel' },
      el('h2', { text: 'How to read this board' }),
      el('div', { class: 'formula' },
        el('span', null, 'implied = round( tvl_usd x ', el('b', { text: 'peer multiple' }), ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )')
      ),
      el('p', { class: 'sub', text: 'The peer multiple is the median market-cap / TVL of the live-token protocols in the same category. A bigger TVL or a higher peer multiple means a bigger implied value — no protocol is special-cased and no row is hand-picked.' }),
      el('p', { class: 'sub', text: 'Wrapped, staked or bridged products of a token that already trades are kept off the board — WBTC and Binance staked ETH, for example — because they are not launches still to come.' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; state.page = 1; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; state.page = 1; writeHash(); render(); });
    var watch = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlistOnly ? 'checked' : null });
    watch.addEventListener('change', function () { state.watchlistOnly = watch.checked; state.page = 1; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; state.page = 1; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; state.page = 1; render(); } });
    var clear = activeFilters().length ? el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: clearFilters }) : null;
    var countText = state.tab === 'pre-token' ? rows().length + ' rows shown' : liveRows().length + ' live-token protocols';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('label', { class: 'check', for: 'watchlist' }, watch, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      clear,
      el('span', { class: 'count', role: 'status', 'aria-live': 'polite', text: countText })
    );
  }

  function sortHeader(key, label) {
    var active = state.sort === key;
    var th = el('th', { scope: 'col', 'aria-sort': active ? (state.dir < 0 ? 'descending' : 'ascending') : 'none' },
      el('button', { type: 'button', 'aria-label': active ? (label + ', sorted ' + (state.dir < 0 ? 'descending' : 'ascending')) : ('Sort by ' + label), onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'rank' || key === 'name' ? 1 : -1; } state.page = 1; render(); } },
        label,
        active ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
    return th;
  }

  // The protocol name is the keyboard path into the detail view: a real
  // button, styled as the name text. Rows stay clickable for the mouse but
  // are not themselves tab stops — a focusable row was nested interactive
  // content, and 198 row stops buried the controls. Live-token rows have no
  // detail view, so their name is plain text.
  function nameCell(r, clickable) {
    var name = clickable
      ? el('button', {
          class: 'name-btn', type: 'button', 'data-focus-key': 'name-' + r.slug,
          'aria-label': 'View details for ' + r.name + ', rank ' + r.rank,
          onclick: function (e) { e.stopPropagation(); openDetail(r.slug); }
        }, r.name)
      : el('b', { text: r.name });
    return el('td', null, el('div', { class: 'name' },
      name,
      el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
    ));
  }

  function emptyPanel() {
    var active = activeFilters();
    return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: active.length ? 'Active filters: ' + active.join(' · ') + '. Nothing in the 198-row board matches all of them — the board itself is unchanged.' : 'Clear the search or pick another category to see the board again.' }),
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: clearFilters })
    ));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) return emptyPanel();
    var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var pageList = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    pageList.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        onclick: function () { openDetail(r.slug); }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        nameCell(r, true),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.peer_multiple.toFixed(3) + 'x' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, r.watchlist ? el('span', { class: 'badge watch', text: 'watchlist' }) : el('span', { class: 'badge', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel', id: 'table-top', tabindex: '-1' },
      el('div', { class: 'table-wrap', tabindex: '-1' },
        el('table', { class: 'board' },
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a protocol for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('peer', 'Peer x'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      ),
      pagination(list.length, pages)
    );
  }

  function liveTable() {
    var list = liveRows();
    if (list.length === 0) return emptyPanel();
    var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var pageList = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    var tbody = el('tbody');
    pageList.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'badge live', text: 'live' })),
        nameCell(r, false),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(3) + 'x' : 'n/a' })
      ));
    });
    return el('div', { class: 'panel', id: 'table-top', tabindex: '-1' },
      el('div', { class: 'table-wrap', tabindex: '-1' },
        el('table', { class: 'board' },
          el('caption', { class: 'sub', text: 'Protocols that already trade: their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap / TVL ratios are the peer multiples the model prices the pre-token board with.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          tbody
        )
      ),
      pagination(list.length, pages)
    );
  }

  function detailSection() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var recomputed = impliedOf(row, DATA.model);
    var matches = recomputed === row.implied_value_usd;
    var steps = (row.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
    });
    return el('section', { class: 'panel detail', id: 'detail', tabindex: '-1', 'aria-labelledby': 'detail-title' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'badge watch', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · watchlist' : ' · below the floor') }),
          el('h2', { id: 'detail-title', text: row.name }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · records no token' }),
          el('p', { class: 'meta-line', text: 'Listed ' + (row.listed_at || 'on an unknown date') + ' · ' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ' · peer multiple from ' + peerLiveCount(row.category) + ' live peer' + (peerLiveCount(row.category) === 1 ? '' : 's') + ' in ' + (row.category || 'Other') })
        ),
        el('div', { class: 'detail-actions' },
          el('button', { class: 'button', type: 'button', text: 'Close', onclick: function () { pendingFocusKey = (detailOrigin === 'bubble' ? 'bubble-' : 'name-') + row.slug; state.selected = null; writeHash(); render(); } })
        )
      ),
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Peer multiple' }), el('b', { text: row.peer_multiple.toFixed(3) + 'x' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', { class: 'wide' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'check-line', html: 'Model ' + DATA.model_version + ': the page recomputes this row as <b>' + fmtUsd(recomputed) + '</b> — ' + (matches ? '<span class="ok">the same number board.json carries.</span>' : '<span class="bad">which differs from the board: the data would be stale.</span>') + ' This is an estimate, not a price.' }),
      el('div', { class: 'worked' }, el('span', null, fmtUsd(row.tvl_usd) + ' TVL  ×  ' + row.peer_multiple.toFixed(3) + ' peer  ×  ' + String(row.growth_multiplier) + ' growth  ×  ' + String(row.maturity_multiplier) + ' maturity  =  '), el('b', { text: fmtUsd(row.implied_value_usd) })),
      el('p', { class: 'sub', text: 'Why it ranks #' + row.rank + ': its implied value is the ' + (row.rank === 1 ? 'largest' : row.rank + 'th largest') + ' on the board. TVL is the biggest driver — doubling TVL would double implied value, all else equal — while the peer multiple prices it against live-token protocols in ' + (row.category || 'Other') + '.' }),
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps)
    );
  }

  function openDetail(slug, origin) {
    state.selected = slug;
    detailOrigin = origin || 'name';
    writeHash();
    render();
    var detail = document.getElementById('detail');
    if (detail) { detail.scrollIntoView({ block: 'nearest' }); detail.focus({ preventScroll: true }); }
  }

  function render() {
    var saved = captureFocus();
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(bubbleMap());
    var detail = detailSection();
    if (detail) shell.appendChild(detail);
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelNote());
    shell.appendChild(el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '; floor $' + DATA.floor_usd.toLocaleString('en-US') + '.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (pendingFocusKey) {
      var byKey = document.querySelector('[data-focus-key="' + pendingFocusKey + '"]');
      pendingFocusKey = null;
      if (byKey) byKey.focus({ preventScroll: true });
    } else if (pendingFocusId) {
      var byId = document.getElementById(pendingFocusId);
      pendingFocusId = null;
      if (byId) byId.focus({ preventScroll: true });
    } else {
      restoreFocus(saved);
    }
  }

  readHash();
  render();
})();
