/* pitch.js — 音高检测（MPM / NSDF），浏览器与 Node 通用
 * 输入：Float32Array 时域波形 + 采样率
 * 输出：{ freq, clarity, rms } 或 null
 * 思路：归一化平方差函数(NSDF) 取第一个显著峰，抑制八度误判，抛物线插值提精度。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PitchDetector = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var A4 = 440;

  function detect(buf, sampleRate, opts) {
    opts = opts || {};
    var minFreq = opts.minFreq || 80;
    var maxFreq = opts.maxFreq || 1100;
    var minRms = opts.minRms != null ? opts.minRms : 0.006;
    var SIZE = buf.length;
    if (!buf || SIZE < 1024 || !sampleRate) return null;

    var i, sum = 0;
    for (i = 0; i < SIZE; i++) sum += buf[i];
    var mean = sum / SIZE;

    var sq = 0;
    for (i = 0; i < SIZE; i++) { var d = buf[i] - mean; sq += d * d; }
    var rms = Math.sqrt(sq / SIZE);
    if (rms < minRms) return null;

    // 2 倍降采样：成对平均，去掉一点高频噪声，运算量减到 1/4
    var DS = 2;
    var n = Math.floor(SIZE / DS);
    var x = new Float32Array(n);
    for (i = 0; i < n; i++) {
      x[i] = ((buf[i * DS] - mean) + (buf[i * DS + 1] - mean)) * 0.5;
    }
    var sr = sampleRate / DS;

    var minLag = Math.max(2, Math.floor(sr / maxFreq));
    var maxLag = Math.min(n - 2, Math.ceil(sr / minFreq));
    if (maxLag <= minLag + 2) return null;

    var nsdf = new Float32Array(maxLag + 2);
    var tau, acf, m, lim, a, b;
    for (tau = minLag; tau <= maxLag; tau++) {
      acf = 0; m = 0; lim = n - tau;
      for (i = 0; i < lim; i++) {
        a = x[i]; b = x[i + tau];
        acf += a * b;
        m += a * a + b * b;
      }
      nsdf[tau] = m > 1e-12 ? (2 * acf) / m : 0;
    }

    var gmax = 0;
    for (tau = minLag; tau <= maxLag; tau++) if (nsdf[tau] > gmax) gmax = nsdf[tau];
    if (gmax < 0.32) return null;

    // 第一个达到全局峰值 90% 的局部极大 —— 避免把 2 倍频当成基频（八度误判）
    var th = gmax * 0.9;
    var best = -1;
    for (tau = minLag + 1; tau < maxLag; tau++) {
      if (nsdf[tau] >= th && nsdf[tau] >= nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1]) {
        best = tau;
        break;
      }
    }
    if (best < 0) {
      for (tau = minLag; tau <= maxLag; tau++) {
        if (best < 0 || nsdf[tau] > nsdf[best]) best = tau;
      }
    }

    // 抛物线插值：亚采样精度
    var y0 = nsdf[best - 1] || 0;
    var y1 = nsdf[best];
    var y2 = nsdf[best + 1] || 0;
    var den = y0 - 2 * y1 + y2;
    var shift = 0;
    if (Math.abs(den) > 1e-9) shift = (y0 - y2) / (2 * den);
    if (shift > 0.5) shift = 0.5;
    if (shift < -0.5) shift = -0.5;
    var tauF = best + shift;
    if (tauF <= 1) return null;

    var freq = sr / tauF;
    if (!(freq >= minFreq && freq <= maxFreq)) return null;
    return { freq: freq, clarity: Math.max(0, Math.min(1, y1)), rms: rms };
  }

  function freqToMidi(f) { return 69 + 12 * Math.log2(f / A4); }
  function midiToFreq(m) { return A4 * Math.pow(2, (m - 69) / 12); }
  function centsBetween(f, target) { return 1200 * Math.log2(f / target); }

  /* 判定：从一串 midi 帧里找出最稳定的音（半音窗口内帧数最多），
   * 与目标音比较，给出 0-3 星。 */
  function judgeMidi(frames, target) {
    if (!frames || !frames.length) return { stars: 0, cents: 0, empty: true };
    var arr = frames.slice().sort(function (a, b) { return a - b; });
    var best = { n: 0, lo: 0, hi: 0 };
    for (var i = 0; i < arr.length; i++) {
      var j = i;
      while (j + 1 < arr.length && arr[j + 1] - arr[i] <= 1.0) j++;
      if (j - i + 1 > best.n) best = { n: j - i + 1, lo: i, hi: j };
    }
    if (best.n < 5) return { stars: 0, cents: 0, weak: true, n: best.n };
    var sum = 0;
    for (var k = best.lo; k <= best.hi; k++) sum += arr[k];
    var mean = sum / best.n;
    var cents = (mean - target) * 100;
    var a = Math.abs(cents);
    var stars = a <= 48 ? 3 : a <= 95 ? 2 : a <= 160 ? 1 : 0;
    return { stars: stars, cents: cents, mean: mean, n: best.n };
  }

  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var SOL = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
  var NUM = ['1', '2', '3', '4', '5', '6', '7'];

  function midiName(m) {
    var r = Math.round(m);
    return NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
  }
  function solfege(m) {
    var r = ((Math.round(m) % 12) + 12) % 12;
    var map = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
    return map[r] == null ? '?' : SOL[map[r]];
  }
  function degree(m) {
    var r = ((Math.round(m) % 12) + 12) % 12;
    var map = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
    return map[r] == null ? '?' : NUM[map[r]];
  }

  return {
    detect: detect,
    judgeMidi: judgeMidi,
    freqToMidi: freqToMidi,
    midiToFreq: midiToFreq,
    centsBetween: centsBetween,
    midiName: midiName,
    solfege: solfege,
    degree: degree
  };
});
