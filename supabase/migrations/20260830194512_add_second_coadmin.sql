-- Step 3 — Auth & invite system: second co-admin on the bootstrap allowlist.

insert into private.admin_allowlist (email, note) values
  ('raiya.786@hotmail.com', 'Ancestree co-admin (Raiya Suleman)')
on conflict (email) do nothing;
