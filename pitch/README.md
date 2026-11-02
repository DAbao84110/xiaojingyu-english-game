# 听音唱音 · 小鲸唱歌课

给小朋友练耳和练唱的小游戏。鲸鱼先唱一个音，小朋友跟着唱，游戏听音准不准、给星星。

## 玩法

1. **听音跟唱** — 鲸鱼随机唱一个音（先 do mi sol，再五个音，最后整条音阶），跟着唱，唱准了得星星
2. **音阶爬梯** — do re mi fa sol la si do 一层一层爬上去，每层唱准才走下一步
3. **自由练声** — 随便唱，实时显示唱名和音高指针，看谁唱得高

判定：误差 ≤48 音分 = ⭐⭐⭐，≤95 = ⭐⭐，≤160 = ⭐，再偏就得重来。

## 技术

- 纯前端，无依赖，`pitch.js / audio.js / game.js / style.css` 四个文件
- 发声：Web Audio API 合成木琴音色（基频 + 2/3/4 次谐波 + 指数包络）
- 拾音：`getUserMedia` + AnalyserNode（4096 点时域）
- 音高检测：`pitch.js` 里的 **NSDF（归一化平方差函数）**，取第一个显著峰抑制八度误判，抛物线插值到亚采样精度；2 倍降采样把计算量压到手机上可跑
- 判定：把 3.8 秒内的 midi 帧按 1 个半音窗口聚类，取最长稳定簇的中位数，跟目标音比音分

## 兼容

- 需要 **HTTPS**（或 localhost）才能用麦克风
- 微信内置浏览器、iOS Safari、Chrome / Edge 都支持
- 第一次进入会弹麦克风授权，选“允许”

## 本地跑

```powershell
cd games/pitch-game
pyenv -m http.server 8899
# 浏览器打开 http://127.0.0.1:8899/
```

## 测试

```powershell
node tests/test_pitch.mjs    # 32 项：检测精度、抗八度误判、噪声、判定分档
```

## 目录

```
index.html      界面
style.css       海洋主题样式
pitch.js        音高检测 + 判定（浏览器 / Node 通用，可单测）
audio.js        发声、音效、麦克风
game.js         游戏状态机
tests/          音高检测单测
```
