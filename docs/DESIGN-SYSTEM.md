# Design system: T3 Code

Fonte: [artifact T3 Code Design System](https://claude.ai/artifact/8tZb4puZkxqf3WNUoitVgr).
Token esatti in `packages/ui-kit/src/theme.css`; componenti in
`packages/ui-kit/src`.

## Principi

- **Chrome silenzioso, un solo colore d'azione.** Superfici neutre (zinc in
  chiaro, quasi nero in scuro). `primary` (blu) è l'unico colore saturo e
  significa "fai ora": un solo bottone `default` per vista.
- **Bordi, non riempimenti.** Si separa con hairline `border`. In scuro card e
  popover sono solo il 3% sopra lo sfondo: niente grigi lattiginosi.
- **Denso.** Controlli desktop 32px (`text-sm`, 14px). Metadati `text-2xs`
  (11px) e `text-3xs` (10px).
- **Lo stato si tinge, non si urla.** Badge e banner di stato: tinta all'8%
  (16% in scuro) dietro il testo `*-foreground`. Mai un fill pieno, salvo
  `destructive`.
- **Ombre rare**: solo dialoghi (`shadow-dialog`) e composer.

## Utility Tailwind disponibili

| Uso | Classi |
|---|---|
| Sfondo pagina / testo | `bg-background text-foreground` |
| Pannelli | `bg-card`, menu e popover `bg-popover` |
| Testo secondario, icone mute | `text-muted-foreground` |
| Hover di righe e bottoni ghost | `hover:bg-accent` |
| Sidebar | `bg-sidebar`, campo ricerca `bg-sidebar-control-surface`, riga attiva `bg-sidebar-row-active` |
| Bordi | `border` (colore di default), controlli `border-input` |
| Stati | `text-error-foreground`, `text-success-foreground`, `text-warning-foreground`, `text-info-foreground`; tinte via `<Badge variant>` |
| Raggi | `rounded-control` (bottoni, 8px), `rounded-lg` (input, card, 10px), `rounded-sm` (badge), `rounded-xl` (dialoghi) |
| Testo piccolo | `text-2xs`, `text-3xs` |
| Codice, percorsi, numeri | `font-mono tabular-nums` |
| Easing dei pannelli | `ease-sheet` |

Variabili di layout: `--sidebar-width` (16rem), `--workspace-topbar-height`
(52px), `--workspace-gutter`, `--content-max-width` (52rem).

## Componenti (`@webeep/ui-kit`)

- `Button` — `variant`: `default` | `outline` | `secondary` | `ghost` |
  `ghost-muted` | `destructive` | `link`; `size`: `xs` | `sm` | `default` |
  `lg` | `icon-xs` | `icon-sm` | `icon`; `icon`, `loading`. I bottoni solo icona
  vogliono `aria-label`.
- `Badge` — `variant`: `default` | `secondary` | `outline` | `error` | `info` |
  `success` | `warning`; `size`: `sm` | `default` | `lg`. Sempre con una parola.
- `Input` — `leading` (icona), `mono`, `invalid`.
- `Card`, `CardHeader` (`title`, `description`, `action`).
- `EmptyState` (`icon`, `title`, `description`, `action`) per stati vuoti ed
  errori.
- `Skeleton` per il caricamento; `Spinner` per attese brevi.
- `Kbd`, `KbdGroup` per le scorciatoie.
- `cn(...)` per unire classi.

## Regole di voce e icone

- Testi in italiano, frase in minuscolo ("Nuova cartella", "Apri nel
  browser"), verbi brevi sui bottoni, niente emoji.
- Icone Lucide (`lucide-react`) a 16px, `text-muted-foreground` nei bottoni
  ghost e outline.
- Focus visibile sempre (anello `ring`); premuto `scale 0.97`; disabilitato
  opacità 0.64; rispetta `prefers-reduced-motion`.
- Contrasto testo ≥ 4.5:1 in entrambi i temi.
