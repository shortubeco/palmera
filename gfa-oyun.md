# Grand Farm Adventure (GFA) — Tarayıcıda 3D Çiftlik Macerası: Proje Belgesi

> Bu belge yeni projenin başlangıç belgesidir. Oyun fikrini, alınan teknik kararları, mimariyi, açık soruları ve yol haritasını tek yerde toplar.
> Hazırlandığı tarih: **2026-11-20**. Kaynak: Palmera Nights (GTA türünde tarayıcı oyunu) projesindeki fikir tartışması.
> Yeni proje klasöründe `CLAUDE.md` olarak da kullanılabilir ya da `CLAUDE.md` içinden bu dosyaya referans verilebilir.

---

## 0. Durum özeti (kısa)

- **Henüz kod yazılmadı.** Bu belge yalnızca fikir ve mimari kararları içerir.
- **Kesinleşen kararlar** (kullanıcı onayladı):
  - Oyunun adı: **Grand Farm Adventure** (kısaltma: **GFA**)
  - Oyun motoru: **Babylon.js**
  - İstemci dili: **düz JavaScript** (ES modülleri). **TypeScript yok, React yok.**
  - Sunucu: **PHP + Laravel**. Sayfalar sunucuda Blade şablonlarıyla üretilir (PHP → HTML), 3D sahneyi tarayıcı çizer.
  - Veritabanı: **PostgreSQL**. Yapılan işler, görevler, para hareketleri vb. hepsi kaydedilir.
  - İletişim: **JSON API** (istemci ↔ PHP).
  - 3D modeller: **Blender → GLB/glTF**.
- **Açık sorular** (karar bekliyor):
  1. Kesin fizik seçimi: Havok (öneri) ya da Rapier/Jolt (bkz. bölüm 6).
  2. Hosting: PostgreSQL destekleyen host ya da VPS (Laravel kontrol listesi: bölüm 7.3).

---

## 1. Oyun fikri

Tarayıcıda oynanan, üçüncü şahıs kameralı, açık dünyalı bir **çiftlik macerası**. Kamera, görev yapısı, karakter kontrolü ve araç mekaniği GTA türünden ilham alıyor; ancak suç ve şehir yerine **çiftçilik, hayvancılık, tarımsal üretim, taşıma, ticaret ve çiftliği büyütme** üzerine kurulu.

Oyuncu görevler tamamlar, para kazanır, arazi satın alır, hayvan besler, ekin yetiştirir ve küçük bir çiftliği zamanla büyük bir tarım işletmesine dönüştürür.

**Önemli:** Bu bir tarayıcı oyunu. Oyuncu hiçbir şey indirmeden ve kurmadan oynayabilmeli.

### 1.1 Kamera ve oynanış

- Üçüncü şahıs kamera; çiftçi karakter arkadan görünür.
- Karakter şunları yapabilir:
  - yürümek, koşmak, zıplamak, serbestçe dolaşmak
  - araca binmek ve inmek
  - hayvan ve nesnelerle etkileşmek: hayvanları beslemek, inek sağmak, yumurta toplamak
  - tohum ekmek, hasat yapmak
  - ürün yüklemek ve boşaltmak
  - görev tamamlamak
- Kamera karakteri yumuşakça takip eder; döndürme ve yakınlaştırma desteklenir.

### 1.2 Oyun dünyası

- Oyuncunun çiftlik evi
- İnek ahırları, koyun ağılları, tavuk kümesleri
- Tarlalar ve sebze bahçeleri
- Depo binaları
- Köy ve kasaba
- Bakkallar ve marketler
- Restoranlar ve diğer ticari müşteriler
- Bu yerleri bağlayan yollar
- Satın alınabilir ek çiftlik arazileri

Başta küçük bir harita yeterli. Ama mimari, ileride **bağlantılı yeni bölgeler** eklemeye izin vermeli.

**Görsel stil:** Stilize 3D / **Low Poly**; fotogerçekçi değil. Renkli ortamlar, sevimli karakterler, tanınır hayvanlar ve tutarlı bir görsel kimlik.

### 1.3 Görev örnekleri

**Görev 1 – Besleme Vakti**
1. İnek ahırına git.
2. İnekleri besle.
3. Koyun ağılına git.
4. Koyunları besle.
5. Kümese git.
6. Tavukları besle.

Tüm adımlar bitince görev tamamlanır.

**Görev 2 – Günlük Toplama**
1. İnekleri sağ.
2. Süt kaplarını doldur.
3. Koyunlardan süt topla.
4. Tavuklardan yumurta topla.
5. Bütün ürünleri araca yükle.

**Görev 3 – Market Teslimatı**
1. Araçla marketlere git.
2. Süt ve yumurta teslim et.
3. Teslimatları tamamla.
4. Ödemeyi al.

**Görev 4 – İlk Hasat**
1. Tarlayı hazırla.
2. Domates tohumu ek.
3. Biber tohumu ek.
4. Ekinleri sula.
5. Büyümelerini bekle.
6. Sebzeleri hasat et.

**Görev 5 – İşi Büyütmek**
1. Tarımsal üretimle para kazan.
2. Ek arazi satın al.
3. Daha fazla hayvan satın al.
4. Yeni ahır ve tesisler yap.
5. Üretim kapasitesini artır.
6. Daha çok ürün sat.

> Not: Görev 5 aslında tek bir görev değil, bir **ilerleme hedefleri** listesi. Ayrı bir "hedefler/başarımlar" sistemi olarak tasarlanması önerilir.

Bunlar ilk örnekler. Görev mimarisi yeni görev ve hedef türlerinin kolayca eklenmesine izin vermeli.

### 1.4 Hayvanlar ve tarımsal üretim

**Başlangıç hayvanları:**
- İnek → süt
- Koyun → süt (ileride yün de eklenebilir)
- Tavuk → yumurta

Daha sonra yeni hayvan türleri eklenebilir.

**Ekinler:** domates, biber, patates, buğday, mısır ve diğer sebzeler.

**Mekanikler:**
- Hayvanlar: beslenme, büyüme, üretim.
- Ekinler: ekim, sulama, büyüme, hasat aşamaları.

### 1.5 Araçlar

| Araç | Rolü |
|---|---|
| Traktör | Tarla işleri, ekipman takma, römork çekme |
| Pikap | Ürün taşıma (önemli) |
| Kamyon | Büyük teslimatlar (önemli) |
| Biçerdöver | Buğday ve mısır hasadı |

Sürüş fiziği "yeterince gerçekçi" olmalı, ama pahalı simülasyon hesapları gerektirmemeli.

### 1.6 Ekonomi ve ilerleme

**Para kazanma yolları:**
- Görev tamamlamak
- Süt, yumurta ve sebze satmak
- Marketlere teslimat yapmak
- Ticari siparişleri tamamlamak

**Harcama kalemleri:**
- Arazi satın almak
- Hayvan almak
- Ahır yapmak, kümes büyütmek
- Traktör ve araç almak
- Tohum ve ekipman almak
- Tesisleri yükseltmek

**Nihai hedef:** Küçük bir çiftliği büyük bir tarım işletmesine dönüştürmek.

### 1.7 Hedef platform ve performans

- Modern masaüstü tarayıcılar.
- Hedef donanım: düşük ve orta seviye bilgisayarlar, tümleşik ekran kartları, giriş seviyesi harici GPU'lar.

| Hedef | Değer |
|---|---|
| Minimum | 30 FPS |
| İdeal | 60 FPS |
| Düşük grafik | 720p |
| Orta grafik | 1080p |

Bunlar geliştirme hedefleridir, garanti değildir. **Performans optimizasyonu temel bir gereksinim.**

