/**
 * AgentUI reference renderer (v1).
 *
 * Renders declarative UI blocks (see spec/wire-protocol.md) into DOM nodes.
 * Zero dependencies; safe for single-file, CSP-strict deployments.
 *
 * Security model — read before modifying:
 *   1. Block payloads are UNTRUSTED DATA. Every payload string reaches the DOM
 *      through textContent (or createElementNS + textContent for SVG), never
 *      innerHTML. The only generated markup is the renderer's own structure.
 *   2. Only catalog components are rendered; anything else is dropped.
 *   3. The download component materializes files client-side from fileText via
 *      Blob. It never fetches URLs found in a block.
 *   4. Every array/string is bounded defensively even though producers should
 *      pre-clip — a misbehaving producer must not be able to blow up a client.
 *
 * Usage (browser):
 *   AgentUI.appendBlocks(logElement, event.data.blocks);
 *   AgentUI.render(block) -> HTMLElement | null
 *
 * @license Apache-2.0
 */
(function (global) {
  "use strict";

  var VERSION = 1;
  var CATALOG = ["keyvalue", "table", "form", "timeline", "compare", "download", "chart", "calendar"];

  // Defensive caps (producers should pre-clip; these are the last line).
  var MAX_ITEMS = 20;
  var MAX_ROWS = 30;
  var MAX_COLS = 10;
  var MAX_CELLS = 200;
  var MAX_DAYS = 10;
  var MAX_SERIES = 3;
  var MAX_POINTS = 16;

  function text(value, limit) {
    if (value === null || value === undefined) return "";
    var s = String(value);
    var cap = limit || MAX_CELLS;
    return s.length > cap ? s.slice(0, cap) + "…" : s;
  }

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function svgEl(tag) {
    return document.createElementNS("http://www.w3.org/2000/svg", tag);
  }

  function cardShell(block, extraClass) {
    var card = el("div", "aub-card" + (extraClass ? " " + extraClass : ""));
    if (block.title) {
      var title = el("div", "aub-card-title");
      title.textContent = text(block.title, 61);
      card.appendChild(title);
    }
    return card;
  }

  // ── keyvalue ───────────────────────────────────────────────────────────

  function renderKeyValue(block) {
    var card = cardShell(block);
    var list = el("dl", "aub-kv");
    var added = 0;
    (block.items || []).forEach(function (item) {
      if (!item || typeof item !== "object" || added >= MAX_ITEMS) return;
      var dt = el("dt");
      dt.textContent = text(item.label, 121);
      var dd = el("dd");
      dd.textContent = item.value === null || item.value === undefined || item.value === ""
        ? "—" : text(item.value, 121);
      list.appendChild(dt);
      list.appendChild(dd);
      added += 1;
    });
    if (!list.children.length) return null;
    card.appendChild(list);
    return card;
  }

  // ── table ──────────────────────────────────────────────────────────────

  function renderTable(block) {
    var columns = (block.columns || []).slice(0, MAX_COLS).map(function (c) { return text(c, 121); });
    var rows = (block.rows || []).slice(0, MAX_ROWS);
    if (!columns.length || !rows.length) return null;
    var card = cardShell(block);
    var table = el("table", "aub-table");
    var thead = el("thead");
    var headRow = el("tr");
    columns.forEach(function (column) {
      var th = el("th");
      th.textContent = column;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = el("tbody");
    rows.forEach(function (row) {
      var tr = el("tr");
      columns.forEach(function (_column, index) {
        var td = el("td");
        var cell = Array.isArray(row) ? row[index] : null;
        td.textContent = cell === null || cell === undefined || cell === "" ? "—" : text(cell, 121);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    return card;
  }

  // ── timeline ───────────────────────────────────────────────────────────

  function renderTimeline(block) {
    var items = (block.items || []).filter(function (i) { return i && typeof i === "object" && i.start; }).slice(0, MAX_ITEMS);
    if (items.length < 2) return null;
    var now = text(block.now, 10);
    var card = cardShell(block);
    var list = el("div", "aub-timeline");
    items.forEach(function (item) {
      var isNow = now && String(item.start) <= now && (!item.end || String(item.end) >= now);
      var row = el("div", "aub-tl-item" + (isNow ? " aub-current" : ""));
      var axis = el("div", "aub-tl-axis");
      axis.appendChild(el("span", "aub-tl-dot"));
      var body = el("div", "aub-tl-body");
      var head = el("div", "aub-tl-head");
      var range = el("span", "aub-tl-range");
      range.textContent = text(item.start, 10) + (item.end ? " → " + text(item.end, 10) : "");
      head.appendChild(range);
      if (item.title) {
        var label = el("span", "aub-tl-title");
        label.textContent = text(item.title, 40);
        head.appendChild(label);
      }
      if (isNow) {
        var tag = el("span", "aub-tl-now");
        tag.textContent = "●";
        head.appendChild(tag);
      }
      body.appendChild(head);
      if (item.note) {
        var note = el("div", "aub-tl-note");
        note.textContent = text(item.note, 60);
        body.appendChild(note);
      }
      row.appendChild(axis);
      row.appendChild(body);
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  // ── compare ────────────────────────────────────────────────────────────

  function scoreColor(score) {
    var n = Number(score) || 0;
    if (n >= 80) return "#2f9e44";
    if (n >= 60) return "#b8860b";
    return "#c92a2a";
  }

  function renderCompare(block) {
    var rows = (block.dimensions || []).filter(function (r) { return r && typeof r === "object" && typeof r.score !== "undefined"; }).slice(0, MAX_ITEMS);
    if (!rows.length) return null;
    var labels = block.labels || {};
    var a = text(labels.personA, 25) || "A";
    var b = text(labels.personB, 25) || "B";
    var card = cardShell(block, "aub-compare");
    if (typeof block.overallScore === "number") {
      var overall = el("div", "aub-cmp-overall");
      var num = el("span", "aub-cmp-score-big");
      num.style.color = scoreColor(block.overallScore);
      num.textContent = String(Math.max(0, Math.min(100, block.overallScore)));
      var caption = el("span", "aub-cmp-caption");
      caption.textContent = block.tier ? text(block.tier, 20) : "";
      overall.appendChild(num);
      overall.appendChild(caption);
      card.appendChild(overall);
    }
    var host = el("div", "aub-cmp-rows");
    rows.forEach(function (row) {
      var wrap = el("div", "aub-cmp-row");
      var meta = el("div", "aub-cmp-meta");
      var name = el("span", "aub-cmp-label");
      name.textContent = text(row.label, 40);
      meta.appendChild(name);
      if (typeof row.personA !== "undefined" || typeof row.personB !== "undefined") {
        var pair = el("span", "aub-cmp-pair");
        pair.textContent = a + " " + text(row.personA, 30) + " ｜ " + b + " " + text(row.personB, 30);
        meta.appendChild(pair);
      }
      var score = el("span", "aub-cmp-score");
      var scoreNum = Math.max(0, Math.min(100, Number(row.score) || 0));
      score.style.color = scoreColor(scoreNum);
      score.textContent = String(scoreNum);
      meta.appendChild(score);
      var bar = el("div", "aub-cmp-bar");
      var fill = el("div", "aub-cmp-fill");
      fill.style.width = scoreNum + "%";
      fill.style.background = scoreColor(scoreNum);
      bar.appendChild(fill);
      wrap.appendChild(meta);
      wrap.appendChild(bar);
      if (row.summary) {
        var summary = el("div", "aub-cmp-summary");
        summary.textContent = text(row.summary, 80);
        wrap.appendChild(summary);
      }
      host.appendChild(wrap);
    });
    card.appendChild(host);
    return card;
  }

  // ── download ───────────────────────────────────────────────────────────

  function renderDownload(block) {
    var fileText = String(block.fileText || "").slice(0, 20000);
    if (!fileText) return null;
    var card = cardShell(block, "aub-download");
    if (block.preview) {
      var preview = el("div", "aub-dl-preview");
      preview.textContent = text(block.preview, 160);
      card.appendChild(preview);
    }
    var row = el("div", "aub-dl-row");
    var btn = el("button", "aub-dl-btn");
    btn.type = "button";
    btn.textContent = text(block.buttonLabel, 30) || "Download";
    btn.addEventListener("click", function () {
      var mime = String(block.mimeType || "text/plain");
      var blob = new Blob([fileText], { type: mime + ";charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = String(block.filename || "report.txt").replace(/[^\w.-]/g, "_").slice(0, 80);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    row.appendChild(btn);
    var note = el("span", "aub-dl-note");
    note.textContent = fileText.length + " chars";
    row.appendChild(note);
    card.appendChild(row);
    return card;
  }

  // ── chart (SVG line / bar, no libraries) ───────────────────────────────

  function renderChart(block) {
    var series = (block.series || []).filter(function (s) { return s && Array.isArray(s.points) && s.points.length >= 2; }).slice(0, MAX_SERIES);
    if (!series.length) return null;
    var card = cardShell(block);
    var W = 460, H = 160, PAD_L = 30, PAD_B = 22, PAD_T = 10;
    var yMin = typeof block.yMin === "number" ? block.yMin : 0;
    var yMax = typeof block.yMax === "number" ? block.yMax : 100;
    var colors = ["#8a6d1f", "#3d7a70", "#7a4a35"];
    var svg = svgEl("svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + (H + 14));
    svg.setAttribute("class", "aub-chart");
    series.forEach(function (se, si) {
      var pts = se.points.slice(0, MAX_POINTS);
      function xPos(i) {
        var span = W - PAD_L - 10;
        return pts.length <= 1 ? PAD_L + span / 2 : PAD_L + (span * i) / (pts.length - 1);
      }
      function yPos(v) {
        var clamped = Math.max(yMin, Math.min(yMax, Number(v) || 0));
        return PAD_T + (H - PAD_B - PAD_T) * (1 - (clamped - yMin) / (yMax - yMin || 1));
      }
      if (si === 0 && String(block.chartType) !== "bar") {
        [0.25, 0.5, 0.75].forEach(function (f) {
          var y = PAD_T + (H - PAD_B - PAD_T) * f;
          var gridline = svgEl("line");
          gridline.setAttribute("x1", PAD_L);
          gridline.setAttribute("x2", W - 10);
          gridline.setAttribute("y1", y);
          gridline.setAttribute("y2", y);
          gridline.setAttribute("stroke", "#f0ebe3");
          svg.appendChild(gridline);
        });
      }
      var color = colors[si % colors.length];
      if (String(block.chartType) === "bar") {
        var barWidth = Math.max(8, (W - PAD_L - 10) / pts.length - 6);
        pts.forEach(function (p, i) {
          var value = Number(p.value != null ? p.value : p.y) || 0;
          var rect = svgEl("rect");
          rect.setAttribute("x", PAD_L + i * ((W - PAD_L - 10) / pts.length) + 3);
          rect.setAttribute("y", yPos(value));
          rect.setAttribute("width", barWidth);
          rect.setAttribute("height", Math.max(1, H - PAD_B - yPos(value)));
          rect.setAttribute("fill", color);
          svg.appendChild(rect);
          var label = svgEl("text");
          label.setAttribute("x", PAD_L + i * ((W - PAD_L - 10) / pts.length) + 3 + barWidth / 2);
          label.setAttribute("y", H - 6);
          label.setAttribute("font-size", "10");
          label.setAttribute("text-anchor", "middle");
          label.setAttribute("fill", "#6b7280");
          label.textContent = text(p.label != null ? p.label : p.x, 12);
          svg.appendChild(label);
        });
      } else {
        var d = pts.map(function (p, i) {
          return (i === 0 ? "M" : "L") + xPos(i).toFixed(1) + "," + yPos(p.y).toFixed(1);
        }).join(" ");
        var path = svgEl("path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-width", "2");
        svg.appendChild(path);
        var last = pts[pts.length - 1];
        var dot = svgEl("circle");
        dot.setAttribute("cx", xPos(pts.length - 1));
        dot.setAttribute("cy", yPos(last.y));
        dot.setAttribute("r", "3");
        dot.setAttribute("fill", color);
        svg.appendChild(dot);
        var lbl = svgEl("text");
        lbl.setAttribute("x", Math.min(xPos(pts.length - 1) + 5, W - 52));
        lbl.setAttribute("y", yPos(last.y) + 4);
        lbl.setAttribute("font-size", "10");
        lbl.setAttribute("fill", "#6b7280");
        lbl.textContent = text(se.label, 40) + (se.reverse ? " ‱" : "");
        svg.appendChild(lbl);
      }
    });
    card.appendChild(svg);
    if (block.note) {
      var note = el("div", "aub-chart-note");
      note.textContent = text(block.note, 200);
      card.appendChild(note);
    }
    return card;
  }

  // ── calendar ───────────────────────────────────────────────────────────

  function renderCalendar(block) {
    var days = (block.days || []).filter(function (d) { return d && typeof d === "object" && d.date; }).slice(0, MAX_DAYS);
    if (!days.length) return null;
    var labels = block.labels || { yi: "宜", ji: "忌", ganZhi: "干支" };
    var card = cardShell(block);
    days.forEach(function (day) {
      var wrap = el("div", "aub-cal-day");
      var head = el("div", "aub-cal-date");
      head.textContent = text(day.date, 12);
      if (day.ganZhi) {
        var gz = el("span", "aub-cal-gz");
        gz.textContent = text(day.ganZhi, 60);
        head.appendChild(gz);
      }
      wrap.appendChild(head);
      [["yi", "aub-cal-yi"], ["ji", "aub-cal-ji"]].forEach(function (pair) {
        if (!day[pair[0]]) return;
        var line = el("div", "aub-cal-line " + pair[1]);
        var tag = el("span", "aub-cal-tag");
        tag.textContent = text(labels[pair[0]] || pair[0], 10);
        line.appendChild(tag);
        var value = el("span");
        value.textContent = text(day[pair[0]], 60);
        line.appendChild(value);
        wrap.appendChild(line);
      });
      card.appendChild(wrap);
    });
    return card;
  }

  // ── form (multi-step, validated client-side; server re-validates) ──────

  function clipValue(value) {
    return String(value == null ? "" : value).trim().slice(0, 120);
  }

  function fieldVisible(field, values) {
    var rule = field.visibleWhen;
    if (!rule || !rule.field) return true;
    var current = values[rule.field];
    if (Array.isArray(rule.in) && rule.in.length) return rule.in.indexOf(current) !== -1;
    if ("equals" in rule) return current === rule.equals;
    return true; // broken rule: show, never silently swallow a field
  }

  function validateField(field, raw) {
    var value = clipValue(raw);
    if (!value) return field.required ? "required" : null;
    if (field.type === "date" && !/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value) && !/^\d{8}$/.test(value)) return "date";
    if (field.type === "time" && !/^\d{1,2}[:：]?\d{0,2}$/.test(value)) return "time";
    if (field.type === "number") {
      var n = Number(value);
      if (value === "" || isNaN(n)) return "number";
      if (typeof field.min === "number" && typeof field.max === "number" && (n < field.min || n > field.max)) return "range";
      if (typeof field.min === "number" && n < field.min) return "range";
      if (typeof field.max === "number" && n > field.max) return "range";
    }
    if (field.type === "select") {
      var ok = (field.options || []).some(function (o) {
        return o && (o.value === value || o.label === value);
      });
      if (!ok) return "select";
    }
    if (typeof field.maxLength === "number" && value.length > field.maxLength) return "too_long";
    if (field.pattern) {
      var re;
      try { re = new RegExp("^(?:" + field.pattern + ")$"); } catch (e) { re = null; }
      if (re && !re.test(value)) return "pattern";
    }
    return null;
  }

  function fieldInput(field, value) {
    var input;
    if (field.type === "select") {
      input = el("select");
      (field.options || []).forEach(function (o) {
        if (!o) return;
        var opt = el("option");
        opt.value = String(o.value);
        opt.textContent = String(o.label != null ? o.label : o.value);
        input.appendChild(opt);
      });
      input.value = value == null ? "" : String(value);
    } else {
      input = el("input");
      input.type = field.type === "number" ? "number" : "text";
      if (field.type === "number") input.step = "any";
      if (field.hint) input.placeholder = String(field.hint);
      input.value = value == null ? "" : String(value);
    }
    return input;
  }

  /**
   * Render a form block.
   * opts.onSubmit(values) is called after ALL steps validate and a final
   * whole-form re-validation passes (a back-edit can invalidate earlier steps).
   */
  function renderForm(block, opts) {
    opts = opts || {};
    var fields = (block.fields || []).filter(function (f) { return f && f.name; }).slice(0, MAX_ITEMS);
    if (!fields.length) return null;
    var totalSteps = Math.max(1, Math.min(5, block.steps || 1));
    var state = { step: 1, values: {}, errors: {} };
    var card = cardShell(block, "aub-form");
    var body = el("div", "aub-form-body");
    var errBox = el("div", "aub-form-err");
    var nav = el("div", "aub-form-nav");
    card.appendChild(body);
    card.appendChild(errBox);
    card.appendChild(nav);

    function visibleFields() {
      return fields.filter(function (f) { return fieldVisible(f, state.values); });
    }
    function draw() {
      body.textContent = "";
      errBox.textContent = "";
      var shown = visibleFields().filter(function (f) { return (f.step || 1) === state.step; });
      if (totalSteps > 1) {
        var indicator = el("div", "aub-form-progress");
        indicator.textContent = state.step + " / " + totalSteps;
        body.appendChild(indicator);
      }
      shown.forEach(function (field) {
        var wrap = el("div", "aub-field");
        var label = el("label");
        label.textContent = String(field.label || field.name) + (field.required ? " *" : "");
        wrap.appendChild(label);
        var input = fieldInput(field, state.values[field.name]);
        input.id = "aub-f-" + String(field.name).replace(/[^A-Za-z0-9_]/g, "");
        input.addEventListener("input", function () {
          state.values[field.name] = input.value;
        });
        wrap.appendChild(input);
        if (field.hint) {
          var hint = el("div", "aub-field-hint");
          hint.textContent = String(field.hint);
          wrap.appendChild(hint);
        }
        var fieldErr = el("div", "aub-field-err");
        fieldErr.textContent = state.errors[field.name] || "";
        wrap.appendChild(fieldErr);
        body.appendChild(wrap);
      });
      drawNav();
    }
    function collectStep() {
      visibleFields().forEach(function (field) {
        var node = document.getElementById("aub-f-" + String(field.name).replace(/[^A-Za-z0-9_]/g, ""));
        if (node) state.values[field.name] = node.value;
      });
    }
    function stepValid() {
      var ok = true;
      state.errors = {};
      visibleFields().forEach(function (field) {
        var error = validateField(field, state.values[field.name]);
        if (error) { state.errors[field.name] = error; ok = false; }
      });
      return ok;
    }
    function drawNav() {
      nav.textContent = "";
      if (state.step > 1) {
        var back = el("button", "aub-btn-ghost");
        back.type = "button";
        back.textContent = "←";
        back.addEventListener("click", function () {
          collectStep();
          state.step -= 1;
          draw();
        });
        nav.appendChild(back);
      }
      var next = el("button", "aub-btn");
      next.type = "button";
      next.textContent = state.step < totalSteps ? "→" : (opts.submitLabel || block.submitLabel || "✓");
      next.addEventListener("click", function () {
        collectStep();
        if (!stepValid()) { draw(); return; }
        if (state.step < totalSteps) { state.step += 1; draw(); return; }
        // Final whole-form re-validation: an earlier step may have been
        // invalidated by a conditional change made in a later step.
        state.errors = {};
        var firstBadStep = 0;
        visibleFields().forEach(function (field) {
          var error = validateField(field, state.values[field.name]);
          if (error && !firstBadStep) firstBadStep = field.step || 1;
          if (error) state.errors[field.name] = error;
        });
        if (Object.keys(state.errors).length) {
          if (firstBadStep) state.step = firstBadStep;
          draw();
          return;
        }
        next.disabled = true;
        if (typeof opts.onSubmit === "function") opts.onSubmit(state.values);
      });
      nav.appendChild(next);
    }
    draw();
    card.__agentuiValues = function () { collectStep(); return state.values; };
    return card;
  }

  // ── public API ─────────────────────────────────────────────────────────

  function render(block, formOpts) {
    if (!block || CATALOG.indexOf(block.component) === -1) return null;
    switch (block.component) {
      case "keyvalue": return renderKeyValue(block);
      case "table": return renderTable(block);
      case "form": return renderForm(block, formOpts);
      case "timeline": return renderTimeline(block);
      case "compare": return renderCompare(block);
      case "download": return renderDownload(block);
      case "chart": return renderChart(block);
      case "calendar": return renderCalendar(block);
      default: return null;
    }
  }

  function appendBlocks(container, blocks, formOpts) {
    if (!container) return;
    (Array.isArray(blocks) ? blocks : []).forEach(function (block) {
      var node = render(block, formOpts);
      if (node) container.appendChild(node);
    });
  }

  /** SSE event data → safe render. Events above the supported version are dropped whole. */
  function handleEventData(container, data, formOpts) {
    if (!data || typeof data !== "object") return false;
    var eventVersion = data.uiVersion || 1;
    if (eventVersion > VERSION) return false;
    appendBlocks(container, data.blocks, formOpts);
    return true;
  }

  /** Minimal stylesheet a host may copy; classes are aub-* prefixed to avoid collisions. */
  var CSS = ".aub-card{background:#fff;border:1px solid #ebe6de;border-left:3px solid #b8860b;border-radius:12px;padding:12px 14px;margin:0 auto 16px;max-width:82%}"
    + ".aub-card-title{font-size:12.5px;color:#6b7280;margin-bottom:8px;font-weight:600}"
    + ".aub-kv{margin:0;display:grid;grid-template-columns:minmax(88px,auto) 1fr;gap:4px 12px}"
    + ".aub-kv dt{font-size:12.5px;color:#6b7280}.aub-kv dd{margin:0;font-size:13.5px}"
    + ".aub-table{border-collapse:collapse;width:100%;font-size:13px}"
    + ".aub-table th,.aub-table td{border:1px solid #e7e2da;padding:5px 8px;text-align:left;vertical-align:top;word-break:break-word}"
    + ".aub-table th{background:#faf7f2;font-weight:600}"
    + ".aub-timeline{display:flex;flex-direction:column}"
    + ".aub-tl-item{display:flex;gap:10px}"
    + ".aub-tl-axis{display:flex;flex-direction:column;align-items:center;min-width:12px}"
    + ".aub-tl-axis::after{content:'';flex:1;width:2px;background:#e7e2da}"
    + ".aub-tl-item:last-child .aub-tl-axis::after{display:none}"
    + ".aub-tl-dot{width:10px;height:10px;border-radius:50%;background:#d8cfc0;margin-top:4px}"
    + ".aub-tl-item.aub-current .aub-tl-dot{background:#b8860b;box-shadow:0 0 0 3px rgba(184,134,11,.18)}"
    + ".aub-tl-body{flex:1;padding-bottom:14px}"
    + ".aub-tl-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}"
    + ".aub-tl-range{font-size:12px;color:#6b7280;font-variant-numeric:tabular-nums}"
    + ".aub-tl-title{font-size:13.5px;font-weight:600}"
    + ".aub-tl-now{font-size:11px;color:#b8860b}"
    + ".aub-tl-note{font-size:12.5px;color:#6b7280;margin-top:2px}"
    + ".aub-cmp-overall{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}"
    + ".aub-cmp-score-big{font-size:22px;font-weight:700}"
    + ".aub-cmp-row{margin-bottom:10px}"
    + ".aub-cmp-meta{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}"
    + ".aub-cmp-label{font-size:13.5px;font-weight:600}"
    + ".aub-cmp-pair{font-size:12px;color:#6b7280}"
    + ".aub-cmp-score{font-size:13px;margin-left:auto}"
    + ".aub-cmp-bar{height:6px;border-radius:999px;background:#f0ebe3;margin:4px 0 2px;overflow:hidden}"
    + ".aub-cmp-fill{height:100%;border-radius:999px}"
    + ".aub-cmp-summary{font-size:12.5px;color:#6b7280}"
    + ".aub-dl-preview{font-size:12.5px;color:#6b7280;margin-bottom:8px;white-space:pre-wrap;word-break:break-word}"
    + ".aub-dl-row{display:flex;align-items:baseline;gap:10px}"
    + ".aub-dl-btn{padding:8px 16px;border:0;border-radius:10px;background:#b8860b;color:#fff;font:inherit;font-weight:600;cursor:pointer}"
    + ".aub-dl-note{font-size:11.5px;color:#9ca3af}"
    + ".aub-chart{width:100%;height:auto}"
    + ".aub-chart-note{font-size:11.5px;color:#9ca3af;margin-top:6px}"
    + ".aub-cal-day{padding:6px 0;border-bottom:1px dashed #eee7dc}"
    + ".aub-cal-day:last-child{border-bottom:0}"
    + ".aub-cal-date{font-size:13px;font-weight:600}"
    + ".aub-cal-gz{margin-left:8px;font-size:12px;color:#6b7280;font-weight:400}"
    + ".aub-cal-line{font-size:12.5px;margin-top:2px}"
    + ".aub-cal-tag{display:inline-block;min-width:28px;font-size:11px;border-radius:4px;text-align:center;margin-right:6px;padding:0 4px}"
    + ".aub-cal-yi .aub-cal-tag{background:#e8f5e9;color:#2f9e44}"
    + ".aub-cal-ji .aub-cal-tag{background:#fdecea;color:#c92a2a}"
    + ".aub-field{margin-bottom:12px}"
    + ".aub-field label{display:block;font-size:12.5px;color:#6b7280;margin-bottom:5px}"
    + ".aub-field input,.aub-field select{width:100%;padding:10px 12px;border:1px solid #ddd6cb;border-radius:10px;font:inherit;background:#fff;box-sizing:border-box}"
    + ".aub-field-hint{font-size:11.5px;color:#9ca3af;margin-top:4px}"
    + ".aub-field-err{color:#b91c1c;font-size:12px;min-height:16px;margin-top:3px}"
    + ".aub-form-progress{font-size:12px;color:#6b7280;margin-bottom:10px}"
    + ".aub-form-err{color:#b91c1c;font-size:12.5px;min-height:16px;margin:6px 0}"
    + ".aub-form-nav{display:flex;gap:10px;margin-top:8px}"
    + ".aub-btn{padding:10px 20px;border:0;border-radius:10px;background:#b8860b;color:#fff;font:inherit;font-weight:600;cursor:pointer}"
    + ".aub-btn:disabled{opacity:.5;cursor:not-allowed}"
    + ".aub-btn-ghost{padding:10px 14px;border:0;border-radius:10px;background:transparent;color:#6b7280;font:inherit;cursor:pointer}";

  global.AgentUI = {
    VERSION: VERSION,
    CATALOG: CATALOG.slice(),
    render: render,
    appendBlocks: appendBlocks,
    handleEventData: handleEventData,
    CSS: CSS,
  };
})(typeof window !== "undefined" ? window : globalThis);
