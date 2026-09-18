# Designer Plan Dashboard Wireframe and Claude Build Notes

Below is the **Claude-ready version**. It starts with the full drawn wireframe first, then the explanation/rules after it.

---

# Designer Plan Dashboard — Drawn Wireframe First

Build this as a **desktop-first dashboard command center**. The public version uses sample data. Logged-in users see real data. Do not invent a different layout.

```text id="6nvc2j"
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ NAV                                                                                          │
│                                                                                              │
│ Designer Plan        Dashboard     Clients     Sales Tools     Service     Account/Login      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ PREVIEW / STATUS BAND                                                                         │
│                                                                                              │
│ PUBLIC STATE:                                                                                │
│ ● Preview mode — You are viewing a sample Designer Plan partner dashboard.                    │
│ Already talked to us? Your account may already be waiting.   Log in | Find my account | Call │
│                                                                                              │
│ LOGGED-IN INCOMPLETE STATE:                                                                  │
│ Account setup: 3 of 5 complete. Next: connect Stripe so you can receive commission.           │
│ [Continue setup] [Connect Stripe] [Call RAP]                                                  │
│                                                                                              │
│ LOGGED-IN ACTIVE STATE:                                                                      │
│ Account active. Your client link and referral code are ready.                                │
│ [Copy client link] [Copy referral code] [Call RAP]                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ HERO / COMMAND CENTER                                                                         │
│                                                                                              │
│ ┌─────────────────────────────────────────────────────────────┐  ┌─────────────────────────┐ │
│ │ DASHBOARD PRODUCT PREVIEW / REAL ACCOUNT SUMMARY             │  │ ACTION / HELP STACK      │ │
│ │                                                             │  │                         │ │
│ │ Example Designer Studio                                     │  │ Partner dashboard       │ │
│ │ Partner dashboard preview                         ● Ready    │  │ preview                 │ │
│ │                                                             │  │                         │ │
│ │ Private client link                                         │  │ See how Designer Plan   │ │
│ │ thedesignerplan.com/plans?ref=EXAMPLESTUDIO                 │  │ works for your studio.  │ │
│ │ [Copy link] [Send to client]                                │  │                         │ │
│ │                                                             │  │ Your dashboard gives    │ │
│ │ Referral code                                               │  │ you a private client    │ │
│ │ EXAMPLESTUDIO                                               │  │ link, referral code,    │ │
│ │ [Copy referral code]                                        │  │ tracked commissions,    │ │
│ │                                                             │  │ client activity, sales  │ │
│ │ Commission summary                                          │  │ tools, and service      │ │
│ │ Tracked commission      $843                                │  │ support.                │ │
│ │ Plans sold              3                                   │  │                         │ │
│ │                                                             │  │ [Create my account]     │ │
│ │ Recent clients & plans                                      │  │ [Log in]                │ │
│ │ Miller Residence  | Premium Plus | Active | File claim      │  │ [Call us to set it up]  │ │
│ │ Harper Project    | Premium      | Link sent | Resend       │  │                         │ │
│ │ Weston Condo      | Stain        | Active | File claim      │  │ Already talked to us?   │ │
│ │                                                             │  │ Your account may        │ │
│ │ Service & claims                                            │  │ already be waiting.     │ │
│ │ File at 5Star Service  |  Call RAP  |  Email RAP            │  │                         │ │
│ │                                                             │  │ Need help?              │ │
│ │ Sample data shown                                           │  │ 561-374-3147            │ │
│ │                                                             │  │ designer.programs       │ │
│ └─────────────────────────────────────────────────────────────┘  │ @raptns.com             │ │
│                                                                  └─────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ QUICK ACTIONS                                                                                 │
│                                                                                              │
│ [Copy client link]  [Copy referral code]  [Send plan to client]  [Buy plan now]              │
│ [Connect Stripe]    [File claim]          [Call RAP]                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ COMMISSION + SETUP                                                                            │
│                                                                                              │
│ ┌──────────────────────────────────────────────┐  ┌────────────────────────────────────────┐ │
│ │ COMMISSION SNAPSHOT                           │  │ SETUP CHECKLIST                        │ │
│ │                                              │  │                                        │ │
│ │ Tracked commission        $843                │  │ ✓ Account created                      │ │
│ │ Pending commission        $598                │  │ ✓ Client link assigned                 │ │
│ │ Payable now               $245                │  │ ✓ Referral code assigned               │ │
│ │ Paid to date              $0                  │  │ □ Stripe connected                     │ │
│ │                                              │  │ □ First client link sent               │ │
│ │ Stripe setup is required before payouts.      │  │ □ Onboarding call scheduled            │ │
│ │                                              │  │                                        │ │
│ │ [Connect Stripe] [How commissions work]       │  │ [Continue setup] [Ask RAP to help]     │ │
│ └──────────────────────────────────────────────┘  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ACCORDION 1 — MY CLIENTS & PLANS                                                              │
│                                                                                              │
│ CLOSED SUMMARY STATE                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ My Clients & Plans                                                  3 recent clients  +  │ │
│ │ 2 active plans · 1 link sent · $196 commission tracked                                  │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                              │
│ OPEN STATE                                                                                    │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ My Clients & Plans                                                   Collapse  −          │ │
│ │ Track clients and projects connected to your Designer Plan activity.                     │ │
│ │                                                                                          │ │
│ │ [Search clients/projects] [Plan: All] [Status: All] [Commission: All] [Sort: Newest]     │ │
│ │                                                                                          │ │
│ │ Client             Project       Plan           Status       Commission     Service       │ │
│ │ ─────────────────────────────────────────────────────────────────────────────────────── │ │
│ │ Miller Residence   Living Room   Premium Plus   Active       $122 pending  File claim    │ │
│ │ Harper Project     Dining Room   Premium        Link sent    Pending       Resend link   │ │
│ │ Weston Condo       Bedroom       Stain          Active       $74 payable   File claim    │ │
│ │                                                                                          │ │
│ │ Row actions: View details · Resend link · File claim · Call RAP · Email RAP              │ │
│ │                                                                                          │ │
│ │ [View full client history]                                                               │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                              │
│ EXPANDED ROW EXAMPLE                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Miller Residence                                                                          │ │
│ │ Project: Living Room                                                                      │ │
│ │ Plan: Premium Plus                                                                        │ │
│ │ Coverage: Jan 12, 2026 – Jan 12, 2029                                                     │ │
│ │ Commission: $122 pending                                                                  │ │
│ │ Service actions: [File claim] [Send claim link] [Call RAP] [Email RAP]                   │ │
│ │ Notes: Client purchased after project closeout email.                                    │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ACCORDION 2 — SERVICE & CLAIMS                                                                │
│                                                                                              │
│ CLOSED SUMMARY STATE                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Service & Claims                                      File claim · Call RAP · Email RAP + │ │
│ │ Send clients to 5Star Service or contact RAP for help.                                   │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                              │
│ OPEN STATE                                                                                    │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Service & Claims                                                   Collapse  −            │ │
│ │ When a client needs help, send them to 5Star Service or contact RAP.                     │ │
│ │ You do not need to manage the claim yourself.                                            │ │
│ │                                                                                          │ │
│ │ ┌────────────────────────────┐ ┌────────────────────────────┐ ┌────────────────────────┐ │ │
│ │ │ File a claim online         │ │ Call or email RAP           │ │ What clients need       │ │ │
│ │ │ Send your client to our     │ │ Not sure what to do?        │ │ Before filing, gather:  │ │ │
│ │ │ 5Star Service app.          │ │ We’ll help route the client.│ │ client name, item,     │ │ │
│ │ │                            │ │                            │ │ photos, date of issue, │ │ │
│ │ │ [File claim]                │ │ [Call RAP] [Email RAP]      │ │ short description.     │ │ │
│ │ │ 5starservice.net            │ │ 561-374-3147                │ │ [Copy instructions]    │ │ │
│ │ └────────────────────────────┘ └────────────────────────────┘ └────────────────────────┘ │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ACCORDION 3 — SALES TOOLS                                                                     │
│                                                                                              │
│ CLOSED SUMMARY STATE                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Sales Tools                            Email scripts · Text scripts · Plan one-pagers  + │ │
│ │ Ready-to-send materials for project closeout and client follow-up.                       │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                              │
│ OPEN STATE                                                                                    │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Sales Tools                                                       Collapse  −             │ │
│ │ Use these when introducing Designer Plan to clients.                                     │ │
│ │                                                                                          │ │
│ │ Send to clients                                                                          │ │
│ │ [Email script] [Text script] [Client FAQ]                                                 │ │
│ │                                                                                          │ │
│ │ Explain the plans                                                                        │ │
│ │ [Tier comparison] [Plan one-pager] [Coverage terms]                                      │ │
│ │                                                                                          │ │
│ │ Help close the sale                                                                      │ │
│ │ [Talk tracks] [Objection answers] [Success stories]                                      │ │
│ │                                                                                          │ │
│ │ Project closeout                                                                         │ │
│ │ [Closeout checklist] [Copy/paste client note]                                            │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ PARTNER UPDATES & SUCCESS STORIES                                                             │
│                                                                                              │
│ ┌──────────────────────────────┐ ┌──────────────────────────────┐ ┌───────────────────────┐ │
│ │ Success story                 │ │ Selling tip                   │ │ Partner updates        │ │
│ │ How a designer protected      │ │ When to introduce protection  │ │ Get scripts, success   │ │
│ │ a full living room project.   │ │ at project closeout.          │ │ stories, and updates.  │ │
│ │                              │ │                              │ │                       │ │
│ │ [Read story]                  │ │ [Read tip]                    │ │ [Subscribe]           │ │
│ └──────────────────────────────┘ └──────────────────────────────┘ └───────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ FINAL CTA                                                                                     │
│                                                                                              │
│ Ready to see your studio in the dashboard?                                                    │
│ Create your account, log in if RAP already created one, or call us and we’ll help set it up.  │
│                                                                                              │
│ [Create my account] [Log in] [Call RAP]                         Shop plans first →            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ FOOTER                                                                                        │
│                                                                                              │
│ Designer Plan — A program by Risk Assurance Partners                                          │
│ Program links | Contact | File a claim | Login                                                │
│ © 2026 Risk Assurance Partners. All rights reserved.                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# Client Page Wireframe

This is the optional full page reached from **View full client history**. It should exist in the information architecture even if not built in the first pass.

```text id="pl23jq"
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ NAV                                                                                          │
│                                                                                              │
│ Designer Plan        Dashboard     Clients     Sales Tools     Service     Account            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ PAGE HEADER                                                                                   │
│                                                                                              │
│ My Clients & Plans                                                                            │
│ Track every client, project, plan, commission, and service action connected to your account.  │
│                                                                                              │
│ [Add client/project] [Send client link] [Copy referral code] [Export list] [Call RAP]         │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ SERVICE / CLAIM QUICK BAR                                                                     │
│                                                                                              │
│ Client needs help?                                                                            │
│ [File claim at 5Star Service] [Call RAP] [Email RAP] [Copy claim instructions]                │
│                                                                                              │
│ Claim portal: 5starservice.net · 561-374-3147 · designer.programs@raptns.com                  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ FILTERS                                                                                       │
│                                                                                              │
│ [Search client/project]                                                                       │
│ [Plan: All] [Status: All] [Commission: All] [Service: All] [Date range] [Sort: Newest]        │
│                                                                                              │
│ Quick filters: All · Links sent · Purchased · Active · Service needed                         │
│ Commission pending · Payable · Expiring soon                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ CLIENT / PLAN TABLE                                                                           │
│                                                                                              │
│ Client             Project       Plan           Coverage/status    Commission      Service    │
│ ──────────────────────────────────────────────────────────────────────────────────────────── │
│ Miller Residence   Living Room   Premium Plus   Active             $122 pending   File claim  │
│ Harper Project     Dining Room   Premium        Link sent          Pending        Resend link │
│ Weston Condo       Bedroom       Stain          Active             $74 payable    File claim  │
│ Brown Residence    Whole Home    Premium Plus   Active             $310 paid      Call RAP    │
│                                                                                              │
│ Row actions: Expand · View plan · Resend link · File claim · Call RAP · Email RAP             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ EXPANDED ROW EXAMPLE                                                                          │
│                                                                                              │
│ Miller Residence                                                                              │
│ Project: Living Room                                                                          │
│ Plan: Premium Plus                                                                            │
│ Coverage: Jan 12, 2026 – Jan 12, 2029                                                         │
│ Plan status: Active                                                                           │
│ Commission: $122 pending                                                                      │
│                                                                                              │
│ Client/referral link:                                                                         │
│ thedesignerplan.com/plans?ref=EXAMPLESTUDIO&miller                                           │
│                                                                                              │
│ Service options:                                                                              │
│ [File claim] [Send claim link] [Call RAP] [Email RAP]                                        │
│                                                                                              │
│ Notes: Client purchased after project closeout email.                                        │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# Explanation for Claude