---

## 2. Önemli uyarılar

### 2.1 İsim ve marka riski
"Grand ... Adventure (G_A)" kalıbı ve tanıtımda GTA adının geçmesi, Take-Two'nun marka hakkıyla çakışabilir. Take-Two bu konuda dava açmasıyla bilinen bir şirket.
- Tür, kamera, görev yapısı ve araç mekaniği serbesttir; kimsenin malı değildir.
- Oyun yayınlanacaksa adın "Grand"/"GFA" kalıbından uzak olması ve tanıtımda GTA'nın anılmaması daha güvenlidir.
- Gerçek bir oyunun adı, logosu, karakteri, haritası ya da görünüşü kullanılmamalıdır.
- **Karar:** Kullanıcı adı **Grand Farm Adventure (GFA)** olarak belirledi. Risk bilinerek kabul edildi. Oyun herkese açık yayınlanacaksa şu önlemler önerilir:
  - Logo, yazı tipi ve renkler GTA'nınkine benzemesin.
  - Tanıtımda ve oyun içinde GTA anılmasın.
  - Gerekirse yayın öncesi bir hukukçuya danışılsın.

### 2.2 Asıl zorluk içerik üretimi
İnek, koyun, tavuk, çiftçi, traktör, biçerdöver: bunların hepsi riglenmiş ve animasyonlu modeller gerektirir. Teknoloji seçimi çözülebilir bir konu; projenin süresini asıl belirleyecek olan Blender'da üretilecek içerik miktarı.
- Prototipte lisansı uygun **CC0** paketler (ör. Kenney, Quaternius) geçici olarak kullanılabilir; sonra özgün modellerle değiştirilir. Lisans her paket için ayrıca kontrol edilmeli.

---

## 3. Teknik gereksinimler özeti

| Alan | İhtiyaç | Zorluk |
|---|---|---|
| Karakter | Kapsül tabanlı kontrolcü, eğimde yürüme, zıplama, animasyon geçişleri (idle/yürü/koş/etkileşim) | Orta |
| Kamera | Omuz üstü takip, döndürme, yakınlaştırma, duvara girmeme | Düşük–orta |
| Araçlar | 4 araç, arcade sürüş, yük taşıma, biçerdöverin hasat yapması | Orta–yüksek |
| Hayvanlar | Basit davranış (gez, ye, uyu), çok sayıda animasyonlu birey | Yüksek (performans ve içerik) |
| Tarım | Binlerce bitki, büyüme aşamaları, tarla durumu | Orta (instancing şart) |
| Ekonomi | Envanter, kargo, market fiyatları, siparişler, satın alma | Orta |
| Görevler | Veriye dayalı, adım adım, olay tabanlı | Orta |
| Dünya | Başta küçük, sonra bölgelerle genişleyebilen yapı | Orta (baştan doğru kurulmalı) |
| Kayıt | Sunucuda oyuncu başına; her iş PostgreSQL'e | Orta |
| Performans | Tümleşik GPU'da 720p/30 FPS | Bütün kararları etkiler |

GTA'dan farklı bir nokta var: bu oyunda **zaman içinde gelişen simülasyon** (bitki büyümesi, hayvan üretimi) ağır basıyor. Bu yüzden mimarinin merkezinde render değil, **zaman damgalı oyun durumu** olmalı.

---

## 4. Kesinleşen teknoloji seti

| Katman | Karar | Not |
|---|---|---|
| 3D motor | **Babylon.js 9.x** | 9.0, 26 Mart 2026'da çıktı. Ekim 2026'da 9.29'du. Başlarken güncel sürüm GitHub'dan kontrol edilmeli. |
| Fizik | **Havok** (Babylon resmi eklentisi, WASM) | Kesinleşmedi; bkz. bölüm 6 |
| İstemci dili | **Düz JavaScript, ES modülleri** | TypeScript yok. Tip güvenliği için JSDoc. |
| UI | **Düz DOM** (HTML + CSS + JS) | React yok. HUD ve oyun içi menüler DOM ile. |
| Paketleme | **Derleme adımı yok** | Babylon `public/vendor/` klasöründe yerel durur, import map ile yüklenir, her JS dosyasına `?v=filemtime` eklenir. Laravel'in varsayılan Vite kurulumu **kullanılmaz**. |
| Sunucu | **PHP 8.x + Laravel** (güncel kararlı sürüm; başlarken PHP gereksinimi kontrol edilmeli) | Blade ile sayfaları üretir, JSON API sunar. Ayrıntılar bölüm 7.4. |
| Veritabanı | **PostgreSQL** | Laravel'in `pgsql` sürücüsü (`pdo_pgsql`). Tablolar Laravel migration'larıyla kurulur. Esnek alanlar için `jsonb`. |
| İletişim | `fetch` + JSON | Eylemler toplu gönderilir (bkz. bölüm 8). |
| Modelleme | **Blender → GLB/glTF** | |
| Asset sıkıştırma | **KTX2/Basis** dokular, **Meshopt** (ya da Draco) geometri | Asset hattında Blender dışa aktarımından sonra bir dönüştürme adımı olur (gltf-transform gibi bir komut satırı aracı). Oyun kodu derlenmez, yalnızca asset'ler dönüştürülür. |

### 4.1 "Sunucuda render" kararının anlamı
- **PHP sayfaları ve arayüzü üretir.** Giriş, profil, ayarlar ve oyun sayfasının iskeleti (yükleme ekranı, HUD kapsayıcıları, menü kapsayıcıları) sunucuda HTML olarak üretilir. Oyunun ilk durumu sayfaya gömülür (Palmera'daki `window.GAME_SAVE` yaklaşımı).
- **3D sahneyi tarayıcı çizer.** Babylon tarayıcıda WebGL 2 / WebGPU ile çalışır.
- 3D görüntünün sunucuda çizilip video olarak gönderilmesi (bulut oyun) **seçilmedi**: her oyuncu için sunucuda GPU gerekir, gecikme sürüşü bozar ve maliyeti çok yüksektir.

### 4.2 TypeScript olmamasının bedeli ve önlemleri
Bu boyutta bir oyunda en sık hata yanlış alan adı ya da eksik veri olur. Önlemler:
- **JSDoc** tip açıklamaları: editör tip kontrolü ve otomatik tamamlama yapar, derleme gerekmez.
- Veri sözleşmesi (JSON şekilleri) **PHP tarafında tek yerde** tanımlanır; gelen her JSON doğrulanır.
- Net modül ayrımı (bkz. bölüm 9).

### 4.3 Babylon'u derleme adımı olmadan kullanmak
- Seçenek A: Babylon'un tek dosyalık UMD sürümü (`babylon.js`) + yükleyiciler (`babylonjs.loaders`) + Havok. Global `BABYLON` nesnesiyle çalışılır. En basit seçenek.
- Seçenek B: `@babylonjs/core` ES modül dosyaları `public/vendor/` klasörüne kopyalanır, import map ile yüklenir. Daha modern, yalnızca kullanılan modüller yüklenir; ama çok sayıda küçük dosya isteği olur.
- **Öneri:** Önce A ile başlanır. Aşama 0'daki ölçümde yükleme süresi sorun olursa B'ye geçilir.
- Babylon dosyaları CDN'den değil **yerelden** sunulur (Palmera'daki `vendor/three/` gibi). Böylece internet bağlantısı ve sürüm değişikliği riski olmaz.
- Havok `.wasm` dosyasının sunucudan `application/wasm` içerik türüyle gelmesi gerekir. PHP yerleşik sunucusunun ve hostun bunu doğru yaptığı kontrol edilmeli.

