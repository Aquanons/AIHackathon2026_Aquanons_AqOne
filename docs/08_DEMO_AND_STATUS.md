# 08 — DEMO, CONTINGENCY & STATUS

## Judging weights — build toward these

| Criterion | Weight | Where it's won |
|---|---|---|
| **Technical Soundness** | **50%** | **The mentor's report — mentoring sessions, not the pitch** |
| Impact & Feasibility | 25% | Field research, deployment cost, who pays |
| Presentation | 15% | Storytelling, **live demo success**, Q&A defence |
| Innovation & Scalability | 10% | Creative impression, deployment path |

**Half the score comes from a mentor's judgement of your technical depth in
conversation.** Show them working hardware early. Bring a design question, not
a status update. Be explicit about what's simulated — mentors are technical and
will spot a fake instantly; labelling it yourself reads as competence.

---

## Demo script (5 minutes)

**1. Hook — 30s.**
> "We interviewed fishermen in New Washington. When they fish, *all of them* are
> in a cellular dead zone. Every safety app on the market stops working exactly
> where fishermen need it most."

**2. Stakes — 30s.**
MDRRMO currently learns about a capsizing hours later, by word of mouth.

**3. The demo — 2 min.**
- Hold up the phone. **Put it in airplane mode in front of the judges.**
- Press SOS.
- Narrate the delivery states as they advance: saved on phone → received by
  buoy → received by AqOne → MDRRMO responded.
- The dashboard across the room lights up.
- **Hand a judge the phone and let them press it.**

**4. How it works — 1 min.** One slide: phone → buoy WiFi → LoRa hop → gateway
→ backend → dashboard. Name the signed envelope and replay protection here,
unprompted — that's your cybersecurity answer delivered before anyone asks.

**5. What's real, what's next — 45s.** Read the status table below out loud.
Then:
> "Safety drives adoption, adoption generates catch data, catch data enables the
> model — in that order."

That single sentence pre-empts the AI question and reframes it as sequencing
rather than absence.

**6. Close — 15s.** Cost per buoy, buoys needed for coverage, who pays
(LGU/BFAR). Have real numbers.

### Rehearse the airplane-mode moment specifically

It is the entire pitch. If the room's WiFi could plausibly explain the result,
the demo proves nothing. Make the isolation visible and undeniable — hold the
phone up, show the airplane icon, let a judge verify it.

---

## Contingency ladder

Work down. Each rung is still a credible demo. **Decide the rung before you
walk on stage, not during.**

| Rung | Situation | What you do | What you say |
|---|---|---|---|
| **1** | Everything works | Full live demo, judge presses the button | Nothing extra |
| **2** | IMU dead | Sensor-bypass mode, button-triggered frame | "Sensing is bypassed; the mesh path is real" |
| **3** | Mesh unreliable in the room | Move nodes closer, lower spreading factor, retry | "We're at close range because of RF conditions in this hall" |
| **4** | Radio dead | Play the screencast, show the hardware physically | "This ran last night; here's the recording and the hardware" |
| **5** | Backend/network down | Screencast + architecture walkthrough | "Our deployment is unreachable from this venue; here's the recorded run" |

**Rung 4 is why the screencast exists. Record it on Day 2, not Day 3.** Once it
exists, every hardware risk drops from fatal to embarrassing.

---

## Q&A — one prepared answer each, everyone answers the same way

**"Is the mesh actually working or simulated?"**
> Answer precisely. If one hop is real and multi-hop isn't, say exactly that.
> "One real LoRa hop, phone to buoy to gateway. Multi-hop relay is implemented
> in firmware but we've only bench-tested two nodes."

**"What's your model's accuracy?"**
> "We deliberately didn't ship a model. With the catch data available, the
> target would be circular — predicting catch volume from catch volume. In a
> system that can flag zones for regulatory review, that has a real livelihood
> cost, so we scoped it post-MVP and built the safety layer that generates the
> data first."

**"How do you stop someone spoofing an SOS?"**
> "Per-device HMAC keys, signed frames, replay protection by message ID, and a
> timestamp window. Jamming we can't mitigate at this budget, and we say so."

**"What's the range?"**
> Give the number **you measured**, not the datasheet number.

**"Battery life?"**
> Duty-cycled SoftAP, LoRa listening continuously, solar sizing. Be honest that
> the demo unit runs the AP always-on.

**"What if the gateway is down?"**
> "Store-and-forward at every buoy with backoff retry, and multiple
> gateway-capable nodes. An SOS is never dropped from the queue."

**"Why not a satellite beacon / PLB?"**
> Cost per vessel. Have the price comparison ready — this is a small-scale
> fisherman's budget.

**"How much per buoy? Who pays?"**
> Have a number. LGU/BFAR procurement is the realistic path.

**"What happens when a buoy is stolen or lost?"**
> "The key is revoked in the device registry; frames from it are rejected."

---

## Status table — keep this true, update it live

This is the honesty artifact. It goes in the README, in the deck, and you read
it out loud. In v1 this had to be retrofitted across many files after claims had
drifted from reality; here it's maintained as you build.

| Capability | Status | Notes |
|---|---|---|
| SOS over LoRa mesh, phone offline | ⬜ | The core claim. Update the moment it works. |
| Signed frames + replay protection | ⬜ | |
| Store-and-forward at buoy | ⬜ | |
| Multi-hop relay (3+ nodes) | ⬜ | Likely bench-only — say so |
| Buoy hazard sensing (MPU6050) | ⬜ | Bypass mode if the IMU is dead |
| Dashboard live feed + acknowledge | ⬜ | |
| Deployed backend, healthcheck green | ⬜ | |
| Range measured on water | ⬜ | Record the metres |
| AI hotspot model | ❌ **Not built** | Deliberate — circular target, no data |
| Catch-decline detection | ❌ **Not built** | Deliberate — out of scope |
| Catch logging / photos | ❌ **Not built** | Deliberate |
| Push notifications | ❌ **Not built** | Roadmap |
| Aklanon localisation | ❌ **Not built** | Roadmap |

Legend: ✅ working & demonstrated · 🟡 partial (explain) · ⬜ not yet · ❌ deliberately out of scope

**Never mark something ✅ that hasn't been run end to end.** A judge finding one
false claim invalidates every true one.

---

## Submission checklist — treat as due 5:00 pm Aug 4

- [ ] Deadline confirmed **in writing** with organisers (the two documents disagree)
- [ ] GitHub repo **public** — private links are stated grounds for immediate disqualification
- [ ] Secret scan clean (`07_SECURITY.md`)
- [ ] README: setup instructions + this status table
- [ ] Demo URL live and reachable **from outside the venue network** — test on mobile data
- [ ] Pitch deck: problem-solution fit, AI architecture, data strategy & ethics
- [ ] **Hardware declared** in the deck, and how its data is used (explicitly required)
- [ ] External models/libraries cited (RadioLib, FastAPI, etc.)
- [ ] Screencast recorded and uploaded
- [ ] Status table matches reality

---

## Day 3 logistics

Closing Ceremony is **1:00–4:00 pm at Iloilo Convention Center** — a different
venue from Sam's 21 Hotel.

- Hard stop on code ~10:30 am.
- Pack hardware in something padded. Bring spares and the antennas.
- Confirm whether you pitch at Sam's 21 before moving venues.
- Bring: laptop chargers, phone chargers, a power strip, USB cables, the
  hotspot, and a printed copy of the status table.
