-- Developer Brief v4 §4: the ownership/occupancy graph -- who's actually
-- responsible for this property, and whether it's owner-occupied or
-- tenanted. Foundational to the Property Passport being anchored on the
-- address rather than whichever account happens to hold it today.

alter table properties add column occupancy_status text not null default 'tenanted'
  check (occupancy_status in ('owner_occupied', 'tenanted', 'vacant'));
alter table properties add column owner_contact_id uuid references contacts(id);