---

## 5. Motor karşılaştırması (karar gerekçesi)

Bulunabilen güncel sürümler (2026-11-20; ikincil kaynaklar, başlarken resmi sayfalardan teyit edilmeli):
- **PlayCanvas Engine:** 2.20.x (2026 ortası). 2.19'da hesaplama tabanlı WebGPU yolu geldi; WebGPU yoksa kendiliğinden WebGL 2'ye düşüyor.
- **Babylon.js:** 9.0 (26 Mart 2026; Frame Graph, clustered lighting), Ekim 2026'da 9.29.
- **Three.js:** r186 (Eylül 2026). `WebGPURenderer` (`three/webgpu`), WebGL 2'ye düşebiliyor.

| Kriter | PlayCanvas 2.x | Babylon.js 9.x | Three.js r18x |
|---|---|---|---|
| Ne tür bir araç | Oyun motoru (entity/component), isteğe bağlı bulut editörü | Tam oyun motoru (sahne, fizik, animasyon, GUI, araçlar) | Render kütüphanesi; gerisini sen kurarsın |
| Render performansı | Çok iyi; küçük paket | İyi; varsayılanlar ağır, ayar gerekir | İyi; ince ayar tamamen sende |
| WebGL 2 / WebGPU | İkisi de olgun, otomatik geri düşüş | İkisi de olgun | WebGPU yolu hâlâ olgunlaşıyor |
| Düşük donanım | En iyisi | İyi (SceneOptimizer, hardware scaling) | İyi, ama hepsi elle |
| Bellek | En az | En fazla | Az |
| Karakter kontrolcüsü | Yok | **Havok PhysicsCharacterController** hazır | Yok |
| Üçüncü şahıs kamera | Örnekler var | `FollowCamera` / `ArcRotateCamera` + çarpışma | Elle |
| Fizik | Ammo.js (eski) | **Havok resmi**, ayrıca Ammo/Cannon/Oimo | Elle (Rapier, Jolt) |
| Araç fiziği | Ammo raycast vehicle | Hazır sınıf yok; ışın tabanlı araç elle | Elle / Rapier kontrolcüsü |
| Animasyon | İyi (anim state graph) | **En güçlüsü** (AnimationGroup, blend, additive, retarget) | İyi (AnimationMixer) |
| Büyük dünya | Async yükleme; streaming elle | AssetContainer, LOD hazır | Elle |
| Instancing | Hardware instancing + BatchGroups | Instances + **thin instances** | InstancedMesh / BatchedMesh |
| Hata ayıklama | Editör iyi | **Inspector** mükemmel | Üçüncü parti |
| Belgeler | İyi (editör odaklı) | Çok iyi, Playground, aktif forum (Microsoft destekli) | En büyük topluluk |
| Uzun vadeli bakım | İstikrarlı | Geriye dönük uyumluluğa çok dikkat ediyor | Sık API kırılmaları |

**Babylon'un seçilme nedeni:** Bu oyunun ihtiyaç listesini en çok kapatan hazır seti sunuyor: Havok fizik, Havok karakter kontrolcüsü, güçlü animasyon sistemi, LOD, thin instances, AssetContainer, Inspector, SceneOptimizer. Düz JavaScript ile de rahat kullanılıyor.

**Babylon'un sınırları:**
- Paket büyük.
- Varsayılan ayarlar düşük donanım için ince ayar istiyor.
- Hazır araç sınıfı yok (araç zaten elle yazılacak, bkz. bölüm 11).

**Neden diğerleri değil:**
- **PlayCanvas:** Bulut editörüne bağımlılık (ücretsiz planda projeler herkese açık), eski Ammo fiziği ve karakter kontrolcüsünün olmaması.
- **Three.js:** Oyun motoru değil. Fizik, karakter, animasyon durum makinesi, asset yönetimi ve araçların hepsini elle kurmak aylarca altyapı işi demek.
- **Unity WebGL / Godot web:** Çıktı büyük, açılış yavaş, tümleşik GPU'da tarayıcıda sorunlu.

---

## 6. Fizik motorları

| Motor | Durum | Karakter | Araç | Belirlenimci (determinizm) | Not |
|---|---|---|---|---|---|
| **Havok** (Babylon eklentisi) | Endüstri standardı, web için ücretsiz, WASM | Hazır kontrolcü | Hazır yok; ışın tabanlı araç elle | Hayır | Babylon ile en sorunsuz yol. **Öneri.** |
| **Rapier** (JS 0.19.x) | Rust → WASM, aktif, Apache-2 | KinematicCharacterController | DynamicRayCastVehicleController | **Evet** (deterministic build) | Motordan bağımsız; çok oyunculu mod için avantaj |
| **Jolt** (JoltPhysics.js) | Güçlü, WASM | CharacterVirtual | WheeledVehicle / **TrackedVehicle** | Kısmen | JS ekosistemi daha küçük |
| **Ammo.js** | Bullet'in eski çevirisi | Zayıf | btRaycastVehicle | Hayır | Bakımı fiilen durmuş; **önerilmez** |
| cannon-es / Oimo | Hafif | Zayıf | Basit | Hayır | Bu ölçek için yetersiz |

**Tasarım ilkesi: fiziği az kullanmak.**
- Fizik motorunda yalnızca karakter, araçlar ve statik dünya çarpışmaları (gerekirse birkaç kasa) olur.
- Hayvanlar, bitkiler ve görev nesneleri fiziğe girmez; tetik alanları ve ızgara sorgularıyla yönetilir.
- Tümleşik GPU'lu makinelerde darboğaz çoğu zaman CPU'dur.
- Fizik çağrıları tek bir modül arkasında toplanır. Gerekirse Havok'tan Rapier'e geçiş tek yerden yapılır.

---

## 7. Sunucu mimarisi

### 7.1 Görevlerin dağılımı

**Laravel Blade sayfaları (sunucuda HTML olarak üretilir):**
- Giriş, kayıt, oyuncu profili, ayarlar
- Oyun sayfası: yükleme ekranı, HUD iskeleti, menü kapsayıcıları; ilk oyun durumu sayfaya gömülür
- İsteğe bağlı oyun dışı sayfalar: istatistikler, görev geçmişi, liderlik tablosu

**Tarayıcıda JavaScript + Babylon:**
- 3D çizim, karakter, araçlar, kamera, fizik, hayvan animasyonları
- Oyun içi menüler (market, envanter, ahır): API'den gelen JSON ile DOM'a çizilir. İstenirse menü HTML'i PHP'den hazır parça olarak da alınabilir.

**Laravel JSON API + PostgreSQL:**
- Kayıt, doğrulama, ekonomi kuralları, görev ilerlemesi, olay geçmişi

### 7.2 Sunucu ile istemci arasındaki sorumluluk sınırı

| Nerede | Ne |
|---|---|
| **İstemci** (anlık, kaydedilmez) | Yürüme, sürüş, fizik, kamera, animasyonlar, hayvanların görsel hareketi |
| **İstemci → sunucu** (eylem olarak kaydedilir) | Besleme, sağma, yumurta toplama, ekme, sulama, hasat, yükleme/boşaltma, teslimat, görev adımları |
| **Sunucu otoritesi** (sunucu karar verir) | Para, satın alma, satış, fiyatlar, sahiplik (arazi, hayvan, araç), görev tamamlama ve ödülleri |
| **Belli aralıklarla** | Oyuncu ve araç konumu (birkaç saniyede bir ya da çıkışta) |

