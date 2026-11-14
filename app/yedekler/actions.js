'use server';

import {revalidatePath} from 'next/cache';
import {addDeploy, setSettings} from '@/lib/db';
import {isBackupPath} from '@/lib/backups';
import {requireUser} from '@/lib/session';

/** Ajan bir sonraki sorgusunda (birkaç saniye içinde) yedek alır. */
export async function requestBackup() {
  await requireUser();
  await setSettings({backup_requested: '1'});
  revalidatePath('/yedekler');
}

/** Ajan botu durdurur, şu anki veriyi yedekler, seçilen yedeği yerine koyar ve botu başlatır. */
export async function restoreBackup(pathname) {
  const user = await requireUser();
  if (!isBackupPath(pathname)) throw new Error('Geçersiz yedek');
  await addDeploy({kind: 'restore', sha: pathname, message: `Yedekten geri yükleme`, author: user});
  revalidatePath('/');
  revalidatePath('/yedekler');
}
