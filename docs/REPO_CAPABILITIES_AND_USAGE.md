# FlowLens — Kompletny przewodnik użytkowania i mapa repozytorium

> Wersja: 3.0.0 · Autor: [@fski](https://fski.app) · Rozszerzenie Chrome DevTools do audytu dostępności (WCAG)

---

## Spis treści

1. [Mapa repozytorium (model mentalny)](#1-mapa-repozytorium)
2. [Inwentarz funkcji (Feature Inventory)](#2-inwentarz-funkcji)
3. [Przewodnik "Jak używać"](#3-przewodnik-jak-używać)
4. [Scenariusze praktyczne](#4-scenariusze-praktyczne)
5. [Rozwiązywanie problemów i pułapki](#5-rozwiązywanie-problemów-i-pułapki)
6. [Ustawienia i persystencja — referencja](#6-ustawienia-i-persystencja)
7. [Model raportowania — referencja](#7-model-raportowania)
8. [Notatki dla maintainerów](#8-notatki-dla-maintainerów)

---

## 1. Mapa repozytorium

### 1.1 Architektura wysokopoziomowa

```
┌─────────────────────┐      chrome.runtime       ┌──────────────────────┐
│   Panel (DevTools)  │  ──── onMessage ────────▶  │   Service Worker     │
│   panel.html / .js  │  ◀─── sendResponse ─────   │   sw.js              │
│   panel.css         │                            │                      │
└─────────────────────┘                            └──────────┬───────────┘
                                                              │
                                                   chrome.scripting
                                                   .executeScript
                                                              │
                                                   ┌──────────▼───────────┐
                                                   │  Audit Snippet       │
                                                   │  a11y-audit-snippet  │
                                                   │  .js                 │
                                                   │  (MAIN world)        │
                                                   └──────────────────────┘
```

**Przepływ danych:**
1. Użytkownik klika przycisk trybu w panelu (`panel.js`).
2. Panel wysyła wiadomość `RUN_AUDIT` lub `CAPTURE_STEP` do service workera (`sw.js`).
3. Service worker rozwiązuje docelowe ramki (scope/frame targeting), wstrzykuje snippet (`a11y-audit-snippet.js`) do ramki w kontekście `MAIN` world.
4. Snippet wykonuje audyt i zwraca wynik do service workera.
5. Service worker normalizuje wynik, wybiera "best entry" i odsyła do panelu.
6. Panel renderuje wyniki w tabelach wirtualnych, przechowuje w `chrome.storage.local`.

### 1.2 Główne moduły/pliki

| Plik | Linie | Rola |
|------|------:|------|
| `manifest.json` | 25 | Konfiguracja MV3: permissions (`scripting`, `webNavigation`, `storage`), `host_permissions` (`http://*/*`, `https://*/*`), service worker, devtools page |
| `devtools.html` / `devtools.js` | ~10 | Rejestracja panelu DevTools (`chrome.devtools.panels.create`) |
| `panel.html` | 272 | Struktura HTML panelu: header, scope/targeting, settings, tryby, action bar, progress, wyniki, eksport |
| `panel.js` | 4265 | Logika UI: stan, renderowanie tabel wirtualnych, sesje Flow, sygnatury, eksporty, persistence, accessibility |
| `panel.css` | 2527 | Style: dark theme only, severity kolory, responsive |
| `sw.js` | ~1605 | Service worker: walidacja wiadomości, frame scope resolution, frame scoring, script injection, normalizacja wyników, frame key generation |
| `a11y-audit-snippet.js` | ~4285 | Silnik audytu WCAG: ~120 typów reguł, `run()`, `observe()`, `watch()`, `tabWalk()`, `contrastScan()`, profile-aware checks |
| `fixtures/a11y-rule-fixtures.html` | ~130 | Strona testowa z fixture'ami do weryfikacji reguł FP |
| `icons/` | — | Ikony rozszerzenia (16, 32, 48, 128px) |

### 1.3 Kontrakty wiadomości (message contracts)

Komunikacja Panel → SW jest przez `chrome.runtime.sendMessage`. SW waliduje każdą wiadomość w `validateIncomingMessage()` (`sw.js:33-71`).

| Typ wiadomości | Kierunek | Cel | Kluczowe pola |
|---------------|----------|-----|----------------|
| `LIST_FRAMES` | Panel → SW | Pobranie listy ramek w zakładce | `tabId` |
| `RUN_AUDIT` | Panel → SW | Uruchomienie audytu w wybranym trybie | `tabId`, `action` (`run`/`contrast`/`tabWalk`/`watch`/`observe`), `target` (scope, frameIds, match), `wcagLevel`, `modeHints`, `appMarkers` |
| `CAPTURE_STEP` | Panel → SW | Przechwycenie kroku sesji (baseline + active) | `tabId`, `action`, `activeMode`, `target`, `wcagLevel`, `modeHints`, `appMarkers` |
| `HIGHLIGHT` | Panel → SW | Podświetlenie elementu na stronie | `tabId`, `frameId`, `finding` |

**Odpowiedzi** zawierają zawsze `ok: boolean` plus dane wynikowe lub `error: string`.

### 1.4 Normalizacja danych, kompaktowanie, persystencja, eksport

| Warstwa | Lokalizacja | Opis |
|---------|------------|------|
| **Normalizacja wyników** | `sw.js:145-223` (`normalizeAuditResult`) | Ujednolicony scoring per tryb: `blockingCount`, `summaryScore`, `primaryCounts` |
| **Frame key generation** | `sw.js:127-143` (`deriveFrameKey`) | Deterministyczny klucz niezależny od `frameId`: `fk::v1::<origin>::<pathHint>::<markerHash8>` |
| **Kompaktowanie rekordów** | `panel.js:828-937` (`persistRecords`) | Progresywne kompaktowanie przy quota exceeded: 3 poziomy (50→25→10 rekordów) |
| **Kompaktowanie sesji** | `panel.js:1737-1875` | `rawAppendix` cap (200 wpisów), soft-compact (ostatnie 30 kroków), pruning orphanów |
| **Persystencja** | `panel.js:419-434` (`storageGet`/`storageSet`) | `chrome.storage.local` z fallback na `localStorage` |
| **Eksport** | `panel.js:2350-2540` | Session Markdown, Session JSON, single-run Markdown/JSON |

---

## 2. Inwentarz funkcji

### A) Screen Audit (tryb statyczny — snapshot)

#### A1. Run (Audit)

| Pole | Wartość |
|------|---------|
| **Nazwa** | Run / Audit |
| **Co robi** | Jednorazowy audyt WCAG — sprawdza labels, ARIA, headingi, landmarki, tab indexy, role, duplikaty ID, focus-visible, touch targets, iframe titles, i więcej |
| **Pliki** | `a11y-audit-snippet.js` (cały `run()` block, ~linie 870-1720), `panel.js` (tryb `"run"`), `sw.js` (`execAuditActionInFrame`) |
| **Wejścia/ustawienia** | Scope (Primary/Host/Embedded/All), WCAG Level (2.1-AA/2.1-AAA/2.2-AA/2.2-AAA), profil MFE (helpcenter/chat), `alsoConsole` |
| **Wyjścia** | Tabela findings z kolumnami: sev, product, type, wcag, name, testId, path, note, fix; severity badges; summary score |
| **Timeout** | 2 sekundy (`panel.js:457`) |
| **Limity** | Brak limitu findings — wynik zależy od DOM |
| **Failure modes** | `INJECT_FAILED`, `NO_API`, `EXEC_FAILED`, `NO_RESULT`, `NO_SCOPE_MATCH` |

#### A2. Contrast

| Pole | Wartość |
|------|---------|
| **Nazwa** | Contrast |
| **Co robi** | Przybliżony skan kontrastu kolorów tekst/tło dla do 250 węzłów tekstowych. Sprawdza AA/AAA ratios |
| **Pliki** | `a11y-audit-snippet.js` (`contrastScan()`), `panel.js` (sekcja `contrastSection`), `sw.js` |
| **Wejścia** | `limit: 250` (domyślnie), scope/frame |
| **Wyjścia** | Tabela z kolumnami: ratio, req, large, text, tag, testId, path, note. Toggle „Show All" przełącza między failures/all samples |
| **Timeout** | 3 sekundy |
| **Limity** | Max 250 węzłów; przybliżony — nie obsługuje gradientów/obrazów |
| **Failure modes** | Jak Run |

#### A3. Tab Walk

| Pole | Wartość |
|------|---------|
| **Nazwa** | Tab Walk |
| **Co robi** | Heurystyczna symulacja nawigacji Tab: przechodzi przez do 80 focusable elements i wykrywa focus traps, focus on body, dialog issues, roach motels |
| **Pliki** | `a11y-audit-snippet.js` (`tabWalk()`), `panel.js` (sekcja `tabWalkSection`), `sw.js` |
| **Wejścia** | `steps: 80` (domyślnie), scope/frame |
| **Wyjścia** | Tabela z kolumnami: i, type, tabIndex, name, path, note |
| **Timeout** | 5 sekund |
| **Blocking types** | `possible_focus_trap`, `non_dialog_focus_trap`, `roach_motel`, `dialog_focus_not_trapped`, `focus_on_body`, `focus_failed` (`panel.js:122-129`) |
| **Failure modes** | Jak Run |

### B) Flow Audit (tryb sesyjny — session-based)

#### B1. Observe

| Pole | Wartość |
|------|---------|
| **Nazwa** | Observe |
| **Co robi** | Powtarza audyt `run` co ~900ms przez 12 sekund, by wykryć dynamicznie renderowaną treść i fluktuacje DOM |
| **Pliki** | `a11y-audit-snippet.js` (`observe()`), `panel.js`, `sw.js` |
| **Wejścia** | `seconds: 12`, scope/frame |
| **Wyjścia** | Findings + trend (peak/jumps), snapshots |
| **Timeout** | 12 sekund |
| **Limity** | Raw cap: 220 findings, 140 snapshots per step |
| **Failure modes** | Jak Run |

#### B2. Watch

| Pole | Wartość |
|------|---------|
| **Nazwa** | Watch |
| **Co robi** | Monitoruje loader chains, silent loading i focus loss przez 40 sekund. Mierzy bursts, total loading time, focus loss events |
| **Pliki** | `a11y-audit-snippet.js` (`watch()`), `panel.js`, `sw.js` |
| **Wejścia** | `seconds: 40`, scope/frame |
| **Wyjścia** | Verdicts (metryki), focus loss count, bursts, silent time, total loading time |
| **Timeout** | 40 sekund |
| **Limity** | Raw cap: 200 events, 80 verdicts per step |
| **Failure modes** | Jak Run |

### C) Funkcje przekrojowe (cross-cutting)

#### C1. Frame targeting / scope / pinning

| Pole | Wartość |
|------|---------|
| **Co robi** | Pozwala wybrać zakres skanowania: Primary frame (auto-detect najlepsza ramka), Host page only (frameId=0), Embedded frame only (iframe), All frames. Opcja pin zachowuje wybór ramki per origin |
| **Pliki** | `sw.js:225-1099` (`normalizeFrameScope`, `resolveTargetFrameIds`, `computeFrameScores`), `panel.js:3678-3693` (UI handlers) |
| **Mechanizm scoringu** | URL includes (+5 per match), DOM selector match (+10), frame area (+0-3), iframe bonus (+1 gdy heurystyki) — `sw.js:798-855` |
| **Persistence** | `pinnedFrames` key w storage — mapowanie origin → frameId |
| **Failure mode** | `NO_SCOPE_MATCH` gdy żadna ramka nie pasuje do scope'u |

#### C2. Profile / Help Center matching

| Pole | Wartość |
|------|---------|
| **Co robi** | Aktywacja profili MFE (microfrontend) dodaje specyficzne heurystyki targetowania ramek i reguł audytu. Wbudowane: `helpcenter`, `chat` |
| **Pliki** | `panel.js:208-256` (`BUILTIN_PROFILES`, `profileState`), `panel.js:3473-3520` (load/save/render) |
| **helpcenter** | URL includes: `helpcenter-webclient`, `usehurrier.com`, `helpcenter`; DOM selectors: `#help-center-root`, `[data-testid='help-center-wrapper']`, itp. Sub-hints: `helpcenter-bot`, `helpcenter-tree` |
| **chat** | DOM selectors: `[data-testid^='GST_CHAT__']`, `#GST_CHAT__FEED`, `[role='log']`. Sub-hints: `chat` |
| **Custom profiles** | Obsługiwane przez `customProfiles` w storage |
| **Profile pills** | Renderowane w sekcji Settings jako toggle checkboxy |

#### C3. Eksporty (JSON / Markdown / Download)

| Pole | Wartość |
|------|---------|
| **Dostępne eksporty** | Copy JSON, Copy Markdown, Download JSON (single run); Session JSON, Session Markdown (sesja) |
| **Pliki** | `panel.js:3721-3738` (single run exports), `panel.js:3384-3452` (session exports), `panel.js:2350-2540` (markdown builders) |
| **JSON single run** | `state.lastResult` — pełny obiekt wynikowy |
| **Markdown single run** | Top 10 findings + metadata (URL, frameIds, mode, env, counts) — `buildMarkdown()` |
| **Session JSON** | Skompaktowany obiekt sesji z `determinismMeta` — filename: `flowlens-session_{host}_{env}_{date}-{time}.json` |
| **Session Markdown** | Summary + flow blocking signatures + per-step diffs + appendix frame keys — `buildSessionMarkdown()` (`panel.js:2350-2481`) |

#### C4. Evidence / debug surfaces

| Pole | Wartość |
|------|---------|
| **Co robi** | Każdy finding posiada pola dowodowe: `extra` object z detalami specyficznymi per reguła, `html` snippet, `path` (CSS path), `testId`, `role`, `tag` |
| **Pliki** | `a11y-audit-snippet.js:313-336` (`add()` function) |
| **Highlight** | Kliknięcie wiersza w tabeli podświetla element na stronie inspekcji (overlay CSS) — `HIGHLIGHT` message → `sw.js:578-678` |
| **Raw JSON** | Toggle `jsonToggle` pokazuje surowy JSON wyniku w `<pre>` — kopiowanie przez `copyJsonRaw` |
| **Targeting summary** | Inline status: `targetingSummary` w panel.html, aktualizowany po każdym uruchomieniu |

#### C5. Confidence lanes + blocking semantics

| Pole | Wartość |
|------|---------|
| **Confidence levels** | `strict` — deterministyczny, pewny; `heuristic` — opiera się na heurystyce, może mieć FP; `advisory` — informacyjny, nie blocking |
| **Blocking rule** | Finding jest "blocking" gdy: (severity=high AND confidence≠advisory) LUB (severity=medium AND confidence=strict) — `isRunFindingBlocking()` (`panel.js:1098-1105`) |
| **W Flow** | Blocking signatures determinują flow summary w Markdown: sortowane po blockingWeight, occurrences, firstSeenStep |
| **W Panel** | `topBlockingAlert` pokazuje liczbę blocking issues; `Prioritized` view filtruje do blocking only |

#### C6. Determinism metadata

| Pole | Wartość |
|------|---------|
| **Co robi** | Session JSON zawiera `determinismMeta` z wersjami schema/signature/frameKey, total steps, per-step frame keys, warnings |
| **Pliki** | `panel.js` — budowane podczas eksportu sesji |
| **Wersje** | `schemaVersion: 1`, `signatureVersion: 1`, `frameKeyVersion: 1` |
| **Cel** | Forward compatibility — pozwala narzędziom sprawdzić, czy sesja była zbudowana kompatybilną wersją logiki |

#### C7. Session capture / Flow mode

| Pole | Wartość |
|------|---------|
| **Co robi** | Przechwytywanie krok-po-kroku stanu dostępności podczas flow SOP. Każdy krok zawiera baseline `run` + opcjonalnie active mode snapshot, z diffami vs. poprzedni krok |
| **Pliki** | `panel.js:3129-3432` (start/mark/end/export), `panel.js:1558-1618` (HUD), `panel.js:2130-2250` (sygnatury), `panel.js:2250-2340` (diff logic), `docs/SESSION_CAPTURE.md` |
| **Limity** | `MAX_STEPS = 100`, `MAX_RAW_APPENDIX_ENTRIES = 200`, `RAW_SOFT_COMPACT_KEEP_RECENT = 30`, `MAX_SESSION_BYTES_ESTIMATE = 4.5MB` |
| **Diff output** | `added`, `fixed`, `persisting`, `weakMatched`, `blockingAdded`, `blockingFixed`, `countsDelta` |
| **Route hint** | Help Center article hint (jeśli profil aktywny) → normalized URL path hint → normalized `document.title` → `"(unknown)"` |
| **HUD** | Inline w export row: session status, step count, elapsed time, last mark status (OK/PARTIAL/FAILED + reason code) |

#### C8. Quick Start presets

| Pole | Wartość |
|------|---------|
| **Co robi** | Presety kombinujące tryby w jednym uruchomieniu |
| **Pliki** | `panel.html:103-112`, `panel.js:3615-3658` |
| **Presety** | `presetQuick` = Audit + Contrast; `presetRelease` = Watch + Observe + Audit; `presetFocus` = Tab Walk + Audit |
| **Mechanizm** | Wywołuje `_lockedPreset([...modes])` — uruchamia tryby sekwencyjnie |

---

## 3. Przewodnik "Jak używać"

### A) Screen Audit — Jak uruchomić snapshot audit

#### Krok 1: Wybór scope'u (zakres skanowania)

1. Otwórz panel **FlowLens** w DevTools (F12 → zakładka FlowLens).
2. W sekcji "Target" wybierz **Scope** z dropdown'u `target`:
   - **Primary frame** (domyślny) — skanuje dokładnie jedną automatycznie wybraną ramkę. Heurystyki scoringowe biorą pod uwagę URL patterns, DOM selectors i rozmiar ramki.
   - **Host page only** — skanuje tylko dokument główny (`frameId=0`). Ignoruje iframe'y.
   - **Embedded frame only** — skanuje jedną wykrytą/wybraną iframe. Jeśli frame jest pin'owany, użyje pin'owanego.
   - **All frames** — skanuje host + wszystkie iframe'y.

#### Krok 2: Pin / manual frame behavior

1. Kliknij **Refresh frames** aby odświeżyć listę dostępnych ramek.
2. Jeśli chcesz ręcznie wybrać ramkę, wybierz ją z dropdown'u `frameSelect`.
3. Włącz **Pin frame** toggle aby zachować ten wybór per origin. Pin'owana ramka działa jako manual override w ramach wybranego scope'u.
4. Przycisk **Copy frame URL** kopiuje URL wybranej ramki do schowka.
5. **Targeting summary** (pod dropdownami) pokazuje aktualny stan: scope, wybraną ramkę i status pin.

#### Krok 3: Wybór screen mode

Kliknij jeden z przycisków trybu (lub użyj skrótu klawiszowego):
- **Audit** `[R]` — pełny jednorazowy audyt WCAG
- **Contrast** `[C]` — skan kontrastu kolorów
- **Tab Walk** `[T]` — symulacja nawigacji klawiaturą

Presety (Quick Start menu ▼):
- **Audit + Contrast** — szybki audyt + kontrast
- **Watch + Observe + Audit** — pełny pre-release check
- **Tab Walk + Audit** — focus na nawigacji klawiaturowej

#### Krok 4: Uruchomienie i interpretacja wyników

1. Kliknij **Run Audit** (lub odpowiedni przycisk dla wybranego trybu). Progress bar pokaże postęp.
2. Po zakończeniu:
   - **Run summary** (`resultsCard`): liczba blocking issues, breakdown strict/heuristic/advisory, timestamp, scope, frame.
   - **Severity badges**: kolorowe plakietki (high=czerwony, medium=pomarańczowy, low=żółty, info=cyan). Kliknięcie filtruje explorer do danego severity.
   - **Stats row**: liczbowe podsumowanie: high/medium/low/info.

#### Krok 5: Triage workflow (filtrowanie/sortowanie)

1. **Prioritized view**: kliknij chip "Prioritized" aby wyświetlić tylko blocking issues (high+strict lub medium+strict). `topBlockingAlert` pokaże liczbę blocking issues.
2. **All findings**: kliknij chip "All findings" aby zobaczyć pełną listę.
3. **Filtry** (sekcja Explorer):
   - **Text search** (`q`) — szukaj w type, name, testId, wcag, path, note, product. Debounced 120ms.
   - **Severity** (`sev`) — filtruj po: high / medium / low / info.
   - **Product** (`prod`) — dynamicznie populowany z findings (np. `chat`, `helpcenter`).
   - **Type** (`type`) — dynamicznie populowany z findings.
   - **Unique** — deduplikacja po hash finding'u.
4. **Sortowanie**: kliknij nagłówek kolumny w tabeli. ↑ = ascending, ↓ = descending, ↕ = unsorted. Działa na: sev, product, type, wcag, name, testId, path, note, fix.
5. **Highlight**: kliknij wiersz — element zostanie podświetlony na stronie inspekcji (cyan overlay).
6. **Copy cell**: najedź na komórkę — pojawi się przycisk kopiowania.

#### Krok 6: Eksport Screen wyników

Menu **Export ▼** (prawy górny narożnik sekcji wyników):
- **Copy JSON** — kopiuje pełny JSON wyniku do schowka.
- **Copy Markdown** — kopiuje sformatowany Markdown (top 10 findings + metadata).
- **Download JSON** — pobiera plik `.json` z timestampem: `a11yflowaudit-{timestamp}.json`.
- **Raw JSON** toggle — otwiera/zamyka surowy JSON w panelu.

#### Krok 7: Rerun i determinizm

- Przycisk **Rerun** (`rerunCurrent`) pozwala powtórzyć ostatni tryb.
- "Deterministyczny" w kontekście FlowLens oznacza:
  - **Frame key** jest generowany niezależnie od `frameId` (który zmienia się przy reload), na podstawie origin + normalized path + DOM marker hash.
  - **Sygnatury findings** są stabilne dzięki normalizacji volatile tokens (UUID, numery) w path i text.
  - **Reguły strict** dają identyczne wyniki przy identycznym DOM. Reguły heuristic/advisory mogą się różnić w zależności od timing'u i computed styles.
  - Wyniki `contrast` i `tabWalk` zależą od rendered state — mogą się różnić jeśli CSS/layout się zmienił.

---

### B) Flow Audit — Jak uruchomić sesję

#### Kiedy użyć Flow Audit

Flow Audit jest odpowiedni gdy:
- Testujesz **wielokrokowy przepływ** (checkout, onboarding, help center navigation).
- Chcesz śledzić **jak issues pojawiają się i znikają** między krokami (new/persisting/fixed).
- Potrzebujesz **raportu sesji** z pełnym timeline'em blocking signatures do review.
- Chcesz porównać stan a11y **przed i po** interakcji/nawigacji.

#### Krok 1: Rozpoczęcie sesji

1. Upewnij się, że scope i frame targeting są ustawione (patrz Screen Audit, kroki 1-2).
2. Wybierz **active mode** — tryb, który będzie rejestrowany oprócz baseline `run` (np. Contrast, Tab Walk, Observe, Watch).
3. Kliknij **Start session** (● ikona). Przycisk zmieni kolor na primary i pokaże „Session active".
4. **Session HUD** pojawi się w export row: ID sesji, liczba kroków, czas od rozpoczęcia.

#### Krok 2: Oznaczanie kroków (Mark Step)

1. Wykonaj interakcję na stronie (np. kliknij przycisk, przejdź do innej strony SPA, otwórz modal).
2. Kliknij **Mark step** — FlowLens:
   - Wykona baseline `run` audit.
   - Jeśli active mode ≠ `run`, wykona również active mode snapshot.
   - Obliczy diffy vs. poprzedni krok: `added`, `fixed`, `persisting`, `weakMatched`, `blockingAdded`, `blockingFixed`.
   - Zarejestruje raw dane w `session.rawAppendix`.
   - Zapisze sesję w storage (best-effort).
3. Toast pokaże liczbę baseline findings. HUD zaktualizuje step count i status.

**Opcjonalnie: Label**
- Pole label jest dostępne w Mark step — pozwala opisać krok (np. „Otwarcie modala koszyka").
- Jeśli puste, `routeHint` jest auto-generowany z URL path lub Help Center article ID.

#### Krok 3: Route hint behavior

Route hint jest automatycznie określany:
1. Help Center article hint (jeśli helpcenter profile aktywny i wykryto article ID/slug).
2. Normalized URL path hint (lowercase, volatile ID tokens znormalizowane, query/hash stripped).
3. Normalized `document.title`.
4. `"(unknown)"` jako fallback.

#### Krok 4: Interpretacja diffów

Po 2+ krokach, diffy pokazują ewolucję issues:
- **new** = dodane — pojawiły się w bieżącym kroku, nie było ich w poprzednim.
- **persisting** = utrzymujące się — obecne zarówno w poprzednim jak i bieżącym kroku.
- **fixed** = naprawione — były w poprzednim, nie ma w bieżącym.
- **weakMatched** = dopasowane przez weak signature (fallback matching dla findings o niskiej jakości identity).
- **blockingAdded** / **blockingFixed** — jak wyżej, ale tylko dla blocking findings.
- **countsDelta** — zmiana liczbowa per metryka (findings, high, medium, low, info).

#### Krok 5: Budgets (Watch/Observe)

- **Watch** mierzy: `bursts` (loader chain bursts), `totalLoadingMs` (sumaryczny czas ładowania), `silentMs` (cichy loading), `focusLossCount` (utrata focusu).
- **Observe** mierzy: `peak` (max count findings w jednym snapshot), `jumps` (ile razy count wzrósł).
- W session diff, watch verdicts i observe trends generują własne sygnatury z metryki + wartości.

#### Krok 6: Zakończenie sesji i eksport

1. Kliknij **End session** — sesja zostanie zarchiwizowana w storage.
2. Eksporty stają się dostępne w menu **Export ▼**:
   - **Session JSON** — pobiera plik `.json`: `flowlens-session_{originSlug}_{env}_{date}-{time}.json`. Zawiera `determinismMeta`, `steps[]`, `rawAppendix`, `frames` index.
   - **Session MD** — kopiuje Markdown do schowka. Inline hint „Copied ✓" potwierdza. Zawiera:
     - Session metadata (origin, env, start/end, versions).
     - **Flow summary** — tabela top 24 blocking signatures sortowana: blockingWeight desc → occurrences desc → firstSeenStep asc → signature lexico.
     - **Per-step** — route hint, URL, modes, diff summary, targeting info, best frame score.
     - **Appendix** — frame keys per step.
3. Eksport ended session jest dostępny nawet po zakończeniu (przechowywany w `sessionState.lastEndedSession`).

#### Krok 7: Scenariusze użycia

**Pre-release check:**
1. Start session na stronie startowej.
2. Przejdź przez happy path flow (np. 5-8 kroków).
3. Mark step po każdym kluczowym stanie.
4. End session → export Session MD → review blocking signatures.

**Quarterly audit:**
1. Start session.
2. Systematycznie odwiedź kluczowe strony/widoki (np. 15-20 kroków).
3. End session → export Session JSON → zarchiwizuj do porównania z następnym kwartałem.

---

## 4. Scenariusze praktyczne

### Screen Audit — Scenariusze

#### Scenariusz S1: Pre-release snapshot

**Cel:** Szybki audyt a11y przed release'em nowej wersji.

**Kroki:**
1. Otwórz DevTools → FlowLens na stronie produkcji/staging.
2. Scope: **Primary frame** (auto-detect).
3. Quick Start → **Watch + Observe + Audit** (preset Release).
4. Poczekaj ~55 sekund (Watch 40s + Observe 12s + Run 2s).
5. Sprawdź **Run summary**: ile blocking issues? Porównaj z poprzednim release.
6. Kliknij **Prioritized** chip → przejrzyj blocking findings.
7. Dla każdego high finding: kliknij wiersz aby highlight'ować element na stronie.
8. **Export** → Copy Markdown → wklej do PR/review.

**Sygnały do obserwacji:**
- Blocking count > 0 → wymaga attention.
- `CLICK_WITHOUT_KEYBOARD` strict → custom control bez keyboard support.
- Watch focus_loss → loader chain traci focus.
- Contrast failures ratio < 3.0 → critical contrast issue.

**Eksport:** Markdown do PR description lub Slack.

**Pułapki:**
- Jeśli strona jest za auth wall, upewnij się, że jesteś zalogowany przed skanowaniem.
- Watch 40s może wykryć FP loader detection jeśli strona ma lazy-loaded content — sprawdź `bursts` count.

#### Scenariusz S2: Quick regression check

**Cel:** Szybkie sprawdzenie po zmianie kodu — czy nie ma nowych regression'ów.

**Kroki:**
1. Otwórz DevTools → FlowLens na zmienionej stronie.
2. Scope: **Primary frame**.
3. Quick Start → **Audit + Contrast** (preset Quick).
4. Poczekaj ~5 sekund.
5. Porównaj **Run summary** z wynikami przed zmianą (np. z historii records).
6. Filtruj: severity=high. Sprawdź czy pojawiły się nowe high findings.
7. Jeśli tak: kliknij finding → highlight → napraw.

**Sygnały:** Nowy `NO_ACCESSIBLE_NAME` na dodanym przycisku, nowy `FORM_CONTROL_NO_LABEL` na nowym input.

**Eksport:** Copy JSON → porównaj diff lokalnie.

**Pułapki:**
- Records z historii mogą być skompaktowane (utracone raw data) jeśli przekroczono limit 20 per origin.

#### Scenariusz S3: Contrast-only pass

**Cel:** Audyt kolorów po zmianie designu/theme.

**Kroki:**
1. Otwórz DevTools → FlowLens.
2. Scope: **All frames** (jeśli chcesz sprawdzić cały layout łącznie z iframe'ami).
3. Tryb: **Contrast** `[C]`.
4. Run → Poczekaj ~3 sekundy.
5. Sprawdź **Contrast section**: tabela failures.
6. Włącz **Show All** toggle → porównaj passing i failing ratios.
7. Kliknij wiersz z najniższym ratio → highlight element na stronie.
8. Export Markdown — wklej do issue koloru.

**Sygnały:**
- ratio < 3.0 z `large: false` → fail AA normal text.
- ratio < 4.5 z `large: false` → fail AAA normal text.
- ratio < 3.0 z `large: true` → fail AA large text.

**Pułapki:**
- Kontrast jest przybliżony — nie obsługuje gradientów, obrazów tła, opacity layering.
- Dark mode vs light mode — sprawdź oba osobno.
- Max 250 nodes skanowanych — duże strony mogą mieć niereprezentatywną próbkę.

---

### Flow Audit — Scenariusze

#### Scenariusz F1: Checkout journey

**Cel:** Audyt a11y pełnego flow zakupowego (koszyk → adres → płatność → potwierdzenie).

**Kroki:**
1. Otwórz DevTools → FlowLens na stronie koszyka.
2. Active mode: **Tab Walk** (dla sprawdzenia nawigacji klawiaturą w formularzach).
3. **Start session**.
4. Mark step: „Stan koszyka".
5. Kliknij „Przejdź do adresu" → Mark step: „Formularz adresu".
6. Wypełnij formularz → kliknij „Dalej" → Mark step: „Płatność".
7. Kliknij „Zamów" → Mark step: „Potwierdzenie".
8. **End session** → Export Session MD.

**Sygnały:**
- `blockingAdded > 0` na kroku płatności → nowe issues w formie płatności.
- `FORM_CONTROL_NO_LABEL` persisting → label problem ciągnie się przez cały flow.
- Tab Walk `focus_failed` → focus trap w modal/overlay.
- `fixed > 0` → issues z poprzedniego kroku zostały "naprawione" (element zniknął z DOM).

**Eksport:** Session MD do ticket/Jira — zawiera pełny timeline z diffami.

**Pułapki:**
- SPA navigation może nie odświeżyć ramek — użyj Refresh frames jeśli frame list stale.
- Jeśli checkout używa iframe'ów (np. Stripe), ustaw scope na **All frames** lub **Embedded frame only**.

#### Scenariusz F2: Help Center multi-iframe flow

**Cel:** Audyt help center z embedded iframe'ami, drzewem artykułów i chat botem.

**Kroki:**
1. Otwórz DevTools → FlowLens na stronie z help center.
2. Settings → włącz profil **Help Center** (pill toggle).
3. Scope: **Embedded frame only** (celujemy w iframe help center).
4. Odśwież ramki → wybierz frame z URL zawierającym `helpcenter`.
5. Active mode: **Observe** (12s monitoring dynamicznych zmian w help center).
6. **Start session**.
7. Mark step: „Strona główna help center".
8. Kliknij kategorię → Mark step: „Kategoria".
9. Otwórz artykuł → Mark step: „Artykuł".
10. Otwórz chat bot → Mark step: „Chat bot".
11. **End session** → Export Session JSON.

**Sygnały:**
- `HC_TREE_ITEM_NO_NAME` → brak accessible name na tree item (high severity).
- `HC_ARTICLE_NO_HEADING` → artykuł bez nagłówka.
- `CHAT_LOG_NO_ARIA_LIVE_SOFT` → role=log bez aria-live.
- Route hint powinien pokazywać article ID/slug.

**Eksport:** Session JSON do archiwum — zawiera `determinismMeta` do porównania między release'ami.

**Pułapki:**
- Cross-origin iframe'y nie mogą być skanowane — pojawi się `IFRAME_CROSS_ORIGIN` (info).
- Pin frame jeśli iframe zmienia `frameId` przy navigation wewnątrz help center.

#### Scenariusz F3: Modal/overlay-heavy flow

**Cel:** Audyt flow z wieloma modali/overlayami (np. ustawienia konta, dialogi potwierdzenia).

**Kroki:**
1. Otwórz DevTools → FlowLens na stronie z modalami.
2. Active mode: **Tab Walk** (sprawdzenie focus trapping w dialogach).
3. Scope: **Host page only** (modale to zazwyczaj host DOM).
4. **Start session**.
5. Mark step: „Stan bazowy (bez modali)".
6. Otwórz modal A → Mark step: „Modal A otwarty".
7. Zamknij modal A → Mark step: „Modal A zamknięty".
8. Otwórz modal B (nested) → Mark step: „Modal B".
9. **End session** → Export Session MD.

**Sygnały:**
- `ARIA_HIDDEN_FOCUSABLE` strict pojawia się gdy modal jest otwarty i background nie jest inert.
- Tab Walk `dialog_focus_not_trapped` → focus ucieka z modala.
- Tab Walk `roach_motel` → użytkownik wchodzi do elementu ale nie może wyjść Tab'em.
- `added` count po otwarciu modala → nowe issues w modal DOM.
- `fixed` count po zamknięciu modala → issues znikają z DOM.

**Eksport:** Session MD do review z team'em frontend.

**Pułapki:**
- Modale z `transition` CSS mogą powodować `ARIA_HIDDEN_FOCUSABLE` advisory z `duringTransition=true` — to jest oczekiwane zachowanie, nie strict blocking.
- Jeśli modal jest renderowany w iframe, zmień scope na **All frames** lub **Embedded**.

---

## 5. Rozwiązywanie problemów i pułapki

### „Skanuje złą ramkę"

**Objaw:** Wyniki dotyczą host page zamiast iframe'a (lub odwrotnie).

**Rozwiązanie:**
1. Sprawdź dropdown **Scope** — zmień na `Embedded frame only` jeśli chcesz iframe, lub `Host page only` jeśli chcesz host.
2. Kliknij **Refresh frames** — odśwież listę ramek.
3. Wybierz konkretną ramkę z dropdown'u `frameSelect`.
4. Włącz **Pin frame** — zachowa ten wybór per origin.
5. Sprawdź **Targeting summary** — powinien potwierdzić wybraną ramkę.

**Kontekst:** Frame scoring w `sw.js:798-855` używa URL includes (+5), DOM selector matches (+10) i frame area (+0-3). Wynik może być nieintuicyjny gdy iframe ma duży area ale nie pasuje do heurystyk.

### „Host + iframe mixed results"

**Objaw:** Wyniki zawierają findings z różnych ramek.

**Rozwiązanie:**
- **Best practice:** Używaj **Primary frame** (1 ramka) lub **Host page only** / **Embedded frame only** (jasny podział).
- **All frames** łączy wyniki ze wszystkich ramek — `perFrame` w JSON export pokazuje wyniki per ramka.
- Wynik `best` w summary dotyczy najlepiej scorowanej ramki — inne ramki widoczne są tylko w raw JSON / export.
- Zmień scope na specyficzny aby uniknąć zamieszania.

### „No scope match"

**Objaw:** Error `NO_SCOPE_MATCH` — żadna ramka nie pasuje do scope'u.

**Rozwiązanie:**
1. Kliknij **Refresh frames** — ramki mogły się zmienić po navigation.
2. Sprawdź scope: `Embedded frame only` wymaga iframe'a na stronie. Jeśli nie ma iframe'ów, zmień na `Primary frame` lub `Host page only`.
3. Sprawdź pin: jeśli pin wskazuje na ramkę która nie istnieje, wyłącz pin.
4. `selectionReason` w JSON export powie dokładnie dlaczego: `no_frames`, `scope_embedded_missing`, `scope_host_missing`, `no_scope_match_manual_outside_scope`.

### „Partial frame failures"

**Objaw:** Status `PARTIAL` — część ramek się powiodła, część nie.

**Rozwiązanie:**
- Sprawdź `perFrame` w JSON export — każda ramka ma `ok: boolean`, `error`, `reason`.
- Typowe reasons: `INJECT_FAILED` (CSP/cross-origin blokuje injection), `NO_API` (snippet nie załadowany), `EXEC_FAILED` (runtime error).
- Cross-origin iframe'y zawsze zwrócą `INJECT_FAILED` — to jest oczekiwane. Pojawi się `IFRAME_CROSS_ORIGIN` jako info finding.
- `perFrame[n].normalized` zawiera scoring per ramka — null jeśli ramka failed.

### „Za dużo findings / szum"

**Objaw:** Setki findings, trudno znaleźć istotne.

**Rozwiązanie:**
1. Kliknij **Prioritized** chip → widok filtruje do blocking only (high+strict, medium+strict).
2. Filtruj severity: **high** najpierw, potem **medium**.
3. Confidence lanes:
   - `strict` = pewne, deteministyczne → priorytet A.
   - `heuristic` = oparte na heurystyce, mogą mieć FP → priorytet B, zweryfikuj ręcznie.
   - `advisory` = informacyjne, nie blocking → priorytet C, nice-to-have.
4. Filtruj **product** → np. `chat` tylko issues chat widget.
5. Filtruj **type** → np. `FORM_CONTROL_NO_LABEL` tylko brakujące labele.
6. **Unique** checkbox → deduplikuj powtarzające się findings.

### „False positives vs false negatives"

**Jak confidence jest przypisywane:**
- `strict`: reguła ma wystarczające dane do deterministycznej decyzji. Np. `ARIA_HIDDEN_FOCUSABLE` — keyboard-reachable actionable element w `aria-hidden=true` container.
- `heuristic`: reguła opiera się na heurystykach. Np. `FOCUS_VISIBLE_SUPPRESSED` — sprawdza computed style ale nie widzi `:focus-visible` selectors w stylesheetach (scans stylesheets ale nie gwarantuje pełnego pokrycia cross-origin sheets). `TOUCH_TARGET_TOO_SMALL` — mierzy `getBoundingClientRect()` ale nie widzi wrapper/pseudo hit areas.
- `advisory`: reguła informuje o potencjalnym problemie bez twardej asercji. Np. `CLICK_WITHOUT_KEYBOARD` z ancestor delegation → `activationUnproven=true` — nie może udowodnić że delegacja działa.

**Znane FP hotspots** (szczegóły w `docs/A11Y_RULE_FP_AUDIT.md`):
1. `FOCUS_VISIBLE_SUPPRESSED` — może flagować gdy `:focus-visible` styles są w cross-origin stylesheet.
2. `CLICK_WITHOUT_KEYBOARD` — ancestor/global key handlers traktowane jako unproven delegation (advisory, nie strict).
3. `ARIA_HIDDEN_FOCUSABLE` — focus guard sentinels (`data-focus-guard`, 1x1 elements) są wyłączone.
4. `TOUCH_TARGET_TOO_SMALL` — heuristic confidence, inline text links exempt.
5. `IFRAME_MISSING_TITLE` — presentational/aria-hidden iframes exempt.

### „Problemy z eksportem"

**Clipboard permissions:**
- Copy Markdown/JSON używa `navigator.clipboard.writeText()` z fallback na `document.execCommand("copy")` via hidden textarea.
- Jeśli clipboard fail: sprawdź DevTools focus (panel musi mieć focus), sprawdź browser permissions.

**Download permissions:**
- Download JSON tworzy Blob + `URL.createObjectURL()` + anchor click.
- Jeśli download blocked: sprawdź browser download settings, sprawdź CSP.

**Ended session export:**
- Dostępny dopiero po kliknięciu **End session**.
- `sessionState.lastEndedSession` przechowuje zakończoną sesję w pamięci.
- Po odświeżeniu panelu, zakończona sesja jest tracona z pamięci (archiwum w storage zachowane).
- Aby eksportować archiwalną sesję, załaduj ją z `session::archive::` storage key.

### „Performance constraints i dlaczego istnieją capy"

| Cap | Wartość | Powód |
|-----|---------|-------|
| `MAX_STEPS` | 100 | Zapobiega niekontrolowanemu wzrostowi sesji. `mark-step` odmówi powyżej limitu |
| `MAX_RAW_APPENDIX_ENTRIES` | 200 (2 × MAX_STEPS) | Chroni przed wzrostem raw payload. Soft-compact zachowuje ostatnie 30 kroków |
| `MAX_SESSION_BYTES_ESTIMATE` | 4.5 MB | Szacunkowy limit rozmiaru sesji JSON. Warning, nie hard block |
| Records per origin | 20 (in memory) | `persistRecords` kompaktuje progresywnie: 50→25→10 rekordów przy quota exceeded |
| Contrast scan nodes | 250 | Ogranicza czas skanowania — `contrastScan({ limit: 250 })` |
| Tab Walk steps | 80 | Ogranicza symulację Tab — `tabWalk({ steps: 80 })` |
| `CAPTURE_SLOW_MS` | 4000 ms | Jeśli mark-step trwa > 4s, HUD pokazuje „CAPTURING (SLOW)" |
| Raw findings per mode | 220 (run), 120 failures + 40 samples (contrast), 200 events (tabWalk/watch), 80 verdicts (watch), 140 snapshots (observe) | `compactRawForSession()` ucina nadmiar |

---

## 6. Ustawienia i persystencja

### 6.1 Storage keys — pełna lista

| Klucz | Scope | Co przechowuje | Kiedy resetowane |
|-------|-------|----------------|------------------|
| `records::{origin}::{env}` | Per origin + env | Array ostatnich do 20 wyników audytu (skompaktowanych). Każdy rekord: action, bestEntry, perFrame, timestamp | Nigdy auto — nadpisywane progresywnie. Manual: clear extension storage |
| `pinnedFrames` | Globalny | Object: `{ [origin]: { frameId: number } }` — pin'owane ramki per origin | Manual: wyłączenie pin lub clear storage |
| `session::active::{origin}::{env}` | Per origin + env | Aktywna sesja — pełny obiekt z steps, rawAppendix | Auto: po `End session` (przeniesione do archive). Manual: clear storage |
| `session::archive::{origin}::{env}::{sessionId}` | Per origin + env + session | Zarchiwizowana sesja — jak active ale zakończona | Manual: clear storage |
| `uiPrefs` | Globalny | `{ theme: "dark"|"light", compact: boolean, wcagLevel: string, alsoConsole: boolean }` | Manual: zmiana w settings UI |
| `customProfiles` | Globalny | Object: custom MFE profile definitions (nadpisują/dodają do BUILTIN_PROFILES) | Manual: zmiana w settings UI |
| `activeProfiles` | Globalny | Array: ID aktywnych profili (np. `["helpcenter"]`) | Manual: toggle pill w settings |
| `colPrefs` | Globalny | Object: `{ [tableId]: { [colIdx]: boolean } }` — widoczność kolumn per tabela | Manual: toggle w dropdown Columns |
| `history` | Per origin | Object: `{ [snapshotKey]: summary }` — snapshoty do diff calculation | Nadpisywane przy nowym wyniku |

### 6.2 Co resetuje się przy nawigacji / reload / zmianie origin

| Zdarzenie | Efekt |
|-----------|-------|
| **SPA navigation** (bez hard reload) | Ramki mogą się zmienić — kliknij Refresh frames. Session kontynuuje. Pin zachowany |
| **Hard reload** | Panel się przeładowuje. Records załadowane z storage. Active session załadowana z storage (jeśli istnieje per origin/env). Pin zachowany |
| **Zmiana origin** | Nowy scope key — records, session, history z nowego origin. Pin z nowego origin (lub brak). UI prefs globalne — zachowane |
| **Zmiana env** | Nowy scope key — records, session z nowego env. Pin per origin — zachowany |
| **Clear extension storage** | Wszystko zresetowane. Rekomendacja: ostrożnie, dotyczy całego rozszerzenia |

### 6.3 Env tag

Env tag jest automatycznie określany na podstawie URL heurystyk:
- Sprawdza URL pod kątem patterns: `localhost`, `staging`, `dev`, `preview`, `canary`, `production`, `prod`.
- Wpływa na scope key — records i sesje są izolowane per origin + env.

---

## 7. Model raportowania

### 7.1 Screen table schema (findings explorer)

| Kolumna | Field | Typ | Default sort |
|---------|-------|-----|-------------|
| sev | `severity` | `"high"` / `"medium"` / `"low"` / `"info"` | Primary (numeric order: high=0, medium=1, low=2, info=3) |
| product | `product` | string ∣ null | — |
| type | `type` | string (np. `"NO_ACCESSIBLE_NAME"`) | — |
| wcag | `wcag` | string (np. `"4.1.2"`, `"1.3.1 / 3.3.2 / 4.1.2"`) | — |
| name | `name` | string — accessible name elementu | — |
| testId | `testId` | string ∣ null — `data-testid` attribute | — |
| path | `path` | string — CSS path do elementu | — |
| note | `note` | string ∣ null — dodatkowa informacja | — |
| fix | `fix` | string ∣ null — sugerowana naprawa (z `FIX_SUGGESTIONS` lub rule-specific) | — |

**Dodatkowe pola w obiekcie finding** (nie w tabeli UI, ale w JSON export):
- `level`: `"A"` / `"AA"` / `"AAA"` — WCAG level
- `confidence`: `"strict"` / `"heuristic"` / `"advisory"`
- `role`: ARIA role elementu
- `tag`: HTML tag name
- `html`: HTML snippet
- `extra`: object z dowodami specyficznymi per reguła

### 7.2 Contrast table schema

| Kolumna | Field | Opis |
|---------|-------|------|
| ratio | `ratio` | Aktualny ratio kontrastu (np. 2.1) |
| req | `required` | Wymagany ratio (4.5 AA normal, 3.0 AA large, 7.0 AAA normal, 4.5 AAA large) |
| large | `largeText` | Boolean — czy tekst jest "large" (≥18pt lub ≥14pt bold) |
| text | `text` | Treść tekstu (truncated) |
| tag | `tag` | HTML tag |
| testId | `testId` | data-testid |
| path | `path` | CSS path |
| note | `note` | Dodatkowa informacja |

### 7.3 Tab Walk table schema

| Kolumna | Field | Opis |
|---------|-------|------|
| i | `i` | Index zdarzenia (kolejność Tab) |
| type | `type` | Typ zdarzenia: `possible_focus_trap`, `non_dialog_focus_trap`, `roach_motel`, `dialog_focus_not_trapped`, `focus_on_body`, `focus_failed`, `focus_jump`, `focus_thrashing`, `duplicate_in_order`, `role_interactive_not_focusable`, `dialog_no_focusables` |
| tabIndex | `tabIndex` | Wartość tabIndex elementu |
| name | `name` | Accessible name |
| path | `path` | CSS path |
| note | `note` | Opis zdarzenia |

### 7.4 Flow timeline schema (session)

**Step object:**

| Field | Typ | Opis |
|-------|-----|------|
| `id` | string | Unique step ID |
| `index` | number | Numer kroku (0-based) |
| `label` | string | User-provided label |
| `at` | ISO8601 | Timestamp |
| `url` | string | URL strony w momencie capture |
| `routeHint` | string | Auto-derived route hint |
| `snapshots.run` | ModeSnapshot | Baseline run snapshot |
| `snapshots.active` | ModeSnapshot ∣ null | Active mode snapshot |
| `diffs.run` | DiffSummary | Diff baseline vs. previous step |
| `diffs.active` | DiffSummary ∣ null | Diff active vs. previous step |
| `diffs.consolidated` | DiffSummary | Merged diff |
| `frameSelections` | object | `usedFrameIds`, `usedFrameKeys` |

**ModeSnapshot:**

| Field | Typ | Opis |
|-------|-----|------|
| `mode` | string | Tryb (`run`/`contrast`/`tabWalk`/`watch`/`observe`) |
| `best` | object | `{ frameId, frameKey, normalized, rawRef }` — best entry |
| `perFrame` | array | Wyniki per ramka (compacted — bez raw) |
| `targeting` | object | `{ scope, targetMode, pinned, helpCenterMatchEnabled, selectionReason, frameKeyVersion, usedFrameIds }` |

### 7.5 Strategia sygnatur i notatki o stabilności

Sygnatury są budowane per tryb w `panel.js:1870-2128`:

| Tryb | Format sygnatury | Blocking? |
|------|-----------------|-----------|
| `run` | `run∣{frameKey}∣{type}∣{wcag}∣{confidence}∣{severity}∣{level}∣testid:{testId}∣pathh:{pathHash}∣{name}∣{note}` | `isRunFindingBlocking(f)` |
| `contrast` | `contrast∣{frameKey}∣{wcag}∣ratio:{bucket}∣required:{bucket}∣{tag}∣testid:{testId}∣pathh:{pathHash}∣{text}` | Zawsze true |
| `tabWalk` | `tabwalk∣{frameKey}∣{type}∣pathh:{pathHash}∣{name}∣{note}∣tabi:{bucket}` | `TAB_BLOCKING_TYPES.has(type)` |
| `watch` | `watch∣{frameKey}∣{metric}∣b:{budget}∣v:{value}` + opcjonalnie `watch∣{frameKey}∣focus_loss∣v:{count}` | Zawsze true |
| `observe` | `observe∣{frameKey}∣{type}∣{wcag}∣{severity}∣testid:{testId}∣pathh:{pathHash}∣{note}` + `observe∣{frameKey}∣trend∣peak:{bucket}∣jumps:{bucket}` | `isRunFindingBlocking(f)` / false (trend) |

**Stabilność:**
- `signatureQuality`: `high` (ma testId), `medium` (ma dobry path), `low` (słaby path — volatile/dynamiczny).
- `weakSignature`: fallback signature dla low-quality findings — używany tylko do Flow persistence matching (nie Screen identity).
- `pathh:*` — path hash (FNV-1a) zamiast raw CSS path — normalizuje dynamiczne indeksy.
- Normalizacja text: `normalizeIdentityText()` strip'uje volatile UUID/number tokens.

### 7.6 Jak "blocking" jest obliczane

```
isRunFindingBlocking(finding):
  1. severity ∉ {high, medium} → NOT blocking
  2. confidence = advisory → NOT blocking
  3. severity = high → BLOCKING
  4. severity = medium AND confidence = strict → BLOCKING
  5. severity = medium AND confidence = heuristic → NOT blocking
```

**W praktyce:**
- `high` + `strict` → **blocking** (najwyższy priorytet)
- `high` + `heuristic` → **blocking** (high severity nawet z heuristic jest blocking)
- `medium` + `strict` → **blocking** (deterministyczny medium = pewny problem)
- `medium` + `heuristic` → **nie blocking** (heuristic medium = potencjalny problem)
- `medium` + `advisory` → **nie blocking**
- `low` / `info` → **nigdy blocking**

---

## 8. Notatki dla maintainerów

### 8.1 Jak dodać nową regułę

1. **Dodaj do `RULE_REGISTRY`** w `a11y-audit-snippet.js:224-282`:
   ```javascript
   MY_NEW_RULE: {
     id: "MY_NEW_RULE",
     wcag: "X.X.X",
     level: "A",           // "A" | "AA" | "AAA"
     confidence: "strict",  // "strict" | "heuristic" | "advisory"
     run: null,            // będzie nadpisane jeśli ma dedykowaną funkcję
   },
   ```

2. **Zaimplementuj logikę** w bloku `run()` w `a11y-audit-snippet.js` (po linii ~870). Użyj `add(findings, { ... })`:
   ```javascript
   add(findings, {
     type: "MY_NEW_RULE",
     el: targetElement,
     severity: "medium",
     note: "Opis problemu.",
     extra: { /* evidence fields */ },
     fix: "Sugerowana naprawa.",
   });
   ```

3. **Dodaj fix suggestion** do `FIX_SUGGESTIONS` (`a11y-audit-snippet.js:160`):
   ```javascript
   MY_NEW_RULE: 'Opis jak naprawić ten problem.',
   ```

4. **Dodaj evidence fields bezpiecznie**: pola `extra` object muszą być serializable (bez DOM references, bez circular structures, bez functions). Truncate long strings. Unikaj dużych arrays.

5. **Dodaj fixture** w `fixtures/a11y-rule-fixtures.html`:
   - Element(y) z oczekiwanym flagowaniem.
   - Element(y) z oczekiwanym brakiem flagowania (negative case).
   - Dodaj expected count do `docs/A11Y_RULE_FP_AUDIT.md`, sekcja 4.

6. **Zweryfikuj**: `node --check a11y-audit-snippet.js` musi przechodzić.

### 8.2 Jak dostosować logikę sygnatur

Sygnatury są budowane w `panel.js` w funkcjach `*SignatureEntries()`:
- `runSignatureEntries()` — linia ~1900
- `contrastSignatureEntries()` — linia ~1956
- `tabWalkSignatureEntries()` — linia ~1988
- `watchSignatureEntries()` — linia ~2019
- `observeSignatureEntries()` — linia ~2061

**Zasady zmian:**
- Po zmianie logiki sygnatury: bump `signatureVersion` (obecna: `1`) w `panel.js`. To jest persystowane w `determinismMeta`.
- Upewnij się, że sygnatura jest **deterministyczna** — identyczny finding musi produkować identyczny sig.
- Użyj `normalizeIdentityText()` do normalizacji pól text.
- Użyj `pathHashForSig()` zamiast raw path — normalizuje dynamiczne indeksy.
- Użyj `bucketNumber()` dla numeric values — zapobiega micro-drift w floating point.

### 8.3 Jak dostosować eksporty bez łamania determinizmu

**Single run markdown** — `buildMarkdown()` (`panel.js:2483`):
- Dodawanie nowych sekcji: append na końcu (nie zmieniaj kolejności istniejących).
- Dodawanie nowych pól: dodaj nowy `lines.push()` — nie modyfikuj istniejących.

**Session markdown** — `buildSessionMarkdown()` (`panel.js:2350`):
- Flow summary sort order (`panel.js:2427-2434`) musi pozostać deterministyczny: blockingWeight desc → occurrences desc → firstSeenStep asc → sig lexico.
- Dodawanie nowych kolumn do tabeli: append na końcu row template.
- Dodawanie nowych sekcji per step: append po istniejących `lines.push()`.

**Session JSON**:
- Dodawanie nowych pól do step/snapshot: dodaj field z default value (nie undefined) — backward compatible.
- Bump `schemaVersion` jeśli zmienisz strukturę (usuniesz/przeniesiesz field).

### 8.4 Jak rozszerzyć fixtures i co oznacza "expected counts"

**Fixtures** w `fixtures/a11y-rule-fixtures.html`:
- Każda sekcja `<section>` testuje jedną regułę lub grupę reguł.
- Elementy z oczekiwanym flagowaniem mają komentarze: `(should flag)`, `(should flag strict)`, `(should not flag)`.

**Expected counts** w `docs/A11Y_RULE_FP_AUDIT.md`, sekcja 4:
- Lista `type → expected count` po uruchomieniu `A11YFlowAudit.run({ strict: true })` na fixture page.
- Obecne expected counts:
  - `FOCUS_VISIBLE_SUPPRESSED`: 1
  - `CLICK_WITHOUT_KEYBOARD`: 3
  - `ARIA_HIDDEN_FOCUSABLE`: 1
  - `TOUCH_TARGET_TOO_SMALL`: 1
  - `DUPLICATE_MAIN_LANDMARK`: 1
  - `IFRAME_MISSING_TITLE`: 1

**Dodawanie nowego fixture:**
1. Dodaj `<section>` z nowym elementem w `a11y-rule-fixtures.html`.
2. Dodaj expected count w `docs/A11Y_RULE_FP_AUDIT.md`.
3. Uruchom weryfikację: wklej snippet, `A11YFlowAudit.run({ strict: true })`, porównaj counts.

**Signature stability fixture** (`#signature-stability-fixture`):
- `#sigStableStrong` (data-testid=`sig-strong-control`) — stabilny control z strong identity.
- `#sigStableWeak` — control z weak identity.
- `#insertSigSibling` — button do wstawienia sibling'a między krokami Flow (testuje, czy strong signatures przeżywają DOM reorder).

---

## Appendix: Pełna lista typów reguł (finding types)

### Reguły z RULE_REGISTRY (z dedykowaną logiką)

| Type | WCAG | Level | Confidence | Plik:linia |
|------|------|-------|------------|------------|
| `FOCUS_VISIBLE_SUPPRESSED` | 2.4.7 | AA | heuristic | `a11y-audit-snippet.js:225-231, 338-452` |
| `LOADER_WITHOUT_ANNOUNCEMENT_HOOK` | 4.1.3 | AA | heuristic | `a11y-audit-snippet.js:232-238, 453-470` |
| `TOUCH_TARGET_TOO_SMALL` | 2.5.8 | AA | heuristic | `a11y-audit-snippet.js:239-246, ~1480-1510` |
| `CLICK_WITHOUT_KEYBOARD` | 2.1.1 | A | heuristic | `a11y-audit-snippet.js:247-253, ~1290-1400` |
| `FOCUS_MAY_BE_OBSCURED` | 2.4.11 | AA | advisory | `a11y-audit-snippet.js:254-260, ~1685-1695` |
| `CONSISTENT_HELP_CHECK` | 3.2.6 | A | advisory | `a11y-audit-snippet.js:261-267, ~1680` |
| `ARIA_HIDDEN_FOCUSABLE` | 4.1.2 | A | strict | `a11y-audit-snippet.js:268-274, ~1400-1450` |
| `IFRAME_MISSING_TITLE` | 4.1.2 | A | strict | `a11y-audit-snippet.js:275-281, ~1625-1665` |

### Reguły inline (bez RULE_REGISTRY entry)

| Type | WCAG | Severity | Linia (przybliżona) |
|------|------|----------|---------------------|
| `IMG_MISSING_ALT` | 1.1.1 | medium | ~966 |
| `IMG_EMPTY_ALT` | 1.1.1 | low | ~967 |
| `NO_ACCESSIBLE_NAME` | 4.1.2 | high | ~974 |
| `FORM_CONTROL_NO_LABEL` | 1.3.1 / 3.3.2 / 4.1.2 | medium | ~983 |
| `HEADING_LEVEL_SKIP` | 1.3.1 | medium | ~995 |
| `NO_H1` | 1.3.1 | info | ~1006 |
| `MULTIPLE_H1` | 1.3.1 | info | ~1007 |
| `NO_MAIN_LANDMARK` | 1.3.1 | low | ~1012 |
| `REGION_NO_NAME` | 1.3.1 / 4.1.2 | low | ~1018 |
| `BROKEN_ARIA_REFERENCE` | 4.1.2 | medium | ~1029 |
| `ARIA_LABELLEDBY_POINTS_TO_ARIA_HIDDEN` | 4.1.2 | medium | ~1041 |
| `POSITIVE_TABINDEX` | 2.4.3 | low | ~1050 |
| `CHAT_LOG_NO_ARIA_LIVE_SOFT` | 4.1.3 | medium/low | ~1063 |
| `DISABLED_INPUT_NO_EXPLANATION` | 3.3.2 / 3.2.2 | low | ~1081 |
| `CHAT_MESSAGE_NO_ROLE` | 1.3.1 | low | ~1101 |
| `CHAT_INPUT_NO_LABEL` | 1.3.1 / 4.1.2 | medium | ~1121 |
| `CHAT_TIMESTAMP_INACCESSIBLE` | 1.3.1 | low | ~1141 |
| `HC_TREE_ITEM_NO_NAME` | 4.1.2 | high | ~1159 |
| `HC_TREE_NO_ARIA_EXPANDED` | 4.1.2 | medium | ~1172 |
| `HC_ARTICLE_NO_HEADING` | 1.3.1 / 2.4.6 | medium | ~1189 |
| `LIVE_REGION_HIDDEN` | 4.1.3 | medium | ~1206 |
| `COMBOBOX_NO_LISTBOX` | 4.1.2 | medium | ~1228 |
| `DUPLICATE_ID` | 4.1.1 | low-high | ~1262 |
| `NO_SKIP_NAV` | 2.4.1 | low | ~1275 |
| `MISSING_AUTOCOMPLETE` | 1.3.5 | low | ~1285 |
| `ARIA_REQUIRED_ATTR_MISSING` | 4.1.2 | medium | ~1468 |
| `TABLE_NO_HEADERS` | 1.3.1 | medium | ~1515 |
| `LABEL_NOT_IN_NAME` | 2.5.3 | medium | ~1525 |
| `MISSING_LANG` | 3.1.1 | medium | ~1531 |
| `VIEWPORT_ZOOM_DISABLED` | 1.4.4 | medium | ~1539 |
| `COMPETING_ASSERTIVE_LIVE` | 4.1.3 | medium | ~1548 |
| `DUPLICATE_MAIN_LANDMARK` | 1.3.1 | medium | ~1556 |
| `DUPLICATE_NAV_NO_LABEL` | 1.3.1 / 4.1.2 | medium | ~1564 |
| `DUPLICATE_BANNER` | 1.3.1 | low | ~1573 |
| `DUPLICATE_CONTENTINFO` | 1.3.1 | low | ~1581 |
| `HEADING_HIERARCHY_FRAGMENTED` | 1.3.1 | medium | ~1592 |
| `COMPETING_SKIP_NAV` | 2.4.1 | low | ~1602 |
| `SHADOW_DOM_FOCUS_ISSUE` | 2.1.1 / 4.1.2 | medium | ~1620 |
| `IFRAME_CROSS_ORIGIN` | — | info | ~1665 |
| `DRAGGABLE_NO_ALTERNATIVE` | 2.5.8 | medium | ~1675 |
| `REDUNDANT_ENTRY` | 3.3.7 | low | ~1709 |
| `TARGET_SIZE_AAA` | 2.5.5 | low | ~1723 |
| `SHELL_OR_MINIMAL_UI` | — | info | ~944 |
| `SHADOW_DOM_DETECTED` | — | info | ~954 |

### Typy zdarzeń Tab Walk

| Type | Blocking? | Opis |
|------|-----------|------|
| `possible_focus_trap` | TAK | Element pojawia się wielokrotnie w tab order — prawdopodobna pętla fokusa |
| `non_dialog_focus_trap` | TAK | Pętla fokusa poza dialog — container przechwytuje focus |
| `roach_motel` | TAK | Focus wchodzi ale nie może wyjść — roach motel pattern |
| `dialog_focus_not_trapped` | TAK | Modal dialog otwarty ale focus ucieka do sibling content |
| `focus_on_body` | TAK | Focus wrócił do `<body>` — prawdopodobne loader chain issue |
| `focus_failed` | TAK | Element nie przyjął focus'a mimo oczekiwania |
| `focus_jump` | NIE | Focus skoczył między odległymi subtrees |
| `focus_thrashing` | NIE | Wiele zmian focus w krótkim czasie — loader mount/unmount churn |
| `duplicate_in_order` | NIE | Element pojawia się wielokrotnie w tab order |
| `role_interactive_not_focusable` | NIE | role=button/link ale element nie jest focusable |
| `dialog_no_focusables` | NIE | Otwarty dialog bez focusable elements wewnątrz |

---

*Dokument wygenerowany na podstawie analizy repozytorium FlowLens v3.0.0, branch `fski/engine-slices-pr`.*
