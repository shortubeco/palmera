# Palmera Nights — Lig sistemi kuralları

*2026-11-23: ilk fikir ve öneriler · 2026-11-24: kurallar kullanıcıyla kararlaştırıldı. Kod henüz yazılmadı.*

## 1. Ligler

| # | Lig | Geçme sınırı | Başlangıç ödülü | Saniyede kesinti | Başarısız (ödül 0) | Görev |
|---|---|---|---|---|---|---|
| 1 | Tahta | 100.000 $ | 15.000 $ | 50 $ | 5:00 | Altın Veloce (Palmera'da arabayı çal → limandaki GARAJ) |
| 2 | Demir | 250.000 $ | 25.000 $ | 60 $ | 6:56 | *kullanıcı anlatacak* |
| 3 | Bakır | 500.000 $ | 40.000 $ | 80 $ | 8:20 | *kullanıcı anlatacak* |
| 4 | Gümüş | 1.000.000 $ | 60.000 $ | 100 $ | 10:00 | *kullanıcı anlatacak* |
| 5 | Altın | 2.000.000 $ | 100.000 $ | 150 $ | 11:07 | *kullanıcı anlatacak* |
| 6 | Platin | 5.000.000 $ | 200.000 $ | 250 $ | 13:20 | *kullanıcı anlatacak* |
| 7 | Elmas | her 5.000.000 $'da yeni görev | 300.000 $ | 300 $ | 16:40 | Elmas 1, Elmas 2, … (sonra eklenecek) |

- Yeni oyuncu **Tahta**'dan başlar. Her ligde **tek görev** vardır; görevler lig yükseldikçe zorlaşır ve uzar.
- Ödül ve sınır değerleri başlangıç değerleridir; gerekirse sonra değiştirilir.
- Lig yükseldikçe daha çok oynamak gerekir (bilerek). Yaklaşık gereken bitiriş: Tahta ~10, Demir ~16, Bakır ~20, Gümüş ~28, Altın ~33, Platin ~42 (görevi süresinin ~%40'ında bitiren oyuncu için).

## 2. Görev, ödül ve süre

- Görev başlarken ödül ligin **başlangıç ödülüdür**; **her saniye ligin kesintisi kadar azalır**. Görev tamamlanınca kalan miktar oyuncunun ödülüdür.
- Ekranda **azalan ödül** ve **geçen süre sayacı** görünür.
- Ödül **0'a inerse görev başarısız** biter.
- **Başarısızlık** (ödülün bitmesi, ölüm, tutuklanma vb.): ödül yok, **ceza yok**; hemen yeniden denenebilir.
- **3 can sistemi kaldırılır** (kalpler, "OYUN BİTTİ", `newGame` sıfırlaması).
- Görev **istendiği kadar** tekrarlanabilir.
- Mevcut görevlerin kendi süre sınırları (Gece Teknesi 180 sn, Sıcak Paket 55 sn + 18 sn vb.) **kalkar**; hepsi bu tek ödül sayacına bağlanır.
- İleride bir lig görevi polisten kaçma türündeyse: ödül polisten kurtulana kadar azalmaya devam eder; kurtulunca görev tamamlanır, kalan ödül alınır.
- Rakip / hayalet yok: herkes saate karşı oynar, yarış sıralama tablolarındadır.

## 3. Para ve lig atlama

- **Tek para** vardır: görev ödülü buraya eklenir; uçak bileti, ceza, hastane gibi giderler de buradan düşer.
- Para **lig görevinden** ve **yardım görevlerinden** (500 $) kazanılır; başka gelir yok.
- Her lige **5.000 $ bakiyeyle** başlanır (Tahta dahil). Bu bakiye sınıra sayılır (Tahta'da 100.000 $'a ulaşmak için 95.000 $ kazanmak gerekir).
- Paranın ligin **geçme sınırına** ulaştığı an oyuncu bir üst lige geçer; yeni ligde yine **5.000 $** ile başlar.
- **Elmas**: üst lig yoktur. Her **5.000.000 $**'a ulaşıldığında yeni Elmas görevi açılır, para **5.000 $'a döner**; her Elmas görevinin kendi süre tablosu olur.

## 4. Sıralamalar (her ligde / her Elmas görevinde iki tablo)

- **Para tablosu**: o ligde şu an oynayanlar; en çok parası olan en üstte. Lig atlayan oyuncu bu tablodan silinir.
- **Süre tablosu**: her oyuncunun o görevdeki **en iyi süresi** (oyuncu başına bir satır); en kısa en üstte. Lig atlayan oyuncunun rekoru **kalır**.

## 5. Site ve arayüz

- **Landing page** (sitenin giriş sayfası): her ligde **iki tablo** (en çok para + en iyi süre), her biri **en iyi 20**; giriş yapmadan görülür. **OYNA** düğmesi → giriş yapılmamışsa kullanıcı adı + şifre (giriş / kayıt), yapılmışsa doğrudan oyun sayfası.
- Oyun içinde: **ESC** ile açılan pencerede oyuncu **kendi sıralamasını** görür.
- **Lig atlama ekranı**: sade tebrik + yeni ligin bilgisi (ad, geçme sınırı, görev, başlangıç ödülü).

## 6. Dünya ve görevler

- Açık dünya (Palmera, Isla Selva, Wild West, Casablanca, uçuşlar) **lobi** olarak kalır; lig görevi dünyadaki işaretten başlar, bitince oyuncu dünyaya döner.
- **İlk aşama: yalnız Tahta ligi** (Altın Veloce). Diğer liglerin bilgileri kullanıcıdan sonra gelecek.
- **Yardım görevleri** (mevcut Gece Teknesi, Sıcak Paket, Mavi Işıklar): **herkes** oynayabilir; her başarılı görev **500 $** verir. Zor durumda kalanlar (bilet, ceza, hastane parası) için ek para kaynağı; ödül az olduğu için ana görevin yerini tutmaz.
- **Görevler ücretsizdir**: ana görevi başlatmak para istemez.
- Para eksiye inmez (gider bakiyeden büyükse bakiye 0'da durur).

## 7. Hesap, kayıt, sunucu

- Giriş: **kullanıcı adı + şifre**. Telefonda ve bilgisayarda aynı hesap.
- Kayıt **sunucuda, PostgreSQL**'de (hostingte var): oyuncunun hesabı, bulunduğu lig, parası, süre rekorları vb.
- Tarayıcı kaydı (localStorage `pn_save`) ve mevcut kayıtlı ilerleme **kullanılmaz**; oyun oyuncunun bulunduğu ligden başlar.
- **Hile önlemi (başlangıç: basit)**: para sunucuda hesaplanır (tarayıcı "param şu kadar" diyemez); görev başlangıç/bitiş zamanını sunucu tutar, ödülü süreden kendisi hesaplar; imkânsız kısa süreler reddedilir.

## 8. Açık konular

- Demir → Platin ve Elmas görevleri (kullanıcı anlatacak).

---

## Ek: değerlendirilip seçilmeyen fikirler (2026-11-23 önerileri)

- Ayrı lig puanı (para yerine) → seçilmedi: sıralama paraya göre.
- Haftalık sezon + 20 kişilik gruplar + düşme → seçilmedi: sınıra ulaşan bir üst lige geçer.
- Hayalet rakip / canlı karşılaşma → seçilmedi: herkes saate karşı oynar.
- Her ligde 3–5 görev havuzu → seçilmedi: her ligde tek görev.
- Kaybedene teselli puanı, beceriye göre eşleştirme → gerek kalmadı (rakip yok).
- Lig sırası: Platin, Elmas'ın altına alındı (kullanıcı onayladı).
