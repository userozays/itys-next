<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ITYS — IT Altyapı Yönetim Sistemi

Çok şirketli IT envanter paneli. Kullanıcılar: yönetici (`admin`) ve teknisyenler (`technician`; yalnızca atandıkları şirketleri görür). Eski Flask sürümü `~/Documents/itys` yalnızca referanstır; oradan kod kopyalanmaz.

## Kapsam

v1 yalnızca **Envanter**: donanım, yazılım lisansları, bitiş uyarıları, Excel/CSV içe aktarma, QR etiket.
v1 dışı (istenmeden eklenmez): ajan, izleme/ping, talep takibi, değişiklik geçmişi, TOTP, müşteri portalı.

Aşamalar: 0 iskelet ✅ → 1 giriş ve şirketler ✅ → 2 donanım ✅ → 3 lisanslar ✅ → 4 içe aktarma + QR ✅ → 5 bitiş uyarıları ✅ (onay bekliyor) → 6 yayına hazırlık. Bir aşama testleri geçip kullanıcı onaylamadan sonrakine geçilmez.

## Komutlar

```bash
npm run dev          # geliştirme sunucusu (3000)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest (birim + veri katmanı)
npm run test:e2e     # Playwright (üretim derlemesi alır, 3100 portunda açar)
npm run db:generate  # schema.ts değişince migration üretir
npm run build        # standalone üretim çıktısı
```

Bir iş "bitti" sayılmadan önce: `lint`, `typecheck`, `test`, `test:e2e` hepsi yeşil.

## Yığın

Next.js 16 (App Router, Cache Components kapalı), TypeScript strict, SQLite (`better-sqlite3`) + Drizzle ORM, Tailwind 4 + shadcn/ui, Zod, next-intl, Vitest, Playwright.

## Mimari kuralları

1. **Katmanlar tek yönlü:** `src/app/` (sayfa, server action; iş mantığı yok) → `src/server/services/` (iş kuralları) → `src/server/db/` (şema ve sorgular). `app/` doğrudan `db/` çağırmaz (tek istisna: `api/health`).
2. **Şirket ayrımı tek yerde:** şirkete ait her tabloda `company_id` bulunur. Sorgular yalnızca oturumdan türetilen bağlam (`companyScope(ctx)`) üzerinden yapılır; istemciden gelen `company_id`'ye güvenilmez. Her yeni varlık için "A şirketinin teknisyeni B'nin kaydını göremez ve değiştiremez" testi zorunludur.
3. **Gizli veriler şifreli:** lisans anahtarları ve bildirim sırları AES-256-GCM ile saklanır; anahtar ortam değişkeninden gelir. Düz metin sır veritabanına yazılmaz, loglanmaz.
4. **Doğrulama Zod ile, tek şema:** aynı şema formda, server action'da ve içe aktarmada kullanılır.
5. **Dosya başına tek sorumluluk**, yaklaşık 300 satır üst sınır. Büyüyen dosya bölünür.
6. **Her özellik testle biter:** servis için Vitest testi + en az bir Playwright akışı.

## Kurallar ve tuzaklar

