(() => {
  "use strict";

  const audio = document.querySelector("#audio");
  const catalogEl = document.querySelector("#catalog");
  const errorEl = document.querySelector("#catalog-error");
  const countEl = document.querySelector("#track-count");
  const groupTabsEl = document.querySelector("#group-tabs");
  const player = document.querySelector("#player");
  const titleEl = document.querySelector("#player-title");
  const statusEl = document.querySelector("#player-status");
  const metaEl = document.querySelector("#player-meta");
  const noteEl = document.querySelector("#player-note-copy");
  const notePanel = document.querySelector("#player-note");
  const infoToggle = document.querySelector("#info-toggle");
  const toggle = document.querySelector("#toggle");
  const toggleIcon = document.querySelector("#toggle-icon");
  const prevButton = document.querySelector("#prev");
  const nextButton = document.querySelector("#next");
  const progress = document.querySelector("#progress");
  const elapsedEl = document.querySelector("#elapsed");
  const durationEl = document.querySelector("#duration");
  const volume = document.querySelector("#volume");
  const canvas = document.querySelector("#visualizer");
  const ctx = canvas.getContext("2d", { alpha: true });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let tracks = [];
  let activeIndex = -1;
  let activeGroup = "all";
  let audioContext = null;
  let analyser = null;
  let source = null;
  let frequencyData = null;
  let animationFrame = null;

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  };

  const trackMeta = (track) => [track.bpm ? `${track.bpm} bpm` : "", track.key || ""].filter(Boolean).join(" · ");
  const trackGroup = (track) => (typeof track.group === "string" && track.group.trim() ? track.group.trim() : "Other");

  function visibleTrackIndices() {
    const indices = [];
    tracks.forEach((track, index) => {
      if (activeGroup === "all" || trackGroup(track) === activeGroup) indices.push(index);
    });
    return indices;
  }

  function setActiveGroup(group) {
    activeGroup = group;
    renderGroupTabs();
    renderCatalog();
    if (activeIndex >= 0) selectTrack(activeIndex, false);
  }

  function renderGroupTabs() {
    const groups = [];
    tracks.forEach((track) => {
      const group = trackGroup(track);
      if (!groups.includes(group)) groups.push(group);
    });

    const entries = [
      { id: "all", label: "All", count: tracks.length },
      ...groups.map((group) => ({ id: group, label: group, count: tracks.filter((track) => trackGroup(track) === group).length }))
    ];

    groupTabsEl.replaceChildren();
    entries.forEach((entry, position) => {
      const button = document.createElement("button");
      button.className = "group-tab";
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(entry.id === activeGroup));
      button.setAttribute("aria-controls", "catalog");
      button.tabIndex = entry.id === activeGroup ? 0 : -1;
      button.append(document.createTextNode(entry.label));

      const count = document.createElement("span");
      count.className = "group-tab-count";
      count.textContent = String(entry.count);
      button.append(count);

      button.addEventListener("click", () => setActiveGroup(entry.id));
      button.addEventListener("keydown", (event) => {
        const tabs = Array.from(groupTabsEl.querySelectorAll('[role="tab"]'));
        let nextPosition = position;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") nextPosition = (position + 1) % tabs.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextPosition = (position - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") nextPosition = 0;
        else if (event.key === "End") nextPosition = tabs.length - 1;
        else return;
        event.preventDefault();
        setActiveGroup(entries[nextPosition].id);
        groupTabsEl.querySelector('[role="tab"][aria-selected="true"]')?.focus();
      });
      groupTabsEl.append(button);
    });
  }

  function renderCatalog() {
    catalogEl.replaceChildren();
    const visible = visibleTrackIndices();
    visible.forEach((index) => {
      const track = tracks[index];
      const row = document.createElement("article");
      row.className = "track";
      row.dataset.index = String(index);
      row.tabIndex = 0;

      const main = document.createElement("div");
      main.className = "track-main";

      const title = document.createElement("h3");
      title.className = "track-title";
      const number = document.createElement("span");
      number.className = "track-index";
      number.textContent = String(index + 1).padStart(2, "0");
      title.append(number, document.createTextNode(track.title));

      const sub = document.createElement("p");
      sub.className = "track-sub";
      sub.textContent = track.collection || "sample lab";
      main.append(title, sub);

      const status = document.createElement("span");
      status.className = "track-status";
      status.textContent = track.status || "demo";

      const meta = document.createElement("span");
      meta.className = "track-meta";
      meta.textContent = trackMeta(track) || "—";

      const play = document.createElement("button");
      play.className = "track-play";
      play.type = "button";
      play.setAttribute("aria-label", `Play ${track.title}`);
      play.textContent = "▶";

      row.append(main, status, meta, play);
      const activateRow = () => {
        if (index === activeIndex && !audio.paused) audio.pause();
        else selectTrack(index, true);
      };
      row.addEventListener("click", activateRow);
      row.addEventListener("keydown", (event) => {
        if (event.target !== row) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateRow();
        }
      });
      catalogEl.append(row);
    });
    const count = visible.length;
    countEl.textContent = activeGroup === "all"
      ? `${count} render${count === 1 ? "" : "s"}`
      : `${count} of ${tracks.length} renders`;
  }

  async function ensureAudioGraph() {
    if (!audioContext) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      audioContext = new AudioContextCtor();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      frequencyData = new Uint8Array(analyser.frequencyBinCount);
    }
    if (audioContext.state === "suspended") await audioContext.resume();
    if (!animationFrame) draw();
  }

  function selectTrack(index, autoplay = false) {
    if (!tracks.length) return;
    const normalized = (index + tracks.length) % tracks.length;
    const sameTrack = normalized === activeIndex;
    activeIndex = normalized;
    const track = tracks[activeIndex];

    if (!sameTrack) {
      audio.src = track.src;
      audio.load();
      progress.value = "0";
      elapsedEl.textContent = "0:00";
      durationEl.textContent = "0:00";
    }

    titleEl.textContent = track.title;
    statusEl.textContent = track.status || "demo";
    metaEl.textContent = [track.collection, trackMeta(track)].filter(Boolean).join(" / ");
    noteEl.textContent = track.note || "No note for this render.";
    document.querySelectorAll(".track").forEach((row) => {
      const rowIndex = Number(row.dataset.index);
      row.classList.toggle("active", rowIndex === activeIndex);
      const button = row.querySelector(".track-play");
      const isActivePlaying = rowIndex === activeIndex && !audio.paused;
      button.textContent = isActivePlaying ? "Ⅱ" : "▶";
      button.setAttribute("aria-label", `${isActivePlaying ? "Pause" : "Play"} ${tracks[rowIndex].title}`);
    });

    if (autoplay) playAudio();
  }

  function stepTrack(direction) {
    const visible = visibleTrackIndices();
    if (!visible.length) return;
    const currentPosition = visible.indexOf(activeIndex);
    const nextPosition = currentPosition === -1
      ? (direction > 0 ? 0 : visible.length - 1)
      : (currentPosition + direction + visible.length) % visible.length;
    selectTrack(visible[nextPosition], true);
  }

  async function playAudio() {
    if (activeIndex < 0 && tracks.length) selectTrack(0, false);
    if (activeIndex < 0) return;
    try {
      await ensureAudioGraph();
      await audio.play();
    } catch (error) {
      console.warn("Playback could not start", error);
    }
  }

  function syncPlayingState() {
    const playing = !audio.paused && !audio.ended;
    player.classList.toggle("playing", playing);
    toggle.setAttribute("aria-pressed", String(playing));
    toggle.setAttribute("aria-label", playing ? "Pause" : "Play");
    toggleIcon.textContent = playing ? "Ⅱ" : "▶";
    document.querySelectorAll(".track").forEach((row) => {
      const rowIndex = Number(row.dataset.index);
      const button = row.querySelector(".track-play");
      const isActivePlaying = rowIndex === activeIndex && playing;
      button.textContent = isActivePlaying ? "Ⅱ" : "▶";
      button.setAttribute("aria-label", `${isActivePlaying ? "Pause" : "Play"} ${tracks[rowIndex].title}`);
    });
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(window.innerWidth * ratio));
    const height = Math.max(1, Math.floor(window.innerHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function averageRange(data, from, to) {
    const start = Math.max(0, Math.floor(data.length * from));
    const end = Math.min(data.length, Math.ceil(data.length * to));
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += data[index];
    return end > start ? sum / (end - start) / 255 : 0;
  }

  function draw() {
    animationFrame = requestAnimationFrame(draw);
    resizeCanvas();
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    let low = 0.03;
    let mid = 0.02;
    let high = 0.015;
    if (analyser && frequencyData && !audio.paused) {
      analyser.getByteFrequencyData(frequencyData);
      low = averageRange(frequencyData, 0.0, 0.12);
      mid = averageRange(frequencyData, 0.12, 0.45);
      high = averageRange(frequencyData, 0.45, 0.88);
    }

    document.documentElement.style.setProperty("--low", low.toFixed(3));
    document.documentElement.style.setProperty("--mid", mid.toFixed(3));
    document.documentElement.style.setProperty("--high", high.toFixed(3));

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const lineY = height * (0.38 + low * 0.045);
    const amplitude = (24 + mid * 150) * ratio;
    const slices = reducedMotion.matches ? 22 : 64;

    ctx.beginPath();
    for (let index = 0; index <= slices; index += 1) {
      const x = (index / slices) * width;
      const phase = index * 0.72 + performance.now() * 0.00045;
      const y = lineY + Math.sin(phase) * amplitude * (0.16 + high * 0.84) + Math.sin(phase * 0.31) * amplitude * 0.22;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(184, 154, 231, ${0.08 + mid * 0.22})`;
    ctx.lineWidth = ratio;
    ctx.stroke();

    const bars = reducedMotion.matches ? 12 : 36;
    for (let index = 0; index < bars; index += 1) {
      const normalized = index / bars;
      const sample = frequencyData && analyser && !audio.paused ? frequencyData[Math.min(frequencyData.length - 1, Math.floor(normalized * frequencyData.length * 0.68))] / 255 : 0.015;
      const x = width * (0.08 + normalized * 0.84);
      const barHeight = sample * height * 0.12;
      ctx.fillStyle = `rgba(183, 206, 159, ${0.035 + sample * 0.13})`;
      ctx.fillRect(x, height * 0.82 - barHeight, Math.max(1, ratio), barHeight);
    }
  }

  toggle.addEventListener("click", () => {
    if (audio.paused) playAudio();
    else audio.pause();
  });
  prevButton.addEventListener("click", () => stepTrack(-1));
  nextButton.addEventListener("click", () => stepTrack(1));
  audio.addEventListener("play", syncPlayingState);
  audio.addEventListener("pause", syncPlayingState);
  audio.addEventListener("ended", () => stepTrack(1));
  audio.addEventListener("loadedmetadata", () => { durationEl.textContent = formatTime(audio.duration); });
  audio.addEventListener("timeupdate", () => {
    elapsedEl.textContent = formatTime(audio.currentTime);
    progress.value = String(audio.duration ? Math.round((audio.currentTime / audio.duration) * 1000) : 0);
  });
  progress.addEventListener("input", () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
  });
  volume.addEventListener("input", () => { audio.volume = Number(volume.value); });
  audio.volume = Number(volume.value);
  infoToggle.addEventListener("click", () => {
    const show = notePanel.hidden;
    notePanel.hidden = !show;
    infoToggle.setAttribute("aria-expanded", String(show));
  });
  window.addEventListener("resize", resizeCanvas);

  fetch("catalog.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`catalog request failed (${response.status})`);
      return response.json();
    })
    .then((catalog) => {
      if (!catalog || !Array.isArray(catalog.tracks)) throw new Error("catalog.json must contain a tracks array");
      tracks = catalog.tracks;
      renderGroupTabs();
      renderCatalog();
      if (tracks.length) selectTrack(0, false);
      draw();
    })
    .catch((error) => {
      console.error(error);
      errorEl.hidden = false;
      errorEl.textContent = "Could not load the listening catalog.";
      countEl.textContent = "offline";
      draw();
    });
})();