## 1. The dashboard is desktop-first

Design primarily for desktop and tablet. Mobile should remain usable for quick actions, but the main dashboard experience is desktop-first.

Add a mobile note if needed:

> For the best dashboard experience, use desktop or tablet. Mobile is available for quick actions like copying your link, filing a claim, or calling RAP.

Do not over-optimize the full client table for mobile. Convert tables to stacked cards on mobile.

---

## 2. The dashboard has three main jobs

The dashboard should help the designer:

```text id="rony18"
Sell a plan.
Track who bought it.
Know what commission is tied to it.
Route clients for service.
```

Everything on the page should support one of those jobs.

---

## 3. Quick Actions must include referral code

Quick Actions must include:

```text id="zk30fk"
Copy client link
Copy referral code
Send plan to client
Buy plan now
Connect Stripe
File claim
Call RAP
```

The referral code is important because some users will be gatekeepers, referral contacts, studio team members, or designers who just want to forward a code.

---

## 4. Use accordions for the heavy sections

Use accordions on the dashboard home for:

```text id="a8lu36"
My Clients & Plans
Service & Claims
Sales Tools
```

This keeps the dashboard from becoming a giant scroll page and leaves room for partner updates, success stories, blog/tips, and newsletter content.

---

## 5. My Clients & Plans is an accordion on the dashboard home

