/* game.js — 听音唱音游戏主逻辑 */
(function () {
  'use strict';

  var PD = window.PitchDetector;
  var AE = window.AudioEngine;
  function $(id) { return document.getElementById(id); }

  var COLORS = ['#ff6b6b', '#ff9f43', '#ffd93d', '#6bcB77', '#4dd0e1', '#4d96ff', '#a66bff'];

  var POOLS = [
    { name: '第一层 · do mi sol', notes: [60, 64, 67], need: 4 },
    { name: '第二层 · 五个音', notes: [60, 62, 64, 67, 69], need: 5 },
    { name: '第三层 · 整个音阶', notes: [60, 62, 64, 65, 67, 69, 71, 72], need: 6 }
  ];
  var LADDER = [60, 62, 64, 65, 67, 69, 71, 72];

  var S = {
    screen: 'home',
    mode: null,
    gen: 0,
    pool: 0,
    correct: 0,
    target: 60,
    lastTarget: 60,
    stars: 0,
    listening: false,
    listenTimer: 0,
    frames: [],
    timer: 0,
    raf: 0,
    freeMode: false,
    ladderIdx: 0,
    busy: false
  };

  /* ---------- 工具 ---------- */
  function later(fn, ms) {
    var g = S.gen;
    S.timer = setTimeout(function () { if (S.gen === g) fn(); }, ms);
  }
  function stopTimers() { if (S.timer) { clearTimeout(S.timer); S.timer = 0; } }

  function showScreen(name) {
    ['scrHome', 'scrPlay', 'scrFree'].forEach(function (id) {
      $(id).classList.toggle('active', id === 'scr' + name.charAt(0).toUpperCase() + name.slice(1));
    });
    S.screen = name;
    $('btnBack').style.visibility = name === 'home' ? 'hidden' : 'visible';
    $('brand').textContent = name === 'home' ? '听音唱音' :
      name === 'play' ? (S.mode === 'ladder' ? '音阶爬梯' : '听音跟唱') : '自由练声';
  }

  function setPrompt(t) {
    var el = $('promptText');
    el.textContent = t;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  /* ---------- 鲸鱼 ---------- */
  function whaleSVG() {
    return '' +
      '<svg class="whale" viewBox="0 0 240 180" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#93e9ff"/><stop offset="1" stop-color="#47a8e6"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<g class="spout">' +
      '<path d="M116 56 C 114 38 104 30 96 20" stroke="#bfefff" stroke-width="7" stroke-linecap="round" fill="none"/>' +
      '<circle cx="96" cy="16" r="7" fill="#bfefff"/><circle cx="76" cy="26" r="5" fill="#bfefff"/>' +
      '<circle cx="134" cy="26" r="6" fill="#bfefff"/>' +
      '</g>' +
      '<path d="M186 92 C 208 82 218 66 210 54 C 196 64 186 76 180 88 Z" fill="#2f93d8" stroke="#a5e9ff" stroke-width="2.5" stroke-opacity=".5"/>' +
      '<path d="M184 104 C 210 112 224 126 218 144 C 202 134 188 122 180 108 Z" fill="#2f93d8" stroke="#a5e9ff" stroke-width="2.5" stroke-opacity=".5"/>' +
      '<path d="M96 130 C 86 152 102 162 120 152" fill="#2f93d8" stroke="#a5e9ff" stroke-width="2.5" stroke-opacity=".5"/>' +
      '<ellipse cx="116" cy="104" rx="76" ry="54" fill="url(#wg)" stroke="#b3edff" stroke-width="3.5" stroke-opacity=".65"/>' +
      '<ellipse cx="110" cy="126" rx="48" ry="26" fill="#eaf9ff" opacity=".95"/>' +
      '<circle cx="84" cy="92" r="8.5" fill="#0b2a44"/>' +
      '<circle cx="81" cy="89" r="2.8" fill="#fff"/>' +
      '<circle cx="132" cy="92" r="8.5" fill="#0b2a44"/>' +
      '<circle cx="129" cy="89" r="2.8" fill="#fff"/>' +
      '<ellipse cx="66" cy="112" rx="12" ry="8" fill="#ff9db0" opacity=".75"/>' +
      '<ellipse cx="152" cy="112" rx="12" ry="8" fill="#ff9db0" opacity=".75"/>' +
      '<path class="mouth" d="M96 118 Q 108 130 120 120" stroke="#0b2a44" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
      '</svg>';
  }

  function plantWhales() {
    $('homeWhale').innerHTML = whaleSVG();
    $('playWhale').innerHTML = whaleSVG();
  }

  function whaleReact(cls, ms) {
    var w = $('playWhale').querySelector('.whale');
    if (!w) return;
    w.classList.remove('singing', 'happy', 'sad');
    w.classList.add(cls);
    setTimeout(function () { w.classList.remove(cls); }, ms || 900);
  }

  /* ---------- 气泡背景 ---------- */
  function plantBubbles() {
    var wrap = $('bubbles');
    var html = '';
    for (var i = 0; i < 18; i++) {
      var size = 6 + Math.random() * 26;
      var left = Math.random() * 100;
      var dur = 9 + Math.random() * 12;
      var delay = -Math.random() * 20;
      html += '<i class="bubble" style="width:' + size.toFixed(0) + 'px;height:' + size.toFixed(0) +
        'px;left:' + left.toFixed(1) + '%;animation-duration:' + dur.toFixed(1) + 's;animation-delay:' +
        delay.toFixed(1) + 's"></i>';
    }
    wrap.innerHTML = html;
  }

  /* ---------- 目标音渲染 ---------- */
  function renderTarget(midi) {
    var sol = PD.solfege(midi);
    var deg = PD.degree(midi);
    var idx = sol === 'do' ? 0 : sol === 're' ? 1 : sol === 'mi' ? 2 : sol === 'fa' ? 3 :
      sol === 'sol' ? 4 : sol === 'la' ? 5 : 6;
    var c = COLORS[idx];
    var card = $('noteCard');
    card.style.setProperty('--c', c);
    $('noteSol').textContent = sol;
    $('noteDegree').textContent = deg;
    $('noteName').textContent = PD.midiName(midi);
    card.classList.remove('flip');
    void card.offsetWidth;
    card.classList.add('flip');
  }

  function updateRuler(cents) {
    var c = Math.max(-350, Math.min(350, cents));
    var pct = (c + 350) / 700 * 100;
    var n = $('needle');
    n.style.left = pct.toFixed(2) + '%';
    var a = Math.abs(cents);
    n.className = 'needle ' + (a <= 50 ? 'good' : a <= 110 ? 'near' : 'off');
  }

  function resetRuler() {
    var n = $('needle');
    n.style.left = '50%';
    n.className = 'needle idle';
  }

  /* ---------- 判定 ---------- */
  function judge(frames, target) {
    var r = PD.judgeMidi(frames, target);
    if (!r.empty && !r.weak && r.stars === 0) r.off = true;
    return r;
  }

  /* ---------- 监听 ---------- */
  function stopListening() {
    S.listening = false;
    if (S.listenTimer) { clearInterval(S.listenTimer); S.listenTimer = 0; }
  }

  function beginListen(tries) {
    if (S.mode === 'free') return;
    tries = tries || 0;
    if (!AE.isMicReady()) {
      if (tries < 10) {
        setPrompt('正在打开麦克风…');
        later(function () { beginListen(tries + 1); }, 550);
      } else {
        micFail({ ok: false, reason: 'timeout' });
      }
      return;
    }
    stopListening();
    S.gen++;
    S.frames = [];
    S.listening = true;
    $('btnAgain').hidden = true;
    resetRuler();
    var t0 = performance.now();
    var g = S.gen;

    S.listenTimer = setInterval(function () {
      if (S.gen !== g || !S.listening) return;
      var p = AE.readPitch();
      if (p && p.clarity > 0.5 && p.rms > 0.01) {
        var m = PD.freqToMidi(p.freq);
        S.frames.push(m);
        updateRuler((m - S.target) * 100);
      }
      if (performance.now() - t0 > 3800) endListen();
    }, 45);
  }

  function endListen() {
    if (!S.listening) return;
    stopListening();
    S.listening = false;
    var res = judge(S.frames, S.target);

    if (res.empty || res.weak) {
      setPrompt(res.empty ? '咦，没听到声音～点按钮再来一次' : '再唱长一点点～');
      AE.sfx('miss');
      whaleReact('sad', 900);
      $('btnAgain').hidden = false;
      $('btnAgain').textContent = '再试一次';
      return;
    }

    var cents = Math.round(res.cents);
    var stars = res.stars;
    var title, sub;
    if (stars === 3) { title = '太棒啦！'; sub = '唱得超准 · ' + fmt(cents); }
    else if (stars === 2) { title = '很好！'; sub = '再稳一点点 · ' + fmt(cents); }
    else if (stars === 1) { title = '有点像了'; sub = (cents > 0 ? '再唱低一点点 · ' : '再唱高一点点 · ') + fmt(cents); }
    else { title = '差一点～'; sub = '这次' + fmt(cents) + '，再听一遍试试'; }

    showResult(stars, title, sub);
    S.stars += stars === 3 ? 5 : stars === 2 ? 3 : stars === 1 ? 1 : 0;
    $('starCount').textContent = S.stars;

    if (stars === 0) {
      $('btnAgain').hidden = false;
      $('btnAgain').textContent = '再试一次';
      // 孩子不会点按钮也不会卡住：4.5 秒没动作就自动重来
      later(function () {
        if (S.mode !== 'single' && S.mode !== 'ladder') return;
        $('btnAgain').hidden = true;
        playTarget();
      }, 4500);
      return;
    }

    $('btnAgain').hidden = true;
    later(function () {
      S.correct++;
      advance();
    }, 1900);
  }

  function fmt(cents) {
    var v = Math.round(cents);
    if (Math.abs(v) <= 3) return '分毫不差';
    return (v > 0 ? '高了 ' : '低了 ') + Math.abs(v) + ' 分';
  }

  function showResult(stars, title, sub) {
    $('resultStars').textContent = stars > 0 ? '⭐'.repeat(stars) : '💧';
    $('resultTitle').textContent = title;
    $('resultSub').textContent = sub || '';
    $('resultLayer').hidden = false;
    $('resultCard').className = 'result-card show s' + stars;
    AE.sfx(stars === 3 ? 'great' : stars > 0 ? 'success' : 'miss');
    if (stars === 3) { whaleReact('happy', 1200); burstStars(); }
    else if (stars > 0) whaleReact('happy', 900);
    later(function () { $('resultLayer').hidden = true; }, 1750);
  }

  function burstStars() {
    for (var i = 0; i < 12; i++) {
      var s = document.createElement('span');
      s.className = 'spark';
      s.textContent = '✨';
      s.style.left = (30 + Math.random() * 40) + '%';
      s.style.top = (40 + Math.random() * 20) + '%';
      s.style.setProperty('--dx', (Math.random() * 260 - 130).toFixed(0) + 'px');
      s.style.setProperty('--dy', (-Math.random() * 220 - 40).toFixed(0) + 'px');
      s.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
      document.body.appendChild(s);
      setTimeout(function (el) { return function () { el.remove(); }; }(s), 1300);
    }
  }

  /* ---------- 出题 ---------- */
  function playTarget() {
    var g = S.gen;
    var freq = PD.midiToFreq(S.target);
    setPrompt('听好啦～');
    resetRuler();
    whaleReact('singing', 2200);
    var total = AE.playSequence([freq, freq], { gap: 0.95, dur: 0.8, vol: 0.5 });
    later(function () {
      setPrompt('轮到你啦，跟着唱～');
      later(beginListen, 750);
    }, total * 1000);
  }

  function newQuestion() {
    stopListening();
    stopTimers();
    S.gen++;
    resetRuler();

    if (S.mode === 'single') {
      var pool = POOLS[S.pool];
      var pick, guard = 0;
      do {
        pick = pool.notes[Math.floor(Math.random() * pool.notes.length)];
        guard++;
      } while (pick === S.lastTarget && pool.notes.length > 1 && guard < 20);
      S.lastTarget = pick;
      S.target = pick;
      $('progBar').style.width = (S.correct / pool.need * 100).toFixed(1) + '%';
      $('promptText').dataset.hint = pool.name;
    } else if (S.mode === 'ladder') {
      if (S.ladderIdx >= LADDER.length) { return finishAll(); }
      S.target = LADDER[S.ladderIdx];
      $('progBar').style.width = (S.ladderIdx / LADDER.length * 100).toFixed(1) + '%';
      $('promptText').dataset.hint = '第 ' + (S.ladderIdx + 1) + ' 层';
      markLadder();
    }
    renderTarget(S.target);
    playTarget();
  }

  function advance() {
    if (S.mode === 'single') {
      var pool = POOLS[S.pool];
      if (S.correct >= pool.need) {
        S.pool++;
        S.correct = 0;
        if (S.pool >= POOLS.length) return finishAll();
        setPrompt('升级啦！' + POOLS[S.pool].name);
        later(newQuestion, 1400);
        return;
      }
      newQuestion();
    } else if (S.mode === 'ladder') {
      S.ladderIdx++;
      if (S.ladderIdx >= LADDER.length) return finishAll();
      newQuestion();
    }
  }

  function finishAll() {
    stopListening();
    S.gen++;
    $('progBar').style.width = '100%';
    $('resultStars').textContent = '🏆';
    $('resultTitle').textContent = '闯关成功！';
    $('resultSub').textContent = '今天唱得真好听～';
    $('resultLayer').hidden = false;
    $('resultCard').className = 'result-card show s3';
    AE.sfx('great');
    burstStars();
    whaleReact('happy', 2000);
    later(function () {
      $('resultLayer').hidden = true;
      S.pool = 0; S.correct = 0; S.ladderIdx = 0;
      newQuestion();
    }, 2600);
  }

  function markLadder() {
    var cells = $('scaleStrip').children;
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.toggle('done', i < S.ladderIdx);
      cells[i].classList.toggle('now', i === S.ladderIdx);
    }
  }

  /* ---------- 模式入口 ---------- */
  function enterMode(mode) {
    AE.resume();
    S.mode = mode;
    S.gen++;
    stopListening();
    stopTimers();
    $('btnAgain').hidden = true;
    $('btnAgain').onclick = null;
    $('resultLayer').hidden = true;

    if (mode === 'free') { startFree(); return; }

    S.pool = 0; S.correct = 0; S.ladderIdx = 0;
    showScreen('play');
    if (mode === 'ladder') buildScaleStrip();

    // 先出题（马上有声音），麦克风在后台打开，不阻塞界面
    newQuestion();
    AE.enableMic().then(function (r) {
      if (r.ok) return;
      if (AE.isMicReady()) return;      // 已经可用（例如测试注入）
      if (S.mode !== mode) return;      // 已经离开这个模式
      if (S.listening) return;          // 正在听，别打断
      micFail(r);
    });
  }

  function buildScaleStrip() {
    var html = '';
    for (var i = 0; i < LADDER.length; i++) {
      var m = LADDER[i];
      html += '<div class="scale-cell" data-midi="' + m + '">' + PD.solfege(m) + '</div>';
    }
    $('scaleStrip').innerHTML = html;
  }

  function micFail(r) {
    setPrompt('没有听到麦克风的声音哦');
    $('btnAgain').hidden = false;
    $('btnAgain').textContent = '重新允许';
    $('btnAgain').onclick = function () {
      $('btnAgain').onclick = null;
      enterMode(S.mode);
    };
    var tip = r.reason === 'NotAllowedError' ? '需要允许麦克风才能玩哦' :
      r.reason === 'no-api' ? '这个浏览器不支持麦克风' : '麦克风打开失败';
    $('promptText').textContent = tip + '，点「重新允许」再试';
  }

  /* ---------- 自由练声 ---------- */
  function startFree() {
    showScreen('free');
    buildScaleStrip();
    $('freeNote').textContent = '…';
    $('freeName').textContent = '正在打开麦克风…';
    $('freePrompt').textContent = '唱一个音吧～';
    $('freeNeedle').style.left = '50%';
    $('freeNeedle').className = 'needle idle';
    S.freeMode = true;
    loopFree();
    AE.enableMic().then(function (r) {
      if (S.mode !== 'free') return;
      if (!r.ok) {
        $('freePrompt').textContent = '麦克风打不开，允许一下再进来～';
        $('freeName').textContent = '没听到声音';
        return;
      }
      $('freeName').textContent = '听着呢，唱吧';
    });
  }

  function stopFree() {
    S.freeMode = false;
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
  }

  function loopFree() {
    if (!S.freeMode) return;
    var p = AE.readPitch();
    if (p && p.clarity > 0.5 && p.rms > 0.01) {
      var m = PD.freqToMidi(p.freq);
      var near = Math.round(m);
      $('freeNote').textContent = PD.solfege(near);
      $('freeName').textContent = PD.midiName(near) + ' · ' + PD.degree(near);
      $('freeNote').style.color = COLORS[['do', 're', 'mi', 'fa', 'sol', 'la', 'si'].indexOf(PD.solfege(near))] || '#fff';
      var pct = Math.max(0, Math.min(100, (m - 60) / 12 * 100));
      var nn = $('freeNeedle');
      nn.style.left = pct.toFixed(1) + '%';
      nn.className = 'needle live';
      var cells = $('scaleStrip').children;
      for (var i = 0; i < cells.length; i++) {
        cells[i].classList.toggle('hot', Number(cells[i].dataset.midi) === near);
      }
    } else {
      $('freeNote').textContent = '…';
      $('freeName').textContent = '等着你唱呢';
      $('freeNote').style.color = '#bdebff';
      var cells2 = $('scaleStrip').children;
      for (var j = 0; j < cells2.length; j++) cells2[j].classList.remove('hot');
    }
    S.raf = requestAnimationFrame(loopFree);
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    $('btnSingle').addEventListener('click', function () { enterMode('single'); });
    $('btnLadder').addEventListener('click', function () { enterMode('ladder'); });
    $('btnFree').addEventListener('click', function () { enterMode('free'); });
    $('btnFreeStop').addEventListener('click', function () {
      stopFree();
      goHome();
    });
    $('btnBack').addEventListener('click', function () {
      goHome();
    });
    $('btnReplay').addEventListener('click', function () {
      if (S.mode === 'free') return;
      stopListening();
      stopTimers();
      S.gen++;
      $('btnAgain').hidden = true;
      $('resultLayer').hidden = true;
      playTarget();
    });
    $('btnAgain').addEventListener('click', function () {
      if ($('btnAgain').onclick) return; // 麦克风重试自己接管
      $('btnAgain').hidden = true;
      stopListening();
      stopTimers();
      S.gen++;
      playTarget();
    });
  }

  function goHome() {
    S.mode = null;
    S.gen++;
    stopListening();
    stopTimers();
    stopFree();
    $('resultLayer').hidden = true;
    showScreen('home');
  }

  /* ---------- 启动 ---------- */
  function init() {
    plantWhales();
    plantBubbles();
    buildScaleStrip();
    bind();
    resetRuler();
    showScreen('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 调试接口（自动化测试用，不影响正常游玩）
  window.__PITCH_GAME__ = {
    state: S,
    judge: judge,
    enterMode: enterMode,
    audio: AE
  };

  // ?auto=single|ladder|free 直接进入模式（自动化测试 / 快捷入口）
  try {
    var auto = new URLSearchParams(location.search).get('auto');
    if (auto) setTimeout(function () { enterMode(auto); }, 350);
  } catch (e) {}
})();