### 7.3 Hosting
- PostgreSQL çoğu paylaşımlı hosting paketinde yoktur (genelde MySQL verilir).
- Seçenekler: PostgreSQL destekleyen bir host, küçük bir VPS ya da yönetilen bir PostgreSQL servisi.
- Yerel geliştirme: `php artisan serve` (varsayılan adres http://127.0.0.1:8000) + yerel PostgreSQL.
- **Laravel paylaşımlı hostingte** özel bir hosting paketi istemez. Kontrol listesi:
  - **PHP sürümü:** Güncel Laravel'in istediği sürüm (8.2/8.3+) panelden seçilebilmeli.
  - **PHP eklentileri:** `pdo_pgsql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `fileinfo`, `bcmath`.
  - **Document root:** Sitenin kök klasörü projenin `public/` klasörü olmalı. Panelden ayarlanır; ayarlanamıyorsa `.htaccess` yönlendirmesi yapılır. Böylece `.env` ve kaynak kod dışarıdan erişilemez.
  - **Composer:** Hostta yoksa `composer install --no-dev` yerelde çalıştırılır, `vendor/` klasörü de yüklenir.
  - **Yazma izni:** `storage/` ve `bootstrap/cache/` yazılabilir olmalı.
  - **`.env`:** Elle oluşturulur (veritabanı bilgileri, `APP_KEY`, `APP_DEBUG=false`).
  - **Migration:** SSH varsa `php artisan migrate`; yoksa korumalı tek seferlik bir yol ya da panelden SQL içe aktarma.
  - **Zamanlanmış işler:** Gerekirse panelden cron ile `schedule:run`.
  - **Çalışmayanlar:** Sürekli çalışan süreçler (WebSocket/Reverb, kuyruk işçisi) paylaşımlı hostta genelde çalışmaz; ileride VPS gerekir.
  - **En büyük engel PostgreSQL:** Çoğu paylaşımlı pakette yalnızca MySQL olur.

### 7.4 Laravel (karar verildi)

**Neden Laravel:** Giriş ve oturum, migration, doğrulama ve API yönlendirme hazır gelir; bu projede bunların hepsi yoğun kullanılacak. Düz PHP'ye göre sunucu tarafında daha az kod yazılır ve güvenlik işleri hazır, denenmiş parçalarla yapılır.

**Bedeli:**
- Composer gerekir.
- Proje çok dosyalıdır.
- Paylaşımlı hostingte birkaç ayar ister (bkz. 7.3).

**Laravel'in hangi parçası ne için kullanılacak:**

| İhtiyaç | Laravel parçası |
|---|---|
| Sayfalar (giriş, profil, oyun sayfası) | **Blade** şablonları. Oyunun ilk durumu Blade içinde JSON olarak sayfaya gömülür. |
| JS/CSS sürümleme | Vite **kullanılmaz**. Blade içinde `filemtime` ile `?v=` eklenir; import map de Blade'de üretilir. |
| Giriş ve oturum | Laravel oturumu + **Sanctum** (aynı alan adında çerez tabanlı SPA kimlik doğrulaması; CSRF korumalı). İstenirse hazır bir giriş iskeleti (Breeze'in Blade sürümü) kullanılabilir. |
| Şifre | Laravel'in yerleşik şifre hash'i. |
| API | `routes/api.php`, denetleyiciler (controller), JSON yanıtlar. |
| Gelen JSON'un doğrulanması | **Form Request** sınıfları: her uç için kurallar tek yerde. |
| Yanıt biçimi | **API Resource** sınıfları: istemciye giden JSON şekli tek yerde. |
| Oyun kuralları (sağma süresi, kapasite, fiyat hesabı) | Ayrı **servis sınıfları**. Denetleyiciler ince tutulur, kurallar burada olur. |
| Veritabanı | **Eloquent** modelleri. Para ve stok değiştiren işlemler `DB::transaction` içinde ve satır kilidiyle (`lockForUpdate`) yapılır. |
| Tablolar | **Migration**'lar. Her şema değişikliği yeni bir migration'dır; eski kayıtlar bozulmaz. |
| Katalog ve ilk veriler | **Seeder**'lar (ürün, fiyat, hayvan, ekin, görev tanımları). |
| Aynı eylemin iki kez işlenmesi | `event_log` tablosunda eylem kimliğine **benzersiz indeks**. |
| Hız sınırı | Laravel'in **rate limiter**'ı (oyuncu başına). |
| Zamanlanmış işler (sipariş yenileme, fiyat toparlanması) | **Scheduler**. Paylaşımlı hostta panelden cron ile çalıştırılır. |
| Test verisi | Ayrı bir test veritabanı (`.env.testing`). Gerçek oyuncu verisine dokunulmaz. |

**Kullanılmayacaklar (ilk sürümde):**
- Vite ve npm tabanlı ön yüz araçları
- Livewire, Inertia, React, Vue
- Kuyruk işçisi (queue worker) ve WebSocket/Reverb. Paylaşımlı hostta çalışmazlar; çok oyunculu mod gelirse VPS ile eklenir.

**Klasör yerleşimi (kavramsal):**
- Oyunun JS dosyaları: `public/js/`
- Babylon ve Havok: `public/vendor/`
- Modeller ve dokular: `public/assets/`
- CSS: `public/css/`
- Sayfalar: `resources/views/` (Blade)
- Oyun kuralları: `app/Services/` (ya da `app/Game/`)

---

## 8. Kaydetme ve eylem akışı (oyunun kalbi)

**Temel kural: oyun hiçbir zaman sunucuyu beklememeli.**

1. Oyuncu bir iş yapar (ör. ineği sağar). İstemci bunu **hemen** ekrana yansıtır (kova dolar, sayaç artar).
2. İş, bir **eylem** olarak yerel kuyruğa girer: eylem türü (`cow_milked` gibi), hedef kimliği, oyun zamanı ve istemcinin ürettiği benzersiz eylem kimliği.
3. Kuyruk birkaç saniyede bir **toplu olarak** API'ye gönderilir. Ayrıca hemen gönderilen durumlar var:
   - önemli anlar: satış, satın alma, görev bitişi
   - sayfa kapanırken (`sendBeacon`)
4. PHP her eylemi kurallara göre kontrol eder:
   - Hedef bu oyuncuya mı ait?
   - Bekleme süresi doldu mu?
   - Kapasite yeterli mi?
   - Görev adımı geçerli mi?
   
   Uygunsa veritabanına yazar ve güncel durum farkını döner.
5. Reddedilen eylemde istemci kendi durumunu sunucununkiyle düzeltir.
6. **Aynı eylem iki kez işlenmez:** benzersiz eylem kimliği sayesinde ağ hatasından sonra tekrar gönderim güvenlidir.
7. Bağlantı koparsa kuyruk bekler; bağlantı gelince gönderilir. Para gerektiren işlemler sunucu onayı gelmeden kesinleşmiş sayılmaz.

### 8.1 Zaman damgalı simülasyon
- Bitki büyümesi ve hayvan üretimi **her karede hesaplanmaz**. Zaman damgasından hesaplanır: "ekildiği an + büyüme süresi", "son sağım + üretim süresi".
- Sunucu da istemci de aynı formülü kullanır. Böylece:
  - Oyun kapalıyken de kurallar tutarlıdır.
  - Görünmeyen bölgeler CPU harcamaz.
  - Sunucu doğrulaması kolaylaşır.
- Oyun içi saat ile gerçek saat arasındaki oran katalogda tanımlanır (örneğin 1 oyun günü = X dakika).

### 8.2 Veritabanı tabloları (kavramsal; kesin şema geliştirmede yazılacak)

| Tablo | İçerik |
|---|---|
| `players` | Hesap, şifre özeti, oluşturma tarihi, son giriş |
| `player_state` | Para (tam sayı, kuruş), oyun saati, konum, ayarlar, kayıt şeması sürümü |
| `parcels` / `farms` | Sahip olunan araziler |
| `buildings` | Ahır, kümes, depo; seviye ve yükseltmeler |
| `animals` | Tür, bulunduğu bina, son beslenme, son üretim, durum |
| `field_plots` | Tarla hücreleri: ekin türü, ekim zamanı, sulama durumu, hasat |
| `inventory` | Eşya, miktar, konum (el / araç kasası / depo / süt tankı) |
| `vehicles` | Sahip olunan araçlar, konum, kasadaki yük |
| `missions_progress` | Görev durumu (başladı / adım N / bitti), zamanlar |
| `transactions` | Para hareketleri (alış, satış, ödül). Bakiye bu kayıtlardan doğrulanabilir. |
| `event_log` | **Yapılan her iş**: zaman, tür, ayrıntı (`jsonb`), eylem kimliği (benzersiz) |
| `orders` | Market ve restoran siparişleri, süreleri |
| `catalog_*` | Ürün, fiyat, hayvan, ekin, bina, araç ve görev tanımları (sürümlü) |

Notlar:
- Para **tam sayı** olarak tutulur (kuruş); kayan nokta kullanılmaz.
- `event_log` hem istenen "yapılan işler geçmişi" hem de istatistik ve hata ayıklama kaynağıdır. Tablo zamanla büyüyeceği için tarihe göre bölümleme (partitioning) ya da arşivleme ileride düşünülmeli.
- Kayıt şeması değişikliklerinde migration sürümü zorunlu. Eski kayıtlar bozulmamalı.

### 8.3 API taslağı (JSON)

| Uç | İş |
|---|---|
| Oturum | Kayıt, giriş, çıkış |
| Durum | Oyun açılışında tam durumu al |
| Eylemler | Toplu eylem listesi gönder; sonuçları ve durum farkını al |
| Market | Fiyatları al, sat, satın al |
| Görevler | Görev listesi, başlat, ilerleme |
| Katalog | Sürümlü tanımlar (istemci önbelleğe alır) |

- Tüm uçlar oturum doğrulaması ister (Laravel Sanctum, çerez tabanlı). Durum değiştiren isteklerde CSRF koruması olur.
- Gelen veri Form Request ile doğrulanır, yanıt API Resource ile biçimlenir.
- Hatalar tutarlı bir JSON biçiminde döner (kod + mesaj).
- Çok sık istek gelmesine karşı oyuncu başına basit hız sınırı konur.

### 8.4 Çok oyunculuyu engellememek
İlk sürüm tek oyunculu. Yine de:
- Oyun mantığı **eylem/olay** yapısıyla yazılır. Bugün eylemler sunucuda doğrulanıyor; yarın aynı eylemler çok oyunculu bir sunucuya gidebilir.
- Oyun durumu render nesnelerinden ayrı, serileştirilebilir veridir.
- Zaman, gerçek saatten değil **oyun saatinden** ilerler.
- Gerçek zamanlı çok oyunculu mod gerekirse ayrı bir WebSocket servisi eklenir.

---

## 9. İstemci modül mimarisi (düz JS)

Katmanlar yukarıdan aşağıya bağımlı olur; ters yönde bağımlılık olmaz.

1. **core:** oyun döngüsü (sabit adımlı simülasyon + değişken render), oyun saati, olay yolu (event bus), ayarlar.
2. **data:** katalog tanımları, oyun durumu, durum farkını uygulama.
3. **net:** API istemcisi, eylem kuyruğu, tekrar deneme, bağlantı durumu.
4. **world:** bölge ve parça (chunk) yükleme ve boşaltma, arazi, statik çarpışma.
5. **sim:** tarım, hayvancılık, ekonomi (istemci tarafı tahmini), envanter ve kargo, binalar. **Babylon'u tanımaz**; saf JS. Formüller PHP'deki kurallarla aynıdır.
6. **actors:** oyuncu karakteri, araçlar, hayvanların görsel temsilcileri, NPC'ler.
7. **interaction:** yakındaki etkileşilebilir nesne sistemi (tek tuş, bağlama göre değişen eylem), eylem animasyonları.
8. **missions:** görev tanımları, adım takibi; olayları dinler.
9. **ui:** HUD (düz DOM, seyrek güncelleme), menüler (DOM, JSON'dan çizilir), mini harita (canvas).
10. **gfx:** kamera, kalite kademeleri, gölge, LOD, efektler, ses.
11. **physics:** Havok çağrılarını saran tek modül (motor değişirse sadece burası değişir).

---

## 10. Üçüncü şahıs karakter ve kamera

**Hareket:**
- Havok karakter kontrolcüsü (kinematik kapsül). Eğim limiti, basamak çıkma ve yere oturma hazır gelir.
- Hız kameraya göre hesaplanır; karakter gittiği yöne yumuşakça döner.

**Animasyon:**
- Hıza bağlı blend: idle → yürü → koş. Ayrıca zıplama ve düşme durumları.
- Eylem animasyonları (sağma, ekme, taşıma) üst gövdeye ayrı katman olarak uygulanır. Böylece yürürken kova taşınabilir.

**Etkileşim:**
- Karakter hedefe doğru kısa bir hizalamayla konumlanır, animasyon oynar, olay simülasyona gider.
- Gerçekçi IK gerekmez; hizalama ve iyi zamanlanmış animasyon yeterli.

**Kamera:**
- Yay benzeri takip (spring arm). Kameradan karaktere ışın atılır, araya bir şey girerse kamera yaklaşır.
- Fare ile döndürme, tekerlekle yakınlaştırma.
- Araçta kamera daha uzakta durur ve FOV hıza bağlı değişir.

**Palmera Nights'tan taşınacak dersler** (kullanıcı geri bildirimleri):
- Ok tuşlarıyla kamera ve karakter birlikte dönsün.
- Eksene veya yola **hizalama yardımı** olsun (araçta ve yürürken; aç/kapa tuşu ile).
- Duraklatma ekranında ve başlangıç ekranında **tuş listesi** olsun.
- Esc ile duraklat, tekrar Esc ile devam et.
- Görev başlatma noktası **uzaktan görünsün** (ışık sütunu + tabela + yön tarifi). Ne yapılacağı açıkça yazsın.
- Can, para gibi göstergeler **etiketli** olsun; simgeler karıştırılmasın.
- "Yükleniyor…" ekranı olsun.
- Başarısızlıkta sayfayı yenilemeden "tekrar dene / başa dön" seçenekleri olsun.
- Grafik kalitesi varsayılanı **Düşük** olsun; oyuncu isterse yükseltsin.

---

## 11. Araç fiziği ve sürüş

**Model:** Rigid body + **4 ışın tekerlek**:
- yay/sönüm süspansiyonu
- yanal sürtünme eğrisi
- motor tork eğrisi

Hem ucuz hem "yeterince gerçekçi". Babylon + Havok'ta hazır sınıf olmadığı için elle yazılır (Palmera'daki arcade modelin daha fiziksel bir hali). Bütün parametreler (kütle, tork, süspansiyon, tutuş) araç başına katalogdan gelir ve kolayca ayarlanabilir olur.

**Araçlar:**

| Araç | Karakteri |
|---|---|
| Pikap | Hızlı, kasası var |
| Kamyon | Ağır, büyük kargo, geniş dönüş |
| Traktör | Yavaş, yüksek tork, arazi tutuşu iyi; ekipman takar (pulluk, ekici, römork) |
| Biçerdöver | Çok yavaş ve geniş; hasat alanı tarla hücrelerini tarar |

**Kargo:**
- Kasadaki ürünler fizik nesnesi değil, **slot tabanlı veri**dir. Görselde sandık ve bidon gösterilir.
- Taşıma ucuz kalır, ürünler yolda kasadan uçmaz.
- İstenirse "çok sert sürünce ürün kırılır" kuralı veri üzerinden eklenebilir.

**Ekipman:**
- Bağlantı noktasına (hitch) oturan basit bir eklem ya da sadece görsel bir parça.
- Tarlada iş, "aletin kapladığı alan × hız" ile hücrelere uygulanır.

---

## 12. Hayvan yapay zekâsı ve animasyon

**Davranış:**
- Basit durum makinesi ya da fayda (utility) seçimi: gez, ye, iç, uyu, sürüye yaklaş, oyuncuya bak.
- "İlgi noktaları" (yemlik, suluk, gölge) üzerinden çalışır. Navmesh gerekmez; ağıl ve mera sınırları içinde basit yönlendirme ve engelden kaçınma yeterli.

**Simülasyon ile görüntü ayrımı:**
- Açlık ve üretim, sim katmanında **zaman damgasıyla** hesaplanır.
- Görsel hayvan yalnızca oyuncu yakınken var olur.

**Animasyon ve performans:**
- Yakındaki 10–20 hayvan: iskeletli animasyon.
- Uzaktaki sürüler: **Vertex Animation Texture (VAT)** ya da baked animasyon + instancing. Yüzlerce tavuk tek çizim çağrısıyla çizilir.
- Daha uzakta: çok düşük poligonlu ve animasyonsuz LOD.
- Animasyon güncellemesi uzaklığa göre seyreltilir.

**İçerik:** Her hayvan için en az şu animasyonlar gerekir: idle, yürü, ye, uzan; ayrıca bir etkileşim animasyonu (sağılma, yumurtlama vb.).

---

## 13. Görev sistemi

**Veriye dayalı tanım.** Görevler JSON olarak katalogda durur, sunucudan gelir.

- **Görev:** kimlik, ad, açıklama, ön koşullar, açtığı görevler, ödüller, adımlar.
- **Adım:** sıralı ya da paralel hedef grubu.
- **Hedef türleri** (sınırlı ve genişletilebilir bir sözlük):
  - `goTo(bölge)`
  - `interact(hedefTürü, eylem, adet)` → "3 ineği besle"
  - `collect(eşya, adet)`
  - `load(eşya, araç)`
  - `deliver(eşya, adet, alıcı)`
  - `plant(ekin, adet)`, `water(adet)`, `harvest(ekin, adet)`
  - `wait(oyunSaati)`
  - `own(şey)`, `earn(miktar)`, `buy(şey)`

**Olay tabanlı ilerleme:**
- Simülasyon `AnimalFed`, `ItemLoaded`, `CropHarvested`, `SaleCompleted` gibi olaylar yayınlar; görev sistemi bunları dinler.
- Yeni görev çoğu zaman sadece yeni bir veri kaydıdır; kod değişmez.

**Sunucu tarafı:**
- Görev adımlarının ilerlemesi eylemlerle birlikte sunucuya gider.
- Görevin tamamlanması ve ödülü **sunucuda** kesinleşir.

**Ekranda:**
- Hedef metni, mini haritada rota ve dünyada uzaktan görünen işaret.
- Yaklaşınca ne yapılacağını söyleyen ipucu.

**İlerleme hedefleri:** "İşini büyüt" gibi uzun vadeli hedefler görevlerden ayrı bir listede tutulur.

---

## 14. Envanter ve ekonomi

**Envanter:**
- **Eşya tanımı:** tür, birim (litre, adet, kg), taşıma yeri (el, kova, kasa, depo), isteğe bağlı tazelik.
- **Kaplar:** oyuncunun eli (tek eşya ya da kova), araç kasası (slot ve kapasite), depo binaları, süt tankı (sıvı hacim). Hepsi aynı arayüzü kullanır; transfer tek bir işlemdir.

**Ekonomi:**
- **Fiyatlar:** market başına taban fiyat × talep çarpanı. Aynı ürünü aynı yere çok satınca fiyat düşer, zamanla toparlanır. Hesap sunucuda yapılır.
- **Siparişler:** restoran ve marketlerden süreli siparişler ("yarına kadar 20 yumurta"). Görevlerin dışında sürekli bir oyun döngüsü sağlar.
- **Harcamalar:** arazi, hayvan, bina, araç, tohum, yem, yükseltme. Hepsi katalogda fiyat ve ön koşulla tanımlanır.
- **Para birimi:** tam sayı (kuruş).

**Denge:**
- İlk saatlerde süt ve yumurta güvenli gelir sağlar.
- Sebze riskli ama kârlı olur.
- Büyük arazi uzun vadeli yatırım olur.
- Fiyatlar katalogda (veritabanında) durduğu için denge, kod değiştirmeden ayarlanır.

---

## 15. Açık dünya ve bölge yükleme

- **Dünya parçalara (chunk) bölünür** (örneğin 128×128 m). Her parça şunlardan oluşur:
  - arazi yükseklik haritası
  - statik geometri (GLB)
  - çarpışma şekilleri
  - nesne ve etkileşim yerleşimi (JSON)
- **Bölgeler** (çiftlik, köy, kasaba, ek araziler) parça gruplarıdır. Yeni bölge eklemek yeni parçalar eklemek demektir; kod değişmez.
- **Yükleme halkaları:**
  - Yakın: tam ayrıntı + fizik.
  - Orta: düşük LOD, fizik yok.
  - Uzak: silüet ya da sis.
  - Babylon `AssetContainer` ile parça yükleme ve boşaltma yapılır.
- **Görünmeyen çiftlikler** zaman damgasıyla ilerler (bkz. 8.1).
- **İlk sürümde tek bölge yeterli.** Ama bölge ve parça yapısı **ilk günden** kullanılmalı; sonradan eklemek çok pahalı olur.

---

## 16. Düşük donanım için performans stratejileri

**Görsel stil:**
- Low poly + **tek bir renk paleti dokusu** (gradient atlas). Nesnelerin çoğu aynı materyali paylaşır; birleştirme ve instancing son derece verimli olur. Bu projenin en büyük tek performans kazancı.

**Ekinler:**
- Binlerce bitki **thin instances** ile çizilir.
- Büyüme aşamaları ayrı mesh'ler ya da ölçek ile gösterilir; tarla verisi tek bir buffer'da tutulur.

**Çizim çağrısı bütçesi:**
- Düşük kalite: 300'ün altı
- Orta kalite: 600'ün altı
- Statik bina ve çitler parça başına birleştirilir.

**LOD:** Her modelde 2–3 seviye ya da uzakta billboard (Babylon yerleşik LOD).

**Culling:**
- Frustum culling hazır gelir.
- Açık arazide occlusion culling pek fayda sağlamaz; köy sokaklarında parça bazında kaba görünürlük yeterli.

**Gölgeler:**
- Tek yönlü ışık, kısa mesafe, düşük çözünürlük.
- Düşük kalitede yalnızca karakter ve araç gölgesi.
- Ortam gölgelemesi baked (vertex color ile AO).
- Gölge haritası aralıklı güncellenir.

**Dokular ve bellek:**
- KTX2/Basis (GPU belleği ~4–6 kat azalır), Meshopt geometri.
- Boşaltılan parçaların kaynakları açıkça serbest bırakılır.

**Uyarlanabilir kalite:**
- FPS izlenir. Hedefin altına düşünce önce render çözünürlüğü (hardware scaling), sonra gölge, sonra LOD mesafesi düşürülür.
- Varsayılan kalite: **Düşük**.

**CPU:**
- Fizik yalnızca yakındaki nesnelerde çalışır.
- Hayvan yapay zekâsı uzaklığa göre seyrek güncellenir.
- Simülasyon sabit adımla ve düşük frekansta çalışır (ör. 10 Hz), render bağımsızdır.

**Ağ:**
- Eylemler toplu gönderilir.
- Katalog önbelleğe alınır.
- Asset'ler uzun süreli önbellekle sunulur (dosya adında sürüm).

**Ölçüm:**
- Hedef donanıma yakın, tümleşik GPU'lu bir makinede düzenli FPS ölçümü yapılır.
- Palmera'da gerçek GPU'da ölçüm yapılmamıştı; bu eksik burada en baştan kapatılmalı.

---

## 17. Riskler

| Risk | Olasılık / etki | Önlem |
|---|---|---|
| **İçerik üretimi** (rigli hayvanlar, animasyonlar, araçlar, binalar) | Yüksek / yüksek | Tutarlı low-poly stil rehberi; prototipte CC0 paketler |
| Sürüş hissi (özellikle traktör ve römork) | Orta / yüksek | Erken prototip, ayarlanabilir parametreler |
| Çok sayıda animasyonlu hayvan | Orta / orta | VAT, LOD, seyrek güncelleme |
| Kapsam büyümesi | Yüksek / yüksek | Önce dikey dilim; özellik listesini sabitle |
| Kayıt şeması değişince eski kayıtların bozulması | Orta / yüksek | Migration sürümleri baştan |
| İstemci ve sunucu kurallarının birbirinden kopması (aynı formül iki dilde) | Orta / orta | Formüller ve sabitler katalogda veri olarak tutulur; kural sayısı az tutulur; sunucu her zaman son sözü söyler |
| Ağ kopması ve eylem kaybı | Orta / orta | Eylem kuyruğu, benzersiz eylem kimliği, tekrar gönderim |
| TypeScript olmadan tip hataları | Orta / orta | JSDoc, Laravel Form Request ile JSON doğrulama, net modüller |
| Laravel'in paylaşımlı hostta kurulumu (document root, izinler, SSH yokluğu) | Orta / düşük | Bölüm 7.3'teki kontrol listesi; host seçimi öncesi deneme kurulumu |
| Tümleşik GPU'da gölge ve doku belleği | Orta / orta | Kalite kademeleri, KTX2 |
| WebGPU ve WebGL farkları, Safari | Orta / düşük | Önce WebGL 2 hedeflenir; WebGPU bonus |
| PostgreSQL hosting | Orta / düşük | Host seçimi erken yapılır |
| `event_log` tablosunun büyümesi | Düşük / orta | Bölümleme ya da arşiv |
| İsim ve marka (ad: Grand Farm Adventure) | Düşük–orta / yüksek | Özgün logo ve görsel kimlik, tanıtımda GTA'yı anmamak, yayın öncesi hukuki kontrol |
| Görev ve ekonomi dengesi | Yüksek / orta | Katalog veritabanında; oyuncu testi |

---

## 18. Yol haritası

Süreler kaba tahmindir (tek geliştirici + yarı zamanlı 3D sanatçı varsayımıyla). Asıl belirleyici içerik üretim hızı olacak.

**Aşama 0: Teknik deneme (1–2 hafta)**
- Babylon (UMD, derleme yok) + Havok ile küçük bir sahne:
  - yürüyen karakter
  - traktör
  - 5.000 instanced bitki
  - 30 animasyonlu hayvan
- Tümleşik GPU'lu bir makinede FPS ve yükleme süresi ölçülür.
- Asset hattı denenir: Blender → GLB → KTX2/Meshopt.
- Kararlar kesinleşir: fizik motoru.
- Laravel kurulur, PostgreSQL'e bağlanır; ilk migration ve tek bir eylem uç noktası denenir.
- Babylon'un Laravel'in `public/` klasöründen, Vite olmadan yüklendiği doğrulanır.

**Aşama 1: Oynanabilir prototip (4–6 hafta)**
- Küçük bir çiftlik, karakter, kamera, pikap.
- 1 inek, 1 tavuk, 1 domates tarlası.
- Etkileşim sistemi, basit envanter.
- Görev sistemi + "Besleme Vakti" görevi.
- Eylem kuyruğu + PostgreSQL'e kayıt (`event_log`, `player_state`).
- Amaç: oyunun **eğlenceli olup olmadığını** erken görmek.

**Aşama 2: Dikey dilim (6–8 hafta)**
- Köy, market, teslimat görevi, ekonomi ve fiyatlar (sunucu otoritesinde).
- Koyun; ekme, sulama, büyüme, hasat döngüsü.
- Kamyon; HUD ve menüler (DOM).
- Hesap ve giriş, katalog, migration'lar.
- Kalite ayarları ve performans bütçesi.

**Aşama 3: İlerleme ve büyüme (8–10 hafta)**
- Arazi satın alma, bina yapma ve yükseltme, hayvan satın alma, siparişler.
- Traktör ekipmanları, biçerdöver; buğday, mısır, patates.
- Görev zinciri ve ilerleme hedefleri.

**Aşama 4: Dünya genişlemesi (sürekli)**
- Bölge yükleme canlıya alınır; kasaba ve ek çiftlikler eklenir.
- Yeni hayvanlar ve ekinler, restoran müşterileri.

**Aşama 5: Cilalama ve yayın**
- Ses ve müzik (Palmera'daki gibi Web Audio ile ya da ses dosyalarıyla).
- Gündüz-gece ve hava durumu.
- Ayarlar, erişilebilirlik, eğitim görevi, yükleme ekranları, hata raporlama.
- Oyun dışı PHP sayfaları: istatistik, görev geçmişi.

**Aşama 6 (isteğe bağlı): Çok oyunculu hazırlık**
- Eylemler zaten sunucuda doğrulanıyor.
- Gerekirse WebSocket servisi eklenir.

---

## 19. Kullanıcının çalışma kuralları (Palmera Nights'tan; yeni projede de geçerli)

- **Türkçe** konuş.
- Yalnızca proje klasöründe çalış; dışındaki dosya, klasör ve projelere bakma.
- İş bitince **açık sunucu ya da arka plan süreci bırakma** (`php artisan serve` dahil). Kullanıcının kendi açtığı sunuculara dokunma.
- Denerken **ses çalma**, pencereyi öne getirme; **başsız tarayıcı** kullan (kullanıcı aynı anda bilgisayarda çalışıyor).
- Projeye otomatik test dosyası yazma; geçici test araçları proje dışında (scratchpad'de) durur.
- **Kullanıcının gerçek kaydını asla silme.** Testlerde ayrı bir test oyuncusu ya da test veritabanı kullan. Gerçek veriye dokunmak gerekirse önce yedek al.
- Tek komutla nasıl açılacağını ve adresini her zaman söyle.
- Tarayıcı önbelleği sorunu yaşanmasın diye JS ve CSS adreslerine `?v=filemtime` ekle. Değişiklikten sonra "sayfayı yenile" demek yeterli olsun.
- Kod yazmadan önce mimari onaylanır. **Bu belge onaylanan mimariyi kaydeder.** Açık sorular (bölüm 0) cevaplanmadan ilgili kısımlara başlanmamalı.

---

## 20. Palmera Nights'tan öğrenilen teknik dersler

- Başsız tarayıcıda (yazılımsal grafik) kare döngüsü çok yavaş. Mantık testi için oyuna `simulate(saniye)` gibi bir fonksiyon eklemek ve tuşları koddan enjekte etmek çok işe yarıyor.
- URL parametreleriyle test modları: `nosave=1`, `mute=1`, `autostart=1`, `debug=1`, `q=low`, saat ve konum ayarı.
- Pointer lock isteği reddedilebilir; hata yakalanmalı.
- Gece sahnesinde bloom ve ışık şiddetleri kolayca "beyaz parlama"ya dönüşüyor; düşük değerlerle başlanmalı.
- AI araçlarda kilitlenme (birbirini bekleme) sık görülüyor; sabır zamanlayıcısı ve öncelik kuralı gerekiyor.
- PowerShell'de JSON dosyası yazarken BOM'suz UTF-8 kullanılmalı.

---

## 21. Kaynaklar (2026-11-20 itibarıyla kontrol edildi)

- PlayCanvas Engine v2.20.0: https://forum.playcanvas.com/t/engine-v2-20-0/42387
- PlayCanvas Engine v2.19.0: https://forum.playcanvas.com/t/engine-v2-19-0/42321
- PlayCanvas Engine: https://playcanvas.com/products/engine
- Babylon.js 9.0 duyurusu: https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0
- Babylon.js 9.27.0: https://gamedev.net/news/5796-babylonjs-9270-released/
- three.js WebGPURenderer: https://threejs.org/manual/en/webgpurenderer
- three.js sürümleri: https://www.github.com/mrdoob/three.js/releases
- Three.js r186: https://cgworld.jp/flashnews/01-202610-Threejs-r186.html
- Rapier (dimforge): https://github.com/dimforge/rapier
- Rapier JS 0.19.3: https://socket.dev/npm/package/@dimforge/rapier2d/overview/0.19.3

Başlarken kontrol edilecek resmi sayfalar:
- Babylon.js sürümleri: https://github.com/BabylonJS/Babylon.js/releases
- Babylon.js belgeleri: https://doc.babylonjs.com
- Havok eklentisi: doc.babylonjs.com → Physics → Havok
- Karakter kontrolcüsü: doc.babylonjs.com → Physics → Character Controller

---

## Ek A: İlk fikir metni (özgün, İngilizce)

Kullanıcının ilk gönderdiği metnin tamamı aşağıdadır. Bu metindeki bazı öneriler **sonradan değişti**:
- TypeScript, React ve Vite **kullanılmayacak**.
- Sunucu tarafında **Laravel kullanılacak** (karar verildi).
- "Kod yazma, dosya oluşturma" talimatları yalnızca o analiz aşaması içindi.

> **Grand Farm Adventure (GFA) – Game Concept & Technical Architecture Research**
>
> **1. Project Overview** — I want to develop a browser-based 3D farming adventure game called Grand Farm Adventure (GFA). The game takes inspiration from Grand Theft Auto (GTA), particularly GTA 5's third-person camera perspective, open-world exploration, mission system, character controls, and vehicle mechanics. However, instead of crime and urban activities, the entire game revolves around farming, animal husbandry, agricultural production, transportation, trading, and expanding a farming business. The goal is to create an enjoyable open-world farming game where players complete missions, earn money, purchase new land, raise animals, grow crops, and gradually build a large agricultural empire. Important: This is a browser game. Players should be able to play directly through a web browser without downloading or installing a desktop application.
>
> **2. Camera and Gameplay Perspective** — Third-person camera similar to GTA 5. The player controls a farmer character visible from behind. The character should be able to: walk and run; jump; move freely around the farm and surrounding environment; enter and exit vehicles; interact with animals and objects; feed animals; milk cows; collect eggs; plant seeds; harvest crops; load and unload products; complete missions. The camera should smoothly follow the character and support rotation and zoom.
>
> **3. Game World** — The player's farmhouse; cow barns; sheep barns; chicken coops; agricultural fields; vegetable gardens; storage buildings; a village and town; grocery stores and markets; restaurants and potential commercial customers; roads connecting different locations; additional purchasable farming properties. Initially a relatively small playable map, but the architecture should support expanding the world with additional connected regions. Visual style: Stylized 3D / Low Poly rather than photorealistic; colorful environments, appealing characters, recognizable animals, consistent visual identity.
>
> **4. Mission System** — Mission-based, similar to GTA; missions consist of multiple sequential objectives.
> - Mission 1 – Feeding Time: go to the cow barn; feed the cows; go to the sheep barn; feed the sheep; go to the chicken coop; feed the chickens.
> - Mission 2 – Daily Collection: milk the cows; fill milk containers; collect milk from the sheep; collect eggs from the chickens; load all products into the player's vehicle.
> - Mission 3 – Market Delivery: drive the vehicle to the grocery stores; deliver milk and eggs; complete the deliveries; receive payment.
> - Mission 4 – First Harvest: prepare the agricultural field; plant tomato seeds; plant pepper seeds; water the crops; wait for the crops to grow; harvest the vegetables.
> - Mission 5 – Growing the Business: earn money through agricultural production; purchase additional land; purchase more animals; build new barns and facilities; increase production capacity; sell more products.
>
> These are initial examples; the game should support an extensible mission architecture.
>
> **5. Animals and Agricultural Production** — Cows (milk), sheep (milk, potentially wool), chickens (eggs); more later. Crops: tomatoes, peppers, potatoes, wheat, corn, other vegetables. Animals have feeding, growth and production mechanics; crops have planting, watering, growing and harvesting stages.
>
> **6. Vehicles** — Tractor, pickup truck, delivery truck, combine harvester. Realistic-enough driving physics without expensive simulation. Pickup and delivery truck are particularly important for transporting products to markets.
>
> **7. Economy and Progression** — Earn money by completing missions, selling milk/eggs/vegetables, delivering products to markets, completing commercial orders. Spend on land, animals, barns, expanding chicken coops, tractors and vehicles, seeds and equipment, upgrading facilities. Ultimate goal: transform a small farm into a large agricultural business.
>
> **8. Target Platform and Performance** — Modern desktop browsers; low-end and mid-range computers, integrated graphics, entry-level dedicated GPUs. Minimum 30 FPS, ideal 60 FPS; low-end 720p, mid-range 1080p (development goals). Consider: LOD, instanced rendering, frustum and occlusion culling, texture compression, efficient shadows, asset streaming, world streaming, efficient collision detection, optimized character and animal animations, memory management, adaptive graphics quality.
>
> **9. Technology Evaluation** — Evaluate PlayCanvas Engine V2, Babylon.js, Three.js (and other relevant technologies) on rendering performance, browser compatibility, WebGL 2 / WebGPU, low-end hardware, memory, character controller, third-person camera, physics integration, vehicle physics, animation, large-world management, asset loading and streaming, instancing and batching, developer experience, TypeScript, React integration, documentation and community, long-term maintainability. Evaluate whether React should be used for UI only. Evaluate physics engines such as Ammo.js, Havok, Rapier.
>
> **10. Proposed Architecture (original)** — Engine: PlayCanvas, Babylon.js or recommended; TypeScript; React; Vite; PHP / Laravel; PostgreSQL; Blender; GLB/glTF. Single-player first; future multiplayer should not be prevented. Evaluate which mechanics run on the client and which data is stored and validated on the backend.
>
> **11. Required Deliverables** — Concept summary; engine comparison; strengths/weaknesses; physics comparison; recommended stack; frontend/backend architecture; module architecture; third-person controls; vehicle physics; animal AI and animation; mission management; inventory and economy; open-world and region streaming; low-end performance strategies; risks; phased roadmap.
>
> **12. Strict Instructions (analysis phase only)** — Do not write code, create files, implement, scaffold, install packages, or modify files during the analysis phase.
