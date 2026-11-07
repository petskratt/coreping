<script>
  import Histogram from './chart/Histogram.svelte';
  import LineChart from './chart/LineChart.svelte';
  import { dumpStorage, restoreBackup } from './lib/backup.js';
  import { buildCsv } from './lib/csv.js';
  import { completedLine, tracingLine } from './lib/log.js';
  import { refreshNames, usedPrefixes } from './lib/names.js';
  import { appendHops, expandRoundTrip, hopsFromSavedRoute, parsePrefixList, takeReadyPrefixes } from './lib/path.js';
  import { bluetoothAvailable, byLastSeen, connectCompanion, contactPrefix, loadIdentity } from './lib/radio.js';
  import { runLimitReached, startKeepAlive, waitAfterRound, waitingLine } from './lib/schedule.js';
  import { assignColorIndices, colorForLink, remotePairKeys } from './lib/colors.js';
  import { buildSeries, isVisible, seriesLabel, strokeDash } from './lib/series.js';
  import { formatLoss, formatSnr, formatTimestamp, summarize } from './lib/stats.js';
  import { exportBaseName } from './lib/filename.js';
  import { sampleBoard } from './lib/sample.js';
  import { appendSamples, clampTraceLimits, clipForwardHops, DEFAULT_DURATION_SEC, DEFAULT_HASH_BYTES, DEFAULT_INTERVAL_SEC, DEFAULT_PATH_STEPS, durationHoursLabel, loadState, MAX_CONCURRENT_TRACES, PATH_STEP_CHOICES, saveState } from './lib/store.js';
  import { activeTraces, traceRound } from './lib/trace.js';

  const saved = loadState();

  let intervalSec = $state(saved.intervalSec);
  let hashBytes = $state(saved.hashBytes);
  let maxDurationSec = $state(saved.maxDurationSec);
  let pathSteps = $state(saved.pathSteps);
  let targets = $state(saved.targets);
  let samples = $state(saved.samples);
  let breaks = $state(saved.breaks);
  let visibility = $state(saved.visibility);
  let colorIndex = $state(saved.colorIndex);
  let selectedId = $state(saved.targets[0]?.id ?? null);

  let connState = $state('off');
  let statusDetail = $state('');
  let selfName = $state(saved.selfName);
  let deviceName = $state('');
  let contacts = $state([]);
  let names = $state(saved.names);
  let contactFilter = $state('');
  let drafts = $state({});
  let fieldError = $state({ id: '', message: '' });
  let fieldNote = $state({ id: '', message: '' });
  let running = $state(false);
  let busy = $state(false);
  let onePing = $state(false);
  let tracingText = $state('');
  let bleOk = $state(bluetoothAvailable());
  let exportOpen = $state(false);
  let settingsOpen = $state(false);
  let targetsOpen = $state(false);

  const sample = sampleBoard();

  let conn = null;
  let token = 0;
  let hurry = false;
  let wake = () => {};
  let exportRoot = null;
  let settingsRoot = null;
  let importInput = null;

  $effect(() => {
    const snapshot = {
      intervalSec,
      hashBytes,
      maxDurationSec,
      pathSteps,
      targets: targets.map((target) => ({ id: target.id, enabled: target.enabled, hops: [...target.hops] })),
      samples: samples.slice(),
      breaks: breaks.slice(),
      visibility: { ...visibility },
      colorIndex: { ...colorIndex },
      names: { ...names },
      selfName,
    };
    saveState(snapshot);
  });

  $effect(() => {
    if (!exportOpen && !settingsOpen) return;
    const close = (event) => {
      if (exportOpen && !exportRoot?.contains(event.target)) exportOpen = false;
      if (settingsOpen && !settingsRoot?.contains(event.target)) settingsOpen = false;
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  });

  const configured = $derived(targets.some((target) => target.hops.length > 0));
  const demo = $derived(connState !== 'on' && samples.length === 0 && !configured);
  const targetsToggleEnabled = $derived(samples.length > 0);
  const targetsVisible = $derived(samples.length === 0 || targetsOpen);
  const clearLabel = $derived(samples.length ? 'Clear samples' : 'Clear targets');
  const longRun = $derived(maxDurationSec > DEFAULT_DURATION_SEC);
  const roundPlan = $derived(activeTraces(targets, pathSteps));
  const tracedIds = $derived(new Set(roundPlan.targets.map((target) => target.id)));

  function nameOf(hex) {
    const book = demo ? sample.names : names;
    const me = demo ? sample.selfName : selfName;
    if (hex == null) return me || 'me';
    const key = String(hex).toLowerCase();
    return book[key] || hex;
  }

  function remember(prefixes) {
    const learned = refreshNames(names, contacts, prefixes);
    let changed = false;
    const next = { ...names };
    for (const [prefix, name] of Object.entries(learned)) {
      if (next[prefix] === name) continue;
      next[prefix] = name;
      changed = true;
    }
    if (changed) names = next;
  }

  const series = $derived(buildSeries(targets, samples, true));
  const viewSeries = $derived(demo ? buildSeries(sample.targets, sample.samples, true) : series);
  const colorMap = $derived(assignColorIndices(remotePairKeys(series), colorIndex));
  const viewColorMap = $derived(assignColorIndices(remotePairKeys(viewSeries), demo ? {} : colorIndex));

  $effect(() => {
    const next = colorMap;
    const keys = Object.keys(next);
    const same = keys.length === Object.keys(colorIndex).length
      && keys.every((key) => colorIndex[key] === next[key]);
    if (!same) colorIndex = next;
  });

  const drawn = $derived(viewSeries
    .filter((line) => isVisible(line, demo ? {} : visibility))
    .map((line) => ({
      ...line,
      color: colorForLink(line.hearerHex, line.prevHex, viewColorMap),
      label: seriesLabel(line, nameOf),
    })));
  const statsRows = $derived(drawn
    .map((line) => ({ ...line, summary: summarize(line.values) }))
    .filter((line) => line.summary?.attempts));
  const consoleLines = $derived([...(demo ? sample.samples : samples)]
    .sort((a, b) => b.t - a.t)
    .map((sample) => ({
      key: `${sample.t}:${sample.targetId}`,
      text: completedLine(sample, nameOf),
    })));
  const listedContacts = $derived(demo ? sample.contacts : contacts
    .filter((contact) => {
      const query = contactFilter.trim().toLowerCase();
      if (!query) return true;
      const prefix = contactPrefix(contact, hashBytes);
      return contact.name.toLowerCase().includes(query) || prefix.includes(query);
    })
    .sort(byLastSeen));

  function newId() {
    return crypto.randomUUID();
  }

  function selectTarget(id) {
    selectedId = id;
  }

  $effect(() => {
    if (demo || targets.length > 0) return;
    addTarget();
  });

  function addTarget(hops = []) {
    const id = newId();
    targets = [...targets, { id, hops, enabled: true }];
    selectedId = id;
    return id;
  }

  function ensureSelected() {
    if (selectedId && targets.some((target) => target.id === selectedId)) return selectedId;
    if (targets.length) {
      selectedId = targets[0].id;
      return selectedId;
    }
    return addTarget();
  }

  function removeTarget(id) {
    const target = targets.find((item) => item.id === id);
    if (targets.length === 1 && target && target.hops.length === 0) return;
    targets = targets.filter((item) => item.id !== id);
    if (selectedId === id) selectedId = targets[0]?.id ?? null;
  }

  function removeHop(target, index) {
    target.hops = target.hops.filter((_, hopIndex) => hopIndex !== index);
  }

  function pathLimitNote(steps) {
    return `Path is limited to ${steps} forward ${steps === 1 ? 'node' : 'nodes'}.`;
  }

  function applyHops(target, incoming, { replace = false } = {}) {
    const base = replace ? [] : target.hops;
    const result = appendHops(base, incoming);
    const hops = clipForwardHops(result.hops, pathSteps);
    const limited = hops.length < result.hops.length;
    const added = hops.length - base.length;
    if (!added && result.cutAt) {
      fieldError = { id: '', message: '' };
      fieldNote = { id: target.id, message: `${nameOf(result.cutAt)} is already on this path.` };
      return;
    }
    if (!added && limited) {
      fieldError = { id: '', message: '' };
      fieldNote = { id: target.id, message: pathLimitNote(pathSteps) };
      return;
    }
    target.hops = hops;
    remember(hops);
    fieldError = { id: '', message: '' };
    fieldNote = limited
      ? { id: target.id, message: pathLimitNote(pathSteps) }
      : result.cutAt
        ? { id: target.id, message: `Removed repeated hops starting at ${nameOf(result.cutAt)}.` }
        : { id: '', message: '' };
  }

  function onDraft(target, value) {
    const result = takeReadyPrefixes(value, hashBytes);
    if (result.hops.length) applyHops(target, result.hops);
    else if (result.error && fieldNote.id === target.id) fieldNote = { id: '', message: '' };
    drafts[target.id] = result.pending;
    if (result.error) fieldError = { id: target.id, message: result.error };
    else if (fieldError.id === target.id) fieldError = { id: '', message: '' };
  }

  function commitDraft(target) {
    const pending = (drafts[target.id] || '').trim();
    if (!pending) return;
    try {
      const hops = parsePrefixList(pending, hashBytes);
      if (!hops.length) return;
      applyHops(target, hops);
      drafts[target.id] = '';
    } catch (err) {
      fieldError = { id: target.id, message: err.message };
      fieldNote = { id: '', message: '' };
    }
  }

  function appendContact(contact) {
    const id = ensureSelected();
    const target = targets.find((item) => item.id === id);
    applyHops(target, [contactPrefix(contact, hashBytes)]);
  }

  function useRoute(contact) {
    const route = hopsFromSavedRoute(contact.outPath, contact.outPathLen, contact.publicKey, hashBytes);
    if (route.error) {
      fieldError = { id: selectedId || '', message: route.error };
      fieldNote = { id: '', message: '' };
      statusDetail = route.error;
      return;
    }
    const id = ensureSelected();
    const target = targets.find((item) => item.id === id);
    applyHops(target, route.hops, { replace: true });
  }

  function toggleLine(line) {
    visibility = { ...visibility, [line.key]: !isVisible(line, visibility) };
  }

  function poke() {
    hurry = true;
    const current = wake;
    wake = () => {};
    current();
  }

  function waitOrWake(ms) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, ms);
      wake = finish;
    });
  }

  async function runOnce(myToken) {
    if (!conn || busy) return;
    const snapshot = targets.map((target) => ({
      id: target.id,
      enabled: target.enabled,
      hops: [...target.hops],
    }));
    const width = hashBytes;
    busy = true;
    try {
      const batch = await traceRound(conn, snapshot, width, true, () => myToken !== token, (event) => {
        if (myToken !== token) return;
        if (event.phase === 'running') {
          tracingText = tracingLine(event.sent, nameOf);
          statusDetail = tracingText;
          return;
        }
        tracingText = '';
        samples = appendSamples(samples, [event.sample]);
        statusDetail = completedLine(event.sample, nameOf);
      }, pathSteps);
      if (myToken !== token) return;
      if (!batch.length) statusDetail = 'No targets to trace.';
    } catch (err) {
      if (myToken !== token) return;
      statusDetail = err?.message || String(err);
    } finally {
      busy = false;
      tracingText = '';
    }
  }

  function exportCsv() {
    const labeled = series.map((line) => ({ ...line, label: seriesLabel(line, nameOf) }));
    const summaryRows = labeled
      .map((line) => ({ label: line.label, summary: summarize(line.values) }))
      .filter((row) => row.summary?.attempts);
    const sampleRows = [];
    for (const line of labeled) {
      for (const point of line.values) {
        const target = targets.find((item) => item.id === point.targetId);
        const targetName = target?.hops?.length
          ? target.hops.map((hop) => nameOf(hop)).join(' -> ')
          : (point.targetId || line.key);
        const sample = samples.find((item) => item.t === point.t && item.targetId === point.targetId);
        sampleRows.push({
          t: point.t,
          hopIndex: point.hopIndex ?? 0,
          target: targetName,
          path: (sample?.sent || []).join(','),
          hop: line.label,
          direction: point.dir || line.dir,
          snr: point.snr,
        });
      }
    }
    const blob = new Blob([buildCsv(summaryRows, sampleRows)], { type: 'text/csv;charset=utf-8' });
    download(`${exportBaseName(targets, nameOf, fileStamp())}.csv`, blob);
    exportOpen = false;
  }

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function fileStamp() {
    return formatTimestamp(Date.now()).replaceAll(/[ :]/g, '-');
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(dumpStorage(localStorage), null, 2)], { type: 'application/json' });
    download(`${exportBaseName(targets, nameOf, fileStamp())}.json`, blob);
    exportOpen = false;
  }

  function applyImported(state) {
    intervalSec = state.intervalSec;
    hashBytes = state.hashBytes;
    maxDurationSec = state.maxDurationSec;
    pathSteps = state.pathSteps;
    targets = state.targets;
    samples = state.samples;
    breaks = state.breaks;
    visibility = state.visibility;
    colorIndex = state.colorIndex;
    names = state.names;
    selfName = state.selfName;
    selectedId = state.targets.some((target) => target.id === selectedId) ? selectedId : (state.targets[0]?.id ?? null);
    drafts = {};
    fieldError = { id: '', message: '' };
    fieldNote = { id: '', message: '' };
  }

  function importedLine(beforeTargets, beforeSamples, state) {
    const targetsAdded = state.targets.filter((target) => target.hops.length).length - beforeTargets;
    const samplesAdded = state.samples.length - beforeSamples;
    if (targetsAdded <= 0 && samplesAdded <= 0) return 'Nothing new to import.';
    const parts = [];
    if (targetsAdded > 0) parts.push(`${targetsAdded} ${targetsAdded === 1 ? 'target' : 'targets'}`);
    if (samplesAdded > 0) parts.push(`${samplesAdded} ${samplesAdded === 1 ? 'sample' : 'samples'}`);
    return `Imported ${parts.join(' and ')}.`;
  }

  function acceptImport(dump) {
    const beforeTargets = targets.filter((target) => target.hops.length).length;
    const beforeSamples = samples.length;
    const state = restoreBackup(dump, localStorage);
    applyImported(state);
    statusDetail = importedLine(beforeTargets, beforeSamples, state);
  }

  async function onImport(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    exportOpen = false;
    if (!file) return;
    try {
      acceptImport(JSON.parse(await file.text()));
    } catch (err) {
      statusDetail = err instanceof SyntaxError ? 'That file is not JSON.' : (err?.message || 'Could not import that file.');
    }
  }

  async function pauseForInterval(ms, myToken, runStarted) {
    const ends = Date.now() + ms;
    while (myToken === token) {
      if (hurry) {
        hurry = false;
        return 'ready';
      }
      if (runLimitReached(runStarted, Date.now(), maxDurationSec)) return 'limit';
      const left = ends - Date.now();
      if (left <= 0) return 'ready';
      statusDetail = waitingLine(left);
      const untilLimit = runStarted + maxDurationSec * 1000 - Date.now();
      await waitOrWake(Math.min(left, 1000, Math.max(0, untilLimit)));
    }
    hurry = false;
    return 'stopped';
  }

  function stopForLimit() {
    if (samples.length) markBreak();
    statusDetail = `Stopped after ${durationHoursLabel(maxDurationSec)}.`;
  }

  async function loop(myToken) {
    const keepAlive = startKeepAlive();
    const runStarted = Date.now();
    try {
      while (myToken === token) {
        if (runLimitReached(runStarted, Date.now(), maxDurationSec)) {
          stopForLimit();
          break;
        }
        const started = Date.now();
        await runOnce(myToken);
        if (myToken !== token) break;
        if (runLimitReached(runStarted, Date.now(), maxDurationSec)) {
          stopForLimit();
          break;
        }
        const wait = waitAfterRound(started, Date.now(), intervalSec * 1000);
        const pause = await pauseForInterval(wait, myToken, runStarted);
        if (pause === 'limit') {
          stopForLimit();
          break;
        }
        if (pause !== 'ready') break;
      }
    } finally {
      keepAlive.stop();
      if (myToken === token) running = false;
    }
  }

  function markBreak() {
    breaks = [...breaks, Date.now()];
  }

  function start() {
    if (running || !conn) return;
    if (samples.length) markBreak();
    const myToken = ++token;
    running = true;
    loop(myToken);
  }

  function stop() {
    const wasRunning = running;
    if (wasRunning) markBreak();
    token += 1;
    running = false;
    poke();
    if (wasRunning) statusDetail = 'Stopped.';
  }

  function traceNow() {
    if (!conn || busy) return;
    if (running) {
      poke();
      return;
    }
    onePing = true;
    runOnce(token).finally(() => { onePing = false; });
  }

  async function connect() {
    connState = 'connecting';
    statusDetail = 'Choose the companion in the Bluetooth picker.';
    try {
      conn = await connectCompanion();
      conn.on('disconnected', () => {
        conn = null;
        connState = 'off';
        stop();
        statusDetail = 'Radio disconnected.';
      });
      const identity = await loadIdentity(conn);
      selfName = identity.selfName;
      deviceName = identity.deviceName;
      contacts = identity.contacts;
      names = refreshNames(names, identity.contacts, usedPrefixes(targets, samples));
      connState = 'on';
      const count = contacts.length;
      statusDetail = count === 1 ? '1 contact loaded.' : `${count} contacts loaded.`;
    } catch (err) {
      conn = null;
      connState = 'off';
      if (err?.name === 'NotFoundError') {
        statusDetail = 'No device selected.';
        return;
      }
      statusDetail = err?.message || String(err);
    }
  }

  function disconnect() {
    stop();
    const current = conn;
    conn = null;
    connState = 'off';
    statusDetail = 'Disconnected.';
    current?.close();
  }

  function chooseInterval(value) {
    const next = clampTraceLimits(Number(value), maxDurationSec);
    intervalSec = next.intervalSec;
    maxDurationSec = next.maxDurationSec;
    settingsOpen = false;
  }

  function chooseDuration(value) {
    const next = clampTraceLimits(intervalSec, Number(value));
    intervalSec = next.intervalSec;
    maxDurationSec = next.maxDurationSec;
    settingsOpen = false;
  }

  function choosePathSteps(value) {
    const steps = PATH_STEP_CHOICES.includes(Number(value)) ? Number(value) : DEFAULT_PATH_STEPS;
    pathSteps = steps;
    let noted = '';
    for (const target of targets) {
      if (target.hops.length <= steps) continue;
      target.hops = clipForwardHops(target.hops, steps);
      if (!noted) noted = target.id;
    }
    if (noted) {
      fieldError = { id: '', message: '' };
      fieldNote = { id: noted, message: pathLimitNote(steps) };
    }
    settingsOpen = false;
  }

  function clearBoard() {
    if (samples.length) {
      samples = [];
      breaks = [];
      statusDetail = 'Samples cleared.';
      return;
    }
    targets = [];
    selectedId = null;
    drafts = {};
    fieldError = { id: '', message: '' };
    fieldNote = { id: '', message: '' };
    visibility = {};
    intervalSec = DEFAULT_INTERVAL_SEC;
    hashBytes = DEFAULT_HASH_BYTES;
    maxDurationSec = DEFAULT_DURATION_SEC;
    pathSteps = DEFAULT_PATH_STEPS;
    statusDetail = 'Targets cleared.';
  }

