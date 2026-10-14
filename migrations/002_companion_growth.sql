-- Companion evolution. Growth points are computed from real use (see
-- src/growth.ts); stage only advances when the user accepts an evolution,
-- and keep_form lets them stay in their current form indefinitely.
alter table companions add column stage integer not null default 1 check (stage between 1 and 3);
alter table companions add column keep_form boolean not null default false;
alter table companions add column evolved_at timestamptz;
