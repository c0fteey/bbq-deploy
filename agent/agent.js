// bbq-deploy ajanı: paneli dinler, botu durdurur, günceller ve tekrar başlatır.
// Bağımlılığı yok, Node 22+ ile çalışır.
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync} from 'node:fs';
import {availableParallelism, totalmem} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const VERSION = '1.4.1';
const HERE = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(process.env.BBQ_CONFIG || join(HERE, 'config.json'), 'utf8'));
const SITE = config.siteUrl.replace(/\/$/, '');
const BOT_DIR = config.botDir;
const LOG_DIR = config.logDir || join(HERE, 'logs');
const STATE_FILE = join(HERE, 'state.json');
const GIT = config.gitPath || 'git';
const NODE_DIR = dirname(process.execPath);
const NPM_CLI = join(NODE_DIR, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const POLL_MS = config.pollMs ?? 3000;
const HEALTH_MS = config.healthMs ?? 15000;
const STOP_TIMEOUT_MS = 10000;

mkdirSync(LOG_DIR, {recursive: true});

// Alt süreçler node, npm ve git'i bulabilsin.
const childEnv = {
  ...process.env,
  PATH: [NODE_DIR, dirname(GIT), process.env.PATH].filter(Boolean).join(process.platform === 'win32' ? ';' : ':'),
};

// ---------- günlük dosyaları ----------

function writeLog(file, line) {
  const path = join(LOG_DIR, file);
  try {
    if (existsSync(path) && statSync(path).size > 5 * 1024 * 1024) renameSync(path, path + '.old');
    appendFileSync(path, line + '\n');
  } catch {}
}

function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(' ')}`;
  console.log(line);
  writeLog('agent.log', line);
  // 1.4.1: ajanın kendi mesajları (güncelleme hatası, panele ulaşamama...) panelin "Bot çıktısı"nda da görünsün;
  // önceden yalnızca VDS'deki agent.log'a yazılıyordu.
  try {
    pushBotLog(`[ajan] ${parts.join(' ')}`);
  } catch {
    // Dosyanın başında, bot günlüğü hazır olmadan yazılan mesajlar yalnızca agent.log'a gider.
  }
}

// ---------- kalıcı durum ----------

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {desired: true};
  }
}
const state = loadState();
const saveState = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// ---------- panel API ----------

async function api(path, body) {
  const res = await fetch(SITE + path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${config.agentToken}`},
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401) throw new Error('Panel token\'ı reddetti. config.json içindeki agentToken panelle aynı olmalı.');
  if (!res.ok) throw new Error(`Panel ${path} → ${res.status}`);
  return res.json();
}

// ---------- komut çalıştırma ----------

/** Komutu çalıştırır, çıktısını out() ile aktarır. Hata kodunda fırlatır. */
function run(cmd, args, {out = () => {}, cwd = BOT_DIR, env = childEnv, quiet = false} = {}) {
  return new Promise((resolve, reject) => {
    if (!quiet) out(`> ${[cmd === process.execPath ? 'node' : cmd === GIT ? 'git' : cmd, ...args].join(' ')}`);
    const child = spawn(cmd, args, {cwd, env, windowsHide: true});
    let stdout = '';
    const onData = (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (!quiet) for (const line of text.split(/\r?\n/)) if (line.trim()) out(line);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(stdout.trim()) : reject(new Error(`${cmd} çıkış kodu ${code}`))));
  });
}

const git = (args, opts) => run(GIT, ['-c', 'safe.directory=*', ...args], opts);
const npm = (args, opts) => run(process.execPath, [NPM_CLI, ...args], opts);
const isRepo = () => existsSync(join(BOT_DIR, '.git'));

async function headSha() {
  if (!isRepo()) return null;
  return git(['rev-parse', 'HEAD'], {quiet: true}).catch(() => null);
}

// ---------- bot süreci ----------

const MAX_LOG_LINES = 150;
const botLog = [];
let botLogDirty = false;

function pushBotLog(line) {
  botLog.push(line);
  if (botLog.length > MAX_LOG_LINES) botLog.shift();
  botLogDirty = true;
  writeLog('bot.log', line);
}

