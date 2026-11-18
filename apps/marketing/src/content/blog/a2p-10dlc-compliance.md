---
title: "A2P 10DLC: Cost, Rules and Who Needs It"
description: "A2P 10DLC decides whether your automated texts reach anyone at all. Here's what it actually costs, how long it takes, and who really needs it in 2026."
date: 2026-11-18
tags: ["a2p 10dlc", "10dlc compliance", "a2p 10dlc registration", "business texting compliance", "ai agents"]
draft: false
---

A2P 10DLC is the system US carriers use to decide whether a business text message gets delivered at all, and it already has teeth. Since February 2025, carriers block unregistered automated or templated texts outright instead of just slowing them down. Registering means setting up a "brand" (your business's legal identity on file with the carriers) and a "campaign" (what you're actually texting about) through whichever platform sends your messages, and as of late 2026 a standard brand plus one campaign runs somewhere around $46 to register and about $10 a month to keep live. The part almost every guide on this skips: if you're an agency reselling automation to several clients, each client needs its own brand and campaign under its own legal identity, not one shared registration covering the whole roster.

## What Is A2P 10DLC, in Plain English?

A2P 10DLC stands for "application-to-person messaging on a 10-digit long code", which is a mouthful for a simple idea: it's the rulebook that governs texts sent by software instead of by a person typing on their own phone. "10DLC" just means the number doing the sending looks like a normal US phone number, the kind with an area code, rather than a short code like the five-digit numbers brands used to text from.

