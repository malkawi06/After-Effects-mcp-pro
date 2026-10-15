// Same "Hello" wink clip as HelloWink.jsx, written against the AEH library (what Claude sends via ae_run_jsx).
var c = app.project.items.addComp("Hello Wink", 1920, 1080, 1, 4, 30);
c.motionBlur = true; c.openInViewer();
AEH.fx(AEH.bg(c, "#1C2233", "#06070A"), "ADBE Noise", { "Amount of Noise": 2.5 });
var t = AEH.text(c, "Hello", { size: 280, tracking: -15, color: "#F5F5F7", justify: "left" });
var td = t.property("ADBE Text Properties").property("ADBE Text Document"), d = td.value;
var rH = t.sourceRectAtTime(0, false);
d.text = "o"; td.setValue(d); var rO = t.sourceRectAtTime(0, false);
d.text = "l"; td.setValue(d); var sw = Math.max(18, Math.min(48, t.sourceRectAtTime(0, false).width * 0.95));
d.text = "Hell"; td.setValue(d);
var P = AEH.prop(t, "ADBE Transform Group/ADBE Position").value, A = AEH.prop(t, "ADBE Transform Group/ADBE Anchor Point").value;
var eye = [P[0] - A[0] + rH.left + rH.width - rO.width / 2, P[1] - A[1] + rO.top + rO.height / 2];
var w = rO.width - sw, h = rO.height - sw;
AEH.textAnim(t, "rise", { start: 0.1, dur: 0.8, amount: 160 });
var ring = AEH.shape(c, "ellipse", { size: [w, h], stroke: "#F5F5F7", width: sw, pos: eye, name: "Eye" });
AEH.drawOn(ring, 0.45, 0.95, "out");
var pupil = AEH.shape(c, "ellipse", { size: [w * 0.46, w * 0.46], fill: "#FF6A3D", pos: eye, name: "Pupil" });
AEH.anim(AEH.prop(pupil, "ADBE Transform Group/ADBE Scale"), [[0.8, [0, 0, 100]], [0.98, [120, 120, 100]], [1.1, [100, 100, 100]]], "out");
var lid = AEH.shape(c, "path", { vertices: [[-w / 2, 0], [w / 2, 0]], outTangents: [[w * 0.27, -w * 0.4], [0, 0]],
    inTangents: [[0, 0], [-w * 0.27, -w * 0.4]], stroke: "#F5F5F7", width: sw, pos: [eye[0], eye[1] + h * 0.12], name: "Lid" });
var squash = [[1.72, [100, 100, 100]], [1.8, [100, 0, 100]], [2, [100, 0, 100]], [2.1, [100, 110, 100]], [2.2, [100, 100, 100]]];
AEH.anim(AEH.prop(ring, "ADBE Transform Group/ADBE Scale"), squash, "smooth");
AEH.anim(AEH.prop(pupil, "ADBE Transform Group/ADBE Scale"), squash, "smooth");
AEH.anim(AEH.prop(lid, "ADBE Transform Group/ADBE Scale"), [[1.78, [100, 0, 100]], [1.86, [104, 115, 100]], [1.98, [100, 100, 100]], [2.04, [100, 0, 100]]], "smooth");
var sp = AEH.shape(c, "star", { points: 4, outer: 40, inner: 10, fill: "#FF6A3D", pos: [eye[0] + w * 0.85, eye[1] - h * 0.75], name: "Sparkle" });
AEH.anim(AEH.prop(sp, "ADBE Transform Group/ADBE Scale"), [[1.82, [0, 0, 100]], [1.98, [115, 115, 100]], [2.5, [0, 0, 100]]], "out");
AEH.expr(AEH.prop(sp, "ADBE Transform Group/ADBE Rotate Z"), "spin", { speed: 120 });
var rig = c.layers.addNull(); rig.name = "Rig";
var kids = [t, ring, pupil, lid, sp];
for (var i = 0; i < kids.length; i++) { kids[i].motionBlur = true; kids[i].parent = rig; }
AEH.anim(AEH.prop(rig, "ADBE Transform Group/ADBE Scale"), [[0, [94, 94, 100]], [1.1, [100, 100, 100]], [4, [103, 103, 100]]], "smooth");
AEH.anim(AEH.prop(rig, "ADBE Transform Group/ADBE Rotate Z"), [[1.7, 0], [1.88, -3], [2.4, 0]], "smooth");
var dir = Folder.myDocuments.fsName + "/AE-Claude/audio/";
AEH.audio(c, dir + "whoosh.wav", 0, -9); AEH.audio(c, dir + "hello.wav", 0.38, 0); AEH.audio(c, dir + "wink_chime.wav", 1.76, -7);
({ comp: c.name, layers: c.numLayers })
