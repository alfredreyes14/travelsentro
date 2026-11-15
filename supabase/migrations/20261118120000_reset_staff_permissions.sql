-- Reset account permissions after new features were added behind existing
-- toggles (Content, Events, Partners, Visa, FAQs, SOA, Messenger, follow-ups).
-- Every staff toggle is switched off; an admin re-grants each one per
-- account from Settings -> Users. Only admins keep everything.
--
-- has_permission() and lib/auth/dal.ts already let role = 'admin' through
-- regardless of these columns; setting them true just keeps the stored data
-- consistent with that.

update profiles
set
  can_manage_packages = true,
  can_message_customers = true,
  can_edit_crm = true,
  can_manage_vouchers = true,
  can_manage_quotes = true
where role = 'admin';

update profiles
set
  can_manage_packages = false,
  can_message_customers = false,
  can_edit_crm = false,
  can_manage_vouchers = false,
  can_manage_quotes = false
where role <> 'admin';
