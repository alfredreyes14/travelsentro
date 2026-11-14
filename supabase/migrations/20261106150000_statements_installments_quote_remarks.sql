-- SOA follow-ups:
-- (1) installments -- an optional payment schedule ({ dueDate, amount,
--     label? } rows, shape enforced by soaFormSchema). Payments received
--     still live in `payments`; they are applied to the installments in
--     due-date order to work out which ones are paid (lib/soa/totals.ts).
-- (2) next_due_date -- the due date of the first installment not fully
--     covered by payments (or due_date when there is no schedule), null
--     once fully paid. Computed by the server on every save, like
--     total_amount, so the list can show and sort it without jsonb.
-- (3) quote_id -- optional link to the quote the SOA bills for.
-- (4) notes -> remarks, matching quotes.
-- (5) reference is dropped; remarks is the one free-text field. Any
--     reference already typed is kept by moving it into remarks first.

alter table statements
  add column installments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(installments) = 'array'),
  add column next_due_date date,
  add column quote_id uuid references quotes(id) on delete set null;

alter table statements rename column notes to remarks;

update statements
  set remarks = concat_ws(E'\n\n', 'Reference: ' || reference, remarks)
  where reference is not null;

alter table statements drop column reference;

-- Existing rows: no schedule yet, so the next due date is the SOA's own
-- due date while something is still owed.
update statements
  set next_due_date = due_date
  where total_amount > amount_paid;

create index statements_quote_id_idx on statements(quote_id);