const bot = {
  child: null,
  state: 'stopped',
  since: null,
  crashTimes: [],
  restartTimer: null,
  exitWaiters: [],
};

function startArgs() {
  const pkg = JSON.parse(readFileSync(join(BOT_DIR, 'package.json'), 'utf8'));
  const script = pkg.scripts?.start || '';
  const parts = script.trim().split(/\s+/);
  if (parts[0] !== 'node') throw new Error(`package.json "start" komutu "node ..." ile başlamalı: ${script}`);
  return parts.slice(1);
}

function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {windowsHide: true});
  else
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
}

/** Ajan yeniden başladıysa önceki bot süreci hâlâ açık olabilir; iki bot aynı anda çalışmasın. */
function killOrphan() {
  const pidFile = join(HERE, 'bot.pid');
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8'));
  if (pid) {
    try {
      process.kill(pid, 0);
      log(`Önceki bot süreci (${pid}) kapatılıyor.`);
      killTree(pid);
    } catch {}
  }
}

function startBot() {
  if (bot.child) return;
  clearTimeout(bot.restartTimer);
  const args = startArgs();
  const child = spawn(process.execPath, args, {
    cwd: BOT_DIR,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  bot.child = child;
  bot.state = 'starting';
  bot.since = Date.now();
  writeFileSync(join(HERE, 'bot.pid'), String(child.pid));
  pushBotLog(`--- bot başlatıldı (pid ${child.pid}) ---`);

  const onData = (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) pushBotLog(line);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('message', (message) => {
    if (message?.type === 'metrics') addSample(message);
  });

  // Birkaç saniye ayakta kalırsa "çalışıyor" say.
  const ready = setTimeout(() => {
    if (bot.child === child) bot.state = 'running';
  }, 5000);

  child.on('exit', (code, signal) => {
    clearTimeout(ready);
    if (bot.child !== child) return;
    bot.child = null;
    pushBotLog(`--- bot kapandı (kod ${code ?? signal}) ---`);
    const waiters = bot.exitWaiters.splice(0);
    waiters.forEach((w) => w(code));
    if (bot.state === 'stopping' || !state.desired || deploying) {
      bot.state = 'stopped';
      return;
    }
    // Beklenmedik çöküş: artan bekleme ile yeniden başlat.
    const now = Date.now();
    bot.crashTimes = bot.crashTimes.filter((t) => now - t < 24 * 3600_000).concat(now);
    const recent = bot.crashTimes.filter((t) => now - t < 10 * 60_000).length;
    const wait = Math.min(60_000, 2000 * 2 ** Math.min(recent - 1, 5));
    bot.state = 'crashed';
    log(`Bot çöktü, ${wait / 1000} sn sonra yeniden başlatılacak.`);
    bot.restartTimer = setTimeout(() => {
      if (state.desired && !deploying && !bot.child) safeStart();
    }, wait);
  });
}

function safeStart() {
  try {
    startBot();
  } catch (error) {
    log('Bot başlatılamadı:', error.message);
    bot.state = 'crashed';
  }
}

/** Botu önce düzgünce (IPC "shutdown"), olmazsa zorla kapatır. */
async function stopBot() {
  clearTimeout(bot.restartTimer);
  const child = bot.child;
  if (!child) {
    bot.state = 'stopped';
    return;
  }
  bot.state = 'stopping';
  const exited = new Promise((resolve) => bot.exitWaiters.push(resolve));
  try {
    if (child.connected) child.send('shutdown');
    else child.kill();
  } catch {}
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), STOP_TIMEOUT_MS));
  if ((await Promise.race([exited, timeout])) === 'timeout') {
    pushBotLog('--- bot zamanında kapanmadı, zorla kapatılıyor ---');
    killTree(child.pid);
    await exited;
  }
}

