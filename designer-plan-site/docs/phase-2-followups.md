# Phase 2 follow-ups (parked on 2026-09-18)

Found while reviewing the three lanes against the code, before any of them
started. None of these is in the three lanes. They are taken up after the
lanes ship and are tested, in this order unless Adrian says otherwise.

Decisions Adrian still owns are marked **decision**.

1. **Setup checklist with real data.** `setup-checklist` and
   `setup-progress-line` are computed from Supabase only. With the bridge
   live they should also tick "account linked" and "Stripe connected".
2. **Six buttons on the clients page with no backend** (**decision**):
   `file-claim`, `send-claim-link`, `copy-claim-instructions` belong to
   5Star Service; proposal is to remove them from the table and link to
   5Star from the service page. `call-rap` / `email-rap` become real `tel:`
   and `mailto:`. `export-csv` is a client-side half hour.
3. **"Connect Stripe" has nowhere to go** (**decision**). Stripe onboarding
   happens inside designerplan.io with an engine session. Proposal for now:
   the button deep-links to the designerplan.io login with a sentence
   explaining why. A signed engine endpoint that mints the onboarding link
   is about 1.5 h, later.
4. **Prospects must not be upserted into `leads`** (**decision**, proposal is
   "never"). They are the designer's clients, with no consent given to RAP.
   Lane 3 is built on that assumption.
5. **Edit / archive a prospect.** Lane 3 ships add and send only. A typo in
   the email cannot be corrected and breaks the join. `client-update.js`
   with edit and archive, about 1.5 h.
6. **Send cap rule.** The contract said three sends per client per 24 h; that
   is not derivable from `link_sent_at` alone. Lane 3 enforces one send per
   client every 10 minutes instead. Revisit only if abuse shows up.
7. **Old dashboard specs.** `docs/dashboard-spec.html` and
   `docs/browser-brief-dashboard.md` predate the contract. Mark them as
   superseded so no agent takes them as source.
8. **Engine deploy process.** Lane 1 only helps once it runs on
   designerplan.io. Version 0.7.5 was deployed without being pushed, so the
   deploy steps need writing down before lane 2 depends on it.
9. **Stripe onboarding link endpoint** (the engine half of item 3).
10. **`dealer_id` cache in `partners`** (contract decision 8): one lookup
    less per load, needs a migration with grants.
