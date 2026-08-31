-- Step 4.5d seed — curated period names for the regions this family tree spans
-- (East African Ismaili/Khoja diaspora: Tanzania incl. Zanzibar, Kenya, Uganda,
-- South Africa). Country-level rows keyed by country_code; Zanzibar city
-- (GeoNames id 148730) gets a place_id override. Successions/dates follow
-- Wikidata political-entity history. Add more regions here as the tree grows.
insert into public.historical_names (place_id, country_code, name, start_date, end_date, source) values
  (null, 'TZ', 'German East Africa',               '1891-01-01', '1919-06-28', 'curated'),
  (null, 'TZ', 'Tanganyika (British mandate)',     '1919-06-28', '1961-12-09', 'curated'),
  (null, 'TZ', 'Tanganyika',                       '1961-12-09', '1964-04-26', 'curated'),
  (148730, null, 'Sultanate of Zanzibar',          '1856-10-19', '1964-01-12', 'curated'),
  (148730, null, 'People''s Republic of Zanzibar', '1964-01-12', '1964-04-26', 'curated'),
  (null, 'KE', 'British East Africa Protectorate', '1895-07-01', '1920-07-23', 'curated'),
  (null, 'KE', 'Kenya Colony',                     '1920-07-23', '1963-12-12', 'curated'),
  (null, 'UG', 'Uganda Protectorate',              '1894-06-19', '1962-10-09', 'curated'),
  (null, 'ZA', 'Union of South Africa',            '1910-05-31', '1961-05-31', 'curated');
