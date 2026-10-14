<!-- /founder:pricing-strategy · 2026-10-14 · input: how would you price Designease's products (DesignEase, Bahrain, designease.io) -->
# DesignEase pricing strategy

DesignEase is the Bahrain interior materials platform at www.designease.io (confirmed by the founder): Surface Library, Designers Portal, Vision Lab, Supplier Network, BOQ with wastage.
Assumption: current prices are the published ones: Essential 29 BHD/mo (278/yr), Signature 79 BHD/mo (758/yr), Firm 199 BHD/mo (1,910/yr). Source: https://www.designease.io/en (seen via search, 2026-10-14; the site could not be opened directly).
Assumption: buyers are interior designers and small firms in Bahrain and the GCC; suppliers are flooring, wall and surface vendors.
Assumption: 1 BHD = 2.659 USD (fixed peg).

## 1. Pricing model analysis

| Model | Fit | Pros | Cons |
|---|---|---|---|
| Flat subscription | 3 | Simple, what you have now | Solo designers pay the same as power users |
| Usage-based | 3 | Fits AI render costs | Hard to budget for small studios |
| Per-seat | 4 | Scales with firm size, matches Programa | Firms share logins |
| Freemium | 5 | Grows the designer base suppliers pay to reach | Needs a supplier revenue line to fund it |
| Credits | 4 | Caps AI cost per account | Confusing alone |
| One-time | 1 | None | No recurring revenue, ongoing AI cost |

