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

## Found while building the lanes (2026-09-18, after the lanes shipped)

From the implementers' reports and the code audit. Same rule: none of these
blocks the lanes; they are taken in order after the lanes are verified.

11. **Slow Stripe can turn into a 502.** The engine's Stripe status call
    allows 4 s connect plus 4 s read inside the request, and the BFF aborts
    at 8 s. A Stripe that is alive but slow makes the page show "temporarily
    unavailable" instead of degrading as contract A intends. Fix: a shorter
    request option for this endpoint only, or move the Stripe lookup off the
    request path. Engine side.
12. **Pre-existing red engine tests.** `SellerAccountApiV1ControllerTest`
    (7 of 11) and `SellerAccountIntegrationTest` (1 of 3) fail with 500s
    because they mock only `DealerServices`, so `@InjectMocks` passes null
    for `StripeService`, and the static stub targets the wrong
    `Account.retrieve` overload. Not caused by phase 2. One small test-only
    commit fixes them.
13. **OpenAPI file lacks `/v1/seller-account`** although the controller's
    javadoc points at it.
14. **`toDashboardDTO` still calls `Date.toInstant()`** on the registration
    date (moved verbatim). It works in production today; if Hibernate ever
    hands back a `java.sql.Date` it throws. One-line hardening.
15. **Cancelled or failed commissions render an Active pill** when coverage
    is left. Contract C never mapped commission status to the pill. Decide
    the look (neutral pill plus the status word is the obvious one).
16. **Per-client send count is unused as a control.** The 10 minute window
    plus the daily cap of 50 per partner are in; `link_sent_count` could also
    cap re-sends per client (contract F wanted three per day).
17. **Test runs must not overlap.** Two Playwright runs against the same
    `netlify dev` produced connection refusals on Supabase and a port
    collision on 3999. One runner at a time, or a retry in
    `signInWithMagicLink`.
18. **Clients page filters still inert:** plan, commission, sort and
    Export CSV keep their single option; only status and search are wired.
19. **Setup checklist** only ticks "Stripe connected" from engine data;
    "Client link assigned" and "Referral code assigned" stay static (item 1).
20. **`stripe_account_id` reaches the browser** in the linked payload. It is
    the viewer's own id, so not a disclosure; strip it in the BFF if the
    contract example (which omits it) is meant literally.
21. **`_hmac.js` reads its env at require time.** Harmless on Netlify;
    noted because `dashboard-data.js` re-checks env per request and the two
    behave differently on a cold start with missing vars.
22. **Local engine profile.** `application.properties` activates `prod`, so
    a plain `spring-boot:run` validates with the production HMAC key. For
    local integration start it with `-Dspring-boot.run.profiles=dev`, whose
    key matches the site's `.env`. Worth a line in the engine README.
