import {addDeploy, getSettings, setSettings} from '@/lib/db';
import {verifyWebhook} from '@/lib/github';
import {destekRepo} from '@/lib/destek';

export async function POST(request) {
  const body = await request.text();
  const settings = await getSettings();
  if (!verifyWebhook(settings.webhook_secret, body, request.headers.get('x-hub-signature-256'))) {
    return new Response('imza geçersiz', {status: 401});
  }

  const event = request.headers.get('x-github-event');
  const payload = JSON.parse(body);

  if (event === 'installation' && payload.action === 'deleted' && String(payload.installation?.id) === settings.installation_id) {
    await setSettings({installation_id: null, repo: null, branch: null});
    return Response.json({ok: true});
  }

  if (event !== 'push') return Response.json({ok: true, ignored: event});

  const repo = payload.repository?.full_name;
  // Destek botunun reposu: push'ta ajan destek botunu günceller.
  const destek = destekRepo(settings);
  if (repo === destek.repo) {
    if (payload.ref !== `refs/heads/${destek.branch}` || payload.deleted || !payload.head_commit) return Response.json({ok: true, ignored: 'destek'});
    const id = await addDeploy({
      kind: 'destek',
      sha: payload.after,
      message: payload.head_commit.message,
      author: payload.head_commit.author?.username || payload.head_commit.author?.name || payload.pusher?.name,
    });
    return Response.json({ok: true, deploy: id});
  }
  if (!settings.repo || repo !== settings.repo) return Response.json({ok: true, ignored: 'repo'});
  if (payload.ref !== `refs/heads/${settings.branch}`) return Response.json({ok: true, ignored: 'branch'});
  if (payload.deleted || !payload.head_commit) return Response.json({ok: true, ignored: 'empty'});

  const head = payload.head_commit;
  const extra = (payload.commits?.length || 1) - 1;
  const id = await addDeploy({
    kind: 'push',
    sha: payload.after,
    message: head.message + (extra > 0 ? `\n\n(+${extra} commit daha)` : ''),
    author: head.author?.username || head.author?.name || payload.pusher?.name,
  });
  return Response.json({ok: true, deploy: id});
}
