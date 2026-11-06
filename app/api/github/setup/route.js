import {getSettings, setSettings} from '@/lib/db';
import {installationRepos} from '@/lib/github';
import {originOf} from '@/lib/origin';
import {getUser} from '@/lib/session';

// App bir repoya kurulunca GitHub buraya döner.
export async function GET(request) {
  const origin = originOf(request);
  if (!(await getUser())) return Response.redirect(`${origin}/api/auth/login`, 303);

  const id = new URL(request.url).searchParams.get('installation_id');
  if (!/^\d+$/.test(id || '')) return Response.redirect(`${origin}/`, 303);

  await setSettings({installation_id: id});
  const settings = await getSettings();
  const repos = await installationRepos(settings);

  // Seçili repo artık erişilebilir değilse ya da tek repo varsa onu seç.
  const stillThere = repos.some((r) => r.fullName === settings.repo);
  if (!stillThere) {
    const only = repos.length === 1 ? repos[0] : null;
    await setSettings({repo: only?.fullName ?? null, branch: only?.defaultBranch ?? null});
  }
  return Response.redirect(`${origin}/`, 303);
}