/** Bot HEALTH_MS boyunca açık kalırsa true. */
function waitHealthy() {
  return new Promise((resolve) => {
    const child = bot.child;
    if (!child) return resolve(false);
    const timer = setTimeout(() => {
      const i = bot.exitWaiters.indexOf(onExit);
      if (i !== -1) bot.exitWaiters.splice(i, 1);
      if (bot.child === child) bot.state = 'running';
      resolve(true);
    }, HEALTH_MS);
    const onExit = () => {
      clearTimeout(timer);
      resolve(false);
    };
    bot.exitWaiters.push(onExit);
  });
}

// ---------- güncelleme ----------

let deploying = false;

async function commandsHash(out) {
  if (!config.commandsModule) return null;
  const code = `const m = await import(${JSON.stringify('./' + config.commandsModule)}); process.stdout.write(JSON.stringify(m.commands));`;
  const json = await run(process.execPath, ['--input-type=module', '-e', code], {quiet: true, out});
  return createHash('sha256').update(json).digest('hex');
}

async function install(changed, out) {
  const needs =
    !existsSync(join(BOT_DIR, 'node_modules')) ||
    changed === null ||
    changed.some((f) => f === 'package.json' || f === 'package-lock.json');
  if (!needs) {
    out('Paketler değişmedi, npm ci atlandı.');
    return;
  }
  await npm(['ci', '--no-audit', '--no-fund'], {out});
}

async function registerCommands(out) {
  if (!config.commandsModule || !config.registerScript) return;
  const hash = await commandsHash(out).catch((e) => {
    out(`Komut listesi okunamadı: ${e.message}`);
    return null;
  });
  if (!hash || hash === state.commandsHash) {
    if (hash) out('Komutlar değişmedi, kayıt atlandı.');
    return;
  }
  out('Komutlar değişmiş, yeniden kaydediliyor.');
  await npm(['run', config.registerScript], {out});
  state.commandsHash = hash;
  saveState();
}

async function checkout(sha, prev, out) {
  await git(['reset', '--hard', sha], {out});
  const changed = prev ? (await git(['diff', '--name-only', prev, sha], {quiet: true})).split('\n').filter(Boolean) : null;
  if (changed) out(`Değişen dosyalar: ${changed.length}`);
  await install(changed, out);
}

async function deploy(job, out) {
  const {url, branch, token} = job.git;
  const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
  const fetchArgs = ['-c', `http.extraHeader=Authorization: Basic ${auth}`, 'fetch', '--no-tags', url];

  mkdirSync(BOT_DIR, {recursive: true});
  if (!isRepo()) {
    out('Bot klasöründe repo yok, ilk kurulum yapılıyor.');
    await git(['init', '-q'], {out});
  }
  const prev = await headSha();
  out(`Şu anki sürüm: ${prev ? prev.slice(0, 7) : 'yok'}`);

  // 1) İndir: bot hâlâ çalışırken yapılır, kesinti kısa sürsün.
  await git([...fetchArgs, branch], {out});
  let target = job.sha || (await git(['rev-parse', 'FETCH_HEAD'], {quiet: true}));
  const has = await git(['cat-file', '-e', `${target}^{commit}`], {quiet: true}).then(() => true, () => false);
  if (!has) await git([...fetchArgs, target], {out});
  out(`Hedef sürüm: ${target.slice(0, 7)}`);

  // 2) Botu durdur.
  out('Bot durduruluyor…');
  await stopBot();
  out('Bot durdu.');

  // 3) Güncelle.
  try {
    await checkout(target, prev, out);
  } catch (error) {
    out(`Güncelleme başarısız: ${error.message}`);
    return rollback(prev, target, out, 'failed');
  }

  // 4) Botu başlat ve kontrol et.
  state.desired = true;
  saveState();
  out(`Bot başlatılıyor, ${HEALTH_MS / 1000} sn izlenecek…`);
  startBot();
  if (await waitHealthy()) {
    out('Bot ayakta. Güncelleme tamam.');
    await registerCommands(out).catch((e) => out(`Komut kaydı başarısız (bot çalışmaya devam ediyor): ${e.message}`));
    return {status: 'success', sha: target};
  }
  out('Bot açılışta kapandı. Son çıktı:');
  botLog.slice(-25).forEach((l) => out('  ' + l));
  return rollback(prev, target, out, 'rolled_back');
}