The system exists because carriers got tired of spam and robotexts riding along on regular phone numbers, which made it hard to tell a legitimate appointment reminder from a scam text pretending to be your bank. The Campaign Registry, a group the major US carriers set up together, now keeps a record of which business is sending what kind of message from which number. Three pieces make up a registration: the brand (who you are, tied to your EIN or business registration), the campaign (what you're sending, like appointment reminders or review requests), and the messaging provider or CSP that actually submits both to the carriers on your behalf. Get those three pieces registered and approved, and your texts carry a trust score that tells carriers to let them through.

## Who Actually Has to Register?

Anyone sending templated or automated business texts to US numbers needs to register, and volume has nothing to do with it. A business sending ten texts a day through a platform that uses the same message template every time counts as A2P traffic exactly the same as a company sending ten thousand, because carriers classify traffic by automation and templating, not by how busy you are. If a missed-call text-back, an appointment reminder sequence, or a review request goes out through software rather than someone manually typing each one from their personal phone, that's A2P 10DLC's jurisdiction.

The one real exception is a sole proprietor texting from their own personal number without any automation platform in the loop, which most small businesses outgrow the moment they want a reminder to fire automatically instead of someone remembering to send it by hand. Bringing your own phone number into a platform doesn't get you out of it either. The registration travels with the number and the use case, not with whichever app happens to be dialing it. And switching platforms doesn't erase the requirement: a new messaging provider still has to register your brand and campaign with the carriers before your texts go through, even if your old provider already did it once.

Picture a [chiropractic clinic](/industries/chiropractic) that books a scheduling tool mainly for calendar sync, then later turns on automated reminders once the front desk realizes how many patients forget appointments. The calendar sync itself, if nobody's texting through it, needs nothing. The moment reminders switch on, that same account is now sending A2P traffic and needs a registered brand and campaign, even though nothing about the clinic's size or call volume changed overnight. The trigger is the automation, not the growth.

## What Happens If You Just Skip It?

Your texts stop arriving, full stop. Since carriers moved to a total block in August 2023, an unregistered number sending automated or templated traffic doesn't get throttled or filtered down to the people most likely to open it. It gets rejected outright, and on Twilio's network that rejection comes back as error 30034, a flat refusal rather than a partial delivery. The caller who was supposed to get a "we missed you, what can we help with" text after a dropped call never sees it, and you have no way of knowing unless you're watching your delivery logs.

T-Mobile goes a step further than a simple block. Carriers can apply penalties of $2,000 to $10,000 per violation for unregistered traffic that still manages to slip through before getting caught, a number that turns a skipped $46 registration into an expensive mistake fast. AT&T and Verizon tend to block silently instead of fining, which sounds less painful until you realize silent failure means you might not notice your reminder sequence has been dead for weeks. On top of the carrier-side risk, sending unregistered automated texts without proper consent tracking also leaves you exposed to TCPA litigation, where statutory damages run $500 to $1,500 per message, a separate and much older legal risk that 10DLC registration doesn't replace, it just sits next to it.

A [home services](/industries/home-services) business is a good example of how this plays out in practice. A plumber sets up missed-call text-back on a Friday, the campaign never gets submitted for registration because nobody flagged it as a required step, and for three weeks every text the system tries to send after a dropped call just disappears. No error shows up on the business owner's phone, no customer complains about a bug, because from the customer's side there was never a text to notice missing. The owner only finds out when a competitor, who happened to answer that same caller's second attempt, gets the job instead, and by then there's no way to know how many calls went the same way.

## How Much Does A2P 10DLC Registration Actually Cost?

Registration costs less than most business owners expect once they've heard the words "carrier compliance", though the fees come in pieces rather than one flat number. A standard brand, the tier most established businesses land in, runs roughly $46 one time, made up of a $4.50 registration fee plus $41.50 for secondary vetting that most providers require for full trust. Campaign registration adds about $15 to vet the specific use case, like appointment reminders or lead follow-up, plus a recurring $10 a month to keep that campaign active.

| Fee | Typical cost |
|---|---|
| Brand registration (standard tier) | ~$46 one time ($4.50 + $41.50 vetting) |
| Campaign vetting | ~$15 one time |
| Monthly campaign fee | ~$10 a month |
| Per-message carrier surcharge | $0.0025 to $0.0045 per segment |

The per-message surcharge is the part that catches people off guard because it never shows up as a line item you approve once. AT&T charges $0.0035 per SMS segment each direction, while T-Mobile charges $0.0045 outbound and $0.0025 inbound, and those fractions of a cent get added automatically to every single text your automations send. A business running a few hundred reminder and review-request texts a month barely notices it. An agency running that volume across a dozen white-labeled clients should actually do the math before promising a client unlimited texting, because the carrier surcharge doesn't go away just because it's small per message.

## How Long Does Approval Actually Take?

Plan for about five to ten business days from submission to a fully approved, high-trust registration, not same-day activation. Brand verification for a standard, EIN-backed business typically clears in one to three business days, while a brand that needs secondary vetting can take five to ten days to clear the carriers' review. Campaign approval usually follows within one to seven days after the brand itself is verified, since carriers won't review a campaign tied to a brand they haven't cleared yet.

Two things slow this down further. A rejected submission, often over a mismatched business name or a website that doesn't clearly describe what the business does, adds at least another two to seven days for the resubmission and re-review cycle. And a toll-free number verification, which some providers use instead of a standard 10DLC brand for lower-volume senders, runs on its own separate timeline of two to three weeks, noticeably slower than the standard path. None of this is instant, which is exactly why registering before you need the texts to go out, not after a client is already waiting on a reminder sequence that won't send, matters more than it sounds like it should.

The ordering trips people up more than the length of the wait itself. A business that signs up for an automation platform on a Monday and expects reminders running by Wednesday is planning around the wrong timeline entirely, because the registration clock doesn't even start until the brand application goes in, and the campaign can't be submitted until the brand clears. Building a week of slack into onboarding, rather than promising a client same-week automation, avoids the awkward conversation where a reminder sequence everyone was counting on simply isn't live yet.

## Does Every Client Need Its Own Registration, or Can an Agency Share One?

Every client needs its own brand and campaign, registered under that client's own legal identity, not a shared registration running under the agency's name. The trust score and the sender identity carriers check both tie back to the EIN and business details on the brand, and that's the client's business, not yours. Pooling several unrelated small businesses under one agency-owned brand either gets flagged by the carriers' vetting process or, if it somehow clears, puts every client's deliverability at risk the moment any one of them triggers a spam complaint. One bad actor in a shared brand can tank the trust score for every client riding along on it.

This is the exact gap the generic 10DLC guides never mention, because most of them are written for a single business evaluating a texting tool, not for an agency reselling automation to a roster of clients under its own brand. If you're running [white-label software](/blog/white-label-saas-cost) for several SMB clients, budget the registration cost and the five-to-ten-day timeline into every new client's onboarding, the same way you'd budget setting up their calendar or their phone number. A platform that handles the automation itself, whether that's a [missed-call text-back](/blog/missed-call-text-back) sequence or an [appointment reminder](/industries/home-services) cadence, still can't make this step disappear, because the registration is a relationship between your client's business and the carriers, run through whichever messaging provider is doing the sending. What a good platform can do is walk each client through brand and campaign setup once, as part of turning the automation on, instead of leaving them to figure out The Campaign Registry on their own.

## What Should You Actually Do About This Right Now?

Start by checking whether the platform already running your texts, whether that's your CRM, your [review-request](/blog/google-reviews-legally) tool, or a standalone SMS app, has already registered a brand and campaign for your business, because plenty of platforms bundle this into onboarding and you may already be covered without realizing it. If you're not sure, ask directly and ask for the brand status, not just a general "yes we're compliant". A brand that's pending isn't the same as one that's approved, and pending status often comes with its own message restrictions while it waits.

If nobody has registered anything yet, the standard tier is worth the extra vetting fee for any business running appointment reminders, missed-call replies, or review requests on a regular cadence, since those all count as recurring automated traffic that carriers watch closely. Sole proprietors sending low volume without automation can often get by on a lower tier, but the moment you turn on anything that fires automatically, that exemption stops applying. Agencies managing several clients should treat registration as a line item in every onboarding checklist, budgeted at roughly $46 to $61 per client plus the five-to-ten-day wait, rather than something to patch after a client calls asking why their reminders stopped arriving.

## A2P 10DLC: The Questions People Actually Ask

**Does a sole proprietor need to register for A2P 10DLC?**
Only if automation is involved. A sole proprietor manually texting from their own phone is generally exempt, but the moment a platform sends templated or scheduled texts on their behalf, that traffic falls under A2P 10DLC like any other business.

**What's the difference between A2P 10DLC and TCPA?**
A2P 10DLC is a carrier-level registration system that decides whether your texts get delivered. TCPA is a federal consent law that decides whether you were legally allowed to send them in the first place. Registering for 10DLC doesn't satisfy TCPA consent requirements, and having TCPA-compliant opt-in doesn't register your brand with carriers, so a business running automated texts legally has to handle both pieces at once rather than treating either one as covering the other.

**How much does A2P 10DLC registration cost in 2026?**
A standard brand runs about $46 one time, campaign vetting adds roughly $15, and a monthly campaign fee of about $10 keeps it active, on top of a small per-message carrier surcharge of $0.0025 to $0.0045 per segment.

**How long does A2P 10DLC approval take?**
Plan on five to ten business days for a standard brand and its first campaign. Rejected submissions or toll-free verification can both push that timeline out further, so register well before you need the automation live.

**What happens if my texts get blocked under 10DLC?**
Carriers reject the message outright rather than delivering it late. On Twilio's network that shows up as error 30034. T-Mobile can also fine $2,000 to $10,000 per violation for unregistered traffic that gets through before being caught.

**Does my agency need a separate 10DLC registration for every client?**
Yes. Each client's brand has to be registered under that client's own legal identity and EIN, not a shared brand under the agency's name. Pooling clients under one brand risks every client's deliverability if any single one triggers a carrier flag.

## The Texts You're Already Sending Need This, Whether You Knew It or Not

A2P 10DLC is the baseline requirement for any automated message to reach anyone at all, not a tax reserved for businesses that text too much, and it quietly sits underneath every missed-call reply, every reminder, and every review request a modern small business or agency runs. Skipping it doesn't save money, it just delays a block that carriers now apply the moment they notice, often with no warning beyond a delivery log that stops looking healthy.

Agencies have the most to lose here, because the question isn't whether your own brand is registered, it's whether each client's is, under that client's own name. [Ownlevel](/) builds its SMS and email automations as event-driven workflows triggered by what's actually happening on a client's calendar or inbox, with a human still approving anything beyond the routine message before it reaches a real customer. None of that replaces the registration step, but it does mean you're not building a reminder sequence or a review-request flow from scratch on top of a compliance problem you'd otherwise have to solve alone. [Start free](/) and see what a properly registered, white-labeled automation setup looks like running under your own brand instead of someone else's.
