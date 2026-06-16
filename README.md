# Odkryj WOMAI

Statyczna aplikacja quizowa z panelem administratora.

## Publiczne adresy

Te Ĺ›cieĹĽki sÄ… celowo zachowane:

- `/odkryj-womai/` â€” panel goĹ›cia, niezabezpieczony przez Cloudflare.
- `/odkryj-womai/admin/` â€” panel administratora, zabezpieczony przez Cloudflare Access.

Nie przenoĹ› plikĂłw `odkryj-womai/index.html` ani `odkryj-womai/admin/index.html`, jeĹ›li obecne adresy majÄ… dalej dziaĹ‚aÄ‡ bez przekierowaĹ„.

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
```

## Konfiguracja

Endpoint Google Apps Script jest ustawiony w:

```text
js/config.js
```

Kolory i podstawowe zmienne wyglÄ…du sÄ… w:

```text
css/theme.css
```

Gdy bÄ™dzie gotowa docelowa identyfikacja wizualna, najpierw zmieĹ„ zmienne w `theme.css`, a dopiero potem szczegĂłĹ‚y w `guest.css` i `admin.css`.

## Logo

Panel goĹ›cia korzysta obecnie z prawdziwego pliku logo:

```text
assets/logo-womai-white.png
```

Ten plik jest wczytywany w `odkryj-womai/index.html` przez element `img.brand-logo`. JeĹ›li logo ma zostaÄ‡ zmienione, najproĹ›ciej podmieniÄ‡ plik `assets/logo-womai-white.png` na nowÄ… wersjÄ™ o tej samej nazwie albo zmieniÄ‡ Ĺ›cieĹĽkÄ™ w `index.html`.

Plik `assets/logo-placeholder.svg` moĹĽe pozostaÄ‡ jako techniczny placeholder lub zapas dla miejsc, ktĂłre nie majÄ… jeszcze docelowego logo.

Panel administratora nadal uĹĽywa klasy `brand-logo-placeholder`, wiÄ™c jego nagĹ‚Ăłwek moĹĽna pĂłĹşniej osobno dostosowaÄ‡ do prawdziwego logo.

## DostÄ™pnoĹ›Ä‡

Przy zmianach trzeba pilnowaÄ‡:

- jÄ™zyka dokumentu `lang="pl"`,
- prawdziwych przyciskĂłw `<button>`,
- komunikatĂłw `aria-live`,
- kolejnoĹ›ci fokusu,
- widocznego fokusu klawiatury,
- kontrastu kolorĂłw,
- dziaĹ‚ania quizu bez myszy.

## BezpieczeĹ„stwo

Cloudflare chroni Ĺ›cieĹĽkÄ™ `/odkryj-womai/admin/`, ale backend Apps Script nadal musi sprawdzaÄ‡ token i rolÄ™ dla kaĹĽdej operacji administracyjnej. Publiczne `action=guest` powinno zwracaÄ‡ wyĹ‚Ä…cznie dane przeznaczone dla goĹ›cia.

## Publikacja

Docelowe publiczne adresy pozostajÄ… bez zmian:

https://ptprojects.app/odkryj-womai
https://ptprojects.app/odkryj-womai/admin

To repo jest ĹşrĂłdĹ‚em aplikacji. Publiczna kopia aplikacji ma trafiaÄ‡ do katalogu `odkryj-womai/` w repozytorium `ptprojects`.

Nie zmieniaj Ĺ›cieĹĽek publicznych bez Ĺ›wiadomej decyzji, bo mogÄ… byÄ‡ uĹĽywane w QR-kodach i w konfiguracji Cloudflare Access.
