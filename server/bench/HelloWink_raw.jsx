// HelloWink.jsx — builds a 4s "Hello" typographic intro where the "o" winks,
// with Windows TTS voice + whoosh + chime, then renders an MP4.
// Output: Documents\HelloWink\ (HelloWink.aep, HelloWink.mp4, audio).
(function () {
    var SCRIPT_DIR = new File($.fileName).parent;
    var OUT = new Folder(Folder.myDocuments.fsName + "/HelloWink");
    var log = [];
    function L(m) { log.push(m); }
    function flushLog() {
        var f = new File(SCRIPT_DIR.fsName + "/build_log.txt");
        f.encoding = "UTF-8"; f.open("w"); f.write(log.join("\n")); f.close();
    }
    function hex(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }

    // Ease every keyframe of a property; influence in %. Dimension-aware.
    function ease(prop, infl) {
        var t = prop.propertyValueType, dims = 1;
        if (t === PropertyValueType.TwoD) dims = 2;
        if (t === PropertyValueType.ThreeD) dims = 3;
        var e = []; for (var d = 0; d < dims; d++) e.push(new KeyframeEase(0, infl));
        for (var k = 1; k <= prop.numKeys; k++) prop.setTemporalEaseAtKey(k, e, e);
    }
    function keys(prop, pairs, infl) {
        for (var i = 0; i < pairs.length; i++) prop.setValueAtTime(pairs[i][0], pairs[i][1]);
        ease(prop, infl || 75);
    }
    function pickFont() {
        var names = ["Montserrat-ExtraBold", "Poppins-Bold", "Inter-Bold", "SegoeUI-Bold", "Arial-BoldMT"];
        for (var i = 0; i < names.length; i++) {
            try { if (app.fonts.getFontsByPostScriptName(names[i]).length) return names[i]; } catch (e) { return "SegoeUI-Bold"; }
        }
        return "Arial-BoldMT";
    }

    app.beginUndoGroup("Hello Wink");
    var undoOpen = true;
    try {
        if (!OUT.exists) OUT.create();
        // ---------- audio assets ----------
        var sfx = ["whoosh.wav", "wink_chime.wav"];
        for (var s = 0; s < sfx.length; s++) new File(SCRIPT_DIR.fsName + "/" + sfx[s]).copy(OUT.fsName + "/" + sfx[s]);
        var helloWav = new File(OUT.fsName + "/hello.wav");
        var ps1 = new File(OUT.fsName + "/tts.ps1");
        ps1.encoding = "UTF-8"; ps1.open("w");
        ps1.write([
            "Add-Type -AssemblyName System.Speech",
            "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
            "try { $s.SelectVoice('Microsoft Zira Desktop') } catch {}",
            "$s.SetOutputToWaveFile('" + helloWav.fsName + "')",
            "try { $s.SpeakSsml('<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"en-US\"><prosody pitch=\"+10%\" rate=\"-8%\">Hello!</prosody></speak>') } catch { $s.Speak('Hello!') }",
            "Write-Output ('voice=' + $s.Voice.Name)",
            "$s.Dispose()"
        ].join("\r\n"));
        ps1.close();
        var ttsOut = system.callSystem('powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1.fsName + '" 2>&1');
        L("tts: " + (helloWav.exists ? "ok" : "FAILED") + " | " + ttsOut);

        // ---------- comp ----------
        var W = 1920, H = 1080, DUR = 4, FPS = 30;
        var comp = app.project.items.addComp("Hello Wink", W, H, 1, DUR, FPS);
        comp.motionBlur = true;
        comp.shutterAngle = 200;
        var WHITE = hex("#F5F5F7"), ACCENT = hex("#FF6A3D"), BG_IN = hex("#1C2233"), BG_OUT = hex("#06070A");

        // Background: radial gradient + fine grain
        var bg = comp.layers.addSolid([0, 0, 0], "BG", W, H, 1);
        var ramp = bg.property("ADBE Effect Parade").addProperty("ADBE Ramp");
        ramp.property(1).setValue([W / 2, H / 2]);
        ramp.property(2).setValue(BG_IN);
        ramp.property(3).setValue([W / 2, H * 1.3]);
        ramp.property(4).setValue(BG_OUT);
        ramp.property(5).setValue(2); // radial
        try { bg.property("ADBE Effect Parade").addProperty("ADBE Noise").property(1).setValue(2.5); } catch (e) { L("noise skipped"); }

        // ---------- measure typography ----------
        var txt = comp.layers.addText("Hello");
        var tp = txt.property("ADBE Text Properties").property("ADBE Text Document");
        var td = tp.value;
        td.resetCharStyle();
        td.font = pickFont(); td.fontSize = 280; td.applyFill = true; td.fillColor = WHITE;
        td.applyStroke = false; td.tracking = -15; td.justification = ParagraphJustification.LEFT_JUSTIFY;
        td.text = "Hello"; tp.setValue(td);
        var rHello = txt.sourceRectAtTime(0, false);
        td.text = "o"; tp.setValue(td); var rO = txt.sourceRectAtTime(0, false);
        td.text = "l"; tp.setValue(td); var rL = txt.sourceRectAtTime(0, false);
        td.text = "Hell"; tp.setValue(td);
        L("font: " + td.font + " hello=" + rHello.width + "x" + rHello.height + " o=" + rO.width + "x" + rO.height);

        var P = [W / 2 - rHello.left - rHello.width / 2, H / 2 - (rHello.top + rHello.height / 2)];
        txt.property("ADBE Transform Group").property("ADBE Position").setValue(P);
        txt.name = "Hell";
        var eyeC = [P[0] + rHello.left + rHello.width - rO.width / 2, P[1] + rO.top + rO.height / 2];
        var SW = Math.max(18, Math.min(48, rL.width * 0.95));     // match letter stem weight
        var ringW = rO.width - SW, ringH = rO.height - SW;

        // Per-character reveal: rise + fade + blur, ramp-up selector swept by offset
        var anim = txt.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
        anim.name = "Reveal";
        var ap = anim.property("ADBE Text Animator Properties");
        ap.addProperty("ADBE Text Position 3D").setValue([0, 160, 0]);
        ap.addProperty("ADBE Text Opacity").setValue(0);
        try { ap.addProperty("ADBE Text Blur").setValue([0, 40]); } catch (e) { L("text blur skipped"); }
        var sel = anim.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
        sel.property("ADBE Text Range Advanced").property("ADBE Text Range Shape").setValue(2); // Ramp Up
        keys(sel.property("ADBE Text Percent Offset"), [[0.10, -100], [0.90, 100]], 85);
        txt.motionBlur = true;

        // ---------- the "o" eye ----------
        function strokeOf(grp, color, width) {
            var st = grp.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
            st.property("ADBE Vector Stroke Color").setValue(color);
            st.property("ADBE Vector Stroke Width").setValue(width);
            st.property("ADBE Vector Stroke Line Cap").setValue(2); // round
            return st;
        }
        var eye = comp.layers.addShape(); eye.name = "Eye (o)";
        eye.property("ADBE Transform Group").property("ADBE Position").setValue(eyeC);
        var ring = eye.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); ring.name = "Ring";
        ring.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([ringW, ringH]);
        var trim = ring.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Trim");
        trim.property("ADBE Vector Trim Offset").setValue(-60);
        keys(trim.property("ADBE Vector Trim End"), [[0.45, 0], [0.95, 100]], 80);
        strokeOf(ring, WHITE, SW);

        var pupilD = Math.min(ringW, ringH) * 0.46;
        var pupil = eye.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); pupil.name = "Pupil";
        pupil.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([pupilD, pupilD]);
        pupil.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(ACCENT);
        var pT = pupil.property("ADBE Vector Transform Group");
        keys(pT.property("ADBE Vector Scale"), [[0.80, [0, 0]], [0.98, [120, 120]], [1.10, [100, 100]]], 70);
        keys(pT.property("ADBE Vector Position"), [[1.15, [0, 0]], [1.45, [ringW * 0.12, -ringH * 0.06]]], 80);

        // Wink: open eye squashes shut, happy "^" lid takes over, eye pops back open
        keys(eye.property("ADBE Transform Group").property("ADBE Scale"),
            [[1.72, [100, 100, 100]], [1.80, [100, 0, 100]], [2.00, [100, 0, 100]], [2.10, [100, 110, 100]], [2.20, [100, 100, 100]]], 70);
        eye.motionBlur = true;

        var lid = comp.layers.addShape(); lid.name = "Lid (wink)";
        lid.property("ADBE Transform Group").property("ADBE Position").setValue([eyeC[0], eyeC[1] + ringH * 0.12]);
        var lg = lid.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var a = ringW / 2, arc = new Shape();
        arc.vertices = [[-a, 0], [a, 0]];
        arc.inTangents = [[0, 0], [-a * 0.55, -a * 0.8]];
        arc.outTangents = [[a * 0.55, -a * 0.8], [0, 0]];
        arc.closed = false;
        lg.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape").setValue(arc);
        strokeOf(lg, WHITE, SW);
        keys(lid.property("ADBE Transform Group").property("ADBE Scale"),
            [[1.78, [100, 0, 100]], [1.84, [104, 115, 100]], [1.90, [100, 100, 100]], [1.98, [100, 100, 100]], [2.04, [100, 0, 100]]], 60);
        lid.motionBlur = true;

        // Sparkle burst next to the wink
        var sp = comp.layers.addShape(); sp.name = "Sparkle";
        sp.property("ADBE Transform Group").property("ADBE Position").setValue([eyeC[0] + ringW * 0.85, eyeC[1] - ringH * 0.75]);
        var stars = [[[0, 0], 40, 10], [[46, 34], 20, 5], [[-14, 52], 12, 3]];
        for (var i = 0; i < stars.length; i++) {
            var g = sp.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            var st = g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Star");
            st.property("ADBE Vector Star Type").setValue(1);
            st.property("ADBE Vector Star Points").setValue(4);
            st.property("ADBE Vector Star Outer Radius").setValue(stars[i][1]);
            st.property("ADBE Vector Star Inner Radius").setValue(stars[i][2]);
            g.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(i === 0 ? ACCENT : WHITE);
            g.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue(stars[i][0]);
        }
        var spT = sp.property("ADBE Transform Group");
        keys(spT.property("ADBE Scale"), [[1.82, [0, 0, 100]], [1.98, [115, 115, 100]], [2.15, [100, 100, 100]], [2.50, [0, 0, 100]]], 65);
        keys(spT.property("ADBE Rotate Z"), [[1.82, -30], [2.50, 60]], 50);
        sp.motionBlur = true;

        // Rig: slow push-in + head-tilt during the wink
        var rig = comp.layers.addNull(); rig.name = "Rig";
        rig.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H / 2]);
        var kids = [txt, eye, lid, sp];
        for (var k = 0; k < kids.length; k++) kids[k].parent = rig;
        var rT = rig.property("ADBE Transform Group");
        keys(rT.property("ADBE Scale"), [[0, [94, 94, 100]], [1.1, [100, 100, 100]], [DUR, [103, 103, 100]]], 60);
        keys(rT.property("ADBE Rotate Z"), [[1.70, 0], [1.88, -3], [2.40, 0]], 70);

        // Fade to black at the end
        var fade = comp.layers.addSolid([0, 0, 0], "Fade Out", W, H, 1);
        keys(fade.property("ADBE Transform Group").property("ADBE Opacity"), [[3.45, 0], [DUR, 100]], 50);

        // ---------- audio ----------
        function addAudio(file, t, db) {
            if (!file.exists) { L("missing audio " + file.name); return; }
            var lyr = comp.layers.add(app.project.importFile(new ImportOptions(file)));
            lyr.startTime = t;
            lyr.property("ADBE Audio Group").property("ADBE Audio Levels").setValue([db, db]);
            lyr.moveToEnd();
        }
        addAudio(new File(OUT.fsName + "/whoosh.wav"), 0.0, -9);
        addAudio(helloWav, 0.38, 0);
        addAudio(new File(OUT.fsName + "/wink_chime.wav"), 1.76, -7);

        comp.openInViewer();
        app.endUndoGroup(); undoOpen = false;   // never save/render inside an undo group
        app.project.save(new File(OUT.fsName + "/HelloWink.aep"));

        // ---------- render MP4 ----------
        var rq = app.project.renderQueue.items.add(comp);
        var om = rq.outputModule(1), tpl = om.templates, chosen = "";
        for (var t2 = 0; t2 < tpl.length; t2++) if (tpl[t2].indexOf("H.264") >= 0) { chosen = tpl[t2]; break; }
        if (chosen) om.applyTemplate(chosen);
        var outFile = new File(OUT.fsName + "/HelloWink." + (chosen ? "mp4" : "avi"));
        if (outFile.exists) outFile.remove();    // replace our previous render
        om.file = outFile;
        L("output template: " + (chosen || "default"));
        app.project.renderQueue.render();
        L("render done: " + om.file.fsName + " exists=" + om.file.exists);
    } catch (err) {
        L("ERROR line " + err.line + ": " + err.toString());
    }
    if (undoOpen) app.endUndoGroup();
    flushLog();
})();
