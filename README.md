# bbq-deploy

Barbeque botunun güncelleme paneli. Bot reposuna push edince VDS'deki bot durur, yeni sürüm indirilir, bot tekrar başlar. Yeni sürüm açılışta çökerse önceki sürüme kendiliğinden döner.

```
PC ──push──> GitHub ──webhook──> bu site (Vercel + Turso)
                                       ▲
                                       │ ajan 4 sn'de bir sorar, logları gönderir
                                  VDS (ajan + bot)
```

VDS'de port açılmaz, bağlantıyı her zaman ajan başlatır. Repo erişimi için VDS'de kalıcı bir anahtar durmaz; ajan her güncellemede panelden 1 saatlik GitHub token'ı alır.

## Kurulum

### 1. Vercel'e yükle

1. Vercel → **Add New → Project** → `bbq-deploy` reposunu seç.
2. **Environment Variables** bölümüne ekle:
   - `ALLOWED_GITHUB_USER` = panele girecek GitHub kullanıcı adın (ör. `c0fteey`)
3. Deploy et.

### 2. Veritabanı (Turso)

1. Vercel'de projeyi aç → **Storage** → **Create Database** → **Turso** → oluştur ve bu projeye bağla. Bu adım `TURSO_DATABASE_URL` ve `TURSO_AUTH_TOKEN` değişkenlerini kendisi ekler.
   - Marketplace'te Turso yoksa: [turso.tech](https://turso.tech) hesabında bir veritabanı oluştur, adresini ve token'ını bu iki değişken adıyla elle ekle.
2. **Deployments → Redeploy** yap. Tablolar ilk istekte kendiliğinden oluşur.

### 3. GitHub bağlantısı

1. Siteyi aç → **GitHub App oluştur**. GitHub açılınca adı değiştirmeden **Create GitHub App** de. Uygulamanın istediği izinler yalnızca repo içeriğini okumak ve push bildirimi almak.
2. Ardından **GitHub ile giriş yap**.
3. Panelde **Repoyu bağla** → yalnızca bot reposunu seç → **Install**.

### 4. VDS

1. Paneldeki **Ajan token'ı** kartından token'ı kopyala.
2. `bbq-vds` klasörünü VDS'ye kopyala ve `kur.bat` dosyasına çift tıkla. Kurulum senden şunları ister: panel adresi, ajan token'ı ve Micup bot token'ı.
3. Birkaç saniye içinde bot indirilir, kurulur ve başlatılır. Paneldeki "İlk kurulum" kaydından adımları izleyebilirsin.

## Bir güncellemede olanlar

1. Push edilen commit panelde **Bekliyor** olarak görünür.
2. Ajan yeni sürümü indirir; bot bu sırada çalışmaya devam eder.
3. Bot durur. Önce düzgün kapanması için mesaj gönderilir, 10 sn içinde kapanmazsa zorla kapatılır.
4. `git reset --hard` ile yeni sürüme geçilir. `.env` ve `data/` git'in dışında olduğu için bunlara dokunulmaz.
5. `npm ci` yalnızca `package.json` veya `package-lock.json` değiştiyse çalışır.
6. Bot başlatılır ve 15 sn izlenir.
   - Bot ayakta kalırsa güncelleme **Başarılı** olur. Slash komutları değiştiyse `npm run komutlar` da çalışır.
   - Bot çökerse önceki sürüme dönülür ve kayıt **Geri alındı** olarak işaretlenir.

Art arda push edilirse yalnızca en son commit uygulanır. Panelden ayrıca yeniden başlatabilir, durdurabilir, en son sürümü yeniden yükleyebilir ya da geçmişteki herhangi bir sürüme dönebilirsin.

## Ortam değişkenleri

| Ad | Açıklama |
|---|---|
| `ALLOWED_GITHUB_USER` | Panele girebilecek tek GitHub hesabı |
| `TURSO_DATABASE_URL` | Turso veritabanı adresi |
| `TURSO_AUTH_TOKEN` | Turso token'ı |
| `SITE_URL` | İsteğe bağlı. Özel alan adı kullanıyorsan tam adres (`https://...`) |

GitHub App bilgileri, oturum anahtarı ve ajan token'ı veritabanında tutulur.

## Geliştirme

```
npm install
TURSO_DATABASE_URL=file:local.db ALLOWED_GITHUB_USER=kullanici npm run dev
```