The dashboard home should show a closed summary state and an open table state.

Closed summary should communicate:

```text id="kkkzuw"
3 recent clients
2 active plans
1 link sent
$196 commission tracked
```

Open state should show:

```text id="75mfp1"
Search
Plan filter
Status filter
Commission filter
Sort
Client table
Row actions
View full client history
```

Rows should support expansion.

---

## 6. Client history can be a separate page

The dashboard home should have:

```text id="r4hisb"
View full client history
```

This can later route to:

```text id="r8h7mb"
/dashboard/clients
```

The client page is where larger tables, deeper filters, export, and full history belong.

---

## 7. Service & Claims is routing only

Do **not** build claim management.

Filing a claim is only a route to:

```text id="riitjj"
5Star Service app
Call RAP
Email RAP
Copy/send claim instructions
```

Service & Claims should appear:

```text id="5ltmh2"
1. As an accordion on the dashboard
2. As a quick bar on the Client page
3. As row-level actions inside My Clients & Plans
```

No claim statuses unless 5Star Service data is connected later.

---

## 8. Sales Tools should also be an accordion

Sales tools should be grouped into practical sections:

```text id="t0n3oo"
Send to clients
Explain the plans
Help close the sale
Project closeout
```

Do not dump all downloads into one list. Make them feel actionable.

