# Backlog — EOL Check

Pomysły na rozwój aplikacji zebrane 2026-10-25. Wszystkie zadania poniżej są do realizacji; kolejność jest propozycją priorytetów.

Cel: pomagać użytkownikowi zdecydować, co i kiedy zaktualizować. Obsługa formatów jest już szeroka, więc kolejne usprawnienia skupiają się na interpretacji wyników i regularnym sprawdzaniu projektów.

## Proponowana kolejność prac

1. Czytelność wyników i wygoda obsługi.
2. Sugestie wersji do migracji.
3. Wykrywanie rozbieżności między plikami.
4. CLI i GitHub Action.

Planowanie w czasie i eksport do kalendarza pozostają dodatkowymi kierunkami do zaplanowania.

## 1. Czytelność wyników i wygoda obsługi

Najbliższa, niewielka iteracja ułatwiająca zrozumienie raportu.

- [x] Klikalne liczniki filtrujące tabelę według statusu, z możliwością powrotu do wszystkich wyników.
- [x] Osobny licznik i filtr `Unknown`.
- [x] Oznaczenie podstawy wyniku: wersja z lockfile, minimum z deklarowanego zakresu lub cykl wywnioskowany z tagu obrazu.
- [x] Komunikat „plik rozpoznany, ale brak produktów objętych sprawdzaniem”, aby pusty wynik nie sugerował potwierdzonego wsparcia wszystkich zależności.
- [x] Usuwanie pojedynczych dodanych plików.
- [x] Przycisk „Wypróbuj przykład” wczytujący przykładowe dane.
- [x] Dodanie źródłowego pliku do eksportu Markdown.

## 2. Sugestie wersji do migracji

Pomóc przejść od informacji o EOL do wyboru wersji docelowej.

- [x] Przy produktach po EOL lub z kończącym się wsparciem pokazać wspierane wersje docelowe.
- [x] Preferować wydania LTS tam, gdzie produkt je oferuje.
- [x] Pokazywać datę końca wsparcia i pozostały okres wsparcia proponowanej wersji.
- [x] Wyraźnie opisać, że sugestia wynika z cyklu życia produktu i nie gwarantuje zgodności aplikacji po aktualizacji.

## 3. Wykrywanie rozbieżności między plikami

Przykład: użytkownik dodaje `.nvmrc`, `package.json` i `Dockerfile`, a aplikacja porównuje deklaracje wersji Node.js.

- [x] Porównywać wersje tego samego produktu w plikach dotyczących tej samej aplikacji.
- [x] Wskazywać rozbieżności wraz z nazwami plików i deklaracjami wersji.
- [x] Rozróżniać rzeczywisty konflikt od różnych, ale zgodnych deklaracji, np. przypiętej wersji mieszczącej się w zakresie `engines`.
- [x] Uwzględnić granice aplikacji i środowisk, aby celowo różne wersje nie były automatycznie traktowane jako błąd.

## 4. CLI i GitHub Action

Większy etap pozwalający regularnie sprawdzać projekt bez ręcznego otwierania strony.

- [ ] Udostępnić CLI wykorzystujące ten sam mechanizm parsowania i sprawdzania EOL co aplikacja.
- [ ] Przygotować GitHub Action generującą raport w CI.
- [ ] Umożliwić opcjonalne blokowanie nowych problemów EOL, z określeniem sposobu porównania z wcześniejszym wynikiem.
- [ ] Obsłużyć kontrolę cykliczną z aktualnymi danymi: wsparcie może skończyć się także bez zmian w repozytorium.

## Dalsze pomysły

### Skanowanie całego folderu projektu

- [x] Umożliwić wybór folderu i automatyczne odnajdywanie obsługiwanych plików.
- [x] Pomijać `.git`, `node_modules` i katalogi wynikowe.
- [x] Zachować lokalne przetwarzanie w przeglądarce.
- [x] W monorepo grupować wyniki według aplikacji i zachowywać ścieżki źródłowe.

### Planowanie aktualizacji w czasie

- [ ] Udostępnić wybór progu ostrzegania: 30, 90, 180 lub 365 dni.
- [ ] Pokazywać liczbę dni pozostałych do EOL.
- [ ] Dodać widok „co straci wsparcie do wybranej daty”, przydatny przy planowaniu kwartału.

### Eksport terminów do kalendarza

- [ ] Generować plik `.ics` z terminami EOL wykrytych produktów.
- [ ] Dodawać przypomnienia, np. 90 i 30 dni przed końcem wsparcia.
- [ ] Umożliwić eksport bez zakładania konta i bez własnego backendu.