async function rollback(prev, target, out, status) {
  if (!prev || prev === target) {
    out('Dönülecek önceki sürüm yok.');
    if (bot.child === null && state.desired && existsSync(join(BOT_DIR, 'package.json'))) safeStart();
    return {status: 'failed', sha: target};
  }
  out(`Önceki sürüme (${prev.slice(0, 7)}) dönülüyor…`);
  await stopBot();
  try {
    await checkout(prev, target, out);
    startBot();
    const ok = await waitHealthy();
    out(ok ? 'Önceki sürüm çalışıyor.' : 'Önceki sürüm de açılmadı! Bot yeniden denenmeye devam edecek.');
    if (!ok && state.desired) safeStart();
    return {status: ok ? status : 'failed', sha: target};
  } catch (error) {
    out(`Geri dönüş başarısız: ${error.message}`);
    return {status: 'failed', sha: target};
  }
}

async function runJob(job) {
  let buffer = '';
  const out = (line) => {
    const text = `[${new Date().toLocaleTimeString('tr-TR', {hour12: false})}] ${line}`;
    buffer += text + '\n';
    log(`#${job.id}`, line);
  };
  const flush = async () => {
    if (!buffer) return;
    const text = buffer;
    buffer = '';
    await api('/api/agent/log', {id: job.id, text}).catch(() => {
      buffer = text + buffer;
    });
  };
  const timer = setInterval(flush, 1000);

  let result;
  deploying = true;
  try {
    if (job.kind === 'restart') {
      out('Bot yeniden başlatılıyor…');
      await stopBot();
      state.desired = true;
      saveState();
      startBot();
      const ok = await waitHealthy();
      out(ok ? 'Bot ayakta.' : 'Bot açılışta kapandı, yeniden denenecek.');
      result = {status: ok ? 'success' : 'failed'};
    } else if (job.kind === 'stop') {
      state.desired = false;
      saveState();
      await stopBot();
      out('Bot durduruldu. Panelden "Başlat" diyene kadar kapalı kalır.');
      result = {status: 'success'};
    } else if (job.kind === 'start') {
      state.desired = true;
      saveState();
      startBot();
      const ok = await waitHealthy();
      out(ok ? 'Bot başlatıldı.' : 'Bot açılışta kapandı, yeniden denenecek.');
      result = {status: ok ? 'success' : 'failed'};
    } else {
      result = await deploy(job, out);
    }
  } catch (error) {
    out(`Hata: ${error.message}`);
    result = {status: 'failed'};
  } finally {
    deploying = false;
    clearInterval(timer);
  }
  // Ajanın kendisi çökmeye karşı: istenen durum "açık" ise ve bot kapalıysa aç.
  if (state.desired && !bot.child && existsSync(join(BOT_DIR, 'package.json'))) safeStart();

  await flush();
  await api('/api/agent/finish', {id: job.id, ...result}).catch((e) => log('finish gönderilemedi:', e.message));
}

// ---------- kullanım ölçümleri ----------
// Bot 10 sn'de bir kendi CPU/RAM kullanımını ve oyun sayaçlarını gönderir. Ajan bunları dakikalık
// kovalarda toplar ve panele yollar. Panel ulaşılamazsa en fazla 1 günlük ölçüm bekletilir.

const CORES = availableParallelism();
const TOTAL_MEM = totalmem();
let bucket = null;
const pendingMetrics = [];
// Canlı görünüm: botun son 5 dakikadaki her ölçümü. Veritabanına satır yazılmaz, durum bildirimine eklenir.
const LIVE_MS = 5 * 60_000;
const live = [];

function emptyBucket(minute) {
  return {minute, cpuMicros: 0, elapsedMicros: 0, rssSum: 0, samples: 0, moves: 0, rejected: 0, guesses: 0, counts: {}};
}

