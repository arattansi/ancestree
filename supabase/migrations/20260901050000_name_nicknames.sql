-- Step 15.1 — Nickname matching for the onboarding name search.
--
-- `private.name_score` (Step 15) compares how names are *spelled* and how they
-- *sound*, so it finds Ratansi/Rattansi and Catherine/Katherine. Nicknames
-- that share neither — Bob/Robert, Bill/William, Peggy/Margaret — score near
-- zero on every one of those signals, so a member entered on the tree under
-- their formal name never surfaced for someone who types the name they
-- actually go by. Those pairs are data, not a string metric: this adds a
-- lookup table and folds it into the scorer.
--
-- Rows are (variant, canonical), both already folded (lowercase, unaccented,
-- letters only). Two names match when they share *any* canonical, so a
-- variant can belong to several roots: "Alex" reaches both Alexander and
-- Alexandra without this table joining those two roots to each other. (They
-- do still score 0.85 against each other through the phonetic rule — Step 15
-- behaviour, unchanged here.)

create table if not exists public.name_nicknames (
  id        bigint generated always as identity primary key,
  variant   text not null,
  canonical text not null,
  constraint name_nicknames_variant_ck check (variant = lower(btrim(variant))),
  constraint name_nicknames_canonical_ck check (canonical = lower(btrim(canonical))),
  constraint name_nicknames_pair_uk unique (variant, canonical)
);

comment on table public.name_nicknames is
  'Given-name nickname groups (Step 15.1). Folded (variant, canonical) pairs; two names match when they share a canonical. Read by private.name_score for the onboarding search. Extendable — insert rows as the family needs them.';

create index if not exists name_nicknames_variant_idx
  on public.name_nicknames (variant);

alter table public.name_nicknames enable row level security;

drop policy if exists name_nicknames_select_authenticated on public.name_nicknames;
create policy name_nicknames_select_authenticated
  on public.name_nicknames for select
  to authenticated
  using (true);

drop policy if exists name_nicknames_write_admin on public.name_nicknames;
create policy name_nicknames_write_admin
  on public.name_nicknames for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- Seed — common English given-name nicknames. Deliberately conservative:
-- every pair here is a name someone is actually called instead of the root,
-- not merely a name that resembles it.
-- ---------------------------------------------------------------------------
insert into public.name_nicknames (variant, canonical)
select unnest(variants), canonical
from (values
  ('robert',      array['bob','bobby','rob','robbie','bert']),
  ('william',     array['bill','billy','will','willie','liam']),
  ('richard',     array['dick','rick','ricky','rich','richie']),
  ('james',       array['jim','jimmy','jamie']),
  ('john',        array['jack','johnny','jonny']),
  ('joseph',      array['joe','joey']),
  ('thomas',      array['tom','tommy']),
  ('charles',     array['charlie','chuck','chas']),
  ('edward',      array['ed','eddie','ted','teddy','ned']),
  ('theodore',    array['ted','teddy','theo']),
  ('henry',       array['hank','harry','hal']),
  ('michael',     array['mike','mikey','mick','micky']),
  ('christopher', array['chris','kit']),
  ('nicholas',    array['nick','nicky']),
  ('daniel',      array['dan','danny']),
  ('david',       array['dave','davey']),
  ('benjamin',    array['ben','benny','benji']),
  ('alexander',   array['alex','alec','sandy','xander']),
  ('anthony',     array['tony']),
  ('samuel',      array['sam','sammy']),
  ('stephen',     array['steve','stevie']),
  ('steven',      array['steve','stevie']),
  ('andrew',      array['andy','drew']),
  ('matthew',     array['matt','matty']),
  ('timothy',     array['tim','timmy']),
  ('kenneth',     array['ken','kenny']),
  ('ronald',      array['ron','ronnie']),
  ('donald',      array['don','donnie']),
  ('gerald',      array['gerry','jerry']),
  ('lawrence',    array['larry','laurie']),
  ('albert',      array['al','bert','bertie']),
  ('alfred',      array['alfie','fred','freddie']),
  ('frederick',   array['fred','freddie','fritz']),
  ('gregory',     array['greg','gregg']),
  ('jeffrey',     array['jeff']),
  ('philip',      array['phil']),
  ('raymond',     array['ray']),
  ('vincent',     array['vince','vinny']),
  ('walter',      array['walt','wally']),
  ('eugene',      array['gene']),
  ('herbert',     array['herb','bert','bertie']),
  ('leonard',     array['len','lenny','leo']),
  ('martin',      array['marty']),
  ('oliver',      array['ollie']),
  ('peter',       array['pete']),
  ('russell',     array['russ']),
  ('stanley',     array['stan']),
  ('terence',     array['terry']),
  ('patrick',     array['pat','paddy']),
  ('elizabeth',   array['liz','lizzie','beth','betty','betsy','eliza','libby']),
  ('katherine',   array['kate','katie','kathy','kitty','kay']),
  ('catherine',   array['kate','katie','cathy','kitty','kay']),
  ('margaret',    array['peggy','maggie','meg','marge','greta','madge']),
  ('eleanor',     array['ellie','nell','nellie']),
  ('mary',        array['molly','polly','mae']),
  ('dorothy',     array['dot','dottie','dolly']),
  ('patricia',    array['pat','patty','tricia','trish']),
  ('susan',       array['sue','susie','suzy']),
  ('barbara',     array['barb','babs']),
  ('jennifer',    array['jen','jenny']),
  ('deborah',     array['deb','debbie']),
  ('rebecca',     array['becky','becca']),
  ('frances',     array['fran','frankie','fanny']),
  ('francis',     array['frank','frankie']),
  ('virginia',    array['ginny','ginger']),
  ('victoria',    array['vicky','vicki','tori']),
  ('samantha',    array['sam','sammy']),
  ('alexandra',   array['alex','sasha','lexi']),
  ('abigail',     array['abby','gail']),
  ('amanda',      array['mandy']),
  ('angela',      array['angie']),
  ('cynthia',     array['cindy']),
  ('josephine',   array['jo','josie']),
  ('judith',      array['judy']),
  ('kimberly',    array['kim']),
  ('lucille',     array['lucy']),
  ('madeline',    array['maddie']),
  ('martha',      array['mattie']),
  ('melissa',     array['mel','missy']),
  ('michelle',    array['shelly']),
  ('nancy',       array['nan']),
  ('pamela',      array['pam']),
  ('penelope',    array['penny']),
  ('rachel',      array['rae']),
  ('roberta',     array['bobbie','robbie']),
  ('rosemary',    array['rosie','rose']),
  ('theresa',     array['terry','tess','tessa']),
  ('teresa',      array['terry','tess','tessa']),
  ('valerie',     array['val']),
  ('vanessa',     array['nessa']),
  ('veronica',    array['ronnie'])
) as seed(canonical, variants)
on conflict (variant, canonical) do nothing;

