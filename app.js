(() => {
  const FLY_MASK = 0x40000 | 0x20000 | 0x10000 | 0x800 | 0x40 | 0x10 | 0x2;
  const CIR = ['low', 'mid', 'top'];
  const AXES = ['x', 'y', 'z'];
  const PROCS = window.PROC_NAMES || [];
  const MAX_FRAMES = 400;
  const DIVIDER_FRAMES = 80;
  const $ = (id) => document.getElementById(id);

  const SERIES = [
    { id: 'feet', label: 'Feet (Link position)', color: 'feet', on: true },
    { id: 'c0', label: 'Low wall circle', color: 'low', on: true },
    { id: 'c1', label: 'Mid wall circle', color: 'mid', on: true },
    { id: 'c2', label: 'Top wall circle', color: 'top', on: true },
    { id: 'lines', label: 'Line check lines', color: 'muted', on: false },
    { id: 'surfaces', label: 'Surfaces from the log', color: 'floor', on: true },
    { id: 'push', label: 'Wall push zones', color: 'wall', on: false },
    { id: 'refs', label: 'Reference lines', color: 'ref', on: true },
  ];

  const VARS = [
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
      id: 'wat',
      label: 'Water height',
      get: (r) => ({ clamp: val(ev(r, 'crr_post'), 'water_h') }),
    },
  ];

  const STATE_ROWS = [
    { label: 'jump flag', get: (r) => r.jump },
    { label: 'line ends raised', get: (r) => r.raised },
    { label: 'on ground', get: (r) => flag(ev(r, 'crr_post'), 'ground_hit') },
    { label: 'wall hit', get: (r) => flag(ev(r, 'crr_post'), 'wall_hit') },
    { label: 'ceiling hit', get: (r) => flag(ev(r, 'crr_post'), 'roof_hit') },
    { label: 'line check hit', get: (r) => flag(ev(r, 'crr_post'), 'line_hit') },
    { label: 'in water', get: (r) => flag(ev(r, 'crr_post'), 'water_in') },
  ];

  let log = null;
  let current = null;
  const VIEW_FORMAT = 'tp-collision-log-view';
  const ui = {
    axes: {
      x: { on: true, scale: 'linear', off: 0, thr: 0.001 },
      y: { on: true, scale: 'linear', off: 0, thr: 0.001 },
      z: { on: false, scale: 'linear', off: 0, thr: 0.001 },
    },
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

  function procName(p) {
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
    const nums = [...frames.keys()]
      .sort((a, b) => a - b)
      .filter((f) => frames.get(f).frame && frames.get(f).crr_pre);
    const first = nums.length ? frames.get(nums[0]).frame[0] : null;
    const perCircle = nums.some((f) => frames.get(f).line_cir);
    return {
      frames,
      nums,
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
      const fr = log.frames.get(f);
      const nxt = log.frames.get(f + 1);
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
      rows.push({ f, fr, lines, proc, jump: mode & 2 ? 1 : 0, raised: raised ? 1 : 0 });
    }
    return rows;
  }

  function buildColumns(rows, hideUnused) {
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
      { key: 'move', label: 'movement', check: true },
    ];
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
    const pm = ev(r, 'posmove_post');
    const moved = pm && !same(cur, pm.pos);
    if (pm) cur = pm.pos;
    set('move', cur, moved ? 'hit' : 'ran');
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
    if (gp) {
      set('ground', gp.pos, same(cur, gp.pos) ? 'ran' : 'hit');
      cur = gp.pos;
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
    if (fe) set('end', fe.pos, same(cur, fe.pos) ? 'ran' : 'hit');
    else set('end', cur, 'skipped');
    r.pts = pts;
    r.st = st;
    r.has = has;
    r.labels = labels;
    r.detail = detail;
  }

  function flatDistance(a, b) {
    return Math.hypot(b[0] - a[0], b[2] - a[2]);
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
          label: `${CIR[e.circle]}: ${kindOf(e.normal)} ${e.poly}`,
          detail: wallCirDetail(e),
        });
      } else if (pre && !same(pre.pos, e.pos)) {
        const moved = flatDistance(pre.pos, e.pos).toPrecision(6);
        steps.push({
          pos: e.pos,
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
    const out = [];
    const add = (p, why) => {
      if (p && typeof p === 'object' && p.normal && typeof p.d === 'number') out.push({ p, why });
    };
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
    if ($('stripState').checked) panels.push({ type: 'state', h: 16 * STATE_ROWS.length + 8 });
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
    const procColors = [C.act, C.hi, C.floor, C.wall, C.roof, C.mid, C.low, C.top];
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
      series.forEach((sr) => {
        if (!show[sr.id]) return;
        if (a !== 'y' && sr.id !== 'feet') return;
        const xs = [];
        const ys = [];
        const cd = [];
        rows.forEach((r, j) => {
          cols.forEach((c, ci) => {
            const pt = r.pts[c.key];
            const raw = pt ? pt[ai] + sr.h(r) : null;
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
          line: { color: sr.color, width: 2, shape: 'hv' },
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
      const pm = fr.posmove_post && fr.posmove_post[0];
      const cp = fr.crr_post && fr.crr_post[0];
      if (pm && cp) {
        const dy = cp.pos[1] - pm.pos[1];
        if (Math.abs(dy) > 20)
          out.push({ f, k: 'hit', t: 'collision moved y ' + (dy > 0 ? '+' : '') + dy.toFixed(2) });
      }
      const fe = fr.frame_end && fr.frame_end[0];
      if (fe && cp && !same(fe.pos, cp.pos)) out.push({ f, k: '', t: 'moved after collision' });
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

  function useLog(text, name) {
    const parsed = parseLog(text);
    if (!parsed.nums.length) {
      $('status').textContent = 'No collision frames in that file.';
      return false;
    }
    log = parsed;
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
      (log.bad ? ', ' + log.bad + ' bad lines' : '');
    const evs = renderEvents();
    return evs;
  }

  function openText(text, name, fresh) {
    const evs = useLog(text, name);
    if (!evs) return;
    if (fresh) {
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
