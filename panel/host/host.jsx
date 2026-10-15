// Claude Bridge — ExtendScript side (ES3). Loaded once by the CEP panel.
// __aeb.call(fn, args) is the only entry point; AEH.* helpers are global for run_jsx code.

var AEH = AEH || {};

(function () {
    // ---------- JSON (ExtendScript has no native JSON) ----------
    function esc(s) {
        return '"' + String(s).replace(/[\\"\u0000-\u001f\u2028\u2029]/g, function (c) {
            var m = { '"': '\\"', "\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
            return m[c] || "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }
    function json(v, depth) {
        depth = depth || 0;
        if (depth > 40) return '"[depth limit]"';
        if (v === null || v === undefined) return "null";
        var t = typeof v;
        if (t === "number") return isFinite(v) ? String(v) : "null";
        if (t === "boolean") return String(v);
        if (t === "string") return esc(v);
        if (t === "function") return "null";
        if (v instanceof Array) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(json(v[i], depth + 1));
            return "[" + a.join(",") + "]";
        }
        if (v.constructor !== Object) {           // AE DOM objects: describe, don't recurse
            var d = "[" + (v.reflect ? v.reflect.name : "object") + "]";
            try { if (v.name !== undefined) d += " " + v.name; } catch (e) {}
            return esc(d);
        }
        var o = [];
        for (var k in v) if (v.hasOwnProperty(k)) o.push(esc(k) + ":" + json(v[k], depth + 1));
        return "{" + o.join(",") + "}";
    }
    AEH.json = json;

    // ---------- helpers for run_jsx code ----------
    AEH.hex = function (h) {
        h = h.replace("#", "");
        return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
    };
    // Comp by name, by item id, or the active comp.
    AEH.comp = function (nameOrId) {
        if (nameOrId === undefined || nameOrId === null || nameOrId === "") {
            var a = app.project.activeItem;
            if (a instanceof CompItem) return a;
            throw new Error("No active composition — pass a comp name.");
        }
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && (it.name === nameOrId || it.id === nameOrId)) return it;
        }
        throw new Error("Composition not found: " + nameOrId);
    };
    AEH.layer = function (comp, nameOrIndex) {
        var l = typeof nameOrIndex === "number" ? comp.layer(nameOrIndex) : comp.layers.byName(nameOrIndex);
        if (!l) throw new Error("Layer not found: " + nameOrIndex);
        return l;
    };
    // Property by slash path of match names or display names: AEH.prop(layer, "ADBE Transform Group/ADBE Position")
    AEH.prop = function (layer, path) {
        var parts = path.split("/"), p = layer;
        for (var i = 0; i < parts.length; i++) {
            var next = p.property(parts[i]);
            if (!next) {   // tell the caller what exists here so it can self-correct
                var kids = [];
                try { for (var k = 1; k <= p.numProperties && kids.length < 40; k++) kids.push(p.property(k).matchName + " (" + p.property(k).name + ")"); } catch (e) {}
                throw new Error("Property not found: " + parts.slice(0, i + 1).join("/") + ". Children here: " + kids.join(", "));
            }
            p = next;
        }
        return p;
    };
    // Layers by "selected" | "all" | /regex/ | "regex string" | [names or indices].
    AEH.layers = function (comp, sel) {
        var out = [], i;
        if (sel === "selected") return comp.selectedLayers;
        if (sel instanceof Array) { for (i = 0; i < sel.length; i++) out.push(AEH.layer(comp, sel[i])); return out; }
        var re = null;   // NB: ExtendScript mis-parses chained ?: — always parenthesize or use if/else
        if (sel !== "all" && sel !== undefined) re = sel instanceof RegExp ? sel : new RegExp(sel, "i");
        for (i = 1; i <= comp.numLayers; i++) if (!re || re.test(comp.layer(i).name)) out.push(comp.layer(i));
        return out;
    };
    // Ease all keyframes of a property (influence %, speed 0). Dimension-aware.
    AEH.ease = function (prop, infl, speed) {
        var t = prop.propertyValueType, dims = 1;
        if (t === PropertyValueType.TwoD) dims = 2;
        if (t === PropertyValueType.ThreeD) dims = 3;
        var e = [];
        for (var d = 0; d < dims; d++) e.push(new KeyframeEase(speed || 0, infl === undefined ? 75 : infl));
        for (var k = 1; k <= prop.numKeys; k++) prop.setTemporalEaseAtKey(k, e, e);
        return prop;
    };
    // Set keyframes from [[time, value], ...] and ease them.
    AEH.keys = function (prop, pairs, infl) {
        for (var i = 0; i < pairs.length; i++) prop.setValueAtTime(pairs[i][0], pairs[i][1]);
        return AEH.ease(prop, infl);
    };
    AEH.importFile = function (path) {
        var f = new File(path);
        if (!f.exists) throw new Error("File not found: " + path);
        return app.project.importFile(new ImportOptions(f));
    };
    // Installed effects (incl. third-party): "matchName | displayName | category", optionally filtered.
    AEH.listEffects = function (filter) {
        var out = [], re = filter ? new RegExp(filter, "i") : null;
        for (var i = 0; i < app.effects.length; i++) {
            var e = app.effects[i], line = e.matchName + " | " + e.displayName + " | " + e.category;
            if (!re || re.test(line)) out.push(line);
        }
        return out;
    };

    // Catalog: "fonts" | "presets" | "templates" (render/output-module) with optional regex filter. Effects: AEH.listEffects.
    AEH.catalog = function (kind, filter) {
        var re = filter ? new RegExp(filter, "i") : null, out = [], i, j;
        var keep = function (s) { if (!re || re.test(s)) out.push(s); };
        if (kind === "fonts") {
            var fams = app.fonts.allFonts;
            for (i = 0; i < fams.length && out.length < 300; i++) for (j = 0; j < fams[i].length; j++) keep(fams[i][j].postScriptName);
        } else if (kind === "presets") {
            var walk = function (f, depth) {
                if (depth > 6 || out.length > 300) return;
                var items = f.getFiles();
                for (var k = 0; k < items.length; k++) {
                    if (items[k] instanceof Folder) walk(items[k], depth + 1);
                    else if (/\.ffx$/i.test(items[k].name)) keep(items[k].fsName);
                }
            };
            walk(new Folder(Folder.appPackage.fsName + "/Presets"), 0);
            var user = new Folder(Folder.myDocuments.fsName + "/Adobe"); if (user.exists) walk(user, 0);
        } else if (kind === "templates") {
            var tmp = app.project.items.addComp("__tpl_tmp", 16, 16, 1, 1, 1), rq = app.project.renderQueue.items.add(tmp);
            try {
                for (i = 0; i < rq.templates.length; i++) keep("render: " + rq.templates[i]);
                for (i = 0; i < rq.outputModule(1).templates.length; i++) keep("output: " + rq.outputModule(1).templates[i]);
            } finally { rq.remove(); tmp.remove(); }
        } else throw new Error("catalog kind: fonts | presets | templates (effects: AEH.listEffects)");
        return out;
    };
    AEH.applyPreset = function (layer, ffxPath) {
        var f = new File(ffxPath); if (!f.exists) throw new Error("Preset not found: " + ffxPath);
        layer.applyPreset(f); return layer;
    };

    // ---------- pro motion library ----------
    function dimsOf(prop) {
        var t = prop.propertyValueType;
        if (t === PropertyValueType.ThreeD) return 3;
        if (t === PropertyValueType.TwoD) return 2;
        return 1;
    }
    function easeArr(prop, infl) {
        var e = [];
        for (var d = 0; d < dimsOf(prop); d++) e.push(new KeyframeEase(0, infl));
        return e;
    }
    // Named curves: [outgoing influence of a segment's first key, incoming influence of its last key].
    AEH.CURVES = { ease: [33, 33], smooth: [75, 75], out: [15, 85], "in": [85, 15], expo: [92, 92], snap: [8, 96] };
    AEH.curve = function (prop, name) {
        if (name === "linear" || name === "hold") {
            var it = name === "hold" ? KeyframeInterpolationType.HOLD : KeyframeInterpolationType.LINEAR;
            for (var i = 1; i <= prop.numKeys; i++) prop.setInterpolationTypeAtKey(i, it, it);
            return prop;
        }
        var c = AEH.CURVES[name || "smooth"];
        if (!c) throw new Error("Unknown curve " + name + " (ease, smooth, out, in, expo, snap, linear, hold)");
        for (var k = 1; k <= prop.numKeys; k++) prop.setTemporalEaseAtKey(k, easeArr(prop, c[1]), easeArr(prop, c[0]));
        return prop;
    };
    // Keyframes + named curve in one call: AEH.anim(prop, [[0, 0], [0.6, 100]], "out")
    AEH.anim = function (prop, pairs, curveName) {
        for (var i = 0; i < pairs.length; i++) prop.setValueAtTime(pairs[i][0], pairs[i][1]);
        return AEH.curve(prop, curveName || "smooth");
    };

    // Expression presets applied to a property.
    AEH.expr = function (prop, preset, o) {
        o = o || {};
        var lib = {
            wiggle: "wiggle(" + (o.freq || 2) + "," + (o.amp || 20) + ")",
            bounce: "var amp=" + (o.amp || 0.06) + ",freq=" + (o.freq || 3) + ",decay=" + (o.decay || 6) + ",n=0,t=0;" +
                "if(numKeys>0){n=nearestKey(time).index;if(key(n).time>time)n--;}" +
                "if(n>0){t=time-key(n).time;}" +
                "if(n>0&&t<1){var v=velocityAtTime(key(n).time-thisComp.frameDuration/10);value+v*amp*Math.sin(freq*t*2*Math.PI)/Math.exp(decay*t);}else{value}",
            loop: 'loopOut("cycle")',
            pingpong: 'loopOut("pingpong")',
            spin: "value+time*" + (o.speed || 90),
            follow: 'thisComp.layer("' + o.leader + '").transform.' + (o.prop || "position") +
                ".valueAtTime(time-framesToTime(" + (o.frames || 3) + "))",
            blink: "Math.round(time*" + (o.freq || 2) + ")%2==0?100:0"
        };
        if (!lib[preset]) throw new Error("Unknown expression preset " + preset);
        prop.expression = lib[preset];
        return prop;
    };

    AEH.font = function (names) {
        for (var i = 0; i < names.length; i++) {
            try { if (app.fonts.getFontsByPostScriptName(names[i]).length) return names[i]; } catch (e) { return names[i]; }
        }
        return "ArialMT";
    };
    // Text layer, anchored at its visual center. o: font|fonts[], size, color, tracking, leading, justify, pos, name, start
    AEH.text = function (comp, str, o) {
        o = o || {};
        var l = comp.layers.addText(str), tp = l.property("ADBE Text Properties").property("ADBE Text Document"), td = tp.value;
        td.resetCharStyle();
        td.font = o.font || AEH.font(o.fonts || ["Montserrat-Bold", "Poppins-SemiBold", "Inter-Bold", "SegoeUI-Bold"]);
        td.fontSize = o.size || 120;
        td.applyFill = true; td.fillColor = AEH.hex(o.color || "#FFFFFF"); td.applyStroke = false;
        td.tracking = o.tracking || 0;
        if (o.leading) { td.autoLeading = false; td.leading = o.leading; }
        td.justification = ParagraphJustification.CENTER_JUSTIFY;
        if (o.justify === "left") td.justification = ParagraphJustification.LEFT_JUSTIFY;
        if (o.justify === "right") td.justification = ParagraphJustification.RIGHT_JUSTIFY;
        tp.setValue(td);
        var r = l.sourceRectAtTime(0, false), tr = l.property("ADBE Transform Group");
        tr.property("ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        tr.property("ADBE Position").setValue(o.pos || [comp.width / 2, comp.height / 2]);
        if (o.name) l.name = o.name;
        if (o.start) l.startTime = o.start;
        return l;
    };
    // Per-character/word/line text animation presets: rise, pop, blur, typewriter, fade, tracking, drop.
    // o: start(s), dur(s), curve, by ("char"|"word"|"line"), amount
    AEH.textAnim = function (layer, preset, o) {
        o = o || {};
        var t0 = o.start || 0, t1 = t0 + (o.dur || 0.8);
        var presets = { rise: 1, drop: 1, pop: 1, blur: 1, fade: 1, typewriter: 1, tracking: 1 };
        if (!presets[preset]) throw new Error("Unknown text preset " + preset + " (rise, drop, pop, blur, fade, typewriter, tracking)");
        var amt = o.amount;
        // Order matters: add animator properties BEFORE the selector — adding properties invalidates older references.
        var a = layer.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
        a.name = preset;
        var p = a.property("ADBE Text Animator Properties");
        if (preset === "tracking") p.addProperty("ADBE Text Tracking Amount").setValue(amt === undefined ? 300 : amt);
        if (preset === "rise") { p.addProperty("ADBE Text Position 3D").setValue([0, amt || 120, 0]); p.addProperty("ADBE Text Blur").setValue([0, 25]); }
        if (preset === "drop") p.addProperty("ADBE Text Position 3D").setValue([0, -(amt || 120), 0]);
        if (preset === "pop") p.addProperty("ADBE Text Scale 3D").setValue([amt || 0, amt || 0, 100]);
        if (preset === "blur") { p.addProperty("ADBE Text Blur").setValue([amt || 60, amt || 60]); p.addProperty("ADBE Text Scale 3D").setValue([115, 115, 100]); }
        if (preset !== "tracking") p.addProperty("ADBE Text Opacity").setValue(0);
        var sel = a.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
        var adv = sel.property("ADBE Text Range Advanced");
        adv.property("ADBE Text Range Type2").setValue(o.by === "word" ? 3 : (o.by === "line" ? 4 : 2));
        if (preset === "typewriter") {
            AEH.anim(sel.property("ADBE Text Percent Start"), [[t0, 0], [t1, 100]], "linear");
        } else if (preset === "tracking") {
            // selector covers everything; animate the selector's amount from 100% (spread) to 0% (normal)
            AEH.anim(adv.property("ADBE Text Selector Max Amount"), [[t0, 100], [t1, 0]], o.curve || "out");
            AEH.anim(layer.property("ADBE Transform Group").property("ADBE Opacity"), [[t0, 0], [t0 + (t1 - t0) * 0.5, 100]], "smooth");
        } else {
            adv.property("ADBE Text Range Shape").setValue(2); // ramp up
            AEH.anim(sel.property("ADBE Text Percent Offset"), [[t0, -100], [t1, 100]], o.curve || "out");
        }
        return layer;
    };

    // Shape layer with one group. kind: rect|ellipse|star|path. o: size, radius, points, outer, inner,
    // vertices/inTangents/outTangents/closed (path), fill, stroke, width, cap ("round"), pos, name
    AEH.shape = function (comp, kind, o) {
        o = o || {};
        var l = comp.layers.addShape();
        l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group").name = kind;
        // Re-fetch the contents group before every add: addProperty can invalidate earlier references.
        var c = { addProperty: function (m) { return l.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").addProperty(m); } };
        var s;
        if (kind === "rect") {
            s = c.addProperty("ADBE Vector Shape - Rect");
            s.property("ADBE Vector Rect Size").setValue(o.size || [400, 200]);
            if (o.radius) s.property("ADBE Vector Rect Roundness").setValue(o.radius);
        } else if (kind === "ellipse") {
            c.addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue(o.size || [200, 200]);
        } else if (kind === "star") {
            s = c.addProperty("ADBE Vector Shape - Star");
            s.property("ADBE Vector Star Type").setValue(o.polygon ? 2 : 1);
            s.property("ADBE Vector Star Points").setValue(o.points || 5);
            s.property("ADBE Vector Star Outer Radius").setValue(o.outer || 100);
            if (!o.polygon) s.property("ADBE Vector Star Inner Radius").setValue(o.inner || 45);
        } else if (kind === "path") {
            var sh = new Shape();
            sh.vertices = o.vertices; sh.closed = !!o.closed;
            if (o.inTangents) sh.inTangents = o.inTangents;
            if (o.outTangents) sh.outTangents = o.outTangents;
            c.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(sh);
        } else throw new Error("Unknown shape kind " + kind);
        if (o.fill) c.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(AEH.hex(o.fill));
        if (o.stroke) {
            var st = c.addProperty("ADBE Vector Graphic - Stroke");
            st.property("ADBE Vector Stroke Color").setValue(AEH.hex(o.stroke));
            st.property("ADBE Vector Stroke Width").setValue(o.width || 8);
            if (o.cap !== "butt") st.property("ADBE Vector Stroke Line Cap").setValue(2);
        }
        l.property("ADBE Transform Group").property("ADBE Position").setValue(o.pos || [comp.width / 2, comp.height / 2]);
        if (o.name) l.name = o.name;
        return l;
    };
    // Animate a stroke drawing on (Trim Paths placed right after the path, before fill/stroke).
    AEH.drawOn = function (layer, t0, t1, curveName, groupIndex) {
        var grp = function () { return layer.property("ADBE Root Vectors Group").property(groupIndex || 1).property("ADBE Vectors Group"); };
        grp().addProperty("ADBE Vector Filter - Trim").moveTo(2);
        var tr = grp().property(2);
        AEH.anim(tr.property("ADBE Vector Trim End"), [[t0, 0], [t1, 100]], curveName || "out");
        return tr;
    };
    // Background solid with linear/radial gradient, sent to the bottom.
    AEH.bg = function (comp, inner, outer, kind) {
        var s = comp.layers.addSolid([0, 0, 0], "BG", comp.width, comp.height, comp.pixelAspect || 1);
        var r = s.property("ADBE Effect Parade").addProperty("ADBE Ramp");
        var radial = kind !== "linear";
        r.property(1).setValue(radial ? [comp.width / 2, comp.height / 2] : [comp.width / 2, 0]);
        r.property(2).setValue(AEH.hex(inner || "#1C2233"));
        r.property(3).setValue(radial ? [comp.width / 2, comp.height * 1.3] : [comp.width / 2, comp.height]);
        r.property(4).setValue(AEH.hex(outer || "#06070A"));
        r.property(5).setValue(radial ? 2 : 1);
        s.moveToEnd();
        return s;
    };
    // Add an effect and set its params by name or match name: AEH.fx(l, "ADBE Glo2", {"Glow Radius": 40})
    AEH.fx = function (layer, matchName, params) {
        var e = layer.property("ADBE Effect Parade").addProperty(matchName);
        if (!e) throw new Error("Effect not available: " + matchName);
        for (var k in params) if (params.hasOwnProperty(k)) {
            var p = e.property(k);
            if (!p) throw new Error("Effect " + matchName + " has no param " + k);
            p.setValue(params[k]);
        }
        return e;
    };
    AEH.precompose = function (comp, layerIndices, name) { return comp.layers.precompose(layerIndices, name, true); };
    // Offset layers' timing by `frames` each, starting at `start` seconds (cascading entrances).
    AEH.stagger = function (layers, frames, start) {
        var fd = layers[0].containingComp.frameDuration;
        for (var i = 0; i < layers.length; i++) layers[i].startTime = (start || 0) + i * frames * fd;
        return layers;
    };
    AEH.marker = function (layer, t, comment) {
        layer.property("ADBE Marker").setValueAtTime(t, new MarkerValue(comment || ""));
    };
    AEH.audio = function (comp, path, t, db) {
        var l = comp.layers.add(AEH.importFile(path));
        l.startTime = t || 0;
        if (db !== undefined) l.property("ADBE Audio Group").property("ADBE Audio Levels").setValue([db, db]);
        return l;
    };
    // Run a recipe the user saved with ae_memory: Documents/AE-Claude/knowledge/recipes/<name>.jsx must define recipe(args).
    AEH.recipe = function (name, args) {
        var f = new File(Folder.myDocuments.fsName + "/AE-Claude/knowledge/recipes/" + name + ".jsx");
        if (!f.exists) throw new Error("No saved recipe named " + name);
        $.evalFile(f);
        return recipe(args || {});
    };

    // ---------- inspection ----------
    function r3(v) { return Math.round(v * 1000) / 1000; }
    function layerKind(l) {
        if (l instanceof TextLayer) return "text";
        if (l instanceof ShapeLayer) return "shape";
        if (l instanceof CameraLayer) return "camera";
        if (l instanceof LightLayer) return "light";
        if (l.nullLayer) return "null";
        if (l.adjustmentLayer) return "adjustment";
        if (l.source && l.source instanceof CompItem) return "precomp";
        if (l.source && l.source.mainSource instanceof SolidSource) return "solid";
        if (l.hasAudio && !l.hasVideo) return "audio";
        return "footage";
    }
    function animated(group, path, out, depth) {
        if (depth > 12 || out.length > 300) return;
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i), id = path + "/" + p.matchName;
            try { if (p.propertyType === PropertyType.PROPERTY) {
                var hasExpr = p.canSetExpression && p.expressionEnabled;
                if (p.numKeys > 0 || hasExpr) {
                    var r = { path: id.replace(/ADBE /g, "").substr(1), name: p.name };
                    if (p.numKeys > 0) r.keys = (function () {
                        var ts = []; for (var k = 1; k <= Math.min(p.numKeys, 12); k++) ts.push(r3(p.keyTime(k))); return ts;
                    })();
                    if (hasExpr) r.expression = p.expression;
                    out.push(r);
                }
            } else animated(p, id, out, depth + 1); } catch (e) {}   // some props refuse access; skip them
        }
    }
    function describeComp(c, withProps) {
        var layers = [];
        for (var i = 1; i <= c.numLayers; i++) {
            var l = c.layer(i), fx = [], eg = l.property("ADBE Effect Parade");
            if (eg) for (var e = 1; e <= eg.numProperties; e++) fx.push(eg.property(e).matchName + " (" + eg.property(e).name + ")");
            // Only non-default fields, to keep responses small.
            var d = { i: i, name: l.name, kind: layerKind(l) };
            if (!l.enabled) d.enabled = false;
            if (l.inPoint > 0.0001 || l.outPoint < c.duration - 0.0001) d.time = [r3(l.inPoint), r3(l.outPoint)];
            if (Math.abs(l.startTime) > 0.0001) d.start = r3(l.startTime);
            if (l.parent) d.parent = l.parent.name;
            if (l.threeDLayer) d.threeD = true;
            if (fx.length) d.effects = fx;
            if (l instanceof TextLayer) d.text = l.property("ADBE Text Properties").property("ADBE Text Document").value.text;
            if (l.source) d.source = l.source.name;
            if (withProps) { var an = []; animated(l, "", an, 0); if (an.length) d.animated = an; }
            layers.push(d);
        }
        var o = { name: c.name, id: c.id, size: [c.width, c.height], duration: c.duration, fps: c.frameRate, layers: layers };
        if (c.workAreaStart > 0 || c.workAreaDuration < c.duration) o.workArea = [r3(c.workAreaStart), r3(c.workAreaStart + c.workAreaDuration)];
        return o;
    }

    // ---------- dispatcher functions ----------
    var fns = {
        status: function () {
            var a = app.project.activeItem;
            return { aeVersion: app.version, project: app.project.file ? app.project.file.fsName : null,
                     dirty: app.project.dirty, numItems: app.project.numItems,
                     activeComp: a instanceof CompItem ? a.name : null,
                     appFolder: Folder.appPackage.fsName };
        },
        runJsx: function (args) {
            var useUndo = args.undo !== false, r;
            if (useUndo) app.beginUndoGroup(args.undoName || "Claude");
            try { r = eval(args.code); }
            finally { if (useUndo) app.endUndoGroup(); }
            return r === undefined ? null : r;
        },
        inspect: function (args) {
            if (args.comp !== undefined && args.comp !== null && args.comp !== "") return describeComp(AEH.comp(args.comp), args.props !== false);
            var items = [];
            for (var i = 1; i <= app.project.numItems; i++) {
                var it = app.project.item(i), d = { id: it.id, name: it.name, type: it.typeName, folder: it.parentFolder.name };
                if (it instanceof CompItem) { d.width = it.width; d.height = it.height; d.duration = it.duration; d.fps = it.frameRate; d.layers = it.numLayers; }
                else if (it instanceof FootageItem && it.file) d.file = it.file.fsName;
                items.push(d);
            }
            var a = app.project.activeItem;
            return { project: app.project.file ? app.project.file.fsName : null, dirty: app.project.dirty,
                     activeComp: a instanceof CompItem ? a.name : null, items: items };
        },
        // Writes PNG frames; the MCP server waits for them, then builds a preview image.
        frames: function (args) {
            var c = AEH.comp(args.comp), dir = new Folder(args.dir), out = [];
            if (!dir.exists) dir.create();
            for (var i = 0; i < args.times.length; i++) {
                var t = Math.max(0, Math.min(args.times[i], c.duration - c.frameDuration));
                var f = new File(dir.fsName + "/f" + ("000" + i).slice(-3) + ".png");
                c.saveFrameToPng(t, f);
                out.push({ time: t, file: f.fsName });
            }
            return { comp: c.name, width: c.width, height: c.height, duration: c.duration, frames: out };
        },
        // Expert checks on a comp + timing data (key times, audio files) for the visual review strip.
        audit: function (args) {
            var c = AEH.comp(args.comp), issues = [], keyTimes = [], audio = [], moving = 0, linear = 0;
            function scan(group, layer, depth) {
                if (depth > 12) return;
                for (var i = 1; i <= group.numProperties; i++) {
                    var p = group.property(i);
                    try {
                        if (p.propertyType === PropertyType.PROPERTY) {
                            if (p.canSetExpression && p.expressionEnabled && p.expressionError)
                                issues.push(layer.name + ": expression error on " + p.name + ": " + p.expressionError);
                            if (p.numKeys > 1) {
                                for (var k = 1; k <= p.numKeys; k++) {
                                    var t = p.keyTime(k);   // comp time
                                    keyTimes.push(Math.round(t * 1000) / 1000);
                                    if (t > c.duration + 0.001) issues.push(layer.name + ": keyframe after comp end at " + t.toFixed(2) + "s (" + p.name + ")");
                                    if (k < p.numKeys && p.keyOutInterpolationType(k) === KeyframeInterpolationType.LINEAR) linear++;
                                }
                            }
                        } else scan(p, layer, depth + 1);
                    } catch (e) {}
                }
            }
            for (var i = 1; i <= c.numLayers; i++) {
                var l = c.layer(i);
                if (!l.enabled && !l.hasAudio) continue;
                scan(l, l, 0);
                var tg = l.property("ADBE Transform Group"), movesThis = false;
                if (tg) for (var j = 1; j <= tg.numProperties; j++) { try { if (tg.property(j).numKeys > 1) movesThis = true; } catch (e) {} }
                if (movesThis && l.hasVideo && !l.motionBlur) issues.push(l.name + ": moves but layer motion blur is off");
                if (l.inPoint >= c.duration || l.outPoint <= 0) issues.push(l.name + ": entirely outside the comp's time range");
                if (l.source && l.source.footageMissing) issues.push(l.name + ": footage missing");
                if (l.hasAudio && l.audioEnabled && l.source && l.source.file)
                    audio.push({ name: l.name, file: l.source.file.fsName, startTime: l.startTime, inPoint: l.inPoint, outPoint: l.outPoint,
                                 levels: l.property("ADBE Audio Group").property("ADBE Audio Levels").value });
                if (movesThis) moving++;
            }
            if (moving && !c.motionBlur) issues.push("Comp motion blur switch is off while layers move");
            if (linear) issues.push(linear + " linear keyframe segment(s) — ease them unless the motion is meant to be mechanical");
            if (!c.numLayers) issues.push("Comp is empty");
            return { comp: c.name, duration: c.duration, frameRate: c.frameRate, width: c.width, height: c.height,
                     issues: issues, keyTimes: keyTimes, audio: audio };
        },
        // Import a reference video, save frames, then remove everything it created.
        refFrames: function (args) {
            var item = AEH.importFile(args.path), info = { name: item.name, width: item.width, height: item.height,
                duration: item.duration, frameRate: item.frameRate, hasAudio: item.hasAudio, frames: [] };
            var tmp = null;
            try {
                if (!item.hasVideo) { item.remove(); return info; }
                var dur = item.duration || 1, fps = item.frameRate || 30;
                tmp = app.project.items.addComp("__ref_tmp", item.width, item.height, item.pixelAspect || 1, dur, fps);
                tmp.layers.add(item);
                var n = args.count || 12, dir = new Folder(args.dir); if (!dir.exists) dir.create();
                for (var i = 0; i < n; i++) {
                    var t = Math.min(dur - 1 / fps, (i + 0.5) * dur / n);
                    var f = new File(dir.fsName + "/r" + ("000" + i).slice(-3) + ".png");
                    tmp.saveFrameToPng(t, f);
                    info.frames.push({ time: Math.round(t * 100) / 100, file: f.fsName });
                }
                info.removeIds = [tmp.id, item.id];   // server removes them once the PNGs are on disk
            } catch (e) {
                if (tmp) tmp.remove();
                item.remove();
                throw e;
            }
            return info;
        },
        // Copy-based checkpoints of the saved project file. revert first checkpoints the current state, so nothing is lost.
        checkpoint: function (args) {
            var dir = new Folder(Folder.myDocuments.fsName + "/AE-Claude/checkpoints"); if (!dir.exists) dir.create();
            var file = app.project.file;
            var list = function () {
                var base = file ? file.name.replace(/\.aep$/i, "") : "", fs = dir.getFiles(function (f) { return f.name.indexOf(base + "__") === 0; }), out = [];
                for (var i = 0; i < fs.length; i++) out.push(fs[i].name);
                return out.sort();
            };
            var make = function (name) {
                if (!file) {
                    if (!args.saveAs) throw new Error("Project has never been saved — pass save_as.");
                    var sf = new File(args.saveAs); if (!sf.parent.exists) sf.parent.create();
                    app.project.save(sf); file = app.project.file;
                } else if (app.project.dirty) app.project.save();
                var stamp = new Date(), pad = function (n) { return ("0" + n).slice(-2); };
                var id = file.name.replace(/\.aep$/i, "") + "__" + stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) + "-" +
                    pad(stamp.getHours()) + pad(stamp.getMinutes()) + pad(stamp.getSeconds()) + "__" + String(name || "checkpoint").replace(/[^A-Za-z0-9_-]+/g, "-") + ".aep";
                if (!file.copy(dir.fsName + "/" + id)) throw new Error("Could not copy project to " + dir.fsName);
                return id;
            };
            if (args.action === "list") return { project: file ? file.fsName : null, checkpoints: list() };
            if (args.action === "create") return { created: make(args.name) };
            if (args.action === "revert") {
                var src = new File(dir.fsName + "/" + args.id);
                if (!src.exists) throw new Error("No checkpoint " + args.id + ". Available: " + list().join(", "));
                if (!file) throw new Error("Project is not saved; nothing to revert to.");
                var safety = make("before-revert"), target = file.fsName;
                app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);   // current state is already in `safety`
                if (!src.copy(target)) throw new Error("Could not restore checkpoint over " + target);
                app.open(new File(target));
                return { reverted: args.id, safetyCheckpoint: safety };
            }
            throw new Error("action: create | list | revert");
        },
        // Comp markers (AE 2023+), else layer markers on a "Beats" null.
        addMarkers: function (args) {
            var c = AEH.comp(args.comp), mp = null, n = 0;
            try { mp = c.markerProperty; } catch (e) {}
            if (!mp) { var nl = c.layers.addNull(); nl.name = args.layerName || "Beats"; nl.enabled = false; mp = nl.property("ADBE Marker"); }
            for (var i = 0; i < args.times.length; i++) {
                if (args.times[i] > c.duration) break;
                mp.setValueAtTime(args.times[i], new MarkerValue(args.labels ? args.labels[i] || "" : "")); n++;
            }
            return { comp: c.name, markers: n };
        },
        removeItems: function (args) {
            for (var i = app.project.numItems; i >= 1; i--) {
                var it = app.project.item(i);
                for (var j = 0; j < args.ids.length; j++) if (it.id === args.ids[j]) { it.remove(); break; }
            }
            return true;
        },
        // Saves the project (aerender reads from disk) and returns what the server needs to render.
        renderPrep: function (args) {
            var c = AEH.comp(args.comp);
            if (!app.project.file) {
                if (!args.saveAs) throw new Error("Project has never been saved — pass save_as.");
                var sf = new File(args.saveAs); if (!sf.parent.exists) sf.parent.create();
                app.project.save(sf);
            } else if (app.project.dirty) app.project.save();
            var rq = app.project.renderQueue.items.add(c), tpl = rq.outputModule(1).templates, h264 = null;
            for (var i = 0; i < tpl.length; i++) if (tpl[i].indexOf("H.264") === 0) { h264 = tpl[i]; break; }
            rq.remove();
            return { project: app.project.file.fsName, comp: c.name, duration: c.duration, frameRate: c.frameRate,
                     // Windows: next to AfterFX.exe; macOS: beside the .app bundle
                     aerender: $.os.indexOf("Windows") >= 0 ? Folder.appPackage.fsName + "/aerender.exe" : Folder.appPackage.parent.fsName + "/aerender",
                     h264Template: h264 };
        }
    };

    $.global.__aeb = {
        call: function (fn, args) {
            var s;
            try {
                if (!fns[fn]) throw new Error("Unknown bridge function: " + fn);
                s = json({ ok: true, result: fns[fn](args || {}) });
            } catch (e) {
                s = json({ ok: false, error: String(e), line: e.line === undefined ? null : e.line });
            }
            if (s.length > 60000) {            // evalScript's return channel is size-limited
                var f = new File(Folder.temp.fsName + "/aeb_" + new Date().getTime() + ".json");
                f.encoding = "UTF-8"; f.open("w"); f.write(s); f.close();
                return "@file:" + f.fsName;
            }
            return s;
        }
    };
})();