- **Giriş:** kendi oturum sistemimiz (`src/server/auth/`): scrypt parola özeti, veritabanında SHA-256 ile özetlenmiş oturum anahtarı, kullanıcı adı + IP deneme sınırı. Better Auth vb. eklenmez. Her sayfa ve server action `requireActor()` / `requireAdmin()` ile başlar; asıl yetki kontrolü servis katmanındadır (`actor` parametresi).
- **Roller ve yetkiler:** üç sabit rol: yönetici (her şey), teknisyen (cihaz, konum, içe aktarma, etiket, lisansı cihaza atama; lisans ekleyip düzenleyemez, maliyet görmez), izleyici (yalnızca görür ve dışa aktarır). Tek istisna teknisyendeki `canSeeLicenseKeys` kutusudur. Kurallar tek yerde, `can.*` (`src/server/auth/permissions.ts`): servis `assertCan(can.…(actor))` ile reddeder, sayfa aynı fonksiyonla düğmeyi gizler, yalnızca değişiklik için var olan sayfa `requireActorWho(can.…)` ile panoya yönlendirir. Maliyet servis çıkışında silinir (`forActor`, `src/server/services/licenses.ts`), dışa aktarmada maliyet sütunları hiç yazılmaz. Yeni bir yazma işlemi eklenince uygun `can.*` kontrolü de eklenir; `permissions.test.ts` ve e2e `11-roles` rolleri denetler.
- **Formlar:** server action `runForm()` (`src/server/form.ts`) ile `FormState` döner; istemcide `useFormAction` + `Field` (`src/components/form.tsx`). Hata kodları `AppError` → `errors.*`, Zod mesajları → `validation.*` çeviri anahtarlarıdır.
- **E2E:** Playwright boş veritabanıyla (`data/e2e.db`) ve ayrı klasöre alınan **üretim derlemesiyle** (`.next-e2e`) 3100 portunda çalışır; aynı projede ikinci bir `next dev` açılmaz, çünkü iki geliştirme sunucusu `next-env.d.ts` dosyasını karşılıklı yeniden yazıp sonsuz yeniden derlemeye girer. Zamanlayıcı testte kapalıdır, Telegram istekleri test içindeki sahte sunucuya gider. Dosyalar ad sırasıyla (`01-…`, `02-…`) tek veritabanı üzerinde çalışır; sonraki dosya öncekinin oluşturduğu hesap ve şirketleri kullanır (`tests/e2e/helpers.ts`). Bir gezinmeden sonra tıklamadan önce yeni sayfanın geldiğini doğrula.
- **Test sonrası önizleme:** `npm run test:e2e` derleme aldığı için çalışan `next dev` sunucusunun canlı yenilemesi kopabilir ve sunucu eski kodu sunar (tarayıcıda "Hydration failed" görünür). Testten sonra geliştirme sunucusunu yeniden başlat.
- **Kamera:** barkod/QR okuma tarayıcıda yapılır (`src/components/barcode-scan.tsx`, `@zxing/browser`); kamera yalnızca HTTPS ya da localhost'ta açılır. E2E'de tarayıcının kamerası, QR kodu gösteren üretilmiş bir videodur (`tests/e2e/fake-camera.ts`).
- **Aynı modelden doldurma:** `findModelSpecs` yalnızca işlemci, RAM, depolama ve işletim sistemini kopyalar; seri no, bilgisayar adı, IP, MAC kopyalanmaz. Yalnızca kullanıcının erişebildiği şirketlere bakar.
- **Demo veri:** `rm data/demo.db* && npm run db:seed`; şema değişince demo veritabanını yeniden üret.
- **Şirkete ait kayıtlar:** servis fonksiyonu ya `companyId` alır ve ilk iş `getCompany(db, actor, companyId)` çağırır, ya da kaydı kimliğiyle yükleyip `getCompany(db, actor, row.companyId)` ile kontrol eder (`src/server/services/assets.ts` örnek). Bir kaydın şirketi istemciden gelmez: yeni kayıt çalışılan şirkete (`getActiveCompany`) yazılır, güncellemede saklı kayıttan okunur. Silme yalnızca yöneticide.
- **Gizli veriler:** `encryptSecret` / `decryptSecret` (`src/server/crypto/secrets.ts`), anahtar `SECRET_KEY` ortam değişkeninden (üretimde zorunlu, `.env.example`). Şifreli sütun kullanıcıya dönen tiplere girmez (`LicenseView.hasKey` örnek); düz metin yalnızca ayrı bir "göster" işlemiyle (`revealLicenseKey`) verilir.
- **Para:** tutarlar küçük birimde tam sayı saklanır (`costMinor`); `src/lib/money.ts` ile biçimlenir.
- **İçe aktarma:** `src/server/import/` saf modüllerdir (dosya okuma, başlık eşleştirme, satır doğrulama); veritabanı işi `src/server/services/imports.ts` içindedir. Yeni bir cihaz alanı eklenince `importFields`, eş anlamlı başlıklar ve `normalizeRow` birlikte güncellenir. Geçerli satırlar tek işlemde eklenir, hatalılar nedenleriyle atlanır.
- **QR etiket:** kod `/a/<şirketId>/<etiket>` adresini taşır (`src/server/qr.ts`); adresin başı `APP_URL` ortam değişkeninden, yoksa istekten gelir. Etiket no değişirse basılı etiket geçersiz kalır.
- **Giriş sonrası yönlendirme:** `next` parametresi yalnızca aynı site içi yollar için izlenir (`safeNext`).
- **Bildirimler:** `src/server/notify/`. Akış: `runExpiryCheck` (eşik 30/7/0 gün, her uyarı `expiry_notices` ile bir kez) → `notifications` kuyruğu → `deliverPending` (5 denemeye kadar, artan aralıkla). Zamanlayıcı `src/instrumentation.ts` ile süreç başına bir kez başlar, 5 dakikada bir çalışır; uyarı üretimi yalnızca 08–20 arasıdır. Göndericiler parametreyle değiştirilebilir (testlerde gerçek ağ kullanılmaz). Bildirim metinleri oturuma bağlı olmadığı için varsayılan dilde (`messages/tr.json`, `notify.*`) üretilir. Ayarlar ve geçmiş yalnızca yöneticiye açıktır.
- **Kayıt sonrası yeniden kurulan formlar:** `key` ile yeniden kurulan bir formun "kaydedildi" durumu üst bileşende tutulur (`SettingsPanel` örnek), yoksa bildirim kaybolur.
- **Açılır listeler:** tarayıcının `<select>` öğesi kullanılmaz (macOS'ta kutunun üstüne açılır); `SelectBox` ya da form içinde `SelectField` kullanılır (`src/components/select-box.tsx`). Değer gizli bir `input` ile forma girer. Testlerde `choose(page, etiket, seçenek)` ve `optionsOf` yardımcıları kullanılır.
- **Uzun seçim listeleri:** yüzlerce kayıt içerebilen seçimler (ör. lisans atamada cihaz) `AssetPicker` ile aramalı ve gruplu yapılır (`src/components/asset-picker.tsx`); başlangıçta hiçbir şey seçili gelmez. Testlerde `pickDevice` kullanılır. Formdaki `SelectBox`, görünür etiketine `labelId` ile bağlanır (`SelectField` bunu kendisi yapar).
- **Sıralama:** enum sütunları anahtar adına göre değil şemadaki liste sırasına göre (`enumOrder`), boş olabilen sütunlar boşlar sonda olacak şekilde (`nullableSort`) sıralanır (`src/server/services/assets.ts`).
- **Parolalar:** `password` şeması uzunluğun yanında tekrarlı, sıralı ve yaygın parolaları reddeder (`src/lib/password-strength.ts`); kullanıcı adını içeren parola da kabul edilmez. E2E yönetici parolası bu yüzden kullanıcı adını içermez. Demo veri servis üzerinden eklendiği için bu kurala tabi değildir.
- **Nesne düzeyi kontroller:** iki alana bakan Zod kontrolü `.refine(…, { when: hasFields(…) })` ile yazılır (`src/server/validation.ts`); böylece diğer alan hatalarıyla birlikte gösterilir.
- **Güvenlik başlıkları:** CSP ve diğer başlıklar `next.config.ts` içindedir. Dış bir kaynak (CDN, gömülü sayfa, başka adrese istek) eklenirse CSP birlikte güncellenir; e2e `07-qa-low-findings` başlıkları denetler.
- **Hata ve 404 sayfaları:** oturum açmış kullanıcının bilinmeyen adresleri `(app)/[...missing]` ile menülü 404 sayfasına düşer. `global-error.tsx` kök düzeni çöktüğünde çalıştığı için çeviri yükleyemez; "Metinler" kuralının tek istisnasıdır.
- **Dışa aktarma:** liste sayfalarının yanındaki `…/export` rotaları (`src/app/(app)/assets/export/route.ts`) aynı adres parametrelerini `src/lib/list-params.ts` ile okur; liste sayfası da aynı fonksiyonu kullanır, filtre eklenince ikisi birlikte değişir. Dosya `src/server/export/` ile üretilir: başlık ve tür/durum sözcükleri içe aktarmanın tanıdıklarıdır (gidiş-dönüş testi `export.test.ts`). CSV'de formül gibi başlayan hücreler `'` ile kaçırılır; gizli alanlar (lisans anahtarı) hiçbir dosyaya girmez.
- **Öneri alanları:** serbest metin + önceki değerler için `SuggestField` / `TextSuggest` (`src/components/text-suggest.tsx`). Liste yalnızca yazılandan farklı bir eşleşme varken açılır; açık liste sayfanın geri kalanını ekran okuyucudan gizler.
- **Pasif şirketler:** teknisyen pasif şirketi hiç görmez (`listCompanies`); yönetici şirket seçiciden pasif şirkete geçebilir ve üstte uyarı bandı görür. `resolveActiveCompany` kimseyi kendisi seçmeden pasif şirkete götürmez. Bitiş uyarıları yalnızca aktif şirketler için üretilir.
- **Kalıcı silme:** şirket yalnızca cihaz, lisans ve konumu yoksa silinir (`companyRecordCounts`, `deleteCompany`); kayıtlı şirket pasif yapılır. Kullanıcı silinebilir, kendi hesabı ve son aktif yönetici hariç (`deleteUser`).
- **Lisans tipi ve maliyet:** `kind` abonelik ya da kalıcı; `billingPeriod` yalnızca abonelikte vardır ve boşsa yıllık sayılır (`licenseBillingPeriod`, `src/server/validation.ts`). Maliyet abonelikte dönem başına, kalıcı lisansta bir kerelik tutardır. Pano özeti (`licenseSummary`) para birimlerini asla toplamaz.
- **Filtreler:** `FilterForm` (`src/components/filter-form.tsx`) seçer seçmez, aramada yazma durunca uygular; "uygula" düğmesi konmaz. Temizle düğmesi `data-filter-clear` ile işaretlenir.
- **Listeye geri dönüş:** liste sayfası `<RememberListUrl list="…" />` ile adresini hatırlar; detay sayfasındaki geri bağlantısı `BackToList` ile filtreli listeye döner (`src/components/list-memory.tsx`).
- **Ham SQL alt sorguları:** Drizzle, `sql` şablonundaki sütunları tek tablolu sorguda tablo adı olmadan yazar; alt sorgudaki `id` yanlış tabloya çözülür (QA K1). Sayım için `leftJoin` + `groupBy` + `count()` kullan ya da tablo adlarını elle yaz. Sayım testleri birden fazla kayıt ve farklı kimliklerle yazılır.
- **Etiket numaraları:** `D-NNNN` numarası şirketteki `tag_seq` sayacından ve kullanımdaki en büyük numaradan devam eder; silinen cihazın numarası yeniden verilmez (QA K2), çünkü basılı QR etiketi o numarayı taşır.
- **Giriş sınırı:** aynı kullanıcı adı + aynı adres 5, tek kullanıcı adı 30, tek adres 100 hatalı denemede 15 dakika kilitlenir (`LIMITS`, `src/server/auth/login.ts`). İstemci adresi `pickClientIp` ile okunur; vekil arkasında `TRUSTED_PROXY_COUNT` ayarlanmalıdır.
- **Form hataları:** biçim hataları (Zod) ve iş kuralı çakışmaları aynı turda döndürülür: `FieldErrors` + `zodIssues` (`src/server/errors.ts`, `src/server/form.ts`). Cihazlarda etiket, seri no ve MAC çakışması `assetConflicts` ile denetlenir; IP yalnızca uyarıdır.
- **Tarayıcıdan işlem çağrısı:** istemci bileşenleri sunucu işlemlerini `useSafeCall` ile çağırır (`src/components/safe-call.ts`); bağlantı koparsa düğme takılı kalmaz.
- **Formlar POST:** her `<form>` `method` belirtir (`src/forms.test.ts` denetler); yöntemsiz form, betik yüklenmeden gönderilirse alanları adres çubuğuna yazar (QA K4).
- **Liste sayfaları:** arama, filtre, sıralama ve sayfa URL parametreleriyle taşınır ve sunucuda uygulanır (`src/app/(app)/assets/page.tsx` örnek); istemci tarafı tablo kütüphanesi yok.
- **Tarihler:** takvim tarihleri `YYYY-MM-DD` metni olarak saklanır; `src/lib/dates.ts` yardımcıları kullanılır.
- **Türkçe arama ve sıralama:** `openDb` SQLite'a `tr_fold` ve `tr_sort_key` işlevlerini kaydeder (`src/lib/turkish.ts`). Metin araması `trFold(sütun) like searchFold(sorgu)`, metin sıralaması `trKey(sütun)` ile yapılır (`src/server/db/turkish-sql.ts`); düz `asc(name)` kullanma. Kısa listeler kodda `localeCompare(…, "tr")` ile de sıralanabilir.
- **Veritabanı:** bağlantı `getDb()` ile alınır (`src/server/db/client.ts`); testlerde `openDb(":memory:")`. Şema değişince `npm run db:generate` çalıştırılır ve `drizzle/` altındaki dosya commit'e girer. Üretilmiş migration elle düzenlenmez.
- **Önbellek:** Cache Components bilerek kapalı (`next.config.ts`); her ekran oturuma bağlı ve güncel veri gösterir. Sayfalar `requireActor()` ile çerez okuduğu için istek anında işlenir. Çerez okumayan ama veritabanına bakan sayfa (ör. `/setup`) sorgudan önce `await connection()` çağırır; yoksa sonuç derleme anında sayfaya gömülür.
- **Metinler:** kullanıcıya görünen hiçbir metin koda yazılmaz; `messages/tr.json` ve `messages/en.json` dosyalarına birlikte eklenir, `useTranslations` / `getTranslations` ile okunur.
- **Dil:** kod, değişken adları, yorumlar ve commit mesajları İngilizce; arayüz metinleri Türkçe (varsayılan) ve İngilizce.
- **Arayüz:** önce `src/components/ui/` altındaki shadcn bileşenleri; yeni bileşen `npx shadcn@latest add <ad>` ile eklenir. Fontlarda `latin-ext` alt kümesi kalır (ş, ğ, ı, İ).
- **Yerel veri:** `data/` klasörü git'e girmez. `DATABASE_PATH` ile dosya yolu değiştirilir.
- **Commit:** yalnızca kullanıcı istediğinde atılır.

## Eski sistemden referanslar (mantığı alınır, kod alınmaz)

- `~/Documents/itys/schema.sql` — alan adları ve ilişkiler
- `~/Documents/itys/bitis.py` — 30/7/0 gün eşikleri, aynı uyarıyı iki kez göndermeme
- `~/Documents/itys/notify.py` — outbox ve yeniden deneme
- `~/Documents/itys/guvenlik/RAPOR-2026-11-06.md` — tekrarlanmayacak güvenlik hataları
