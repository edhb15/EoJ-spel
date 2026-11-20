# shared/ – delade funktioner för alla spel

- `eoj.js` – dela-knappar, dagens utmaning och topplistor. Används av spelen.
- `config.js` – inställningar för topplistan online.

## Gör topplistorna gemensamma online (ca 5 minuter)

Utan inställningar sparas topplistan bara på varje spelares egen enhet. Så här får alla samma topplista:

1. Skapa ett gratis konto på https://supabase.com och tryck **New project** (välj region *Stockholm* eller *Frankfurt*).
2. Öppna **SQL Editor**, klistra in koden nedan och tryck **Run**:

```sql
create table public.scores (
  id bigint generated always as identity primary key,
  board text not null check (char_length(board) between 1 and 60),
  name text not null check (char_length(name) between 1 and 12),
  score double precision not null check (score >= 0 and score < 100000000),
  created_at timestamptz not null default now()
);
create index scores_board_score on public.scores (board, score);

alter table public.scores enable row level security;
create policy "Alla kan läsa" on public.scores for select to anon using (true);
create policy "Alla kan lägga till" on public.scores for insert to anon with check (true);
grant select, insert on public.scores to anon;
```

3. Gå till **Project Settings → API** (eller **API Keys**) och kopiera
   - **Project URL** (t.ex. `https://abcdefgh.supabase.co`)
   - **anon public**-nyckeln eller **publishable**-nyckeln
4. Klistra in dem i `shared/config.js` och spara på GitHub. Klart!

Nyckeln är gjord för att synas i webbläsaren – den kan bara läsa och lägga till resultat, inte ändra eller ta bort.

**Ta bort ett olämpligt namn:** Supabase → **Table Editor → scores**, markera raden och ta bort den.

**Bra att veta:** gratisprojekt på Supabase pausas om ingen använt dem på en vecka. Då loggar du in och trycker **Restore**. Medan det är pausat visar spelen "Kunde inte ladda topplistan", men spelen fungerar som vanligt.

## Topplistor som finns

| Spel | Topplista |
|---|---|
| Stunt Rider 3D | Dagens utmaning (ny varje dag), Stunt Mode, Ramp Jump, varje Time Trial-bana |
| Ski to Death 3D | Poäng |
| Impossible Rooms 3D | Tid per nivå, Del 1, hela spelet |
| Smita från ledet | Sekunder innan man blir fångad |
| Teacher Meltdown | Snabbaste sammanbrottet |
