(() => {
  const FLY_MASK = 0x40000 | 0x20000 | 0x10000 | 0x800 | 0x40 | 0x10 | 0x2;
  const CIR = ['low', 'mid', 'top'];
  const AXES = ['x', 'y', 'z'];
  const PROCS = window.PROC_NAMES || [];
  const HORSE_PROCS = [
    'horse wait',
    'horse move',
    'horse stop',
    'horse turn',
    'horse jump',
    'horse land',
    'horse large damage',
    'horse tool demo',
    'horse none',
  ];
  const MAX_FRAMES = 400;
  const DIVIDER_FRAMES = 80;
  const $ = (id) => document.getElementById(id);

  const SERIES = [
    { id: 'feet', label: 'Feet (Link position)', color: 'feet', on: true },
    { id: 'epona', label: 'Epona position and circles (while riding)', color: 'epona', on: true },
    { id: 'c0', label: 'Low wall circle', color: 'low', on: true },
    { id: 'c1', label: 'Mid wall circle', color: 'mid', on: true },
    { id: 'c2', label: 'Top wall circle', color: 'top', on: true },
    { id: 'lines', label: 'Line check lines', color: 'muted', on: false },
    { id: 'surfaces', label: 'Surfaces from the log', color: 'floor', on: true },
    { id: 'push', label: 'Wall push zones', color: 'wall', on: false },
    { id: 'refs', label: 'Reference lines', color: 'ref', on: true },
  ];

  const MOVE_PARTS = [
    { id: 'mv', label: 'Movement step total', part: 'total' },
    { id: 'an', label: 'Animation movement', part: 'anim' },
    { id: 'ot', label: 'Other movement (not speed, animation or actor push)', part: 'other' },
  ];

  function movementParts(r) {
    const pre = ev(r, 'posmove_pre');
    const post = ev(r, 'posmove_post');
    if (!pre || !post) return null;
    const total = [0, 1, 2].map((i) => post.pos[i] - pre.pos[i]);
    const anim = post.anim_move || null;
    const cc = pre.cc_move || [0, 0, 0];
    const other = [0, 1, 2].map((i) => total[i] - post.speed[i] - (anim ? anim[i] : 0) - cc[i]);
    return { total, anim, other };
  }

  function movementGetter(part, axis) {
    return (r) => {
      const m = movementParts(r);
      const v = m && m[part];
      if (!v) return {};
      if (axis === 'h') return { move: Math.hypot(v[0], v[2]) };
      return { move: v[axis] };
    };
  }

  const VARS = [
    ...MOVE_PARTS.flatMap((m) => [
      { id: m.id + 'x', label: m.label + ' x', get: movementGetter(m.part, 0) },
      { id: m.id + 'y', label: m.label + ' y', get: movementGetter(m.part, 1) },
      { id: m.id + 'z', label: m.label + ' z', get: movementGetter(m.part, 2) },
      { id: m.id + 'h', label: m.label + ', horizontal', get: movementGetter(m.part, 'h') },
    ]),
    { id: 'spx', label: 'Speed x', get: speedAt(0) },
    { id: 'spy', label: 'Speed y', get: speedAt(1) },
    { id: 'spz', label: 'Speed z', get: speedAt(2) },
    {
      id: 'spf',
      label: 'Forward speed',
      get: (r) => ({
        start: val(ev(r, 'frame'), 'speedF'),
        move: val(ev(r, 'posmove_post'), 'speedF'),
      }),
    },
    {
      id: 'nsp',
      label: 'Normal speed',
      get: (r) => ({ start: val(ev(r, 'frame'), 'normal_speed') }),
    },
    { id: 'grav', label: 'Gravity', get: (r) => ({ start: val(ev(r, 'frame'), 'gravity') }) },
    { id: 'ccx', label: 'Actor push x', get: ccAt(0) },
    { id: 'ccy', label: 'Actor push y', get: ccAt(1) },
    { id: 'ccz', label: 'Actor push z', get: ccAt(2) },
    {
      id: 'gnd',
      label: 'Ground height found',
      get: (r) => ({ ground: val(ev(r, 'ground_post'), 'ground_h') }),
    },
    {
      id: 'gss',
      label: 'Ground search start',
      get: (r) => ({ ground: val(ev(r, 'ground_pre'), 'search_start') }),
    },
    { id: 'roof', label: 'Ceiling height', get: (r) => ({ roof: val(ev(r, 'roof'), 'roof_h') }) },
    {
      id: 'rlim',
      label: 'Ceiling limit',
      get: (r) => ({ roof: val(ev(r, 'roof'), 'roof_limit') }),
    },
    {
      id: 'cold',
      label: 'Ceiling above old position',
      get: (r) => {
        const l = ev(r, 'line1_pre');
        return { line0: l && l.ceiling_above_old ? fin(l.ceiling_above_old.y) : null };
      },
    },
    {
      id: 'bodyh',
      label: 'Wolf/swim check push, horizontal',
      get: (r) => {
        const b = bodyStep(r);
        return b.moved ? { body: flatDistance(b.from, b.pos) } : {};
      },
    },
    {
      id: 'wcand',
      label: 'Wall push candidates',
      get: (r) => ({
        wall: (r.fr.wall_list || []).length
          ? r.fr.wall_list.reduce((sum, w) => sum + (w.count || 0), 0)
          : null,
      }),
    },
    {
      id: 'wmax',
      label: 'Largest single wall push',
      get: (r) => ({
        wall: (r.fr.wall_cir || []).length
          ? Math.max(...r.fr.wall_cir.map((e) => flatDistance(e.pos_before, e.pos_after)))
          : null,
      }),
    },
    {
      id: 'near',
      label: 'Nearby triangles logged',
      get: (r) => ({ start: r.fr.nearby ? r.fr.nearby[0].count : null }),
    },
    {
      id: 'windx',
      label: 'Wind push x',
      get: (r) => {
        const e = ev(r, 'posmove_post');
        return e && e.wind ? { move: fin(e.wind[0]) } : {};
      },
    },
    {
      id: 'windz',
      label: 'Wind push z',
      get: (r) => {
        const e = ev(r, 'posmove_post');
        return e && e.wind ? { move: fin(e.wind[2]) } : {};
      },
    },
    {
      id: 'gco',
      label: 'Ground check offset',
      get: (r) => ({ start: val(ev(r, 'crr_pre'), 'gnd_chk_offset') }),
    },
    {
      id: 'rch',
      label: 'Ceiling check height (roof_crr_h)',
      get: (r) => ({ start: val(ev(r, 'crr_pre'), 'roof_crr_h') }),
    },
    {
      id: 'pgh',
      label: 'Ground height from the previous frame',
      get: (r) => ({ start: val(ev(r, 'crr_pre'), 'prev_ground_h') }),
    },
    {
      id: 'hpitch',
      label: 'Epona pitch (field_0x1714)',
      get: (r) => ({ start: val(ev(r, 'frame'), 'pitch') }),
    },
    {
      id: 'hmax',
      label: 'Epona max forward speed',
      get: (r) => ({ start: val(ev(r, 'frame'), 'normal_max_speedF') }),
    },
    {
      id: 'wat',
      label: 'Water height',
      get: (r) => ({ clamp: val(ev(r, 'crr_post'), 'water_h') }),
    },
  ];

  const COMMON_STATE_ROWS = [
    { label: 'on ground', get: (r) => flag(ev(r, 'crr_post'), 'ground_hit') },
    { label: 'wall hit', get: (r) => flag(ev(r, 'crr_post'), 'wall_hit') },
    { label: 'ceiling hit', get: (r) => flag(ev(r, 'crr_post'), 'roof_hit') },
    { label: 'line check hit', get: (r) => flag(ev(r, 'crr_post'), 'line_hit') },
    { label: 'in water', get: (r) => flag(ev(r, 'crr_post'), 'water_in') },
    { label: 'collision skipped', get: (r) => (r.fr.crr_skip ? 1 : 0) },
  ];

  function modeBits(e, bit) {
    if (!e || typeof e.mode !== 'string') return null;
    return parseInt(e.mode, 16) & bit ? 1 : 0;
  }

  const LINK_STATE_ROWS = [
    { label: 'jump flag', get: (r) => r.jump },
    { label: 'line ends raised', get: (r) => r.raised },
    ...COMMON_STATE_ROWS,
    { label: 'magnet boots on', get: (r) => flag(ev(r, 'posmove_post'), 'magne_boots') },
    { label: 'riding Epona', get: (r) => flag(ev(r, 'frame'), 'horse_ride') },
    { label: 'thin ceiling rule off', get: (r) => flag(ev(r, 'ground_pre'), 'thin_ceiling_off') },
  ];

  const HORSE_STATE_ROWS = [
    ...COMMON_STATE_ROWS,
    { label: 'front line wall hit (flag 0x4)', get: (r) => modeBits(ev(r, 'frame_end'), 0x4) },
    { label: 'collision y kept (flag 0x4000)', get: (r) => modeBits(ev(r, 'frame_end'), 0x4000) },
  ];

  function stateRows() {
    return ui.actor === 'horse' ? HORSE_STATE_ROWS : LINK_STATE_ROWS;
  }

  let log = null;
  let current = null;
  let latest = null;
  const VIEW_FORMAT = 'tp-collision-log-view';
  const ui = {
    axes: {
      x: { on: true, scale: 'linear', off: 0, thr: 0.001 },
      y: { on: true, scale: 'linear', off: 0, thr: 0.001 },
      z: { on: false, scale: 'linear', off: 0, thr: 0.001 },
    },
    tab: 'steps',
    actor: 'link',
  };

  function num(v) {
    if (v === 'inf') return Infinity;
    if (v === '-inf') return -Infinity;
    return typeof v === 'number' ? v : NaN;
  }

  function fin(v) {
    const n = num(v);
    return Number.isFinite(n) ? n : null;
  }

  function ev(r, name) {
    const a = r.fr[name];
    return a ? a[0] : null;
  }

  function val(e, key) {
    return e ? fin(e[key]) : null;
  }

  function flag(e, key) {
    return e && typeof e[key] === 'boolean' ? (e[key] ? 1 : 0) : null;
  }

  function speedAt(i) {
    return (r) => {
      const out = {};
      const f = ev(r, 'frame');
      const pm = ev(r, 'posmove_post');
      const fe = ev(r, 'frame_end');
      if (f) out.start = fin(f.speed[i]);
      if (pm) out.move = fin(pm.speed[i]);
      if (fe) out.end = fin(fe.speed[i]);
      return out;
    };
  }

  function ccAt(i) {
    return (r) => {
      const e = ev(r, 'posmove_pre');
      return e && e.cc_move ? { move: fin(e.cc_move[i]) } : {};
    };
  }

  function procName(p, horse) {
    if (horse || ui.actor === 'horse')
      return HORSE_PROCS[p] !== undefined ? HORSE_PROCS[p] : 'horse proc ' + p;
    return PROCS[p] !== undefined ? PROCS[p] : 'proc ' + p;
  }

  function same(a, b) {
    return (
      a &&
      b &&
      Math.abs(a[0] - b[0]) < 1e-4 &&
      Math.abs(a[1] - b[1]) < 1e-4 &&
      Math.abs(a[2] - b[2]) < 1e-4
    );
  }

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function colors() {
    const c = {};
    [
      'bg',
      'panel',
      'raise',
      'act',
      'hi',
      'fg',
      'muted',
      'line',
      'grid',
      'band1',
      'band2',
      'band3',
      'band4',
      'band5',
      'c-feet',
      'c-epona',
      'c-low',
      'c-mid',
      'c-top',
      'c-hit',
      'c-floor',
      'c-wall',
      'c-roof',
      'c-ref',
      'c-skip',
      'c-on',
      'c-off',
    ].forEach((k) => {
      c[k.replace('c-', '')] = css('--' + k);
    });
    return c;
  }

  function parseLog(text) {
    const frames = new Map();
    let bad = 0;
    let seq = 0;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch (err) {
        bad++;
        continue;
      }
      if (typeof e.f !== 'number' || !e.ev) {
        bad++;
        continue;
      }
      e.__n = seq++;
      if (!frames.has(e.f)) frames.set(e.f, {});
      const fr = frames.get(e.f);
      (fr[e.ev] = fr[e.ev] || []).push(e);
    }
    const fillSkipped = (map) =>
      map.forEach((fr) => {
        if (!fr.frame || fr.crr_pre || !fr.crr_skip) return;
        const f0 = fr.frame[0];
        const pm = fr.posmove_post && fr.posmove_post[0];
        fr.crr_pre = [
          {
            f: f0.f,
            ev: 'crr_pre',
            synthetic: true,
            proc: f0.proc,
            mode: f0.mode,
            fly: f0.fly,
            pos: (pm || f0).pos,
            old: f0.old || f0.pos,
            speed: (pm || f0).speed || [0, 0, 0],
            line_raise: false,
            circles: [],
          },
        ];
      });
    const usable = (map) =>
      [...map.keys()].sort((a, b) => a - b).filter((f) => map.get(f).frame && map.get(f).crr_pre);
    const horseFrames = new Map();
    frames.forEach((fr, f) => {
      const hf = {};
      Object.keys(fr).forEach((k) => {
        if (k.startsWith('horse_')) hf[k.slice(6)] = fr[k];
      });
      if (Object.keys(hf).length) horseFrames.set(f, hf);
    });
    fillSkipped(frames);
    fillSkipped(horseFrames);
    const actors = {
      link: { frames, nums: usable(frames) },
      horse: { frames: horseFrames, nums: usable(horseFrames) },
    };
    const nums = actors.link.nums.length ? actors.link.nums : actors.horse.nums;
    const firstMap = actors.link.nums.length ? frames : horseFrames;
    const first = nums.length ? firstMap.get(nums[0]).frame[0] : null;
    const perCircle = nums.some((f) => firstMap.get(f).line_cir);
    return {
      frames: firstMap,
      nums,
      actors,
      bad,
      stage: first ? first.stage : '',
      room: first ? first.room : '',
      perCircle,
    };
  }

  function reconLines(fr, nxt) {
    const crr = fr.crr_pre && fr.crr_pre[0];
    const l1 = fr.line1_pre && fr.line1_pre[0];
    if (!crr || !l1) return null;
    const old = crr.old;
    const pos = crr.pos;
    const spd = crr.speed[1];
    const src = nxt && nxt.frame ? nxt.frame[0] : fr.frame[0];
    const fly = typeof crr.fly === 'boolean' ? crr.fly : (parseInt(src.mode, 16) & FLY_MASK) !== 0;
    const raised = spd < 0 && !fly;
    const roof = num(l1.ceiling_above_old.y);
    let lowered = false;
    return crr.circles.map((c, i) => {
      const h = c.h;
      let wh = h;
      let mode = 'normal';
      if (roof < old[1] + h) {
        if (lowered) return { i, h, mode: 'skipped' };
        wh = roof - old[1] - 1;
        mode = 'lowered';
        lowered = true;
      }
      return {
        i,
        h,
        wall_h: wh,
        mode,
        raised,
        hit: false,
        rebuilt: true,
        start: [old[0], old[1] + wh, old[2]],
        end: [pos[0], pos[1] + wh - (raised ? spd : 0), pos[2]],
      };
    });
  }

  function reconHit(lines, fr) {
    const l1p = fr.line1_post && fr.line1_post[0];
    if (!lines || !l1p || !l1p.line_hit) return;
    const f = l1p.pos;
    const floor = l1p.ground_hit && !fr.crr_pre[0].ground_hit;
    for (const ln of lines) {
      if (ln.mode === 'skipped') continue;
      const a = ln.start;
      const b = ln.end;
      if (floor) {
        if (Math.min(a[1], b[1]) - 1e-3 <= f[1] && f[1] <= Math.max(a[1], b[1]) + 1e-3) {
          Object.assign(ln, {
            hit: true,
            kind: 'floor',
            cross: f.slice(),
            after_adjust: [f[0], f[1] - 1, f[2]],
            after: f.slice(),
          });
          return;
        }
        continue;
      }
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const L2 = dx * dx + dz * dz;
      if (L2 < 1e-9) continue;
      const t = ((f[0] - a[0]) * dx + (f[2] - a[2]) * dz) / L2;
      const cy = a[1] + t * (b[1] - a[1]);
      const ny = f[1] + ln.h - cy;
      if (t >= 0 && t <= 1 && Math.abs(Math.abs(ny) - 1) < 1e-2) {
        Object.assign(ln, {
          hit: true,
          kind: ny < 0 ? 'roof' : 'wall',
          cross: [f[0], cy, f[2]],
          after_adjust: [f[0], f[1] + ln.h, f[2]],
          after: f.slice(),
        });
        return;
      }
    }
  }

  function loggedLines(fr) {
    const list = (fr.line_cir || []).filter((e) => e.pass === 'line1').sort((a, b) => a.i - b.i);
    if (!list.length) return null;
    return list.map((e) => ({
      i: e.i,
      h: e.h,
      wall_h: e.wall_h,
      mode: e.mode,
      raised: e.raised,
      start: e.start,
      end: e.end,
      hit: !!e.hit,
      kind: e.hit && e.poly && e.poly.kind ? e.poly.kind : e.hit ? 'wall' : undefined,
      cross: e.pos_after_cross,
      after_adjust: e.pos_after_adjust,
      after: e.pos_after,
      poly: e.poly,
    }));
  }

  function buildRows(f0, f1) {
    const rows = [];
    for (const f of log.nums) {
      if (f < f0 || f > f1) continue;
      const row = makeRow(f, log.frames.get(f), log.frames.get(f + 1));
      if (ui.actor === 'link') {
        const hfr = log.actors.horse.frames.get(f);
        const riding = row.fr.frame && row.fr.frame[0].horse_ride !== false;
        if (riding && hfr && hfr.frame && hfr.crr_pre) {
          row.horseRow = makeRow(f, hfr, log.actors.horse.frames.get(f + 1));
          row.horseRow.isHorse = true;
        }
      }
      rows.push(row);
    }
    return rows;
  }

  function makeRow(f, fr, nxt) {
    {
      let lines = loggedLines(fr);
      if (!lines) {
        lines = reconLines(fr, nxt);
        reconHit(lines, fr);
      }
      const crr = fr.crr_pre[0];
      const src = nxt && nxt.frame ? nxt.frame[0] : fr.frame[0];
      const proc = typeof crr.proc === 'number' ? crr.proc : src.proc;
      const mode = crr.mode ? parseInt(crr.mode, 16) : parseInt(src.mode, 16);
      const fly = typeof crr.fly === 'boolean' ? crr.fly : (mode & FLY_MASK) !== 0;
      const raised =
        typeof crr.line_raise === 'boolean' ? crr.line_raise : crr.speed[1] < 0 && !fly;
      return { f, fr, lines, proc, jump: mode & 2 ? 1 : 0, raised: raised ? 1 : 0 };
    }
  }

  function buildColumns(rows, hideUnused) {
    const horseRows = rows.map((r) => r.horseRow).filter(Boolean);
    if (ui.actor !== 'link' || !horseRows.length) return buildActorColumns(rows, hideUnused);
    ui.actor = 'horse';
    let hcols;
    try {
      hcols = buildActorColumns(horseRows, hideUnused);
    } finally {
      ui.actor = 'link';
    }
    const lcols = buildActorColumns(rows, hideUnused);
    const ecols = hcols.map((c) => ({
      key: 'h:' + c.key,
      base: c.key,
      label: 'Epona ' + c.label,
      check: c.check,
      horse: true,
    }));
    rows.forEach((r) => {
      const h = r.horseRow;
      ecols.forEach((c) => {
        if (!h || !h.st) {
          r.st['h:' + c.base] = 'skipped';
          return;
        }
        r.pts['h:' + c.base] = h.pts[c.base];
        r.st['h:' + c.base] = h.st[c.base] || 'skipped';
        r.labels['h:' + c.base] =
          'Epona ' + ((h.labels && h.labels[c.base]) || hcols.find((x) => x.key === c.base).label);
        if (h.detail && h.detail[c.base]) r.detail['h:' + c.base] = h.detail[c.base];
      });
    });
    return ecols.concat(lcols);
  }

  function buildActorColumns(rows, hideUnused) {
    const kinds = new Map();
    rows.forEach((r) =>
      (r.lines || []).forEach((ln) => {
        if (!ln.hit) return;
        if (!kinds.has(ln.i)) kinds.set(ln.i, new Set());
        kinds.get(ln.i).add(ln.kind === 'floor' ? 'floor' : 'face');
      }),
    );
    const cols = [
      { key: 'start', label: 'start', check: true },
      { key: 'action', label: 'action code', check: true },
      { key: 'move', label: 'movement', check: true },
      {
        key: 'body',
        label: ui.actor === 'horse' ? 'horse body check' : 'wolf/swim check',
        check: true,
      },
    ];
    if (rows.some((r) => r.fr.movebg))
      cols.push({ key: 'movebg', label: 'moving ground', check: true });
    for (let k = 0; k < 3; k++) {
      cols.push({ key: 'line' + k, label: 'line: ' + CIR[k], circle: k, check: true });
      if (kinds.has(k)) {
        const s = kinds.get(k);
        const lab =
          s.size > 1
            ? ['adjust', 'settle']
            : s.has('floor')
              ? ['-1', 'ground']
              : ['1 out', '-circle'];
        cols.push({ key: 'hitA' + k, label: CIR[k] + ' hit: ' + lab[0], check: true });
        cols.push({ key: 'hitB' + k, label: CIR[k] + ' hit: ' + lab[1], check: true });
      }
    }
    if (rows.some((r) => r.fr.line_down))
      cols.push({ key: 'ldown', label: 'line down', check: true });
    const wallLogged = rows.some((r) => r.fr.wall_list || r.fr.wall_dzb_post);
    rows.forEach((r) => {
      r.pushes = wallLogged ? wallPushes(r) : null;
    });
    if (wallLogged) {
      const most = Math.max(1, ...rows.map((r) => r.pushes.length));
      for (let k = 0; k < most; k++)
        cols.push({
          key: 'wp' + k,
          label: 'wall push ' + (k + 1),
          check: true,
          wallFirst: k === 0,
        });
    } else {
      for (let k = 0; k < 3; k++)
        cols.push({
          key: 'wall' + k,
          label: 'wall: ' + CIR[k],
          circle: k,
          check: true,
          wallFirst: k === 0,
        });
    }
    cols.push({ key: 'lc2', label: 'line check 2', check: true });
    cols.push({ key: 'roof', label: 'ceiling', check: true });
    cols.push({ key: 'ground', label: 'ground', check: true });
    cols.push({ key: 'clamp', label: 'ceiling clamp', check: true });
    if (rows.some((r) => r.fr.frame_end))
      cols.push({ key: 'end', label: 'frame end', check: true });
    rows.forEach((r) => stepRow(r, cols));
    if (!hideUnused) return cols;
    return cols.filter((c) => !c.check || rows.some((r) => r.st[c.key] !== 'skipped'));
  }

  function stepRow(r, cols) {
    const has = new Set(cols.map((c) => c.key));
    const pts = {};
    const st = {};
    const labels = {};
    const detail = {};
    const set = (k, p, s) => {
      pts[k] = p;
      if (s) st[k] = s;
    };
    let cur = ev(r, 'frame').pos;
    set('start', cur, 'ran');
    if (r.fr.crr_skip)
      detail.start = 'CrrPos was skipped this frame (the collision skip flag was set)';
    const pp = ev(r, 'posmove_pre');
    const procs = (r.fr.proc || []).map(
      (e) =>
        'action change: ' +
        procName(e.from) +
        ' to ' +
        procName(e.to) +
        (e.pos ? ` at ${e.pos.map((v) => (+v).toFixed(3)).join(', ')}` : ''),
    );
    const aux = (r.fr.aux_line || []).map(auxLineText);
    if (pp && !same(cur, pp.pos)) {
      detail.action = [
        `moved ${flatDistance(cur, pp.pos).toPrecision(6)} flat, ${(pp.pos[1] - cur[1]).toPrecision(6)} in y`,
        'before the speed move, by the action code or an action change',
        ...procs,
        ...aux,
      ].join('<br>');
      cur = pp.pos;
      set('action', cur, 'hit');
    } else {
      if (procs.length || aux.length) detail.action = [...procs, ...aux].join('<br>');
      set('action', cur, pp ? 'ran' : 'skipped');
    }
    const pm = ev(r, 'posmove_post');
    const moved = pm && !same(cur, pm.pos);
    if (pm) cur = pm.pos;
    set('move', cur, moved ? 'hit' : 'ran');
    const body = bodyStep(r);
    if (body.moved) {
      cur = body.pos;
      set('body', cur, 'hit');
    } else set('body', cur, body.ran ? 'ran' : 'skipped');
    labels.body = body.label;
    if (body.detail) detail.body = body.detail;
    const mb = ev(r, 'movebg');
    if (mb) {
      cur = mb.pos;
      set('movebg', cur, 'hit');
    } else set('movebg', cur, 'skipped');
    const l1p = ev(r, 'line1_post');
    for (let k = 0; k < 3; k++) {
      const ln = r.lines ? r.lines[k] : null;
      if (ln && ln.hit && ln.after) {
        set('line' + k, ln.cross, ln.mode === 'lowered' ? 'hitlow' : 'hit');
        set('hitA' + k, ln.after_adjust, 'hit');
        set('hitB' + k, ln.after, 'hit');
        cur = ln.after;
      } else {
        set(
          'line' + k,
          cur,
          !ln
            ? 'skipped'
            : ln.mode === 'skipped'
              ? 'skipped'
              : ln.mode === 'lowered'
                ? 'lowered'
                : 'ran',
        );
        set('hitA' + k, cur, 'skipped');
        set('hitB' + k, cur, 'skipped');
      }
    }
    if (l1p && !same(cur, l1p.pos)) {
      cur = l1p.pos;
      set('line2', cur, 'hit');
    }
    const lskip = ev(r, 'line1_skipped');
    if (lskip) {
      const why = lineSkipReason(r, lskip);
      for (let k = 0; k < 3; k++) detail['line' + k] = why;
    }
    const ld = ev(r, 'line_down');
    if (ld) {
      cur = ld.pos_after;
      set('ldown', cur, ld.hit ? 'hit' : 'ran');
    } else set('ldown', cur, 'skipped');
    const wp = ev(r, 'wall_post');
    if (r.pushes) {
      for (let k = 0; has.has('wp' + k); k++) {
        const push = r.pushes[k];
        if (push) {
          cur = push.pos;
          set('wp' + k, cur, 'hit');
          labels['wp' + k] = push.label;
          detail['wp' + k] = push.detail;
        } else {
          set('wp' + k, cur, k === 0 && wp ? 'ran' : 'skipped');
        }
      }
    } else {
      const whit = wp ? wp.circles.map((c) => c.wall_hit) : [false, false, false];
      const last = Math.max(-1, ...whit.map((h, i) => (h ? i : -1)));
      for (let k = 0; k < 3; k++) {
        const moved = wp && (last < 0 ? k === 2 : k >= last);
        set('wall' + k, moved ? wp.pos : cur, !wp ? 'skipped' : whit[k] ? 'hit' : 'ran');
      }
    }
    if (wp) cur = wp.pos;
    const l2 = ev(r, 'line2_post');
    if (l2) {
      set('lc2', l2.pos, same(cur, l2.pos) ? 'ran' : 'hit');
      cur = l2.pos;
    } else set('lc2', cur, 'skipped');
    const rf = ev(r, 'roof');
    if (rf) {
      set('roof', rf.pos, rf.roof_hit ? 'hit' : 'ran');
      cur = rf.pos;
    } else set('roof', cur, 'skipped');
    const gp = ev(r, 'ground_post');
    const gn = ev(r, 'ground_none');
    if (gp) {
      set('ground', gp.pos, same(cur, gp.pos) ? 'ran' : 'hit');
      cur = gp.pos;
    } else if (gn) {
      const p = [cur[0], gn.pos_y, cur[2]];
      const limit = fin(gn.roof_limit);
      const clamped = limit !== null && limit < gn.pos_y;
      if (clamped) p[1] = limit;
      set('ground', p, clamped ? 'hit' : 'ran');
      detail.ground =
        'ground check off (ground-none flag)' +
        (clamped ? `<br>y limited to the ceiling limit ${limit}` : '');
      cur = p;
    } else set('ground', cur, 'skipped');
    const gr = ev(r, 'groundroof_post');
    if (gr) {
      const p = [cur[0], gr.pos_y, cur[2]];
      set('clamp', p, Math.abs(p[1] - cur[1]) > 1e-4 ? 'hit' : 'ran');
      cur = p;
    } else {
      const cp = ev(r, 'crr_post');
      set('clamp', cp ? cp.pos : cur, 'skipped');
      if (cp) cur = cp.pos;
    }
    const fe = ev(r, 'frame_end');
    if (fe) {
      const changed = !same(cur, fe.pos);
      set('end', fe.pos, changed ? 'hit' : 'ran');
      if (changed) {
        const why = endReason(r, cur, fe.pos);
        labels.end = why.label;
        detail.end = why.detail;
      }
    } else set('end', cur, 'skipped');
    r.pts = pts;
    r.st = st;
    r.has = has;
    r.labels = labels;
    r.detail = detail;
  }

  function flatDistance(a, b) {
    return Math.hypot(b[0] - a[0], b[2] - a[2]);
  }

  function near(a, b) {
    return Math.abs(a - b) < 1e-3;
  }

  function lineSkipReason(r, e) {
    if (e.line_check_none)
      return 'line check skipped: turned off for this action (line-check-none flag)';
    const radius = fin(e.wall_all_low_h_r);
    if (radius === null || Math.abs(radius) < 3.8e-6)
      return 'line check skipped: the lowest circle radius is 0';
    const crr = ev(r, 'crr_pre');
    const off = crr ? fin(crr.gnd_chk_offset) : null;
    const drop = fin(e.old_pos_dist_y);
    const lowH = fin(e.wall_all_low_h);
    const parts = [
      'line check skipped: none of its run conditions held',
      `horizontal move squared ${fmtNum(e.old_pos_dist2xz)} is not above the lowest circle radius squared ${fmtNum(radius * radius)}`,
    ];
    if (off !== null && drop !== null) {
      parts.push(`drop ${fmtNum(drop)} is not above the ground check offset ${fmtNum(off)}`);
      if (lowH !== null)
        parts.push(
          `drop ${fmtNum(drop)} is not above offset minus lowest circle height ${fmtNum(off - lowH)}`,
        );
    }
    parts.push('no forced line check (line-check flag off)');
    return parts.join('<br>');
  }

  function fmtNum(v) {
    const n = fin(v);
    return n === null ? String(v) : String(+n.toPrecision(6));
  }

  function endTag(step) {
    const tags = [
      ['magnet boots', 'end: magnet boots undo'],
      ['underwater swim', 'end: swim y undo'],
      ['tool demo', 'end: animation position'],
      ['hookshot fly', 'end: collision undone'],
      ['door open', 'end: y to frame start'],
      ['mode 0x4000', 'end: x/z undone'],
      ['fly attention', 'end: y to frame start'],
    ];
    const hit = tags.find(([k]) => step.startsWith(k));
    return hit ? hit[1] : 'end: moved after collision';
  }

  function auxLineText(e) {
    const what = e.hit
      ? e.poly
        ? `hit ${kindOf(e.poly.normal)} bg ${e.poly.bg} poly ${e.poly.poly}`
        : 'hit'
      : 'no hit';
    return `action line check: ${what}`;
  }

  function endReason(r, before, end) {
    const after = ev(r, 'crr_after');
    if (after && Array.isArray(after.steps)) {
      const moved = `moved ${flatDistance(before, end).toPrecision(6)} flat, ${(end[1] - before[1]).toPrecision(6)} in y after collision`;
      if (after.steps.length)
        return {
          label: endTag(after.steps[after.steps.length - 1]),
          detail: [moved, ...after.steps].join('<br>'),
        };
      return {
        label: 'end: moved after collision',
        detail:
          moved +
          '<br>no restore branch applied, so the change comes from later code (ice slip, auto ground hit or the action)',
      };
    }
    const pre = ev(r, 'crr_pre');
    const post = ev(r, 'crr_post');
    const start = ev(r, 'frame');
    const moved = `moved ${flatDistance(before, end).toPrecision(6)} flat, ${(end[1] - before[1]).toPrecision(6)} in y after collision`;
    if (pre && same(end, pre.pos))
      return {
        label: 'end: collision undone',
        detail:
          moved +
          '<br>frame end equals the position from before CrrPos: the collision result was thrown away' +
          '<br>Link does this for hookshot fly, magnet boots fly, rope, vine and riding modes, and with magnet boots on',
      };
    if (
      pre &&
      post &&
      near(end[0], pre.pos[0]) &&
      near(end[2], pre.pos[2]) &&
      near(end[1], post.pos[1])
    )
      return {
        label: 'end: x/z undone',
        detail:
          moved +
          '<br>x and z equal the position from before CrrPos, y kept from collision (action mode 0x4000)',
      };
    if (
      pre &&
      post &&
      near(end[1], pre.pos[1]) &&
      near(end[0], post.pos[0]) &&
      near(end[2], post.pos[2])
    )
      return {
        label: 'end: y undone',
        detail:
          moved +
          '<br>y equals the height from before CrrPos, x and z kept from collision' +
          (ui.actor === 'horse'
            ? ''
            : '<br>Link does this while the underwater swim animation plays with no ground or ceiling hit'),
      };
    if (
      (ui.actor === 'horse' || r.isHorse) &&
      start &&
      post &&
      near(end[1], start.pos[1]) &&
      near(end[0], post.pos[0]) &&
      near(end[2], post.pos[2])
    )
      return {
        label: 'end: y from frame start',
        detail:
          moved +
          '<br>Epona: state flag 0x4000 off, so y goes back to the frame start and vertical speed to 0',
      };
    return { label: 'end: moved after collision', detail: moved };
  }

  function bodyLineName(e) {
    if (e.kind === 'swim') return e.pass + ' line';
    if (e.kind === 'horse') return `${e.pass} ${e.i === 0 ? 'front' : 'back'} line`;
    return `${e.pass} ${e.i === 0 ? 'back' : 'front'} ${e.height}`;
  }

  function bodyLineText(e) {
    const what = e.line_hit
      ? e.poly
        ? `hit ${kindOf(e.poly.normal)} bg ${e.poly.bg} poly ${e.poly.poly}`
        : 'hit'
      : 'miss';
    let res = '';
    if (e.result && e.push) res = `, push ${flatDistance([0, 0, 0], e.push).toPrecision(4)}`;
    else if (e.line_hit && !e.result && e.kind !== 'swim') res = ', rejected';
    return `${bodyLineName(e)}: ${what}${res}`;
  }

  function bodyStep(r) {
    const pm = ev(r, 'posmove_post');
    const cp = ev(r, 'crr_pre');
    const pre = ev(r, 'body_check_pre');
    const post = ev(r, 'body_check_post');
    const kind = (post && post.kind) || (pre && pre.kind) || null;
    const from = pm ? pm.pos : null;
    const pos = cp ? cp.pos : from;
    const moved = !!(from && pos && !same(from, pos));
    const ran = post ? !post.skipped : moved;
    const lines = (r.fr.body_line || []).map(bodyLineText);
    const parts = [];
    if (moved) parts.push('moved ' + flatDistance(from, pos).toPrecision(6));
    if (post && post.skipped) parts.push('skipped by its mode or action check');
    parts.push(...lines);
    if (moved && !post) parts.push('no line details in this recording');
    (r.fr.body_push || []).forEach((e) => {
      if (e.normal) parts.push(`push normal (${e.normal.map((v) => (+v).toFixed(4)).join(', ')})`);
    });
    return {
      from,
      pos,
      moved,
      ran,
      kind,
      label: kind
        ? kind + ' body check'
        : ui.actor === 'horse'
          ? 'horse body check'
          : 'wolf/swim check',
      detail: parts.join('<br>'),
    };
  }

  function kindOf(normal) {
    if (normal[1] >= 0.5) return 'floor';
    return normal[1] < -0.8 ? 'ceiling' : 'wall';
  }

  function ownerText(e) {
    return e.actor !== undefined && e.actor !== null ? ', actor ' + e.actor : '';
  }

  function wallCirDetail(e) {
    const lines = [
      `${kindOf(e.normal)} bg ${e.bg} poly ${e.poly}${ownerText(e)}, ${CIR[e.circle]} circle`,
      `${e.result}, moved ${flatDistance(e.pos_before, e.pos_after).toPrecision(6)}`,
      `slice y ${e.slice_y}, flat normal length ${e.flat_len} (inverse ${e.inv_flat_len})`,
    ];
    if (e.dist2 !== undefined) lines.push(`distance^2 to pusher ${e.dist2}, radius^2 ${e.radius2}`);
    if (e.push_scale !== undefined) lines.push(`push scale ${e.push_scale}`);
    if (e.cross_a !== undefined)
      lines.push(
        `circle line cross: a ${e.cross_a}, b ${e.cross_b}, c ${e.cross_c}` +
          (e.cross_a_zero ? ' (a counts as zero, linear solve)' : ''),
      );
    if (e.push) lines.push(`push [${e.push[0]}, ${e.push[1]}]`);
    return lines.join('<br>');
  }

  function wallPushes(r) {
    const steps = [];
    const pres = r.fr.wall_dzb_pre || [];
    const items = [
      ...(r.fr.wall_cir || []).map((e) => ({ e, type: 'cir' })),
      ...(r.fr.wall_dzb_post || []).map((e, i) => ({ e, pre: pres[i], type: 'dzb' })),
    ].sort((a, b) => a.e.__n - b.e.__n);
    items.forEach(({ e, pre, type }) => {
      if (type === 'cir') {
        if (same(e.pos_before, e.pos_after)) return;
        steps.push({
          pos: e.pos_after,
          from: e.pos_before,
          cir: e,
          label: `${CIR[e.circle]}: ${kindOf(e.normal)} ${e.poly}`,
          detail: wallCirDetail(e),
        });
      } else if (
        pre &&
        !same(pre.pos, e.pos) &&
        !(r.fr.wall_cir || []).some((c) => c.mesh === 'dzb' && c.bg === e.bg)
      ) {
        const moved = flatDistance(pre.pos, e.pos).toPrecision(6);
        steps.push({
          pos: e.pos,
          from: pre.pos,
          bg: e.bg,
          label: `object bg ${e.bg}`,
          detail: `object wall push, bg ${e.bg}${ownerText(e)}, moved ${moved}`,
        });
      }
    });
    return steps;
  }

  function polyKey(p) {
    return p.tri ? p.tri.map((t) => t.join(',')).join(';') : p.bg + ':' + p.poly;
  }

  function polyId(p) {
    return (
      'bg ' +
      p.bg +
      (p.poly !== undefined ? ' poly ' + p.poly : '') +
      (p.actor !== undefined ? ', actor ' + p.actor : '')
    );
  }

  function polysOf(r) {
    const own = polysFromFrame(r, '');
    if (ui.actor !== 'link' || !r.fr.horse_crr_pre) return own;
    const hf = {};
    Object.keys(r.fr).forEach((k) => {
      if (k.startsWith('horse_')) hf[k.slice(6)] = r.fr[k];
    });
    const seen = new Set(own.map((o) => polyKey(o.p)));
    return own.concat(polysFromFrame({ fr: hf }, 'Epona ').filter((o) => !seen.has(polyKey(o.p))));
  }

  function polysFromFrame(r, tag) {
    const out = [];
    const add = (p, why) => {
      if (p && typeof p === 'object' && p.normal && typeof p.d === 'number')
        out.push({ p, why: tag + why });
    };
    (r.fr.body_line || []).forEach((e) => e.line_hit && add(e.poly, 'body check line hit'));
    (r.fr.aux_line || []).forEach((e) => e.hit && add(e.poly, 'action line check hit'));
    const g = ev(r, 'ground_post');
    if (g) add(g.found, 'ground found');
    const rf = ev(r, 'roof');
    if (rf) add(rf.hit, 'ceiling');
    const l1 = ev(r, 'line1_pre');
    if (l1 && l1.ceiling_above_old) add(l1.ceiling_above_old.hit, 'ceiling above old position');
    const gpre = ev(r, 'ground_pre');
    if (gpre && gpre.ceiling_above_pos)
      add(gpre.ceiling_above_pos.hit, 'ceiling over ground search');
    const wp = ev(r, 'wall_post');
    if (wp) wp.circles.forEach((c, i) => add(c.hit, CIR[i] + ' circle wall push'));
    (r.fr.line_cir || []).forEach((e) => {
      if (e.hit) add(e.poly, CIR[e.i] + ' line check hit');
    });
    const ld = ev(r, 'line_down');
    if (ld) add(ld.poly, 'line down hit');
    (r.fr.wall_list || []).forEach((w) =>
      (w.list || []).forEach((t) => {
        if (!t.tri) return;
        const n = t.normal;
        const d = -(n[0] * t.tri[0][0] + n[1] * t.tri[0][1] + n[2] * t.tri[0][2]);
        const kind = kindOf(n) === 'ceiling' ? 'roof' : kindOf(n);
        add(
          { bg: w.bg, poly: t.poly, actor: w.actor, normal: n, d, tri: t.tri, kind },
          'wall push candidate',
        );
      }),
    );
    const nb = ev(r, 'nearby');
    if (nb && nb.polys) nb.polys.forEach((p) => add(p, 'nearby'));
    const seen = new Set();
    return out.filter((o) => {
      const k = polyKey(o.p);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function surfaceValue(poly, ai, at, top) {
    const n = poly.normal;
    if (Math.abs(n[ai]) < 0.2) return null;
    let s = poly.d;
    for (let o = 0; o < 3; o++) if (o !== ai) s += n[o] * at[o];
    const v = -s / n[ai];
    if (poly.tri) {
      const q = at.slice();
      q[ai] = v;
      for (let d = 0; d < 3; d++) {
        const vs = poly.tri.map((t) => t[d]);
        const lo = Math.min(...vs) - 40;
        const hi = Math.max(...vs) + 40;
        if (d === 1 && ai !== 1) {
          if (at[1] + top < lo || at[1] > hi) return null;
        } else if (q[d] < lo || q[d] > hi) return null;
      }
    }
    return v;
  }

  function parseRefs(text) {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([xyzXYZ])\s*=\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(.*)$/);
      if (m) out.push({ axis: m[1].toLowerCase(), v: parseFloat(m[2]), label: m[3].trim() });
    }
    return out;
  }

  const RSQRTE_TABLE = [
    [0x69fa000000000n, -0x15a0000000n],
    [0x5f2e000000000n, -0x13cc000000n],
    [0x554a000000000n, -0x1234000000n],
    [0x4c30000000000n, -0x10d4000000n],
    [0x43c8000000000n, -0x0f9c000000n],
    [0x3bfc000000000n, -0x0e88000000n],
    [0x34b8000000000n, -0x0d94000000n],
    [0x2df0000000000n, -0x0cb8000000n],
    [0x2794000000000n, -0x0bf0000000n],
    [0x219c000000000n, -0x0b40000000n],
    [0x1bfc000000000n, -0x0aa0000000n],
    [0x16ae000000000n, -0x0a0c000000n],
    [0x11a8000000000n, -0x0984000000n],
    [0x0ce6000000000n, -0x090c000000n],
    [0x0862000000000n, -0x0898000000n],
    [0x0416000000000n, -0x082c000000n],
    [0xffe8000000000n, -0x1e90000000n],
    [0xf0a4000000000n, -0x1c00000000n],
    [0xe2a8000000000n, -0x19c0000000n],
    [0xd5c8000000000n, -0x17c8000000n],
    [0xc9e4000000000n, -0x1610000000n],
    [0xbedc000000000n, -0x1490000000n],
    [0xb498000000000n, -0x1330000000n],
    [0xab00000000000n, -0x11f8000000n],
    [0xa204000000000n, -0x10e8000000n],
    [0x9994000000000n, -0x0fe8000000n],
    [0x91a0000000000n, -0x0f08000000n],
    [0x8a1c000000000n, -0x0e38000000n],
    [0x8304000000000n, -0x0d78000000n],
    [0x7c48000000000n, -0x0cc8000000n],
    [0x75e4000000000n, -0x0c28000000n],
    [0x6fd0000000000n, -0x0b98000000n],
  ];
  const f32 = Math.fround;
  const bitsView = new DataView(new ArrayBuffer(8));

  function frsqrte(x) {
    bitsView.setFloat64(0, x);
    const bits = bitsView.getBigUint64(0);
    const exponent = bits & 0x7ff0000000000000n;
    const key = (exponent | (bits & 0x000fffffffffffffn)) >> 37n;
    const newExponent = (((0xbfcn << 52n) - exponent) >> 1n) & 0x7ff0000000000000n;
    const [base, step] = RSQRTE_TABLE[Number((key >> 11n) & 0x1fn)];
    const fraction = BigInt.asUintN(64, base + step * (key & 0x7ffn));
    bitsView.setBigUint64(0, newExponent | fraction);
    return bitsView.getFloat64(0);
  }

  function fastSqrt(x) {
    return x > 0 ? f32(frsqrte(x) * x) : 0;
  }

  function pushZone(poly, radius) {
    const nx = f32(poly.normal[0]);
    const nz = f32(poly.normal[2]);
    const flatLength = fastSqrt(f32(f32(nx * nx) + f32(nz * nz)));
    if (flatLength === 0) return null;
    const scale = f32(f32(1 / flatLength) * radius);
    const pusherDistance = Math.hypot(f32(nx * scale), f32(nz * scale));
    return { near: pusherDistance - radius, far: pusherDistance, flat: Math.hypot(nx, nz) };
  }

  function rgba(hex, alpha) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
  }

  function symlog(v, thr) {
    return Math.sign(v) * Math.log10(1 + Math.abs(v) / thr);
  }

  function fmt(v) {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e4 || a < 1e-2) return v.toExponential(0).replace('e+', 'e');
    return String(+v.toPrecision(3));
  }

  function symTicks(vals, thr) {
    const finite = vals.filter((v) => v !== null && Number.isFinite(v));
    if (!finite.length) return null;
    const lo = Math.min(...finite);
    const hi = Math.max(...finite);
    const maxA = Math.max(Math.abs(lo), Math.abs(hi), thr);
    const raw = [0];
    for (let k = Math.floor(Math.log10(thr)) + 1; Math.pow(10, k) <= maxA * 1.0001; k++)
      raw.push(Math.pow(10, k), -Math.pow(10, k));
    let t = raw
      .filter((v) => v >= lo - Math.abs(lo) * 0.1 - thr && v <= hi + Math.abs(hi) * 0.1 + thr)
      .sort((a, b) => a - b);
    while (t.length > 13) t = t.filter((_, i) => i % 2 === 0 || t[i] === 0);
    return { tickvals: t.map((v) => symlog(v, thr)), ticktext: t.map(fmt) };
  }

  function axisTransform(a) {
    const s = ui.axes[a];
    if (s.scale === 'symlog') return (v) => (v === null ? null : symlog(v - s.off, s.thr));
    if (s.scale === 'log') return (v) => (v === null || v - s.off <= 0 ? null : v - s.off);
    return (v) => (v === null ? null : v - s.off);
  }

  function render() {
    const plot = $('plot');
    if (!log) {
      Plotly.purge(plot);
      saveSettings();
      return;
    }
    const C = colors();
    let f0 = parseInt($('f0').value, 10);
    let f1 = parseInt($('f1').value, 10);
    if (!Number.isFinite(f0)) f0 = log.nums[0];
    if (!Number.isFinite(f1)) f1 = f0 + 4;
    if (f1 < f0) [f0, f1] = [f1, f0];
    let note = '';
    if (f1 - f0 + 1 > MAX_FRAMES) {
      f1 = f0 + MAX_FRAMES - 1;
      note = 'Showing the first ' + MAX_FRAMES + ' frames of that range.';
    }
    $('f0').value = f0;
    $('f1').value = f1;
    const rows = buildRows(f0, f1);
    $('frameNote').textContent = note;
    if (!rows.length) {
      Plotly.purge(plot);
      $('status').textContent = 'No frames in that range.';
      return;
    }
    const cols = buildColumns(rows, $('hideUnused').checked);
    latest = { rows, cols };
    if (ui.tab === 'map') {
      $('status').textContent = '';
      buildMapSteps();
      renderMap();
      saveSettings();
      return;
    }
    const nc = cols.length;
    const X = (j, ci) => j * (nc + 1) + ci;
    const xmax = X(rows.length - 1, nc - 1);
    const colIdx = new Map(cols.map((c, i) => [c.key, i]));

    const show = {};
    SERIES.forEach((s) => {
      show[s.id] = $('s_' + s.id).checked;
    });
    const vars = VARS.filter((v) => $('v_' + v.id).checked);
    const refs = show.refs ? parseRefs($('refs').value) : [];

    const panels = [];
    AXES.forEach((a) => {
      if (ui.axes[a].on) panels.push({ type: 'axis', a, h: 270 });
    });
    vars.forEach((v) => panels.push({ type: 'var', v, h: 140 }));
    if ($('stripChecks').checked) panels.push({ type: 'checks', h: 46 });
    if ($('stripState').checked) panels.push({ type: 'state', h: 16 * stateRows().length + 8 });
    if (!panels.length) {
      Plotly.purge(plot);
      $('status').textContent = 'Turn on at least one panel.';
      return;
    }

    const gap = 22;
    const top = 96;
    const bottom = nc * rows.length > 260 ? 40 : 110;
    const inner = panels.reduce((s, p) => s + p.h, 0) + gap * (panels.length - 1);
    const height = inner + top + bottom;
    let yPos = 1;
    panels.forEach((p, i) => {
      const hFrac = p.h / inner;
      p.domain = [Math.max(0, yPos - hFrac), yPos];
      yPos -= hFrac + gap / inner;
      p.ax = i === 0 ? 'y' : 'y' + (i + 1);
      p.axKey = i === 0 ? 'yaxis' : 'yaxis' + (i + 1);
    });
    const last = panels[panels.length - 1];

    const traces = [];
    const shapes = [];
    const ann = [];
    const layout = {
      height,
      margin: { l: 120, r: 24, t: top, b: bottom },
      paper_bgcolor: C.panel,
      plot_bgcolor: C.panel,
      font: { family: css('--font-mono') || 'monospace', color: C.fg, size: 11 },
      showlegend: true,
      legend: {
        orientation: 'h',
        x: 0,
        y: 1,
        yanchor: 'top',
        yref: 'container',
        font: { size: 11 },
      },
      hovermode: 'closest',
      hoverlabel: {
        bgcolor: C.raise,
        bordercolor: C.act,
        font: { family: css('--font-mono') || 'monospace', size: 11, color: C.fg },
      },
      modebar: { bgcolor: 'rgba(0,0,0,0)', color: C.muted, activecolor: C.act },
      xaxis: {
        anchor: last.ax,
        range: [-0.8, xmax + 0.8],
        showgrid: false,
        zeroline: false,
        fixedrange: false,
        tickangle: -90,
        tickfont: { size: 9, color: C.muted },
        color: C.muted,
        tickmode: 'array',
        tickvals: [],
        ticktext: [],
      },
    };

    const procs = [];
    const procColors = [C.act, C.hi, C.floor, C.wall, C.on, C.mid, C.low, C.top];
    rows.forEach((r, j) => {
      if (!procs.includes(r.proc)) procs.push(r.proc);
      const hit = (r.lines || []).some((l) => l.hit);
      const pc = procColors[procs.indexOf(r.proc) % procColors.length];
      panels.forEach((p) => {
        const [y0, y1] = p.domain;
        shapes.push({
          type: 'rect',
          xref: 'x',
          yref: 'paper',
          x0: X(j, 0) - 0.5,
          x1: X(j, nc - 1) + 0.5,
          y0,
          y1,
          fillcolor: C.band1,
          line: { width: 0 },
          layer: 'below',
        });
        for (let ci = 0; rows.length <= DIVIDER_FRAMES && ci < nc - 1; ci++) {
          const xb = X(j, ci) + 0.5;
          shapes.push({
            type: 'line',
            xref: 'x',
            yref: 'paper',
            x0: xb,
            x1: xb,
            y0,
            y1,
            layer: 'below',
            line: { color: C.line, width: 0.5 },
          });
        }
      });
      ann.push({
        xref: 'x',
        yref: 'paper',
        x: (X(j, 0) + X(j, nc - 1)) / 2,
        y: 1,
        yanchor: 'bottom',
        yshift: 4,
        showarrow: false,
        text:
          '<span style="color:' +
          (hit ? C.hit : C.muted) +
          '">frame ' +
          r.f +
          '</span><br><b><span style="color:' +
          pc +
          '">' +
          procName(r.proc) +
          '</span></b>',
        font: { size: 10, color: C.fg },
      });
    });

    if (nc * rows.length <= 260) {
      rows.forEach((r, j) =>
        cols.forEach((c, ci) => {
          layout.xaxis.tickvals.push(X(j, ci));
          layout.xaxis.ticktext.push((r.labels && r.labels[c.key]) || c.label);
        }),
      );
    } else {
      rows.forEach((r, j) => {
        layout.xaxis.tickvals.push(X(j, 0));
        layout.xaxis.ticktext.push('f' + r.f);
      });
    }

    const firstSeen = new Set();
    const legendOnce = (name) => {
      if (firstSeen.has(name)) return false;
      firstSeen.add(name);
      return true;
    };

    panels.forEach((p, pi) => {
      const ax = {
        domain: p.domain,
        anchor: 'x',
        gridcolor: C.grid,
        zerolinecolor: C.line,
        color: C.muted,
        tickfont: { size: 10 },
        title: { font: { size: 11, color: C.muted } },
        automargin: true,
      };
      layout[p.axKey] = ax;
      if (p.type === 'axis') axisPanel(p, ax);
      else if (p.type === 'var') varPanel(p, ax);
      else if (p.type === 'checks') checksPanel(p, ax);
      else statePanel(p, ax);
      ann.push({
        xref: 'paper',
        yref: 'paper',
        x: 0,
        xanchor: 'left',
        xshift: -112,
        y: p.domain[1],
        yanchor: 'bottom',
        showarrow: false,
        text: '<b>' + p.title + '</b>',
        font: { size: 12, color: C.fg },
      });
    });

    function axisPanel(p, ax) {
      const a = p.a;
      const ai = AXES.indexOf(a);
      const tf = axisTransform(a);
      const s = ui.axes[a];
      p.title = a.toUpperCase();
      ax.title.text =
        s.scale === 'linear' && s.off === 0
          ? a
          : a + (s.off ? ' - (' + s.off + ')' : '') + (s.scale !== 'linear' ? ', ' + s.scale : '');
      if (s.scale === 'log') ax.type = 'log';
      const dataRaw = [];
      const series = [{ id: 'feet', h: () => 0, color: C.feet, name: 'feet' }];
      for (let k = 0; k < 3; k++)
        series.push({
          id: 'c' + k,
          h: (r) =>
            a === 'y' && r.lines && r.lines[k] ? r.lines[k].h : a === 'y' ? circleH(r, k) : 0,
          color: [C.low, C.mid, C.top][k],
          name: CIR[k] + ' circle',
        });
      if (cols.some((c) => c.horse)) {
        series.push({
          id: 'epona',
          base: 'feet',
          horse: true,
          h: () => 0,
          color: C.epona,
          name: 'Epona',
        });
        for (let k = 0; k < 3; k++)
          series.push({
            id: 'epona',
            base: 'c' + k,
            horse: true,
            h: (r) =>
              a === 'y' && r.lines && r.lines[k] ? r.lines[k].h : a === 'y' ? circleH(r, k) : 0,
            color: C.epona,
            dash: ['dot', 'dash', 'longdash'][k],
            name: 'Epona ' + CIR[k] + ' circle',
          });
      }
      series.forEach((sr) => {
        if (!show[sr.id]) return;
        if (sr.horse && !show[sr.base] && sr.base !== 'feet') return;
        if (a !== 'y' && sr.id !== 'feet' && sr.base !== 'feet') return;
        const xs = [];
        const ys = [];
        const cd = [];
        rows.forEach((r, j) => {
          cols.forEach((c, ci) => {
            const pt = !!c.horse === !!sr.horse ? r.pts[c.key] : null;
            const rr = sr.horse ? r.horseRow : r;
            const raw = pt && rr ? pt[ai] + sr.h(rr) : null;
            xs.push(X(j, ci));
            ys.push(tf(raw));
            cd.push([r.f, c.label, raw === null ? '' : raw.toPrecision(9)]);
            if (raw !== null) dataRaw.push(raw);
          });
          xs.push(null);
          ys.push(null);
          cd.push(null);
        });
        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: xs,
          y: ys,
          yaxis: p.ax,
          line: { color: sr.color, width: 2, shape: 'hv', dash: sr.dash || 'solid' },
          name: sr.name,
          legendgroup: sr.name,
          showlegend: legendOnce(sr.name),
          customdata: cd,
          hovertemplate:
            'frame %{customdata[0]}, %{customdata[1]}<br>' +
            sr.name +
            ' ' +
            a +
            ' = %{customdata[2]}<extra></extra>',
        });
      });
      if (show.lines) {
        const groups = [[], [], [], []];
        rows.forEach((r, j) =>
          (r.lines || []).forEach((ln) => {
            if (ln.mode === 'skipped' || !ln.start) return;
            const ci = colIdx.get('line' + ln.i);
            if (ci === undefined) return;
            const g = groups[ln.hit ? 3 : ln.i];
            const x = X(j, ci) - 0.3;
            g.push(
              [x, ln.start[ai], r.f, CIR[ln.i], ln.mode, ln.hit],
              [x, ln.end[ai], r.f, CIR[ln.i], ln.mode, ln.hit],
              null,
            );
            dataRaw.push(ln.start[ai], ln.end[ai]);
          }),
        );
        const names = ['low line', 'mid line', 'top line', 'line that hit'];
        const cols4 = [C.low, C.mid, C.top, C.hit];
        groups.forEach((g, gi) => {
          if (!g.length) return;
          traces.push({
            type: 'scatter',
            mode: 'lines+markers',
            yaxis: p.ax,
            x: g.map((q) => (q ? q[0] : null)),
            y: g.map((q) => (q ? tf(q[1]) : null)),
            customdata: g.map((q) => (q ? [q[2], q[3], q[4], q[1].toPrecision(9)] : null)),
            line: { color: cols4[gi], width: 2.5 },
            marker: { size: 5, symbol: 'line-ew-open', color: cols4[gi] },
            name: names[gi],
            legendgroup: names[gi],
            showlegend: legendOnce(names[gi]),
            hovertemplate:
              'frame %{customdata[0]}, %{customdata[1]} circle line (%{customdata[2]})<br>' +
              a +
              ' = %{customdata[3]}<extra></extra>',
          });
        });
      }
      refs.forEach((rf) => {
        if (rf.axis === a) dataRaw.push(rf.v);
      });
      const isLog = s.scale === 'log';
      const toAxis = (raw) => {
        const t = tf(raw);
        return t === null || !Number.isFinite(t) ? null : isLog ? Math.log10(t) : t;
      };
      const tv = dataRaw.map(toAxis).filter((v) => v !== null);
      let lo = tv.length ? Math.min(...tv) : 0;
      let hi = tv.length ? Math.max(...tv) : 1;
      const pad = Math.max(
        (hi - lo) * 0.08,
        s.scale === 'linear' ? 5 : s.scale === 'symlog' ? 0.3 : 0.05,
      );
      const rlo = lo - pad;
      const rhi = hi + pad;
      Object.assign(ax, { range: [rlo, rhi], autorange: false });
      const inRange = (raw) => {
        const u = toAxis(raw);
        return u !== null && u >= rlo && u <= rhi;
      };

      if (show.surfaces || show.push) {
        const byKind = { floor: [], wall: [], roof: [] };
        const zones = [];
        const pushers = [];
        rows.forEach((r, j) => {
          const at = ev(r, 'frame').pos;
          const x0 = X(j, 0) - 0.5;
          const x1 = X(j, nc - 1) + 0.5;
          polysOf(r).forEach(({ p: poly, why }) => {
            const kind = poly.kind || 'wall';
            const id = polyId(poly);
            const v = surfaceValue(poly, ai, at, circleH(r, 2) || 180);
            if (v === null) return;
            if (show.surfaces && inRange(v)) {
              byKind[kind].push(
                [x0, v, [kind, id, why, v.toPrecision(9), r.f]],
                [x1, v, [kind, id, why, v.toPrecision(9), r.f]],
                null,
              );
            }
            if (!show.push || kind !== 'wall') return;
            const crr = ev(r, 'crr_pre');
            const radius = crr && crr.circles[0] ? crr.circles[0].r : 35;
            const zone = pushZone(poly, radius);
            if (!zone) return;
            const perUnit = zone.flat / poly.normal[ai];
            const near = v + zone.near * perUnit;
            const far = v + zone.far * perUnit;
            const un = toAxis(near);
            const uf = toAxis(far);
            if (un === null || uf === null) return;
            if (Math.max(un, uf) < rlo || Math.min(un, uf) > rhi) return;
            zones.push({
              x0,
              x1,
              near,
              far,
              text:
                `frame ${r.f}: push zone of wall ${id}<br>` +
                `${a} from ${near.toPrecision(9)} to ${far.toPrecision(9)}<br>` +
                `starts ${zone.near.toPrecision(4)} in front of the face, pusher at ${zone.far.toPrecision(7)}`,
            });
          });
        });
        if (show.push && ai !== 1)
          rows.forEach((r, j) => {
            const at = ev(r, 'frame').pos;
            const other = ai === 0 ? 2 : 0;
            (r.fr.wall_cir || []).forEach((e) => {
              if (!e.pusher) return;
              const [x0p, z0p, x1p, z1p] = e.pusher;
              const a0 = ai === 0 ? x0p : z0p;
              const a1 = ai === 0 ? x1p : z1p;
              const o0 = ai === 0 ? z0p : x0p;
              const o1 = ai === 0 ? z1p : x1p;
              if (Math.abs(o1 - o0) < 1e-6) return;
              const t = (at[other] - o0) / (o1 - o0);
              const v = a0 + t * (a1 - a0);
              if (!inRange(v)) return;
              pushers.push({
                x0: X(j, 0) - 0.5,
                x1: X(j, nc - 1) + 0.5,
                v,
                text:
                  `frame ${r.f}: pusher of ${kindOf(e.normal)} ${e.poly}, ${CIR[e.circle]} circle<br>` +
                  `${a} = ${v.toPrecision(9)} at Link (segment t = ${t.toPrecision(4)})<br>${e.result}`,
              });
            });
          });
        pushers.forEach((q) => {
          traces.push({
            type: 'scatter',
            mode: 'lines',
            yaxis: p.ax,
            x: [q.x0, q.x1],
            y: [tf(q.v), tf(q.v)],
            hoverinfo: 'text',
            text: q.text,
            line: { color: C.wall, width: 1.5, dash: 'dash' },
            name: 'pusher (logged)',
            legendgroup: 'pusher (logged)',
            showlegend: legendOnce('pusher (logged)'),
          });
        });
        zones.forEach((z) => {
          traces.push({
            type: 'scatter',
            mode: 'lines',
            yaxis: p.ax,
            fill: 'toself',
            hoveron: 'fills',
            hoverinfo: 'text',
            text: z.text,
            x: [z.x0, z.x1, z.x1, z.x0, z.x0],
            y: [z.near, z.near, z.far, z.far, z.near].map(tf),
            fillcolor: rgba(C.wall, 0.18),
            line: { color: rgba(C.wall, 0.55), width: 0.75 },
            name: 'wall push zone',
            legendgroup: 'wall push zone',
            showlegend: legendOnce('wall push zone'),
          });
        });
        const kc = { floor: C.floor, wall: C.wall, roof: C.roof };
        Object.keys(byKind).forEach((k) => {
          const g = byKind[k];
          if (!g.length) return;
          const nm = k === 'roof' ? 'ceiling surface' : k + ' surface';
          traces.push({
            type: 'scatter',
            mode: 'lines',
            yaxis: p.ax,
            x: g.map((q) => (q ? q[0] : null)),
            y: g.map((q) => (q ? tf(q[1]) : null)),
            customdata: g.map((q) => (q ? q[2] : null)),
            line: { color: kc[k], width: 2, dash: 'dot' },
            name: nm,
            legendgroup: nm,
            showlegend: legendOnce(nm),
            hovertemplate:
              'frame %{customdata[4]}: %{customdata[0]} %{customdata[1]}<br>%{customdata[2]}<br>' +
              a +
              ' = %{customdata[3]} at Link<extra></extra>',
          });
        });
      }
      refs
        .filter((rf) => rf.axis === a && inRange(rf.v))
        .forEach((rf) => {
          const yv = tf(rf.v);
          shapes.push({
            type: 'line',
            xref: 'x',
            yref: p.ax,
            x0: -0.8,
            x1: xmax + 0.8,
            y0: yv,
            y1: yv,
            line: { color: C.ref, width: 1.5, dash: 'dash' },
          });
          ann.push({
            xref: 'x',
            yref: p.ax,
            x: xmax + 0.6,
            xanchor: 'right',
            y: isLog ? Math.log10(yv) : yv,
            yanchor: 'bottom',
            showarrow: false,
            text: rf.label || a + ' = ' + rf.v,
            font: { size: 10, color: C.muted },
          });
        });
      if (s.scale === 'symlog') {
        const t = symTicks(
          dataRaw.map((v) => v - s.off),
          s.thr,
        );
        if (t) Object.assign(ax, { tickmode: 'array', tickvals: t.tickvals, ticktext: t.ticktext });
      }
    }

    function circleH(r, k) {
      const c = ev(r, 'crr_pre');
      return c && c.circles[k] ? c.circles[k].h : 0;
    }

    function varPanel(p, ax) {
      const v = p.v;
      p.title = v.label;
      const xs = [];
      const ys = [];
      const cd = [];
      rows.forEach((r, j) => {
        const m = v.get(r);
        cols.forEach((c, ci) => {
          const m0 = m[c.key] !== undefined ? m[c.key] : c.wallFirst ? m.wall : undefined;
          if (m0 === undefined || m0 === null) return;
          xs.push(X(j, ci));
          ys.push(m0);
          cd.push([r.f, c.label, m0.toPrecision(9)]);
        });
        xs.push(null);
        ys.push(null);
        cd.push(null);
      });
      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        yaxis: p.ax,
        x: xs,
        y: ys,
        customdata: cd,
        connectgaps: false,
        line: { color: C.feet, width: 1.8 },
        marker: { size: 6, color: C.feet },
        name: v.label,
        showlegend: false,
        hovertemplate:
          'frame %{customdata[0]}, %{customdata[1]}<br>' +
          v.label +
          ' = %{customdata[2]}<extra></extra>',
      });
      if (!ys.some((y) => y !== null))
        ann.push({
          xref: 'paper',
          yref: p.ax,
          x: 0.5,
          y: 0,
          showarrow: false,
          text: 'Not in this recording',
          font: { color: C.muted },
        });
    }

    function checksPanel(p, ax) {
      p.title = 'Checks';
      Object.assign(ax, {
        range: [-1, 1],
        showticklabels: false,
        showgrid: false,
        zeroline: false,
      });
      const styles = {
        ran: { name: 'ran, no effect', symbol: 'square-open', size: 9 },
        hit: { name: 'ran, hit or moved Link', symbol: 'square', size: 10 },
        hitlow: { name: 'lowered line, hit', symbol: 'triangle-down', size: 11 },
        lowered: { name: 'line lowered under ceiling', symbol: 'triangle-down-open', size: 10 },
        skipped: { name: 'skipped', symbol: 'x-thin-open', size: 8 },
      };
      Object.keys(styles).forEach((k) => {
        const xs = [];
        const cs = [];
        const cd = [];
        rows.forEach((r, j) =>
          cols.forEach((c, ci) => {
            if (!c.check || r.st[c.key] !== k) return;
            xs.push(X(j, ci));
            cd.push([
              r.f,
              (r.labels && r.labels[c.key]) || c.label,
              r.detail && r.detail[c.key] ? '<br>' + r.detail[c.key] : '',
            ]);
            cs.push(
              k === 'hit' || k === 'hitlow'
                ? C.hit
                : k === 'skipped'
                  ? C.skip
                  : c.circle !== undefined
                    ? [C.low, C.mid, C.top][c.circle]
                    : C.muted,
            );
          }),
        );
        if (!xs.length) return;
        traces.push({
          type: 'scatter',
          mode: 'markers',
          yaxis: p.ax,
          x: xs,
          y: xs.map(() => 0),
          customdata: cd,
          marker: {
            symbol: styles[k].symbol,
            size: styles[k].size,
            color: cs,
            line: { color: cs, width: 1.6 },
          },
          name: styles[k].name,
          legendgroup: 'chk' + k,
          showlegend: legendOnce('chk' + k),
          hovertemplate:
            'frame %{customdata[0]}, %{customdata[1]}: ' +
            styles[k].name +
            '%{customdata[2]}<extra></extra>',
        });
      });
    }

    function statePanel(p, ax) {
      p.title = 'Link state';
      const STATE_ROWS = stateRows();
      const z = STATE_ROWS.map(() => []);
      const xs = [];
      const text = STATE_ROWS.map(() => []);
      for (let x = 0; x <= xmax; x++) xs.push(x);
      STATE_ROWS.forEach((sr, ri) => {
        for (let x = 0; x <= xmax; x++) {
          z[ri].push(null);
          text[ri].push('');
        }
        rows.forEach((r, j) => {
          const v = sr.get(r);
          for (let ci = 0; ci < nc; ci++) {
            z[ri][X(j, ci)] = v;
            text[ri][X(j, ci)] =
              'frame ' +
              r.f +
              ': ' +
              sr.label +
              ' ' +
              (v === null ? 'not logged' : v ? 'on' : 'off');
          }
        });
      });
      traces.push({
        type: 'heatmap',
        yaxis: p.ax,
        x: xs,
        y: STATE_ROWS.map((s) => s.label),
        z,
        text,
        hoverinfo: 'text',
        zmin: 0,
        zmax: 1,
        colorscale: [
          [0, C.off],
          [1, C.on],
        ],
        showscale: false,
        xgap: 1,
        ygap: 2,
      });
      Object.assign(ax, {
        showgrid: false,
        zeroline: false,
        tickfont: { size: 9, color: C.muted },
        autorange: 'reversed',
      });
    }

    const wrapW = plot.parentElement.clientWidth;
    const stepPx = parseInt($('stepPx').value, 10);
    layout.width = Math.max(wrapW, (xmax + 2) * stepPx + 150);
    layout.shapes = shapes;
    layout.annotations = ann;
    Plotly.react(plot, traces, layout, {
      responsive: false,
      displaylogo: false,
      scrollZoom: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    });
    $('status').textContent = '';
    saveSettings();
  }

  const mapState = { steps: [], idx: 0, timer: null, wantFrame: null, zoom: null, cam3d: null };

  const PROJ = {
    top: { u: 0, v: 2, un: 'x', vn: 'z' },
    front: { u: 0, v: 1, un: 'x', vn: 'y' },
    side: { u: 2, v: 1, un: 'z', vn: 'y' },
  };

  function stepKind(key) {
    if (key === 'move' || key === 'body' || key === 'movebg' || key === 'lc2') return key;
    if (/^(line|hitA|hitB)\d$/.test(key) || key === 'ldown') return 'line';
    if (/^(wp|wall)\d+$/.test(key)) return 'wall';
    if (key === 'roof' || key === 'clamp') return 'roof';
    if (key === 'ground') return 'ground';
    return 'other';
  }

  function stepColor(kind, C) {
    return (
      {
        move: C.feet,
        body: C.hi,
        movebg: C.act,
        line: C.on,
        wall: C.wall,
        lc2: C.mid,
        roof: C.roof,
        ground: C.floor,
      }[kind] || C.muted
    );
  }

  function esc(t) {
    return String(t).replace(
      /[&<>"]/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
    );
  }

  function showTab() {
    const map = ui.tab === 'map';
    $('stepsView').hidden = map;
    $('mapView').hidden = !map;
    $('tabSteps').setAttribute('aria-selected', String(!map));
    $('tabMap').setAttribute('aria-selected', String(map));
  }

  function setTab(t) {
    ui.tab = t;
    stopPlay();
    showTab();
    render();
  }

  function buildMapSteps() {
    const prev = mapState.steps[mapState.idx];
    const keep = prev ? { f: prev.r.f, key: prev.key } : mapState.restore;
    mapState.restore = null;
    const movedOnly = $('mapMoved').checked;
    const steps = [];
    let carry = null;
    const carryBy = {};
    if (latest)
      latest.rows.forEach((r) => {
        const lastBy = {};
        latest.cols.forEach((c) => {
          const st = r.st[c.key];
          const pos = r.pts[c.key];
          if (!st || st === 'skipped' || !pos) return;
          const who = c.horse ? 'h' : 'l';
          const last = lastBy[who];
          const from = last ? last.pos : carryBy[who] || pos;
          const s = {
            r: c.horse ? r.horseRow : r,
            row: r,
            c,
            key: c.horse ? c.base : c.key,
            horse: !!c.horse,
            st,
            pos,
            from,
            moved: !same(from, pos),
            label: (r.labels && r.labels[c.key]) || c.label,
          };
          lastBy[who] = s;
          if (movedOnly && !s.moved && s.key !== 'start') return;
          steps.push(s);
        });
        Object.keys(lastBy).forEach((who) => {
          carryBy[who] = lastBy[who].pos;
        });
      });
    mapState.steps = steps;
    let idx = 0;
    if (mapState.wantFrame !== null) {
      const i = steps.findIndex((s) => s.r.f >= mapState.wantFrame);
      idx = i < 0 ? 0 : i;
      mapState.wantFrame = null;
    } else if (keep) {
      const exact = steps.findIndex((s) => s.r.f === keep.f && s.key === keep.key);
      const frame = steps.findIndex((s) => s.r.f >= keep.f);
      idx = exact >= 0 ? exact : frame >= 0 ? frame : 0;
    }
    mapState.idx = idx;
    const seek = $('mapSeek');
    seek.max = Math.max(0, steps.length - 1);
    seek.value = idx;
  }

  function horseOverlay(r) {
    if (ui.actor !== 'link' || !r.fr.horse_crr_pre) return null;
    const end = (r.fr.horse_frame_end || r.fr.horse_crr_post || r.fr.horse_crr_pre)[0];
    const circles = r.fr.horse_crr_pre[0].circles || [];
    if (!end || !end.pos) return null;
    return {
      pos: end.pos,
      circles,
      text: `Epona at frame end<br>${end.pos.map((v) => v.toFixed(3)).join(', ')}<br>wall circles: ${circles
        .map((c) => `h ${c.h} r ${c.r}`)
        .join(', ')}`,
    };
  }

  function linkCircles(r) {
    const crr = ev(r, 'crr_pre');
    return crr && crr.circles ? crr.circles : [];
  }

  function circleCenters(r, pos) {
    return linkCircles(r).map((c, i) => {
      const p = [pos[0], pos[1] + c.h, pos[2]];
      return {
        i,
        p,
        text: `${CIR[i]} circle center, ${c.h} above feet, radius ${c.r}<br>${p.map((v) => v.toFixed(3)).join(', ')}`,
      };
    });
  }

  function normalTraces(polys, C) {
    const len = Math.max(4, (parseFloat($('mapSpan').value) || 200) * 0.06);
    return polyGroups(polys, C)
      .filter(([, , list]) => list.length)
      .map(([name, col, list]) => {
        const a = [];
        const tips = [];
        const text = [];
        list.forEach((p) => {
          const c = [0, 1, 2].map((d) => (p.tri[0][d] + p.tri[1][d] + p.tri[2][d]) / 3);
          const tip = c.map((v, d) => v + p.normal[d] * len);
          a.push(c, tip, null);
          tips.push(tip);
          text.push(polyText(p));
        });
        return { name: name + ' normals', col, a, tips, text };
      });
  }

  function axis3() {
    return $('mapMirror').checked ? [0, 2, 1] : [2, 0, 1];
  }

  function map3dHeight() {
    const el = $('map');
    const top = el.getBoundingClientRect().top + window.scrollY;
    return Math.max(480, Math.round(window.innerHeight - top - 12));
  }

  function bodyTop(r) {
    return Math.max(linkHeight(r), ...linkCircles(r).map((c) => c.h));
  }

  function linkHeight(r) {
    const f = ev(r, 'frame');
    return f && typeof f.height === 'number' ? f.height : 150;
  }

  function stepPolys(s) {
    const r = s.r;
    const out = [];
    const add = (p) => {
      if (p && p.tri && p.normal) out.push(p);
    };
    const kind = stepKind(s.key);
    if (kind === 'body') (r.fr.body_line || []).forEach((e) => e.line_hit && add(e.poly));
    if (kind === 'line') {
      const m = /(\d)$/.exec(s.key);
      if (s.key === 'ldown') {
        const ld = ev(r, 'line_down');
        if (ld) add(ld.poly);
      } else if (m && r.lines && r.lines[+m[1]] && r.lines[+m[1]].hit) add(r.lines[+m[1]].poly);
    }
    if (kind === 'wall') {
      const m = /(\d+)$/.exec(s.key);
      const push = r.pushes && m ? r.pushes[+m[1]] : null;
      if (push && push.cir)
        add({ normal: push.cir.normal, tri: push.cir.tri, bg: push.cir.bg, poly: push.cir.poly });
      const wp = ev(r, 'wall_post');
      if (wp)
        wp.circles.forEach((c) => {
          if (c.hit && (!push || push.bg === undefined || c.hit.bg === push.bg)) add(c.hit);
        });
    }
    if (kind === 'lc2')
      (r.fr.line_cir || []).forEach((e) => e.pass === 'line2' && e.hit && add(e.poly));
    if (kind === 'ground') {
      const g = ev(r, 'ground_post');
      if (g) add(g.found);
    }
    if (kind === 'roof') {
      const rf = ev(r, 'roof');
      if (rf) add(rf.hit);
    }
    return out;
  }

  function stepSegments(s) {
    const r = s.r;
    const kind = stepKind(s.key);
    const segs = [];
    if (kind === 'body')
      (r.fr.body_line || []).forEach((e) =>
        segs.push({
          a: e.start,
          b: e.end,
          cross: e.line_hit ? e.cross : null,
          on: !!e.result,
          text: bodyLineText(e),
        }),
      );
    if (kind === 'line') {
      if (s.key === 'ldown') {
        const ld = ev(r, 'line_down');
        if (ld)
          segs.push({
            a: ld.start,
            b: ld.end,
            cross: ld.hit ? ld.pos_after : null,
            on: !!ld.hit,
            text: 'line down',
          });
      } else {
        const m = /(\d)$/.exec(s.key);
        const ln = m && r.lines ? r.lines[+m[1]] : null;
        if (ln && ln.start && ln.end)
          segs.push({
            a: ln.start,
            b: ln.end,
            cross: ln.hit && ln.cross ? ln.cross : null,
            on: !!ln.hit,
            text: CIR[ln.i] + ' line check' + (ln.hit ? ', hit' : ', no hit'),
          });
      }
    }
    if (s.key === 'action')
      (r.fr.aux_line || []).forEach((e) =>
        segs.push({
          a: e.start,
          b: e.end,
          cross: e.hit ? e.cross : null,
          on: !!e.hit,
          text: auxLineText(e),
        }),
      );
    if (kind === 'lc2')
      (r.fr.line_cir || [])
        .filter((e) => e.pass === 'line2' && e.start && e.end)
        .forEach((e) =>
          segs.push({
            a: e.start,
            b: e.end,
            cross: e.hit && e.cross ? e.cross : null,
            on: !!e.hit,
            text: CIR[e.i] + ' line check 2' + (e.hit ? ', hit' : ', no hit'),
          }),
        );
    return segs;
  }

  function pusherLines(s, radius) {
    const r = s.r;
    const m = /(\d+)$/.exec(s.key);
    const push = r.pushes && m ? r.pushes[+m[1]] : null;
    const out = [];
    if (push && push.cir && push.cir.pusher) {
      const [x0, z0, x1, z1] = push.cir.pusher;
      out.push({ a: [x0, 0, z0], b: [x1, 0, z1] });
      return out;
    }
    const bg = push && push.bg !== undefined ? push.bg : null;
    if (bg === null) return out;
    const nb = ev(r, 'nearby');
    (nb && nb.polys ? nb.polys : []).forEach((p) => {
      if (p.bg !== bg || Math.abs(p.normal[1]) >= 0.5) return;
      const flat = Math.hypot(p.normal[0], p.normal[2]);
      if (flat < 1e-6) return;
      const ahead =
        (p.normal[0] * s.from[0] + p.normal[2] * s.from[2] + p.normal[1] * p.tri[0][1] + p.d) /
        flat;
      if (ahead < -radius || ahead > radius * 3) return;
      let best = null;
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) {
          const d = flatDistance(p.tri[i], p.tri[j]);
          if (!best || d > best.d) best = { d, a: p.tri[i], b: p.tri[j] };
        }
      if (!best || best.d < 1e-3) return;
      const ox = (radius * p.normal[0]) / flat;
      const oz = (radius * p.normal[2]) / flat;
      out.push({ a: [best.a[0] + ox, 0, best.a[2] + oz], b: [best.b[0] + ox, 0, best.b[2] + oz] });
    });
    return out;
  }

  function mapInfo(s, C) {
    const r = s.r;
    const inFrame = mapState.steps.filter((t) => t.r === r);
    const n = inFrame.indexOf(s) + 1;
    const d = [0, 1, 2].map((i) => s.pos[i] - s.from[i]);
    const detail = r.detail && r.detail[s.key] ? r.detail[s.key].split('<br>') : [];
    const rows = [
      ['Frame', r.f + ', ' + procName(r.proc, r.isHorse)],
      ['Step', `${n} of ${inFrame.length}: ${s.label}`],
      ['Result', s.st],
      ['Position', s.pos.map((v) => v.toFixed(3)).join(', ')],
      [
        'Moved',
        d.map((v) => (v >= 0 ? '+' : '') + v.toFixed(3)).join(', ') +
          `  (flat ${flatDistance(s.from, s.pos).toFixed(3)})`,
      ],
    ];
    const html =
      `<div class="mi-step" style="border-color:${stepColor(stepKind(s.key), C)}">${esc(s.label)}</div>` +
      '<dl>' +
      rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') +
      '</dl>' +
      (detail.length
        ? '<h3>Detail</h3><ul>' + detail.map((t) => `<li>${esc(t)}</li>`).join('') + '</ul>'
        : '');
    $('mapInfo').innerHTML = html;
  }

  function polyGroups(polys, C) {
    const groups = { floor: [], wall: [], ceiling: [] };
    polys.forEach((p) => {
      if (p.tri) groups[kindOf(p.normal)].push(p);
    });
    return [
      ['floors', C.floor, groups.floor],
      ['walls', C.wall, groups.wall],
      ['ceilings', C.roof, groups.ceiling],
    ];
  }

  function polyText(p) {
    const n = p.normal;
    return `${kindOf(n)}, ${polyId(p)}<br>normal (${n.map((v) => v.toFixed(4)).join(', ')})`;
  }

  function renderMap() {
    const el = $('map');
    const steps = mapState.steps;
    if (!steps.length) {
      Plotly.purge(el);
      $('mapInfo').textContent = 'No steps in this frame range.';
      $('mapStep').textContent = '';
      return;
    }
    mapState.idx = Math.min(Math.max(0, mapState.idx), steps.length - 1);
    const s = steps[mapState.idx];
    $('mapSeek').value = mapState.idx;
    $('mapStep').textContent = `frame ${s.r.f}, ${s.label} (${mapState.idx + 1}/${steps.length})`;
    const C = colors();
    mapInfo(s, C);
    const is3d = $('mapProj').value === 'ortho' || $('mapProj').value === 'persp';
    $('mapView').classList.toggle('is3d', is3d);
    if (is3d) renderMap3d(s, C);
    else renderMap2d(s, C);
  }

  function renderMap2d(s, C) {
    const P = PROJ[$('mapProj').value] || PROJ.top;
    const U = (p) => p[P.u];
    const V = (p) => p[P.v];
    const r = s.r;
    const traces = [];
    const shapes = [];
    const ann = [];
    mapState.polyTraces = new Map();
    mapState.hovered = null;
    mapState.pendingHover = null;
    clearTimeout(mapState.hoverTimer);
    polyGroups(
      polysOf(r).map((o) => o.p),
      C,
    ).forEach(([name, col, list]) => {
      if (!list.length) return;
      const x = [];
      const y = [];
      const text = [];
      list.forEach((p) => {
        [0, 1, 2, 0].forEach((i) => {
          x.push(U(p.tri[i]));
          y.push(V(p.tri[i]));
          text.push(polyText(p));
        });
        x.push(null);
        y.push(null);
        text.push(null);
      });
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x,
        y,
        text,
        hoverinfo: 'text',
        fill: 'toself',
        fillcolor: rgba(col, 0.1),
        line: { color: rgba(col, 0.8), width: 1 },
        name,
      });
      mapState.polyTraces.set(traces.length - 1, { list, stride: 5 });
    });
    if ($('mapNormals').checked)
      normalTraces(
        polysOf(r).map((o) => o.p),
        C,
      ).forEach((q) =>
        traces.push(
          {
            type: 'scatter',
            mode: 'lines',
            x: q.a.map((p) => (p ? U(p) : null)),
            y: q.a.map((p) => (p ? V(p) : null)),
            line: { color: q.col, width: 1.2 },
            hoverinfo: 'skip',
            name: q.name,
            legendgroup: q.name,
          },
          {
            type: 'scatter',
            mode: 'markers',
            x: q.tips.map(U),
            y: q.tips.map(V),
            marker: { size: 5, color: q.col, symbol: 'diamond' },
            text: q.text,
            hoverinfo: 'text',
            legendgroup: q.name,
            showlegend: false,
          },
        ),
      );
    const hl = stepPolys(s);
    if (hl.length) {
      const x = [];
      const y = [];
      const text = [];
      hl.forEach((p) => {
        [0, 1, 2, 0].forEach((i) => {
          x.push(U(p.tri[i]));
          y.push(V(p.tri[i]));
          text.push(polyText(p));
        });
        x.push(null);
        y.push(null);
        text.push(null);
      });
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x,
        y,
        text,
        hoverinfo: 'text',
        line: { color: C.fg, width: 3 },
        name: 'surfaces this step used',
      });
      mapState.polyTraces.set(traces.length - 1, { list: hl, stride: 5 });
    }
    const rows = latest.rows;
    const ri = rows.indexOf(r);
    const ends = rows
      .slice(0, ri)
      .map((q) => (ev(q, 'frame_end') || ev(q, 'crr_post') || {}).pos)
      .filter(Boolean);
    if (ends.length)
      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        x: ends.map(U),
        y: ends.map(V),
        line: { color: C.muted, width: 1, dash: 'dot' },
        marker: { size: 4, color: C.muted },
        hoverinfo: 'skip',
        name: 'earlier frame ends',
      });
    const trail = mapState.steps.filter((t, i) => t.r === r && i <= mapState.idx).map((t) => t.pos);
    const first = ev(r, 'frame').pos;
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: [U(first), ...trail.map(U)],
      y: [V(first), ...trail.map(V)],
      line: { color: rgba(C.feet, 0.5), width: 1.5 },
      hoverinfo: 'skip',
      name: 'this frame so far',
    });
    const radius = linkCircles(r).length ? linkCircles(r)[0].r : 35;
    const kind = stepKind(s.key);
    const ccol = [C.low, C.mid, C.top];
    if (P.v === 2) {
      if (kind === 'wall' && s.moved)
        shapes.push({
          type: 'circle',
          x0: U(s.from) - radius,
          x1: U(s.from) + radius,
          y0: V(s.from) - radius,
          y1: V(s.from) + radius,
          line: { color: rgba(C.fg, 0.5), width: 1, dash: 'dot' },
        });
      const cir = linkCircles(r);
      const oneRadius = cir.every((c) => Math.abs(c.r - cir[0].r) < 1e-4);
      (oneRadius ? cir.slice(0, 1) : cir).forEach((c, i) =>
        shapes.push({
          type: 'circle',
          x0: U(s.pos) - c.r,
          x1: U(s.pos) + c.r,
          y0: V(s.pos) - c.r,
          y1: V(s.pos) + c.r,
          line: { color: oneRadius ? C.feet : ccol[i % 3], width: 1.2 },
          fillcolor: i === 0 ? rgba(C.feet, 0.05) : 'rgba(0,0,0,0)',
        }),
      );
      if (kind === 'wall')
        pusherLines(s, radius).forEach((q) =>
          traces.push({
            type: 'scatter',
            mode: 'lines',
            x: [U(q.a), U(q.b)],
            y: [V(q.a), V(q.b)],
            line: { color: C.wall, width: 1.5, dash: 'dash' },
            hoverinfo: 'skip',
            name: 'pushers',
            legendgroup: 'pushers',
            showlegend: false,
          }),
        );
    } else {
      const h = linkHeight(r);
      shapes.push({
        type: 'line',
        x0: U(s.pos),
        x1: U(s.pos),
        y0: V(s.pos),
        y1: V(s.pos) + h,
        line: { color: rgba(C.feet, 0.6), width: 1 },
      });
      linkCircles(r).forEach((c, i) =>
        shapes.push({
          type: 'line',
          x0: U(s.pos) - c.r,
          x1: U(s.pos) + c.r,
          y0: V(s.pos) + c.h,
          y1: V(s.pos) + c.h,
          line: { color: ccol[i % 3], width: 2 },
        }),
      );
      const g = ev(r, 'ground_post');
      if (kind === 'ground' && g && fin(g.ground_h) !== null)
        shapes.push({
          type: 'line',
          x0: U(s.pos) - radius * 2,
          x1: U(s.pos) + radius * 2,
          y0: g.ground_h,
          y1: g.ground_h,
          line: { color: C.floor, width: 1.5, dash: 'dash' },
        });
    }
    stepSegments(s).forEach((q) => {
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: [U(q.a), U(q.b)],
        y: [V(q.a), V(q.b)],
        line: { color: q.on ? C.hi : C.muted, width: q.on ? 2 : 1.2, dash: q.on ? 'solid' : 'dot' },
        text: [q.text, q.text],
        hoverinfo: 'text',
        showlegend: false,
      });
      if (q.cross)
        traces.push({
          type: 'scatter',
          mode: 'markers',
          x: [U(q.cross)],
          y: [V(q.cross)],
          marker: { symbol: 'x-thin', size: 11, line: { width: 2, color: q.on ? C.hi : C.muted } },
          text: [q.text],
          hoverinfo: 'text',
          showlegend: false,
        });
    });
    if (s.moved)
      ann.push({
        x: U(s.pos),
        y: V(s.pos),
        ax: U(s.from),
        ay: V(s.from),
        xref: 'x',
        yref: 'y',
        axref: 'x',
        ayref: 'y',
        showarrow: true,
        arrowhead: 2,
        arrowsize: 1.2,
        arrowwidth: 2,
        arrowcolor: stepColor(kind, C),
        text: '',
      });
    const horse = horseOverlay(r);
    if (horse) {
      const hx = [];
      const hy = [];
      horse.circles.forEach((c) => {
        if (P.v === 2) {
          for (let t = 0; t <= 48; t++) {
            const a = (t / 48) * Math.PI * 2;
            const q = [
              horse.pos[0] + c.r * Math.cos(a),
              horse.pos[1] + c.h,
              horse.pos[2] + c.r * Math.sin(a),
            ];
            hx.push(U(q));
            hy.push(V(q));
          }
        } else {
          const l = [horse.pos[0], horse.pos[1] + c.h, horse.pos[2]];
          const rr = [horse.pos[0], horse.pos[1] + c.h, horse.pos[2]];
          l[P.u] -= c.r;
          rr[P.u] += c.r;
          hx.push(U(l), U(rr));
          hy.push(V(l), V(rr));
        }
        hx.push(null);
        hy.push(null);
      });
      traces.push(
        {
          type: 'scatter',
          mode: 'lines',
          x: hx,
          y: hy,
          line: { color: C.hi, width: 1.5, dash: 'dash' },
          hoverinfo: 'skip',
          name: 'Epona circles',
          legendgroup: 'epona',
        },
        {
          type: 'scatter',
          mode: 'markers',
          x: [U(horse.pos)],
          y: [V(horse.pos)],
          marker: { size: 8, color: C.hi, symbol: 'diamond' },
          text: [horse.text],
          hoverinfo: 'text',
          name: 'Epona',
          legendgroup: 'epona',
        },
      );
    }
    const feet = ev(r, 'feet');
    if (feet && Array.isArray(feet.feet))
      traces.push({
        type: 'scatter',
        mode: 'markers',
        x: feet.feet.map(U),
        y: feet.feet.map(V),
        marker: { size: 7, color: C.floor, symbol: 'square-open', line: { width: 2 } },
        text: feet.feet.map(
          (p, i) => `hoof ${i + 1} ground point<br>${p.map((v) => v.toFixed(3)).join(', ')}`,
        ),
        hoverinfo: 'text',
        name: 'hoof ground points',
      });
    const centers = circleCenters(r, s.pos);
    if (centers.length)
      traces.push({
        type: 'scatter',
        mode: 'markers',
        x: centers.map((q) => U(q.p)),
        y: centers.map((q) => V(q.p)),
        marker: {
          size: 7,
          color: centers.map((q) => ccol[q.i % 3]),
          line: { color: C.bg, width: 1 },
        },
        text: centers.map((q) => q.text),
        hoverinfo: 'text',
        name: 'circle centers',
      });
    traces.push({
      type: 'scatter',
      mode: 'markers',
      x: [U(s.pos)],
      y: [V(s.pos)],
      marker: { size: 8, color: C.fg, line: { color: C.bg, width: 1 } },
      text: [`frame ${r.f}, ${s.label}<br>${s.pos.map((v) => v.toFixed(3)).join(', ')}`],
      hoverinfo: 'text',
      name: ui.actor === 'horse' || r.isHorse ? 'Epona' : 'Link',
    });
    const follow = $('mapFollow').checked;
    const span = Math.max(1, parseFloat($('mapSpan').value) || 200);
    const axis = (title) => ({
      title,
      gridcolor: C.grid,
      zerolinecolor: C.line,
      color: C.muted,
      tickfont: { size: 10 },
      tickformat: '.0f',
    });
    const layout = {
      height: 640,
      margin: { l: 70, r: 16, t: 16, b: 50 },
      paper_bgcolor: C.panel,
      plot_bgcolor: C.panel,
      font: { family: css('--font-mono') || 'monospace', color: C.fg, size: 11 },
      showlegend: true,
      legend: { orientation: 'h', x: 0, y: -0.09, font: { size: 10 } },
      hovermode: 'closest',
      hoverlabel: { bgcolor: C.raise, bordercolor: C.act, font: { size: 11, color: C.fg } },
      xaxis: axis(P.un),
      yaxis: Object.assign(axis(P.vn), {
        scaleanchor: 'x',
        scaleratio: 1,
        autorange: P.v === 2 && !$('mapMirror').checked ? 'reversed' : true,
      }),
      shapes,
      annotations: ann,
      uirevision: follow ? 'follow' + mapState.idx : 'map-' + $('mapProj').value,
    };
    const zoom = mapState.zoom && mapState.zoom.proj === $('mapProj').value ? mapState.zoom : null;
    if (follow && zoom) {
      const cu = U(s.pos) + zoom.du;
      const cv = V(s.pos) + zoom.dv;
      layout.xaxis.range = [cu - zoom.w / 2, cu + zoom.w / 2];
      layout.yaxis.range = [cv - zoom.h / 2, cv + zoom.h / 2];
    } else if (!follow && zoom && zoom.abs) {
      layout.xaxis.range = zoom.abs[0].slice();
      layout.yaxis.range = zoom.abs[1].slice();
    } else if (follow) {
      const tall = P.v === 1 ? bodyTop(r) : 0;
      const view = Math.max(span, tall + 100);
      const cv = V(s.pos) + tall / 2;
      layout.xaxis.range = [U(s.pos) - view / 2, U(s.pos) + view / 2];
      layout.yaxis.range = [cv - view / 2, cv + view / 2];
      if (P.v === 2 && !$('mapMirror').checked) layout.yaxis.range.reverse();
    }
    if (layout.yaxis.range) delete layout.yaxis.autorange;
    mapState.hoverTrace = traces.length;
    traces.push(
      {
        type: 'scatter',
        mode: 'lines',
        x: [],
        y: [],
        line: { color: C.hi, width: 3 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        type: 'scatter',
        mode: 'markers',
        x: [],
        y: [],
        marker: { size: 10, color: C.hi, symbol: 'diamond' },
        hoverinfo: 'skip',
        showlegend: false,
      },
    );
    const el = $('map');
    Plotly.react(el, traces, layout, {
      responsive: true,
      displaylogo: false,
      scrollZoom: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    });
    hookMapZoom(el);
  }

  function hookMapZoom(el) {
    if (!el.mapZoomHooked && el.on) {
      el.mapZoomHooked = true;
      el.on('plotly_relayout', (e) => rememberZoom(e));
      el.on('plotly_hover', (e) => showHoveredNormal(e));
      el.on('plotly_unhover', () => showHoveredNormal(null));
      el.addEventListener('dblclick', () => {
        const p = mapState.pendingHover || mapState.hovered;
        if (p && !PROJ[$('mapProj').value]) faceCamera(p);
      });
    }
  }

  function faceCamera(p) {
    const el = $('map');
    const sc = el._fullLayout && el._fullLayout.scene;
    const scene = sc && sc._scene;
    if (!scene) return;
    const ar = scene.glplot.getAspectratio();
    const aspect = [ar.x, ar.y, ar.z];
    const ranges = [sc.xaxis.range, sc.yaxis.range, sc.zaxis.range];
    const m3 = axis3();
    const toPlot = (v) => m3.map((i) => v[i]);
    const c = toPlot([0, 1, 2].map((d) => (p.tri[0][d] + p.tri[1][d] + p.tri[2][d]) / 3));
    const n = toPlot(p.normal);
    const center = c.map(
      (v, i) =>
        (aspect[i] * (v - (ranges[i][0] + ranges[i][1]) / 2)) / (ranges[i][1] - ranges[i][0]),
    );
    const dir = n.map((v, i) => (v * (ranges[i][1] - ranges[i][0])) / aspect[i]);
    const len = Math.hypot(...dir) || 1;
    const cam = scene.getCamera();
    const dist =
      Math.hypot(cam.eye.x - cam.center.x, cam.eye.y - cam.center.y, cam.eye.z - cam.center.z) ||
      1.5;
    const eye = center.map((v, i) => v + (dir[i] / len) * dist);
    const up = Math.abs(n[2]) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    Plotly.relayout(el, {
      'scene.camera': {
        center: { x: center[0], y: center[1], z: center[2] },
        eye: { x: eye[0], y: eye[1], z: eye[2] },
        up,
        projection: { type: $('mapProj').value === 'persp' ? 'perspective' : 'orthographic' },
      },
    });
  }

  function showHoveredNormal(e) {
    const pt = e && e.points && e.points[0];
    const ref = pt && mapState.polyTraces ? mapState.polyTraces.get(pt.curveNumber) : null;
    const n = pt ? (Array.isArray(pt.pointNumber) ? pt.pointNumber[0] : pt.pointNumber) : null;
    mapState.pendingHover =
      ref && typeof n === 'number' ? ref.list[Math.floor(n / ref.stride)] || null : null;
    clearTimeout(mapState.hoverTimer);
    mapState.hoverTimer = setTimeout(applyHoveredNormal, mapState.pendingHover ? 30 : 150);
  }

  function syncViewIntoLayout(el) {
    const fl = el._fullLayout;
    const L = el.layout;
    if (!fl || !L) return;
    const sc = fl.scene && fl.scene._scene;
    if (sc && L.scene) {
      try {
        L.scene.camera = sc.getCamera();
        const ar = sc.glplot.getAspectratio();
        L.scene.aspectratio = { x: ar.x, y: ar.y, z: ar.z };
        L.scene.aspectmode = 'manual';
      } catch (err) {
        return;
      }
    }
    ['xaxis', 'yaxis'].forEach((k) => {
      if (fl[k] && L[k] && Array.isArray(fl[k].range)) {
        L[k].range = fl[k].range.slice();
        L[k].autorange = false;
      }
    });
  }

  function applyHoveredNormal() {
    const el = $('map');
    const h = mapState.hoverTrace;
    const p = mapState.pendingHover;
    if (p === mapState.hovered) return;
    if (h === undefined || !el.data || !el.data[h + 1] || !el._fullLayout || mapState.restyling)
      return;
    mapState.hovered = p;
    const P = PROJ[$('mapProj').value];
    const axes = P ? [P.u, P.v] : axis3();
    const keys = P ? ['x', 'y'] : ['x', 'y', 'z'];
    const line = keys.map(() => []);
    const tipPt = keys.map(() => []);
    if (p) {
      const c = [0, 1, 2].map((d) => (p.tri[0][d] + p.tri[1][d] + p.tri[2][d]) / 3);
      const len = Math.max(10, (parseFloat($('mapSpan').value) || 200) * 0.15);
      const tip = c.map((v, d) => v + p.normal[d] * len);
      [p.tri[0], p.tri[1], p.tri[2], p.tri[0], null, c, tip].forEach((q) =>
        axes.forEach((a, k) => line[k].push(q ? q[a] : null)),
      );
      axes.forEach((a, k) => tipPt[k].push(tip[a]));
    }
    const update = {};
    if (!P) {
      const s = mapState.steps[mapState.idx];
      const at = s ? s.pos : [0, 0, 0];
      if (!p)
        axes.forEach((a, k) => {
          line[k].push(at[a], at[a]);
          tipPt[k].push(at[a]);
        });
      const col = p ? colors().hi : 'rgba(0,0,0,0)';
      update['line.color'] = [col, col];
      update['marker.color'] = [col, col];
    }
    keys.forEach((k, i) => {
      update[k] = [line[i], tipPt[i]];
    });
    syncViewIntoLayout(el);
    mapState.restyling = true;
    Promise.resolve()
      .then(() => Plotly.restyle(el, update, [h, h + 1]))
      .catch(() => null)
      .then(() => {
        mapState.restyling = false;
        if (mapState.pendingHover !== mapState.hovered) {
          clearTimeout(mapState.hoverTimer);
          mapState.hoverTimer = setTimeout(applyHoveredNormal, 30);
        }
      });
  }

  function rememberZoom(e) {
    const proj = $('mapProj').value;
    if (e && Object.keys(e).some((k) => k.startsWith('scene'))) {
      const prev = mapState.cam3d && mapState.cam3d.proj === proj ? mapState.cam3d : null;
      const sc = ($('map').layout && $('map').layout.scene) || {};
      const base = JSON.parse(
        JSON.stringify({
          camera: (prev && prev.camera) || sc.camera || null,
          aspectratio: (prev && prev.aspectratio) || null,
        }),
      );
      Object.keys(e).forEach((k) => {
        if (!k.startsWith('scene.')) return;
        const path = k.slice(6).split('.');
        if (path[0] !== 'camera' && path[0] !== 'aspectratio') return;
        let o = base;
        path.slice(0, -1).forEach((part) => {
          if (!o[part] || typeof o[part] !== 'object') o[part] = {};
          o = o[part];
        });
        o[path[path.length - 1]] = JSON.parse(JSON.stringify(e[k]));
      });
      mapState.cam3d = { proj, camera: base.camera, aspectratio: base.aspectratio };
      saveSoon();
      return;
    }
    const P = PROJ[proj];
    const s = mapState.steps[mapState.idx];
    if (!P || !s || !e) return;
    if (e['xaxis.autorange'] || e['yaxis.autorange']) {
      mapState.zoom = null;
      return;
    }
    const touched = Object.keys(e).some((k) => /^[xy]axis\.range/.test(k));
    const L = $('map').layout;
    if (!touched || !L || !L.xaxis || !L.yaxis) return;
    const xr = L.xaxis.range;
    const yr = L.yaxis.range;
    mapState.zoom = {
      proj,
      w: xr[1] - xr[0],
      h: yr[1] - yr[0],
      du: (xr[0] + xr[1]) / 2 - s.pos[P.u],
      dv: (yr[0] + yr[1]) / 2 - s.pos[P.v],
      abs: [xr.slice(), yr.slice()],
    };
    saveSoon();
  }

  function renderMap3d(s, C) {
    const r = s.r;
    const traces = [];
    mapState.polyTraces = new Map();
    mapState.hovered = null;
    mapState.pendingHover = null;
    clearTimeout(mapState.hoverTimer);
    const m3 = axis3();
    const X = (p) => p[m3[0]];
    const Y = (p) => p[m3[1]];
    const Z = (p) => p[m3[2]];
    const mesh = (list, col, opacity, name) => {
      if (!list.length) return;
      const x = [];
      const y = [];
      const z = [];
      const i = [];
      const j = [];
      const k = [];
      const text = [];
      list.forEach((p) => {
        const b = x.length;
        p.tri.forEach((v) => {
          x.push(X(v));
          y.push(Y(v));
          z.push(Z(v));
          text.push(polyText(p));
        });
        i.push(b);
        j.push(b + 1);
        k.push(b + 2);
      });
      traces.push({
        type: 'mesh3d',
        x,
        y,
        z,
        i,
        j,
        k,
        color: col,
        opacity,
        flatshading: true,
        name,
        showlegend: true,
        text,
        hoverinfo: 'text',
        legendgroup: name,
      });
      mapState.polyTraces.set(traces.length - 1, { list, stride: 3 });
      const ex = [];
      const ey = [];
      const ez = [];
      list.forEach((p) => {
        [0, 1, 2, 0].forEach((n) => {
          ex.push(X(p.tri[n]));
          ey.push(Y(p.tri[n]));
          ez.push(Z(p.tri[n]));
        });
        ex.push(null);
        ey.push(null);
        ez.push(null);
      });
      traces.push({
        type: 'scatter3d',
        mode: 'lines',
        x: ex,
        y: ey,
        z: ez,
        line: { color: opacity > 0.5 ? col : rgba(C.fg, 0.45), width: opacity > 0.5 ? 4 : 2 },
        hoverinfo: 'skip',
        legendgroup: name,
        showlegend: false,
      });
    };
    polyGroups(
      polysOf(r).map((o) => o.p),
      C,
    ).forEach(([name, col, list]) => mesh(list, col, 0.35, name));
    mesh(stepPolys(s), C.fg, 0.85, 'surfaces this step used');
    if ($('mapNormals').checked)
      normalTraces(
        polysOf(r).map((o) => o.p),
        C,
      ).forEach((q) =>
        traces.push(
          {
            type: 'scatter3d',
            mode: 'lines',
            x: q.a.map((p) => (p ? X(p) : null)),
            y: q.a.map((p) => (p ? Y(p) : null)),
            z: q.a.map((p) => (p ? Z(p) : null)),
            line: { color: q.col, width: 3 },
            hoverinfo: 'skip',
            name: q.name,
            legendgroup: q.name,
          },
          {
            type: 'scatter3d',
            mode: 'markers',
            x: q.tips.map(X),
            y: q.tips.map(Y),
            z: q.tips.map(Z),
            marker: { size: 3, color: q.col, symbol: 'diamond' },
            text: q.text,
            hoverinfo: 'text',
            legendgroup: q.name,
            showlegend: false,
          },
        ),
      );
    const trail = mapState.steps.filter((t, i) => t.r === r && i <= mapState.idx).map((t) => t.pos);
    const first = ev(r, 'frame').pos;
    const path = [first, ...trail];
    traces.push({
      type: 'scatter3d',
      mode: 'lines',
      x: path.map(X),
      y: path.map(Y),
      z: path.map(Z),
      line: { color: C.feet, width: 4 },
      hoverinfo: 'skip',
      name: 'this frame so far',
    });
    const ccol = [C.low, C.mid, C.top];
    linkCircles(r).forEach((c, ci) => {
      const ring = [];
      for (let t = 0; t <= 32; t++) {
        const a = (t / 32) * Math.PI * 2;
        ring.push([s.pos[0] + c.r * Math.cos(a), s.pos[1] + c.h, s.pos[2] + c.r * Math.sin(a)]);
      }
      traces.push({
        type: 'scatter3d',
        mode: 'lines',
        x: ring.map(X),
        y: ring.map(Y),
        z: ring.map(Z),
        line: { color: ccol[ci % 3], width: 3 },
        hoverinfo: 'skip',
        name: CIR[ci] + ' circle',
      });
    });
    stepSegments(s).forEach((q) => {
      traces.push({
        type: 'scatter3d',
        mode: 'lines',
        x: [X(q.a), X(q.b)],
        y: [Y(q.a), Y(q.b)],
        z: [Z(q.a), Z(q.b)],
        line: { color: q.on ? C.hi : C.muted, width: q.on ? 5 : 3 },
        text: [q.text, q.text],
        hoverinfo: 'text',
        showlegend: false,
      });
      if (q.cross)
        traces.push({
          type: 'scatter3d',
          mode: 'markers',
          x: [X(q.cross)],
          y: [Y(q.cross)],
          z: [Z(q.cross)],
          marker: { size: 4, color: q.on ? C.hi : C.muted, symbol: 'x' },
          hoverinfo: 'skip',
          showlegend: false,
        });
    });
    const horse3 = horseOverlay(r);
    if (horse3) {
      const hx = [];
      const hy = [];
      const hz = [];
      horse3.circles.forEach((c) => {
        for (let t = 0; t <= 48; t++) {
          const a = (t / 48) * Math.PI * 2;
          const q = [
            horse3.pos[0] + c.r * Math.cos(a),
            horse3.pos[1] + c.h,
            horse3.pos[2] + c.r * Math.sin(a),
          ];
          hx.push(X(q));
          hy.push(Y(q));
          hz.push(Z(q));
        }
        hx.push(null);
        hy.push(null);
        hz.push(null);
      });
      traces.push(
        {
          type: 'scatter3d',
          mode: 'lines',
          x: hx,
          y: hy,
          z: hz,
          line: { color: C.hi, width: 3, dash: 'dash' },
          hoverinfo: 'skip',
          name: 'Epona circles',
          legendgroup: 'epona',
        },
        {
          type: 'scatter3d',
          mode: 'markers',
          x: [X(horse3.pos)],
          y: [Y(horse3.pos)],
          z: [Z(horse3.pos)],
          marker: { size: 5, color: C.hi, symbol: 'diamond' },
          text: [horse3.text],
          hoverinfo: 'text',
          name: 'Epona',
          legendgroup: 'epona',
        },
      );
    }
    const feet3 = ev(r, 'feet');
    if (feet3 && Array.isArray(feet3.feet))
      traces.push({
        type: 'scatter3d',
        mode: 'markers',
        x: feet3.feet.map(X),
        y: feet3.feet.map(Y),
        z: feet3.feet.map(Z),
        marker: { size: 4, color: C.floor, symbol: 'square-open' },
        text: feet3.feet.map((p, i) => `hoof ${i + 1} ground point`),
        hoverinfo: 'text',
        name: 'hoof ground points',
      });
    const centers = circleCenters(r, s.pos);
    if (centers.length)
      traces.push({
        type: 'scatter3d',
        mode: 'markers',
        x: centers.map((q) => X(q.p)),
        y: centers.map((q) => Y(q.p)),
        z: centers.map((q) => Z(q.p)),
        marker: { size: 4, color: centers.map((q) => ccol[q.i % 3]) },
        text: centers.map((q) => q.text),
        hoverinfo: 'text',
        name: 'circle centers',
      });
    traces.push({
      type: 'scatter3d',
      mode: 'markers',
      x: [X(s.pos)],
      y: [Y(s.pos)],
      z: [Z(s.pos)],
      marker: { size: 5, color: C.fg },
      text: [`frame ${r.f}, ${s.label}`],
      hoverinfo: 'text',
      name: ui.actor === 'horse' || r.isHorse ? 'Epona' : 'Link',
    });
    const follow = $('mapFollow').checked;
    const span = Math.max(1, parseFloat($('mapSpan').value) || 200);
    const tall = bodyTop(r);
    const view = Math.max(span, tall + 100);
    const axis = (title, c) =>
      Object.assign(
        {
          title,
          gridcolor: C.grid,
          color: C.muted,
          backgroundcolor: C.panel,
          showbackground: false,
          tickformat: '.0f',
        },
        follow ? { range: [c - view / 2, c + view / 2] } : {},
      );
    const proj = $('mapProj').value;
    const cam = mapState.cam3d && mapState.cam3d.proj === proj ? mapState.cam3d : null;
    const camera = Object.assign(
      { up: { x: 0, y: 0, z: 1 }, eye: { x: 1.3, y: 1.3, z: 1.3 } },
      cam && cam.camera ? cam.camera : {},
      { projection: { type: proj === 'persp' ? 'perspective' : 'orthographic' } },
    );
    mapState.hoverTrace = traces.length;
    traces.push(
      {
        type: 'scatter3d',
        mode: 'lines',
        x: [X(s.pos), X(s.pos)],
        y: [Y(s.pos), Y(s.pos)],
        z: [Z(s.pos), Z(s.pos)],
        line: { color: 'rgba(0,0,0,0)', width: 6 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        type: 'scatter3d',
        mode: 'markers',
        x: [X(s.pos)],
        y: [Y(s.pos)],
        z: [Z(s.pos)],
        marker: { size: 5, color: 'rgba(0,0,0,0)', symbol: 'diamond' },
        hoverinfo: 'skip',
        showlegend: false,
      },
    );
    const el = $('map');
    Plotly.react(
      el,
      traces,
      {
        height: map3dHeight(),
        margin: { l: 0, r: 0, t: 0, b: 0 },
        paper_bgcolor: C.panel,
        font: { family: css('--font-mono') || 'monospace', color: C.fg, size: 11 },
        legend: { orientation: 'h', x: 0, y: 0, font: { size: 10 } },
        hoverlabel: { bgcolor: C.raise, bordercolor: C.act, font: { size: 11, color: C.fg } },
        uirevision: 'map3d-' + $('mapProj').value,
        scene: {
          aspectmode: cam && cam.aspectratio ? 'manual' : follow ? 'cube' : 'data',
          aspectratio: cam && cam.aspectratio ? cam.aspectratio : undefined,
          bgcolor: C.panel,
          camera,
          xaxis: axis('xyz'[m3[0]], X(s.pos)),
          yaxis: axis('xyz'[m3[1]], Y(s.pos)),
          zaxis: axis('y (up)', Z(s.pos) + tall / 2),
          uirevision: 'map3d-' + $('mapProj').value,
        },
      },
      { responsive: true, displaylogo: false },
    );
    hookMapZoom(el);
  }

  function mapStepRef() {
    const s = mapState.steps[mapState.idx];
    return s ? { f: s.r.f, key: s.key } : mapState.restore || null;
  }

  function saveSoon() {
    clearTimeout(mapState.saveTimer);
    mapState.saveTimer = setTimeout(saveSettings, 300);
  }

  function seekTo(i) {
    if (!mapState.steps.length) return;
    mapState.idx = Math.min(Math.max(0, i), mapState.steps.length - 1);
    renderMap();
    saveSoon();
  }

  function seekFrame(dir) {
    const steps = mapState.steps;
    if (!steps.length) return;
    const f = steps[mapState.idx].r.f;
    if (dir > 0) {
      const i = steps.findIndex((s) => s.r.f > f);
      if (i >= 0) seekTo(i);
    } else {
      const startHere = steps.findIndex((s) => s.r.f === f);
      if (mapState.idx > startHere) seekTo(startHere);
      else {
        const prevF = [...steps].reverse().find((s) => s.r.f < f);
        if (prevF) seekTo(steps.findIndex((s) => s.r.f === prevF.r.f));
      }
    }
  }

  function stopPlay() {
    if (mapState.timer) clearInterval(mapState.timer);
    mapState.timer = null;
    $('mapPlay').textContent = 'Play';
  }

  function togglePlay() {
    if (mapState.timer) {
      stopPlay();
      return;
    }
    if (mapState.idx >= mapState.steps.length - 1) mapState.idx = 0;
    $('mapPlay').textContent = 'Pause';
    mapState.timer = setInterval(
      () => {
        if (mapState.idx >= mapState.steps.length - 1) {
          stopPlay();
          return;
        }
        seekTo(mapState.idx + 1);
      },
      Math.max(30, parseInt($('mapSpeed').value, 10) || 250),
    );
  }

  function buildMapControls() {
    $('tabSteps').addEventListener('click', () => setTab('steps'));
    $('tabMap').addEventListener('click', () => setTab('map'));
    $('mapSeek').addEventListener('input', () => seekTo(parseInt($('mapSeek').value, 10)));
    $('mapPrev').addEventListener('click', () => seekTo(mapState.idx - 1));
    $('mapNext').addEventListener('click', () => seekTo(mapState.idx + 1));
    $('mapPrevF').addEventListener('click', () => seekFrame(-1));
    $('mapNextF').addEventListener('click', () => seekFrame(1));
    $('mapPlay').addEventListener('click', togglePlay);
    $('mapNormals').addEventListener('change', () => {
      renderMap();
      saveSettings();
    });
    ['mapProj', 'mapFollow', 'mapSpan', 'mapMirror'].forEach((id) =>
      $(id).addEventListener('change', () => {
        mapState.zoom = null;
        mapState.cam3d = null;
        renderMap();
        saveSettings();
      }),
    );
    $('mapMoved').addEventListener('change', () => {
      buildMapSteps();
      renderMap();
      saveSettings();
    });
    $('mapSpeed').addEventListener('change', () => {
      if (mapState.timer) {
        stopPlay();
        togglePlay();
      }
      saveSettings();
    });
    document.addEventListener('keydown', (e) => {
      if (ui.tab !== 'map' || !log) return;
      const t = e.target;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && t.id !== 'mapSeek') return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) seekFrame(1);
        else seekTo(mapState.idx + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) seekFrame(-1);
        else seekTo(mapState.idx - 1);
      } else if (e.key === ' ' && t.tagName !== 'BUTTON') {
        e.preventDefault();
        togglePlay();
      }
    });
  }

  const SETTINGS_KEY = 'tp-collision-log-viewer.settings';

  function gatherSettings() {
    const s = {
      axes: ui.axes,
      series: {},
      vars: {},
      refs: $('refs').value,
      f0: $('f0').value,
      f1: $('f1').value,
      stepPx: $('stepPx').value,
      stripChecks: $('stripChecks').checked,
      stripState: $('stripState').checked,
      hideUnused: $('hideUnused').checked,
      tab: ui.tab,
      actor: ui.actor,
      map: {
        proj: $('mapProj').value,
        span: $('mapSpan').value,
        follow: $('mapFollow').checked,
        normals: $('mapNormals').checked,
        mirror: $('mapMirror').checked,
        moved: $('mapMoved').checked,
        speed: $('mapSpeed').value,
        step: mapStepRef(),
        zoom: mapState.zoom,
        cam3d: mapState.cam3d,
      },
    };
    SERIES.forEach((x) => {
      s.series[x.id] = $('s_' + x.id).checked;
    });
    VARS.forEach((x) => {
      s.vars[x.id] = $('v_' + x.id).checked;
    });
    return s;
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(gatherSettings()));
    } catch (e) {
      return;
    }
  }

  function loadSettings() {
    let s = null;
    try {
      s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    } catch (e) {
      s = null;
    }
    applySettings(s);
  }

  function applySettings(s) {
    if (!s || typeof s !== 'object') return;
    if (s.axes)
      AXES.forEach((a) => {
        if (s.axes[a]) Object.assign(ui.axes[a], s.axes[a]);
      });
    if (s.series)
      SERIES.forEach((x) => {
        if (typeof s.series[x.id] === 'boolean') $('s_' + x.id).checked = s.series[x.id];
      });
    if (s.vars)
      VARS.forEach((x) => {
        if (typeof s.vars[x.id] === 'boolean') $('v_' + x.id).checked = s.vars[x.id];
      });
    ['stripChecks', 'stripState', 'hideUnused'].forEach((id) => {
      if (typeof s[id] === 'boolean') $(id).checked = s[id];
    });
    if (s.stepPx) {
      $('stepPx').value = s.stepPx;
      $('stepPxOut').textContent = s.stepPx + ' px';
    }
    if (typeof s.refs === 'string') $('refs').value = s.refs;
    if (s.tab === 'steps' || s.tab === 'map') ui.tab = s.tab;
    if (s.actor === 'link' || s.actor === 'horse') {
      ui.actor = s.actor;
      $('actor').value = s.actor;
      if (log) applyActor();
    }
    if (s.map && typeof s.map === 'object') {
      if (s.map.proj) $('mapProj').value = s.map.proj;
      if (s.map.span) $('mapSpan').value = s.map.span;
      if (typeof s.map.follow === 'boolean') $('mapFollow').checked = s.map.follow;
      if (typeof s.map.normals === 'boolean') $('mapNormals').checked = s.map.normals;
      if (typeof s.map.mirror === 'boolean') $('mapMirror').checked = s.map.mirror;
      if (typeof s.map.moved === 'boolean') $('mapMoved').checked = s.map.moved;
      if (s.map.speed) $('mapSpeed').value = s.map.speed;
      if (s.map.step && typeof s.map.step.f === 'number') mapState.restore = s.map.step;
      if (s.map.zoom && typeof s.map.zoom === 'object') mapState.zoom = s.map.zoom;
      if (s.map.cam3d && typeof s.map.cam3d === 'object') mapState.cam3d = s.map.cam3d;
    }
    showTab();
    if (s.f0 !== undefined) $('f0').value = s.f0;
    if (s.f1 !== undefined) $('f1').value = s.f1;
    syncAxisInputs();
  }

  function fileDb() {
    return new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open('tp-collision-log-viewer', 1);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function storeFile(name, text) {
    fileDb()
      .then((db) => {
        db.transaction('files', 'readwrite').objectStore('files').put({ name, text }, 'last');
      })
      .catch(() => null);
  }

  function loadStoredFile() {
    return fileDb()
      .then(
        (db) =>
          new Promise((resolve) => {
            const req = db.transaction('files', 'readonly').objectStore('files').get('last');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          }),
      )
      .catch(() => null);
  }

  function findEvents() {
    const out = [];
    for (const f of log.nums) {
      const fr = log.frames.get(f);
      const lc = (fr.line_cir || []).filter((e) => e.hit);
      if (lc.length)
        lc.forEach((e) =>
          out.push({
            f,
            k: 'hit',
            t:
              CIR[e.i] +
              ' line hit' +
              (e.poly && e.poly.kind
                ? ' (' + (e.poly.kind === 'roof' ? 'ceiling' : e.poly.kind) + ')'
                : '') +
              (e.pass === 'line2' ? ', pass 2' : ''),
          }),
        );
      else if (fr.line1_post && fr.line1_post[0].line_hit && !fr.line_cir)
        out.push({ f, k: 'hit', t: 'line check hit' });
      const bigPushes = (fr.wall_cir || []).filter(
        (e) => flatDistance(e.pos_before, e.pos_after) > 50,
      );
      bigPushes.forEach((e) => {
        const moved = flatDistance(e.pos_before, e.pos_after).toFixed(1);
        const solve = e.cross_a_zero ? ', linear solve' : '';
        out.push({
          f,
          k: 'hit',
          t: `wall push ${moved} (${CIR[e.circle]}, ${kindOf(e.normal)} ${e.poly}${solve})`,
        });
      });
      const beforeWall = fr.line1_post ? fr.line1_post[0] : fr.posmove_post && fr.posmove_post[0];
      if (!bigPushes.length && fr.wall_post && beforeWall) {
        const moved = flatDistance(beforeWall.pos, fr.wall_post[0].pos);
        if (moved > 1)
          out.push({ f, k: moved > 50 ? 'hit' : '', t: `wall push ${moved.toFixed(1)}` });
      }
      const pmB = fr.posmove_post && fr.posmove_post[0];
      const crB = fr.crr_pre && fr.crr_pre[0];
      if (pmB && crB) {
        const moved = flatDistance(pmB.pos, crB.pos);
        const kind = fr.body_check_post ? fr.body_check_post[0].kind : 'wolf/swim';
        if (moved > 1)
          out.push({ f, k: moved > 50 ? 'hit' : '', t: `${kind} check push ${moved.toFixed(1)}` });
      }
      const pm = fr.posmove_post && fr.posmove_post[0];
      const cp = fr.crr_post && fr.crr_post[0];
      if (pm && cp) {
        const dy = cp.pos[1] - pm.pos[1];
        if (Math.abs(dy) > 20)
          out.push({ f, k: 'hit', t: 'collision moved y ' + (dy > 0 ? '+' : '') + dy.toFixed(2) });
      }
      const fe = fr.frame_end && fr.frame_end[0];
      const pre = fr.crr_pre && fr.crr_pre[0];
      const fs = fr.frame && fr.frame[0];
      const horseYReset =
        ui.actor === 'horse' &&
        fe &&
        cp &&
        fs &&
        Math.abs(fe.pos[0] - cp.pos[0]) < 1e-3 &&
        Math.abs(fe.pos[2] - cp.pos[2]) < 1e-3 &&
        Math.abs(fe.pos[1] - fs.pos[1]) < 1e-3;
      if (fe && cp && !same(fe.pos, cp.pos) && !horseYReset)
        out.push({
          f,
          k: '',
          t:
            pre && same(fe.pos, pre.pos) ? 'collision result thrown away' : 'moved after collision',
        });
      if (fr.crr_skip) out.push({ f, k: '', t: 'collision skipped' });
      (fr.aux_line || []).forEach((e) => {
        if (e.hit) out.push({ f, k: '', t: auxLineText(e) });
      });
      const pp = fr.posmove_pre && fr.posmove_pre[0];
      if (pp && fs && flatDistance(fs.pos, pp.pos) + Math.abs(pp.pos[1] - fs.pos[1]) > 1)
        out.push({ f, k: '', t: 'action code moved ' + flatDistance(fs.pos, pp.pos).toFixed(1) });
      (fr.proc || []).forEach((e) =>
        out.push({ f, k: '', t: procName(e.from) + ' to ' + procName(e.to) }),
      );
    }
    return out;
  }

  function renderEvents() {
    const list = $('events');
    list.textContent = '';
    const evs = findEvents();
    if (!evs.length) {
      const li = document.createElement('li');
      li.className = 'note';
      li.textContent = 'None';
      list.appendChild(li);
      return evs;
    }
    evs.slice(0, 400).forEach((e) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const fs = document.createElement('span');
      fs.className = 'f';
      fs.textContent = e.f;
      const ts = document.createElement('span');
      ts.className = e.k === 'hit' ? 'k-hit' : '';
      ts.textContent = e.t;
      b.append(fs, ts);
      b.addEventListener('click', () => {
        mapState.wantFrame = e.f;
        const span = Math.max(0, parseInt($('f1').value, 10) - parseInt($('f0').value, 10) || 4);
        const half = Math.floor(span / 2);
        $('f0').value = e.f - half;
        $('f1').value = e.f - half + span;
        render();
      });
      li.appendChild(b);
      list.appendChild(li);
    });
    return evs;
  }

  function buildControls() {
    const axesEl = $('axes');
    AXES.forEach((a) => {
      const d = document.createElement('div');
      d.className = 'axis';
      d.innerHTML =
        '<label class="name"><input type="checkbox" id="ax_' +
        a +
        '"> ' +
        a.toUpperCase() +
        '</label>' +
        '<span class="lbl">Scale</span><div class="inline"><select id="sc_' +
        a +
        '"><option value="linear">linear</option><option value="symlog">symlog</option><option value="log">log</option></select>' +
        '<input id="th_' +
        a +
        '" type="number" step="any" title="symlog linear range"></div>' +
        '<span class="lbl">Subtract</span><div class="inline"><input id="of_' +
        a +
        '" type="number" step="any"><button class="button small" type="button" id="ofb_' +
        a +
        '">Window start</button></div>';
      axesEl.appendChild(d);
      const sync = () => {
        const s = ui.axes[a];
        s.on = $('ax_' + a).checked;
        s.scale = $('sc_' + a).value;
        s.thr = Math.max(1e-9, parseFloat($('th_' + a).value) || 0.001);
        s.off = parseFloat($('of_' + a).value) || 0;
        $('th_' + a).hidden = s.scale !== 'symlog';
        render();
      };
      ['ax_', 'sc_', 'th_', 'of_'].forEach((p) => $(p + a).addEventListener('change', sync));
      $('ofb_' + a).addEventListener('click', () => {
        if (!log) return;
        const f0 = parseInt($('f0').value, 10);
        const f = log.nums.find((n) => n >= f0);
        if (f === undefined) return;
        $('of_' + a).value = log.frames.get(f).frame[0].pos[AXES.indexOf(a)];
        sync();
      });
    });
    const sEl = $('series');
    SERIES.forEach((s) => {
      const l = document.createElement('label');
      l.innerHTML =
        '<input type="checkbox" id="s_' +
        s.id +
        '"' +
        (s.on ? ' checked' : '') +
        '><span class="swatch" style="background:var(--c-' +
        s.color +
        ')"></span>' +
        s.label;
      sEl.appendChild(l);
      l.querySelector('input').addEventListener('change', render);
    });
    const vEl = $('vars');
    VARS.forEach((v) => {
      const l = document.createElement('label');
      l.innerHTML = '<input type="checkbox" id="v_' + v.id + '"> ' + v.label;
      vEl.appendChild(l);
      l.querySelector('input').addEventListener('change', render);
    });
    ['stripChecks', 'stripState', 'hideUnused'].forEach((id) =>
      $(id).addEventListener('change', render),
    );
    $('refs').addEventListener('input', debounce(render, 400));
    $('stepPx').addEventListener('input', () => {
      $('stepPxOut').textContent = $('stepPx').value + ' px';
      debounced();
    });
    $('stepPxOut').textContent = $('stepPx').value + ' px';
    $('apply').addEventListener('click', render);
    ['f0', 'f1'].forEach((id) =>
      $(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') render();
      }),
    );
    $('prev').addEventListener('click', () => shift(-1));
    $('next').addEventListener('click', () => shift(1));
    $('file').addEventListener('change', (e) => {
      if (e.target.files[0]) readFile(e.target.files[0]);
      e.target.value = '';
    });
    $('export').addEventListener('click', exportView);
    buildMapControls();
    $('actor').addEventListener('change', () => {
      ui.actor = $('actor').value;
      if (!log) return;
      applyActor();
      mapState.steps = [];
      mapState.restore = null;
      mapState.zoom = null;
      renderEvents();
      render();
    });
  }

  function syncAxisInputs() {
    AXES.forEach((a) => {
      const s = ui.axes[a];
      $('ax_' + a).checked = s.on;
      $('sc_' + a).value = s.scale;
      $('th_' + a).value = s.thr;
      $('of_' + a).value = s.off;
      $('th_' + a).hidden = s.scale !== 'symlog';
    });
  }

  function shift(dir) {
    const f0 = parseInt($('f0').value, 10);
    const f1 = parseInt($('f1').value, 10);
    const span = f1 - f0 + 1;
    $('f0').value = f0 + dir * span;
    $('f1').value = f1 + dir * span;
    render();
  }

  function debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
  const debounced = debounce(render, 150);

  function applyActor() {
    if (!log) return;
    const hasHorse = log.actors.horse.nums.length > 0;
    const hasLink = log.actors.link.nums.length > 0;
    $('actor').querySelector('option[value="horse"]').disabled = !hasHorse;
    $('actor').querySelector('option[value="link"]').disabled = !hasLink;
    if (ui.actor === 'horse' && !hasHorse) ui.actor = 'link';
    if (ui.actor === 'link' && !hasLink) ui.actor = 'horse';
    $('actor').value = ui.actor;
    log.frames = log.actors[ui.actor].frames;
    log.nums = log.actors[ui.actor].nums;
  }

  function useLog(text, name) {
    const parsed = parseLog(text);
    if (!parsed.nums.length) {
      $('status').textContent = 'No collision frames in that file.';
      return false;
    }
    log = parsed;
    applyActor();
    current = { name, text };
    $('export').disabled = false;
    $('empty').hidden = true;
    $('meta').textContent =
      name +
      ', ' +
      log.stage +
      ' room ' +
      log.room +
      ', frames ' +
      log.nums[0] +
      '-' +
      log.nums[log.nums.length - 1] +
      (log.actors.horse.nums.length
        ? ', Epona on ' + log.actors.horse.nums.length + ' frames'
        : '') +
      (log.bad ? ', ' + log.bad + ' bad lines' : '');
    const evs = renderEvents();
    return evs;
  }

  function openText(text, name, fresh) {
    const evs = useLog(text, name);
    if (!evs) return;
    if (fresh) {
      mapState.restore = null;
      mapState.zoom = null;
      mapState.steps = [];
      const firstHit = evs.find((e) => e.k === 'hit');
      const c = firstHit ? firstHit.f : log.nums[0] + 2;
      $('f0').value = Math.max(log.nums[0], c - 2);
      $('f1').value = Math.max(log.nums[0], c - 2) + 4;
      storeFile(name, text);
    }
    render();
  }

  function openView(v) {
    applySettings(v.settings);
    const name = v.file.name || 'recording';
    if (!useLog(v.file.text, name)) return;
    storeFile(name, v.file.text);
    render();
    if (v.zoom && typeof v.zoom === 'object' && Object.keys(v.zoom).length)
      Plotly.relayout($('plot'), v.zoom);
  }

  function asView(text) {
    if (!/^\s*\{/.test(text)) return null;
    try {
      const v = JSON.parse(text);
      return v && v.format === VIEW_FORMAT && v.file && typeof v.file.text === 'string' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function exportView() {
    if (!log || !current) return;
    const zoom = {};
    const L = $('plot').layout || {};
    Object.keys(L).forEach((k) => {
      if (/^[xy]axis\d*$/.test(k) && L[k] && Array.isArray(L[k].range))
        zoom[k + '.range'] = L[k].range.slice();
    });
    const view = {
      format: VIEW_FORMAT,
      version: 1,
      settings: gatherSettings(),
      zoom,
      file: current,
    };
    const blob = new Blob([JSON.stringify(view)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      current.name.replace(/\.(jsonl|json|txt)$/i, '') +
      '_f' +
      $('f0').value +
      '-' +
      $('f1').value +
      '.view.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function readFile(file) {
    const fr = new FileReader();
    fr.onload = () => {
      const text = String(fr.result);
      const v = asView(text);
      if (v) openView(v);
      else openText(text, file.name, true);
    };
    fr.onerror = () => {
      $('status').textContent = 'Could not read that file.';
    };
    fr.readAsText(file);
  }

  function setupDrop() {
    let depth = 0;
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      depth++;
      $('drop').hidden = false;
    });
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) $('drop').hidden = true;
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      $('drop').hidden = true;
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) readFile(f);
    });
  }

  function watchTheme() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', render);
    new MutationObserver(render).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    window.addEventListener('resize', debounce(render, 200));
  }

  buildControls();
  loadSettings();
  syncAxisInputs();
  setupDrop();
  watchTheme();
  if (typeof Plotly === 'undefined') {
    $('status').textContent = 'Plotly did not load.';
    return;
  }
  loadStoredFile().then((f) => {
    if (f && typeof f.text === 'string') openText(f.text, f.name, false);
  });
})();
