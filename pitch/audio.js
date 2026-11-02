/* audio.js — 发声、音效、麦克风采集
 * 依赖 pitch.js 提供的 PitchDetector
 */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var analyser = null;
  var buf = null;
  var micStream = null;
  var micReady = false;
  var muted = false;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    return ctx;
  }

  function resume() {
    ensure();
    if (ctx.state !== 'running') return ctx.resume().catch(function () {});
    return Promise.resolve();
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.55;
  }

  /* 一个音符：基频 + 2/3/4 次谐波，快速起音 + 指数衰减，像木琴/八音盒 */
  function playTone(freq, opt) {
    ensure();
    opt = opt || {};
    var dur = opt.dur || 1.0;
    var when = opt.when || 0;
    var vol = opt.vol == null ? 0.55 : opt.vol;
    var t0 = ctx.currentTime + when + 0.02;
    var partials = opt.partials || [[1, 1.0], [2, 0.38], [3, 0.14], [4, 0.06]];

    for (var i = 0; i < partials.length; i++) {
      var mul = partials[i][0];
      var amp = partials[i][1];
      var d = dur / (1 + i * 0.5);
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mul;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol * amp, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + d + 0.06);
    }
  }

  /* 播一串音，返回总时长（秒） */
  function playSequence(freqs, opt) {
    ensure();
    opt = opt || {};
    var gap = opt.gap == null ? 0.62 : opt.gap;
    var dur = opt.dur == null ? 0.85 : opt.dur;
    for (var i = 0; i < freqs.length; i++) {
      playTone(freqs[i], { when: i * gap, dur: dur, vol: opt.vol });
    }
    return gap * freqs.length + dur * 0.3;
  }

  var SFX = {
    success: [523.25, 659.25, 783.99],   // C5 E5 G5 上行
    great: [659.25, 783.99, 1046.5],     // 更高更亮
    miss: [311.13, 246.94],              // 下行两个低音
    tap: [880],
    star: [1046.5, 1318.5, 1568]
  };

  function sfx(name) {
    ensure();
    var notes = SFX[name] || SFX.tap;
    var gap = name === 'miss' ? 0.18 : 0.11;
    var dur = name === 'miss' ? 0.32 : name === 'tap' ? 0.12 : 0.5;
    for (var i = 0; i < notes.length; i++) {
      playTone(notes[i], { when: i * gap, dur: dur, vol: name === 'miss' ? 0.35 : 0.3 });
    }
  }

  async function enableMic() {
    ensure();
    if (micReady) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, reason: 'no-api' };
    }
    try {
      var req = navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1
        },
        video: false
      });
      var timeout = new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('TIMEOUT')); }, 9000);
      });
      var stream = await Promise.race([req, timeout]);
      var src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
      micStream = stream;
      micReady = true;
      return { ok: true };
    } catch (e) {
      var name = (e && e.name) || 'Error';
      return { ok: false, reason: name, message: (e && e.message) || '' };
    }
  }

  function readPitch() {
    if (!analyser || !buf) return null;
    analyser.getFloatTimeDomainData(buf);
    return root.PitchDetector.detect(buf, ctx.sampleRate, { minRms: 0.008 });
  }

  function stopMic() {
    if (micStream) {
      micStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      micStream = null;
    }
    analyser = null;
    buf = null;
    micReady = false;
  }

  function isMicReady() { return micReady; }
  function sampleRate() { return ctx ? ctx.sampleRate : 44100; }

  root.AudioEngine = {
    ensure: ensure,
    resume: resume,
    setMuted: setMuted,
    playTone: playTone,
    playSequence: playSequence,
    sfx: sfx,
    enableMic: enableMic,
    readPitch: readPitch,
    stopMic: stopMic,
    isMicReady: isMicReady,
    sampleRate: sampleRate,
    getContext: function () { return ctx; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