// Botun gönderdiği sayaçlar (komut, oyun hamlesi, mesaj, ekonomi, sosyal hareket...): anahtarları bot belirler,
// ajan yalnızca toplar. 1.4.0: sınır 60'tan 200 anahtara çıktı (85 sosyal hareket ayrı sayılıyor).
const MAX_COUNT_KEYS = 200;
function cleanCounts(counts) {
  const out = {};
  if (!counts || typeof counts !== 'object') return out;
  for (const [key, value] of Object.entries(counts).slice(0, MAX_COUNT_KEYS)) {
    if (typeof key === 'string' && key.length <= 60 && Number.isFinite(value) && value > 0) out[key] = value;
  }
  return out;
}
function addCounts(target, counts) {
  for (const [key, value] of Object.entries(counts)) {
    if (key in target || Object.keys(target).length < MAX_COUNT_KEYS) target[key] = (target[key] ?? 0) + value;
  }
}

function closeBucket(b) {
  pendingMetrics.push({
    minute: b.minute,
    cpu: b.elapsedMicros ? round((b.cpuMicros / b.elapsedMicros / CORES) * 100) : 0,
    ram: b.samples ? round((b.rssSum / b.samples / TOTAL_MEM) * 100) : 0,
    ramMb: b.samples ? round(b.rssSum / b.samples / 1048576) : 0,
    moves: b.moves,
    rejected: b.rejected,
    guesses: b.guesses,
    counts: b.counts,
  });
  if (pendingMetrics.length > 1440) pendingMetrics.splice(0, pendingMetrics.length - 1440);
}

const round = (n) => Math.round(n * 100) / 100;
const num = (n) => (Number.isFinite(n) && n >= 0 ? n : 0);

function rollBucket() {
  const minute = Math.floor(Date.now() / 60_000);
  if (bucket && bucket.minute !== minute) {
    closeBucket(bucket);
    bucket = null;
  }
  // Ajan çalışırken bot kapalıysa dakika sıfır olarak kaydedilir (grafikte düşüş görünür).
  bucket ??= emptyBucket(minute);
}

function addSample(m) {
  const elapsed = num(m.elapsedMicros);
  const now = Date.now();
  const counts = cleanCounts(m.counts);
  live.push({
    t: now,
    cpu: elapsed ? round((num(m.cpuMicros) / elapsed / CORES) * 100) : 0,
    ram: round((num(m.rss) / TOTAL_MEM) * 100),
    ramMb: round(num(m.rss) / 1048576),
    moves: num(m.moves),
    rejected: num(m.rejected),
    guesses: num(m.guesses),
    counts,
  });
  while (live.length && live[0].t < now - LIVE_MS) live.shift();

  rollBucket();
  bucket.cpuMicros += num(m.cpuMicros);
  bucket.elapsedMicros += num(m.elapsedMicros);
  bucket.rssSum += num(m.rss);
  bucket.samples += 1;
  bucket.moves += num(m.moves);
  bucket.rejected += num(m.rejected);
  bucket.guesses += num(m.guesses);
  addCounts(bucket.counts, counts);
}

// ---------- kendi kendini güncelleme ----------
// Panel daha yeni bir ajan sürümü bildirirse indirilir, sözdizimi kontrol edilir ve ajan yeniden başlar
// (baslat.cmd onu 5 sn sonra yeni sürümle açar).

