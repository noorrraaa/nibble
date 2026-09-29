# nibble · Erişim ve "ne nerede"

> Değer yok, yer var. Sunucu kuralları (firewall, SSH, geri alma): `hayat/SUNUCU-GUVENLIK.md`.
> Son güncelleme: 2026-09-29.

| Ne | Nerede / nasıl |
|---|---|
| Canlı site | https://nibble.nardin.app (web editör; `nardin.app` vitrininde "Denemede") |
| Kod | bu klasör, GitHub `git@github-kisisel:noorrraaa/nibble.git` |
| Coolify | https://coolify.nardin.app → proje `x11g…` → **nibble** (`pv7jvina5gk0pfg66pbt5e2x`). Push deploy ETMİYOR → panelden **Redeploy** |
| Eski geçici adres | ✅ 2026-09-29 kaldırıldı; yalnız `https://nibble.nardin.app` |
| Domain / DNS / Search Console | `nardin.app` ortak: Cloudflare + GSC `emrekizak5@gmail.com` (bkz. `nardin/ERISIM.md`) |
| Analitik | Cloudflare Web Analytics, `nibble.nardin.app` token'ı `47a67e735fc741a98bd12c85dbbacfe2` (açık token) |
| Hukuki iletişim | `thecrimelogs.contact@gmail.com` (`src/lib/site.ts` → `LEGAL_CONTACT_EMAIL`) |

Veri: kullanıcı çizimleri tarayıcının kendi IndexedDB'sinde; sunucuda kullanıcı verisi YOK. Sunucu kaybolsa
bile kullanıcı verisi kaybolmaz, yalnız site yeniden deploy edilir.