</script>

<main class="page">
  <header class="top">
    <div class="brand">
      <h1><img class="mark" src="{import.meta.env.BASE_URL}favicon.svg" alt="" /> Coreping</h1>
      <p class="lede">Check MeshCore node-to-node SNR and loss with periodic traces. Connect to your companion, select a single target to ping, or repeaters to trace the connections between them. Max duration and path depth are limited, and the shortest interval depends on the max duration, so a scan does not overuse the mesh.</p>
      {#if statusDetail}
        <p class="status"><span class="prompt" aria-hidden="true">&gt;</span> {statusDetail}</p>
      {/if}
    </div>
    <div class="toolbar">
      {#if connState === 'on'}
        <button onclick={disconnect}>Disconnect</button>
      {:else}
        <button class="primary" onclick={connect} disabled={!bleOk || connState === 'connecting'}>
          {connState === 'connecting' ? 'Connecting…' : 'Connect'}
        </button>
      {/if}
      <button
        type="button"
        aria-pressed={targetsVisible}
        disabled={!targetsToggleEnabled}
        onclick={() => { targetsOpen = !targetsOpen; }}
      >Targets</button>
      {#if running}
        <button class="primary" onclick={stop}>Stop</button>
      {:else}
        <button class="primary" onclick={start} disabled={connState !== 'on'}>Start</button>
      {/if}
      <button onclick={traceNow} disabled={connState !== 'on' || busy}>{onePing ? 'One ping only, Vassily' : 'Trace now'}</button>
      <div class="menu" bind:this={exportRoot}>
        <button
          type="button"
          class="menu-button"
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          onclick={() => { exportOpen = !exportOpen; if (exportOpen) settingsOpen = false; }}
        >Export <span class="caret" aria-hidden="true">▾</span></button>
        {#if exportOpen}
          <div class="menu-panel" role="menu">
            <button type="button" role="menuitem" onclick={exportCsv} disabled={samples.length === 0}>CSV</button>
            <button type="button" role="menuitem" onclick={exportJson}>JSON</button>
            <button type="button" role="menuitem" onclick={() => importInput?.click()}>Import JSON</button>
          </div>
        {/if}
        <input bind:this={importInput} type="file" accept="application/json,.json" hidden onchange={onImport} />
      </div>
      <div class="menu" bind:this={settingsRoot}>
        <button
          type="button"
          class="menu-button"
          aria-haspopup="menu"
          aria-expanded={settingsOpen}
          onclick={() => { settingsOpen = !settingsOpen; if (settingsOpen) exportOpen = false; }}
        >Settings <span class="caret" aria-hidden="true">▾</span></button>
        {#if settingsOpen}
          <div class="menu-panel settings-menu" role="menu">
            <label title={longRun ? 'Runs longer than 4 hours trace at least every 5 minutes.' : ''}>
              Interval
              <select value={intervalSec} onchange={(event) => chooseInterval(event.currentTarget.value)}>
                <option value={15} disabled={longRun}>15 s</option>
                <option value={30} disabled={longRun}>30 s</option>
                <option value={60} disabled={longRun}>60 s</option>
                <option value={300}>5 min</option>
                <option value={600}>10 min</option>
                <option value={900}>15 min</option>
              </select>
            </label>
            <label>
              Max duration
              <select value={maxDurationSec} onchange={(event) => chooseDuration(event.currentTarget.value)}>
                <option value={4 * 3600}>4 h</option>
                <option value={8 * 3600}>8 h</option>
                <option value={12 * 3600}>12 h</option>
                <option value={24 * 3600}>24 h</option>
                <option value={48 * 3600}>48 h</option>
              </select>
            </label>
            <label title="Nodes walked forward. The way back is added. Default is 4, and 8 is the longest.">
              Path steps
              <select value={pathSteps} onchange={(event) => choosePathSteps(event.currentTarget.value)}>
                {#each PATH_STEP_CHOICES as steps (steps)}
                  <option value={steps}>{steps === 1 ? '1 node' : `${steps} nodes`}</option>
                {/each}
              </select>
            </label>
            <label title="1, 2, or 4 bytes. 3-byte prefixes cannot be traced.">
              Hash
              <select value={hashBytes} onchange={(event) => { hashBytes = Number(event.currentTarget.value); settingsOpen = false; }}>
                <option value={1}>1 byte</option>
                <option value={2}>2 bytes</option>
                <option value={4}>4 bytes</option>
              </select>
            </label>
          </div>
        {/if}
      </div>
      <button class="clear" onclick={clearBoard} disabled={samples.length === 0 && !configured} aria-label={clearLabel} title={clearLabel}>×</button>
    </div>
  </header>

  {#if !bleOk}
    <p class="note">This browser has no Web Bluetooth. Use Chrome or Edge on a computer, over HTTPS.</p>
  {/if}

  {#if targetsVisible}
  <div class="columns" class:sample={demo} inert={demo}>
    <section class="panel">
      <h2>Targets</h2>
      {#if !demo && roundPlan.skipped}
        <p class="hint">{MAX_CONCURRENT_TRACES} traces run at a time. {roundPlan.skipped} {roundPlan.skipped === 1 ? 'target is' : 'targets are'} left out of the round.</p>
      {/if}
      {#each (demo ? sample.targets : targets) as target (target.id)}
        {@const waiting = !demo && target.enabled && target.hops.length > 0 && !tracedIds.has(target.id)}
        <div
          class="target"
          class:selected={target.id === selectedId}
          class:idle={waiting}
          title={waiting ? `${MAX_CONCURRENT_TRACES} traces run at a time. This one waits until a traced target is turned off.` : undefined}
          onfocusin={() => selectTarget(target.id)}
        >
          <label class="inline">
            <input type="checkbox" bind:checked={target.enabled} aria-label="Trace this target" />
          </label>
          <div class="pill-line">
            {#each target.hops as hop, index (hop)}
              {@const label = nameOf(hop)}
              <span class="pill">
                {#if label.toLowerCase() !== hop.toLowerCase()}
                  <span class="pill-name">{label}</span>
                {/if}
                <span class="pill-hash">{hop}</span>
                <button type="button" onclick={() => removeHop(target, index)} aria-label="Remove {hop}">×</button>
              </span>
            {/each}
            <input
              type="text"
              placeholder={target.hops.length ? '' : 'ab12, cd34'}
              aria-label="Path hashes"
              spellcheck="false"
              autocapitalize="off"
              value={drafts[target.id] || ''}
              onfocus={() => selectTarget(target.id)}
              oninput={(event) => onDraft(target, event.currentTarget.value)}
              onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitDraft(target); } }}
            />
            <button type="button" onclick={() => commitDraft(target)} disabled={!(drafts[target.id] || '').trim()}>Add</button>
          </div>
          <button
            type="button"
            class="clear target-remove"
            onclick={(event) => { event.stopPropagation(); removeTarget(target.id); }}
            disabled={targets.length === 1 && target.hops.length === 0}
            aria-label="Remove target"
            title="Remove target"
          >×</button>
          {#if target.hops.length || (fieldError.id === target.id && fieldError.message) || (fieldNote.id === target.id && fieldNote.message)}
            <div class="target-meta">
              {#if target.hops.length}
                <p class="path-preview">Full path: <span class="hash">{expandRoundTrip(target.hops).join(', ')}</span></p>
              {/if}
              {#if fieldError.id === target.id && fieldError.message}
                <p class="error">{fieldError.message}</p>
              {/if}
              {#if fieldNote.id === target.id && fieldNote.message}
                <p class="notice">{fieldNote.message}</p>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
      {#if !demo}
        <button onclick={() => addTarget()}>Add target</button>
      {/if}
    </section>

    <section class="panel contacts-panel">
      <div class="panel-head">
        <h2>Contacts</h2>
        {#if demo || connState === 'on'}
          <input
            type="text"
            placeholder="Filter"
            aria-label="Filter contacts"
            value={contactFilter}
            oninput={(event) => contactFilter = event.currentTarget.value}
          />
        {/if}
      </div>
      {#if !demo && connState !== 'on'}
        <p class="empty">Connect to load the companion's contact list.</p>
      {:else}
        <div class="contacts-slot">
          <div class="contacts">
            {#each listedContacts as contact (contact.publicKey.join(','))}
              <div class="contact">
                <button class="textish add-name" title="Add to the selected path" onclick={() => appendContact(contact)}>
                  <span class="plus" aria-hidden="true">+</span>
                  <span class="contact-name">{contact.name}</span>
                  <span class="contact-meta">{contactPrefix(contact, demo ? sample.hashBytes : hashBytes)}</span>
                </button>
                <button onclick={() => useRoute(contact)} title="Replace the selected target with this contact's saved route">Use route</button>
              </div>
            {/each}
            {#if listedContacts.length === 0}
              <p class="empty">No contacts match.</p>
            {/if}
          </div>
        </div>
      {/if}
    </section>
  </div>
  {/if}

  <section class="panel" class:sample={demo} inert={demo}>
    <h2>SNR</h2>
    <LineChart series={drawn} breaks={demo ? sample.breaks : breaks} intervalMs={(demo ? sample.intervalSec : intervalSec) * 1000} />
    <div class="legend">
      {#each viewSeries as line (line.key)}
        {@const on = isVisible(line, demo ? {} : visibility)}
        <button aria-pressed={on} onclick={() => toggleLine(line)}>
          <svg class="swatch" width="28" height="10" aria-hidden="true">
            <line
              x1="1" y1="5" x2="27" y2="5"
              stroke={colorForLink(line.hearerHex, line.prevHex, viewColorMap)}
              stroke-width="2"
              stroke-linecap="butt"
              stroke-dasharray={strokeDash(line.style)}
            />
          </svg>
          {seriesLabel(line, nameOf)}
        </button>
      {/each}
    </div>
    {#if statsRows.length}
      <table class="stats">
        <thead>
          <tr>
            <th>Hop</th>
            <th class="num">Min</th>
            <th class="num">Avg</th>
            <th class="num">Max</th>
            <th class="num">Stdev</th>
            <th class="num">Loss</th>
            <th class="num">n</th>
            <th>Distribution</th>
          </tr>
        </thead>
        <tbody>
          {#each statsRows as row (row.key)}
            <tr>
              <td>{row.label}</td>
              <td class="num">{formatSnr(row.summary.min)}</td>
              <td class="num">{formatSnr(row.summary.avg)}</td>
              <td class="num">{formatSnr(row.summary.max)}</td>
              <td class="num">{formatSnr(row.summary.stdev)}</td>
              <td class="num" title="{row.summary.attempts - row.summary.count} of {row.summary.attempts}">{formatLoss(row.summary.loss)}</td>
              <td class="num">{row.summary.count}</td>
              <td><Histogram bins={row.summary.histogram} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="panel console-panel" class:sample={demo} inert={demo} aria-label="Trace log">
    <h2>Console</h2>
    <div class="console" aria-live="polite">
      {#if tracingText}
        <div class="console-line running">{tracingText}</div>
      {/if}
      {#each consoleLines as line (line.key)}
        <div class="console-line">{line.text}</div>
      {/each}
      {#if !tracingText && consoleLines.length === 0}
        <div class="console-line muted">No traces yet.</div>
      {/if}
    </div>
  </section>

  <footer class="site-footer">
    <a href="https://github.com/petskratt/coreping" target="_blank" rel="noopener noreferrer">github.com/petskratt/coreping</a>
  </footer>
</main>
