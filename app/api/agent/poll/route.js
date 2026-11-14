import {addDeploy, db, setSettings} from '@/lib/db';
import {DEPLOY_KINDS, authAgent, unauthorized} from '@/lib/agent';
import {installationToken} from '@/lib/github';
import {agentVersion} from '@/lib/agent-script';
import {saveMetrics} from '@/lib/metrics';
import {downloadUrl, isBlobConfigured} from '@/lib/backups';

/** Bekleyen oyuncu yönetimi işleri (en fazla 5); ajan bunları bota iletir. Takılı kalanlar 1 dk sonra başarısız sayılır. */
async function takeAdminJobs(c) {
  const now = Date.now();
  await c.execute({
    sql: `UPDATE admin_jobs SET status = 'failed', finished_at = ?, result = ? WHERE status IN ('pending', 'running') AND created_at < ?`,
    args: [now, JSON.stringify({ok: false, error: 'Ajan 1 dakika içinde uygulamadı.'}), now - 60_000],
  });
  const {rows} = await c.execute(`SELECT id, action, user_id, params FROM admin_jobs WHERE status = 'pending' ORDER BY id LIMIT 5`);
  if (!rows.length) return [];
  await c.execute({
    sql: `UPDATE admin_jobs SET status = 'running' WHERE id IN (${rows.map(() => '?').join(',')})`,
    args: rows.map((r) => r.id),
  });
  return rows.map((r) => ({id: Number(r.id), action: r.action, userId: r.user_id, params: safeParse(r.params)}));
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// VDS'deki ajan birkaç saniyede bir burayı çağırır: durumunu bildirir, varsa yeni işi alır.
export async function POST(request) {
  const settings = await authAgent(request);
  if (!settings) return unauthorized();

  const status = await request.json().catch(() => ({}));
  const {botLog, metrics, ...info} = status;
  if (Array.isArray(metrics) && metrics.length) await saveMetrics(metrics);
  // "Şimdi yedek al" isteği bir kez iletilir. Blob bağlı değilse ajan yedek almaya hiç çalışmaz.
  const backupNow = settings.backup_requested === '1';
  await setSettings({
    agent_seen: Date.now(),
    agent_info: JSON.stringify(info),
    ...(Array.isArray(botLog) ? {bot_log: JSON.stringify(botLog.slice(-150))} : {}),
    ...(backupNow ? {backup_requested: null} : {}),
  });
  const extra = {agentVersion: agentVersion(), backups: isBlobConfigured(), ...(backupNow ? {backupNow: true} : {})};

  const c = await db();

  // Ajan boştayken "çalışıyor" görünen iş kalmışsa ajan yarıda kesilmiştir.
  if (!info.busyJobId) {
    await c.execute({
      sql: `UPDATE deploys SET status = 'failed', finished_at = ?, log = log || ? WHERE status = 'running'`,
      args: [Date.now(), '\n[panel] Ajan bu iş bitmeden yeniden başladı.\n'],
    });
  } else {
    return Response.json({job: null, ...extra});
  }

  let {rows: pending} = await c.execute(`SELECT * FROM deploys WHERE status = 'pending' ORDER BY id`);

  // Kurulum: repo seçili ama VDS'de bot hiç kurulmamışsa ilk kurulum işi aç.
  if (!pending.length && !info.installed && settings.repo && settings.branch) {
    const {rows} = await c.execute({
      sql: `SELECT id FROM deploys WHERE kind = 'install' AND status = 'failed' AND finished_at > ?`,
      args: [Date.now() - 5 * 60_000],
    });
    if (rows.length) return Response.json({job: null, ...extra}); // son başarısız kurulumdan sonra 5 dk bekle
    await addDeploy({kind: 'install', message: 'İlk kurulum'});
    ({rows: pending} = await c.execute(`SELECT * FROM deploys WHERE status = 'pending' ORDER BY id`));
  }
  if (!pending.length) return Response.json({job: null, ...extra, admin: await takeAdminJobs(c)});

  // Art arda gelen güncellemelerden sadece en yenisi uygulanır.
  const deploys = pending.filter((d) => DEPLOY_KINDS.includes(d.kind));
  const skipped = deploys.slice(0, -1).map((d) => d.id);
  if (skipped.length) {
    await c.execute({
      sql: `UPDATE deploys SET status = 'skipped', finished_at = ?, log = 'Daha yeni bir güncelleme geldiği için atlandı.'
            WHERE id IN (${skipped.map(() => '?').join(',')})`,
      args: [Date.now(), ...skipped],
    });
  }
  const job = pending.find((d) => !skipped.includes(d.id));

  const out = {id: Number(job.id), kind: job.kind, sha: job.sha};
  if (DEPLOY_KINDS.includes(job.kind)) {
    // Repo erişimi işi almadan önce hazırlanır; olmazsa iş takılı kalmasın, sebebiyle başarısız olsun.
    try {
      if (!settings.repo || !settings.branch) throw new Error('Panelde repo seçili değil.');
      const {token} = await installationToken(settings);
      out.git = {url: `https://github.com/${settings.repo}.git`, branch: settings.branch, token};
    } catch (error) {
      await c.execute({
        sql: `UPDATE deploys SET status = 'failed', finished_at = ?, log = ? WHERE id = ?`,
        args: [Date.now(), `[panel] Repo erişimi alınamadı: ${error.message}`, job.id],
      });
      return Response.json({job: null, ...extra});
    }
  }

  if (job.kind === 'restore') {
    // Geri yüklenecek yedek: message sütununda yolu durur. İndirme adresi 30 dk geçerli.
    try {
      out.backup = {pathname: job.sha, url: await downloadUrl(job.sha, 30)};
    } catch (error) {
      await c.execute({
        sql: `UPDATE deploys SET status = 'failed', finished_at = ?, log = ? WHERE id = ?`,
        args: [Date.now(), `[panel] Yedeğin indirme adresi alınamadı: ${error.message}`, job.id],
      });
      return Response.json({job: null, ...extra});
    }
  }

  await c.execute({sql: `UPDATE deploys SET status = 'running', started_at = ? WHERE id = ?`, args: [Date.now(), job.id]});
  return Response.json({job: out, ...extra});
}