Recommendation: a two-sided model. Free for designers at entry, paid per seat with AI credits above that, and suppliers pay to be in the network. Because Material Bank, the closest global model, is free for designers and charges manufacturers a monthly platform fee plus a per-sample fee (https://www.architectmagazine.com/technology/products/material-bank-aspires-to-transform-product-selection-for-architects_o). Every designer who builds a BOQ on DesignEase is a lead a supplier will pay for.

## 2. Tier design

### Starter: free
- Surface Library, full browse
- 3 active design boards
- BOQ with wastage, 1 export per month
- 10 AI credits per month
- Supplier quote requests: unlimited (suppliers pay for these)
- 1 seat

Upgrade trigger: 4th project, or the first client who wants a rendered look from Vision Lab.

### Signature: 49 BHD/mo or 470 BHD/yr (20% off), about $130/mo
- Everything in Starter
- Unlimited boards and BOQ exports, branded with the studio logo
- Vision Lab
- 150 AI credits per month, top-ups at 10 BHD per 100
- Supplier Network: compare quotes side by side
- 1 seat

Upgrade trigger: a second designer, or running out of credits two months in a row.

### Firm: 149 BHD/mo or 1,430 BHD/yr (20% off) for 3 seats, +29 BHD per extra seat
- Everything in Signature
- 1,000 pooled AI credits per month (fair use, not "unlimited")
- Shared material library and board templates
- Client approval links
- Project-level cost reports
- Priority supplier response, onboarding call

Self-serve up to 10 seats, sales-led above that.

### Supplier side (new revenue line)
- Listing: 99 BHD/mo per supplier for catalog, analytics and leads (proposal, test it)
- Per qualified quote request: 3 BHD, charged only when a designer sends a BOQ line to that supplier

Why these changes:
- Drop Essential at 29 BHD. It is a paid gate in front of the library suppliers want designers to use. Make the entry free and charge suppliers.
- Cut Signature from 79 to 49 BHD, because 79 BHD is about $210, over 3x Programa ($59 per user) and DesignFiles ($49 to $69). A solo designer comparing tools will see that gap.
- Firm moves from 199 BHD flat with unlimited AI to per-seat with pooled credits, because unlimited AI is the one line that can turn a customer unprofitable (see section 4).

## 3. Competitive pricing context

| Competitor | Price | What's included | DesignEase position |
|---|---|---|---|
| Programa | $59/user/mo first 3 users, $29 after, 20% off annual | Project management, specs, client portal. https://programa.design/pricing (checked 2026-10-14) | Signature slightly above, because it adds a local material library, BOQ and AI renders |
| DesignFiles | $49 to $69/mo | E-design boards and renders. https://blog.designfiles.co/programa-alternatives/ (checked 2026-10-14) | Above, same reason |
| Houzz Pro | Sources disagree: $99 to $399/mo | CRM, marketing, 3D floor plans. https://www.capterra.com/p/199689/Houzz-Pro/ (checked 2026-10-14) | Below: Firm should cost less per seat than Houzz Pro's top tier |
| Material Bank | Free for designers, manufacturers pay | Sample logistics, catalog. https://www.architectmagazine.com/technology/products/material-bank-aspires-to-transform-product-selection-for-architects_o (2020 article) | Same model: free designer entry, supplier pays |

Mattoboard: Not found. No price source turned up.

None of these stock GCC suppliers or quote in BHD. Local inventory and local supplier quotes are what justify a premium over Programa, not the AI.

## 4. Unit economics check

Cost per user per month:
- AI credits. Estimate: if 1 credit is 1 image generation at $0.04 to $0.10, then 150 credits = $6 to $15 = 2.3 to 5.6 BHD. Not confirmed, replace with your real API bill.
- Hosting and storage. Estimate: 1 to 2 BHD per active user.
- Support. Estimate: 2 to 4 BHD per paying user in year one (WhatsApp support is common in the region).

| Tier | Price/mo | Est. cost/mo | Est. gross margin |
|---|---|---|---|
| Starter | 0 | 1 to 2 BHD | Negative, funded by supplier fees |
| Signature | 49 BHD | 5 to 12 BHD | 76% to 90% |
| Firm (3 seats) | 149 BHD | 20 to 45 BHD | 70% to 87% |
| Old Firm "unlimited", heavy user | 199 BHD | Estimate: 3,000 renders x $0.07 = $210 = 79 BHD, plus support | Under 55% and falling with use |

Break-even: fixed costs are not known. Placeholder: [monthly fixed cost in BHD] / 49 = Signature customers needed. Example only: at 4,000 BHD/mo fixed, 82 Signature customers, or 40 suppliers at 99 BHD.

Target blended ARPU: 60 to 70 BHD per paying designer account (mix of Signature and Firm), plus supplier revenue on top.

## 5. Pricing psychology

- Anchoring: show Firm first on the pricing page. 149 BHD for 3 seats makes 49 BHD look small.
- Decoy: none needed with a free tier. The 150 vs. 1,000 credit gap does that job: a studio with 2 designers will see Firm as better value than 2 Signature seats (98 BHD with 300 credits).
- Annual framing: "2 months free" instead of "20% off". The same discount reads as a gift, and Programa uses the same wording.

## 6. Launch pricing vs. scale pricing

- Launch, first 90 days of the new model: Signature at 39 BHD/mo for founding studios, capped at the first 50, locked for 12 months. Because the supplier side needs designers on the platform before suppliers will pay.
- Suppliers: free listing for the first 3 months, then 99 BHD. Charge per quote request from day one so you learn what a lead is worth.
- Grandfathering: current Essential customers move to Starter free plus 3 months of Signature. Current Signature customers drop to 49 BHD (a price cut, so tell them). Current Firm customers keep 199 BHD with unlimited AI for 12 months, then move to the per-seat plan.
- Raise prices when: (1) more than 30% of Signature accounts buy top-ups, (2) supplier quote requests per designer pass a level you can show suppliers, or (3) trial-to-paid conversion stays above 15% for 3 months, which means the price is not the barrier.

## Numbers to find
- [Real AI cost per credit from your API bill]
- [Monthly fixed costs]
- [Current paying customers per tier]
- [Number of active suppliers and what they would pay]

## 7. Commission on materials sold through the platform (added 2026-10-14)

Assumption: DesignEase takes an order and the supplier ships and invoices, so DesignEase charges the supplier a commission. It does not buy and hold stock.
Assumption: the commission is charged on the materials only, not on cutting, fabrication, installation or delivery.

Rule used: the commission has to fit inside the supplier's gross margin. A supplier should give up at most about a quarter of its margin for a sale it would not otherwise have made. This is a judgment, not a sourced benchmark.

What suppliers earn (gross margin):
- Independent tile distributors: 34.4% average, 39.4% for the best (https://www.floortrendsmag.com/articles/82996-how-the-high-profit-distributor-outfoxes-the-competition, about 14 years old)
- Flooring dealers: 37% average, per BizMiner as quoted by https://www.qfloors.com/stop-guessing-how-to-price-flooring-jobs-for-profit/
- Floor & Decor, tile, wood and stone retailer: 43.6% in fiscal 2025 (https://www.sec.gov/Archives/edgar/data/1507079/000162828026009770/fnd-20251225.htm)
- Quartz fabricators mark up slab cost 15% to 40% (https://slabwise.com/guides/wholesale-quartz-countertops)

What other marketplaces take:
- Houzz: 15% to 20% of the sale, from 2015 to 2018 reports (https://channelx.world/2018/10/marketplaces-2018-houzz/)
- Amazon: 8% for building materials in one guide, 15% for Tools and Home Improvement in another (https://www.runfutureproof.com/amazon-fees/tools)

| Category | Commission | Why |
|---|---|---|
| Porcelain tiles | 6% to 8% | Commodity, price-shopped per m², heavy and breakable. Margins about 34% |
| Ceramic tiles | 6% to 8% | Same as porcelain, lower price per m², so a higher % gets noticed |
| Wood and parquet | 8% to 10% | Flooring dealers around 37%. Fewer brands to compare, so less price shopping |
| Quartz, branded | 6% to 8% | Distributors hold territory deals and thin slab margins |
| Quartz, unbranded | 8% to 10% | More margin and more room for a platform fee |
| Natural stone (marble, granite) | 10% to 12% | Each slab is unique, so the designer cannot price-shop it. Highest value per order |

Mechanics:
- Start everyone at the low end for 6 months, then move suppliers who get the most orders to the top of the range.
- Cap the commission per order, for example [cap in BHD] on stone orders, so a large villa job does not push a supplier off the platform.
- Show suppliers the price, never mark it up to the designer. If the designer later finds the same tile cheaper at the showroom, trust in the platform ends.
- If DesignEase takes the commission, drop the per-quote fee (section 2) for suppliers who sell through checkout, so they are not charged twice.

Questions to answer before setting the final numbers:
- [Do designers in Bahrain already get a referral % from suppliers? If yes, the commission has to sit on top of it or replace it.]
- [Typical supplier margin in Bahrain per category. Ask 5 suppliers.]
- [Who pays for breakage and returns: supplier or platform?]