---

## 9. Use the bottom area for engagement

Because accordions reduce clutter, the bottom of the dashboard should include:

```text id="qi1in6"
Success stories
Selling tips / blog
Newsletter / partner updates
```

This matters because the dashboard is also a nurture channel. It keeps designers returning and gives RAP a place to show momentum.

---

## 10. Public versus logged-in behavior

Public dashboard:

```text id="q6w74q"
Show sample data
Show preview mode
Show dashboard product mockup
Show create / login / call options
Do not show real account status
```

Logged-in incomplete dashboard:

```text id="ywi294"
Show real account
Show setup checklist
Show client link
Show referral code
Show Stripe status
Show quick actions
```

Logged-in active dashboard:

```text id="w8o4b6"
Show real link/code
Show real commission
Show real clients/plans
Show real service routing
Show real sales tools
```

---

## 11. Visual rules

Stay aligned with the existing Designer Plan site:

```text id="oubde9"
Paper background
Ink text
Hairline borders
Editorial spacing
Terracotta accent only
No dark masthead
No blue SaaS UI
No heavy gradients
No stock lifestyle hero
```

The hero should be a close-up dashboard product preview, not a person using a laptop.

---

## 12. Do not change this structure

Do not replace the accordions with long open sections.  
Do not make Service a full claim-management module.  
Do not bury the referral code.  
Do not remove the Client page concept.  
Do not make this primarily mobile-first.  
Do not make the dashboard a generic marketing page.

The layout above is the intended direction.