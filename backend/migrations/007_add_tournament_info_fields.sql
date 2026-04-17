alter table tournaments
add column if not exists event_date date,
add column if not exists start_time text,
add column if not exists end_time text,
add column if not exists location_name text,
add column if not exists address text,
add column if not exists details text,
add column if not exists parking_info text,
add column if not exists check_in_info text,
add column if not exists contact_email text;