const newer = (a, b) => {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

// Başarısız güncelleme 30 dk sonra yeniden denenir (geçici bir panel/ağ hatası ajanı eski sürümde bırakmasın).
let updateFailedFor = null;
let updateFailedAt = 0;
const UPDATE_RETRY_MS = 30 * 60_000;

async function selfUpdate(version) {
  if (!version || !newer(version, VERSION)) return;
  if (updateFailedFor === version && Date.now() - updateFailedAt < UPDATE_RETRY_MS) return;
  if (process.env.BBQ_CONFIG) return; // test ortamı
  log(`Yeni ajan sürümü ${version} indiriliyor…`);
  try {
    const res = await fetch(SITE + '/api/agent/script', {
      headers: {Authorization: `Bearer ${config.agentToken}`},
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`panel ${res.status}`);
    const code = await res.text();
    const next = join(HERE, 'agent.js.new');
    writeFileSync(next, code);
    const check = spawnSync(process.execPath, ['--check', next], {windowsHide: true, encoding: 'utf8'});
    if (check.status !== 0) throw new Error(`sözdizimi hatası: ${check.stderr}`);
    renameSync(join(HERE, 'agent.js'), join(HERE, 'agent.js.old'));
    renameSync(next, join(HERE, 'agent.js'));
    log(`Ajan ${version} sürümüne güncellendi, yeniden başlatılıyor.`);
    await stopBot();
    process.exit(0);
  } catch (error) {
    updateFailedFor = version;
    updateFailedAt = Date.now();
    log('Ajan güncellenemedi:', error.message);
  }
}

// ---------- ana döngü ----------

let lastBotLogSent = 0;
let currentJobId = null;
let cachedSha = null;

async function status() {
  const now = Date.now();
  const sendLog = botLogDirty && now - lastBotLogSent > 10_000;
  if (sendLog) {
    botLogDirty = false;
    lastBotLogSent = now;
  }
  return {
    version: VERSION,
    installed: isRepo() && existsSync(join(BOT_DIR, 'package.json')),
    sha: cachedSha,
    busyJobId: currentJobId,
    bot: {
      state: deploying && !bot.child ? 'updating' : state.desired || bot.child ? bot.state : 'stopped',
      since: bot.since,
      crashes: bot.crashTimes.filter((t) => now - t < 24 * 3600_000).length,
    },
    ...(sendLog ? {botLog: botLog.slice(-MAX_LOG_LINES)} : {}),
    ...(pendingMetrics.length ? {metrics: pendingMetrics.slice(0, 120)} : {}),
    live: live.filter((p) => p.t >= now - LIVE_MS),
  };
}

/** Panele gönderilen ölçümleri kuyruktan düşer. */
function sent(payload) {
  const last = payload.metrics?.at(-1)?.minute;
  if (last === undefined) return;
  // Dakikaya göre düşülür; iki istek aynı ölçümleri göndermiş olsa da gönderilmemiş olan silinmez.
  while (pendingMetrics.length && pendingMetrics[0].minute <= last) pendingMetrics.shift();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  log(`bbq-deploy ajanı ${VERSION} başladı. Panel: ${SITE}, bot klasörü: ${BOT_DIR}`);
  killOrphan();
  cachedSha = await headSha();
  if (state.desired && existsSync(join(BOT_DIR, 'package.json')) && existsSync(join(BOT_DIR, 'node_modules'))) {
    safeStart();
  }

  // Panel işleri bot çalışırken de dinlenir, durum bildirimi iş sürerken de devam eder.
  setInterval(async () => {
    if (!currentJobId) return;
    const payload = await status();
    await api('/api/agent/poll', payload).then(() => sent(payload), () => {});
  }, 5000);
  setInterval(rollBucket, 5000);

  let errors = 0;
  for (;;) {
    try {
      const payload = await status();
      const {job, agentVersion} = await api('/api/agent/poll', payload);
      sent(payload);
      errors = 0;
      if (!job && !deploying) await selfUpdate(agentVersion);
      if (job) {
        log(`İş alındı: #${job.id} ${job.kind} ${job.sha ?? ''}`);
        currentJobId = job.id;
        try {
          await runJob(job);
        } finally {
          currentJobId = null;
          cachedSha = await headSha();
        }
        continue;
      }
    } catch (error) {
      errors++;
      if (errors === 1 || errors % 20 === 0) log('Panele ulaşılamadı:', error.message);
    }
    await sleep(errors ? Math.min(30_000, POLL_MS * errors) : POLL_MS);
  }
}

process.on('unhandledRejection', (e) => log('Yakalanmamış hata:', e?.stack || e));
// Beklenmedik hatada ajan kapanır; baslat.cmd onu 5 sn sonra yeniden açar.
// Ajan kapanınca IPC bağlantısı kopar ve bot da kendini kapatır, böylece iki bot aynı anda çalışmaz.
process.on('uncaughtException', (e) => {
  log('Yakalanmamış hata, ajan yeniden başlatılacak:', e?.stack || e);
  if (bot.child) killTree(bot.child.pid);
  process.exit(1);
});

main();