-- Each root is a variant of itself, so Bob → robert ← Robert lines up without
-- special-casing the canonical side of the lookup.
insert into public.name_nicknames (variant, canonical)
select distinct canonical, canonical from public.name_nicknames
on conflict (variant, canonical) do nothing;

-- ---------------------------------------------------------------------------
-- private.nickname_match — do two folded names share a nickname group?
-- SECURITY DEFINER so the lookup works from every calling context.
-- ---------------------------------------------------------------------------
create or replace function private.nickname_match(p_a text, p_b text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.name_nicknames a
    join public.name_nicknames b on b.canonical = a.canonical
    where a.variant = p_a
      and b.variant = p_b
  );
$$;

grant execute on function private.nickname_match(text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- private.name_score — Step 15, plus the nickname floor.
-- ---------------------------------------------------------------------------
create or replace function private.name_score(p_a text, p_b text)
returns real
language plpgsql
stable
set search_path = ''
as $$
declare
  a text := private.fold_name(p_a);
  b text := private.fold_name(p_b);
  s real;
begin
  if a is null or b is null then return 0; end if;
  if a = b then return 1; end if;

  -- Trigram overlap, floored by normalised edit distance so short names
  -- (where trigrams are sparse) still score sensibly: "Ali" vs "Alu".
  s := greatest(
    extensions.similarity(a, b),
    1.0 - extensions.levenshtein(a, b)::real / greatest(length(a), length(b))
  );

  -- Sounds the same, spelled differently: Catherine / Katherine.
  if length(a) > 2 and length(b) > 2 then
    if nullif(extensions.dmetaphone(a), '') is not distinct from
       nullif(extensions.dmetaphone(b), '')
      and extensions.dmetaphone(a) <> ''
    then
      s := greatest(s, 0.85);
    end if;
  end if;

  -- Shortened forms of the same name: Ali / Alimah, Sam / Samir.
  if length(a) >= 3 and length(b) >= 3
    and (a like b || '%' or b like a || '%')
  then
    s := greatest(s, 0.75);
  end if;

  -- Known nickname groups, which share neither spelling nor sound:
  -- Bob / Robert, Peggy / Margaret. Curated, so scored high.
  if private.nickname_match(a, b) then
    s := greatest(s, 0.9);
  end if;

  return least(greatest(s, 0), 1);
end;
$$;

grant execute on function private.name_score(text, text) to authenticated, service_role;
