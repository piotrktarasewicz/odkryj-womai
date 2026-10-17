# Odkryj WOMAI

Statyczna aplikacja quizowa z panelem administratora.

## Publiczne adresy

Te ścieżki są celowo zachowane:

- `/odkryj-womai/` — panel gościa, niezabezpieczony przez Cloudflare.
- `/odkryj-womai/admin/` — panel administratora, zabezpieczony przez Cloudflare Access.

Nie przenoś plików `odkryj-womai/index.html` ani `odkryj-womai/admin/index.html`, jeśli obecne adresy mają dalej działać bez przekierowań.

## Struktura

```text
odkryj-womai/
  index.html
  admin/
    index.html
  assets/
    logo-womai-white.png
    logo-placeholder.svg
  css/
    theme.css
    guest.css
    admin.css
  js/
    config.js
    api.js
    guest.js
    admin.js
  worker/
    wrangler.toml
    src/index.js
```

## Konfiguracja

Endpoint Google Apps Script jest ustawiony w:

```text
js/config.js
```

Kolory i podstawowe zmienne wyglądu są w:

```text
css/theme.css
```

Gdy będzie gotowa docelowa identyfikacja wizualna, najpierw zmień zmienne w `theme.css`, a dopiero potem szczegóły w `guest.css` i `admin.css`.

## Logo

Panel gościa korzysta obecnie z prawdziwego pliku logo:

```text
assets/logo-womai-white.png
```

Ten plik jest wczytywany w `odkryj-womai/index.html` przez element `img.brand-logo`. Jeśli logo ma zostać zmienione, najprościej podmienić plik `assets/logo-womai-white.png` na nową wersję o tej samej nazwie albo zmienić ścieżkę w `index.html`.

Plik `assets/logo-placeholder.svg` może pozostać jako techniczny placeholder lub zapas dla miejsc, które nie mają jeszcze docelowego logo.

Panel administratora nadal używa klasy `brand-logo-placeholder`, więc jego nagłówek można później osobno dostosować do prawdziwego logo.

## Dostępność

Przy zmianach trzeba pilnować:

- języka dokumentu `lang="pl"`,
- prawdziwych przycisków `<button>`,
- komunikatów `aria-live`,
- kolejności fokusu,
- widocznego fokusu klawiatury,
- kontrastu kolorów,
- działania quizu bez myszy.

## Bezpieczeństwo

Cloudflare chroni ścieżkę `/odkryj-womai/admin/`, ale backend Apps Script nadal musi sprawdzać token i rolę dla każdej operacji administracyjnej. Publiczne `action=guest` powinno zwracać wyłącznie dane przeznaczone dla gościa.

## Logowanie do panelu administratora

Panel nie ma własnego formularza logowania. Osoba loguje się przez Cloudflare Access, a rolę ustala Worker z katalogu `worker/`:

1. Cloudflare Access wpuszcza na `/odkryj-womai/admin/` osoby z listy w swojej polityce.
2. Panel wysyła zapytania do `/odkryj-womai/admin/api/…`. Tę ścieżkę obsługuje Worker `odkryj-womai-admin-api`.
3. Worker sprawdza podpisany token logowania Access (`Cf-Access-Jwt-Assertion`), odczytuje z niego e-mail i ustala rolę z sekretów `SUPERADMINS` i `ADMINS`.
4. Worker dokłada token właściwej roli (`ADMIN_TOKEN` albo `SUPERADMIN_TOKEN`) i przekazuje zapytanie do Apps Script. Tokeny nie trafiają do przeglądarki.

Adresów e-mail i tokenów nie zapisuje się w repozytorium, bo jest publiczne. Ustawia się je jako sekrety Workera:

```text
cd worker
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put SUPERADMIN_TOKEN
npx wrangler secret put SUPERADMINS
npx wrangler secret put ADMINS
npx wrangler deploy
```

Listy adresów rozdziela się przecinkami. Dodanie lub usunięcie osoby wymaga zmiany sekretu Workera i polityki w Cloudflare Access (Zero Trust → Access → Applications).

Katalog `worker/` nie jest publikowany do `ptprojects`.

## Publikacja

Docelowe publiczne adresy pozostają bez zmian:

https://ptprojects.app/odkryj-womai
https://ptprojects.app/odkryj-womai/admin

To repo jest źródłem aplikacji. Publiczna kopia aplikacji ma trafiać do katalogu `odkryj-womai/` w repozytorium `ptprojects`.

Nie zmieniaj ścieżek publicznych bez świadomej decyzji, bo mogą być używane w QR-kodach i w konfiguracji Cloudflare Access.
