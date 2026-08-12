# Telephony

QuikCRM can place calls for you. You click a call button on a record, the system dials your phone and then the customer, and once the call ends you record what happened.

**Where to find it:** Sidebar → Activities → **Telephony**

**Available to:** Sales User, Sales Manager, Administrator.

---

## In this section

- **Making calls** — this page
- **[Recording a call outcome](call-disposition.md)** — the form you complete after a call

---

## Before you can call

Two things must be in place:

1. **Your organisation's calling provider must be configured.** This is an administrator task. The Dialer page shows the current status, and displays a notice if it is not ready.
2. **Your own calling number must be set.** Go to **Settings → My Profile** and fill in **Mobile**. This is the number the system rings first.

> **Gotcha.** Your calling number is stored in the browser where you set it. If you use QuikCRM on another computer or in a different browser, set it again there.

---

## Where you can start a call

| From | How |
|---|---|
| **Lead list** | The call icon on any row |
| **Lead detail** | The call button in the header, or Start call from the command palette |
| **Dialer** | Type or paste a number into the keypad |
| **Contact records** | The call control on the record |

The call control is disabled when the record has no phone or mobile number.

Where a record holds a number in either the Phone or the Mobile field, QuikCRM uses whichever is present.

---

## How a call works

1. You start the call.
2. The system places the call through your organisation's provider.
3. The in-call view opens and shows the call's live status and duration, refreshing every couple of seconds.
4. When the call ends — by you or by the customer — the outcome form opens automatically.
5. You record the outcome. See [Recording a call outcome](call-disposition.md).

Call details such as duration and any recording arrive from the provider shortly afterwards and are attached to the call record. They may not be present the instant the call ends.

[SCREENSHOT RECOMMENDED]
Show: the Dialer page with the keypad and the provider status panel.

---

## The Dialer page

**Sidebar → Activities → Telephony**

The page has two parts:

- **Quick Dial** — a keypad for calling a number that is not attached to a record.
- **Provider status** — whether calling is configured, which connection is in use, and the default calling number.

If calling is not configured, a notice appears at the top of the page explaining what your administrator needs to set up.

---

## Call recordings

Where your provider supplies a recording, it appears against the call in the lead's Timeline and Call Disposition tabs, with a player.

Recordings arrive after the call, not during it.

---

## Important

- Calls placed through QuikCRM are logged automatically. You do not need to create an activity for the call itself — the outcome form does that.
- A call placed outside QuikCRM (on your handset directly) is not logged. Use **Log activity** to record it.

## Permissions

Making calls requires access to the Telephony module — included in the standard Sales User role. Administrators configure the provider and the available call outcomes.

## Troubleshooting

| Problem | Likely cause | What to do |
|---|---|---|
| The call button is greyed out | The record has no phone or mobile number | Add a number to the record |
| A notice says the provider is not configured | Calling is not yet set up for your organisation | Contact your administrator |
| My phone does not ring | Your calling number is missing or wrong | Check Settings → My Profile → Mobile |
| The number is right but calls still fail | Your organisation's connection to the provider may not be permitted from your network | Contact your administrator |
| No recording appeared | Recordings arrive after the call, and not every provider supplies them | Wait, then refresh the lead; ask your administrator if it never appears |

## Related features

- [Recording a call outcome](call-disposition.md) · [Activities](../activities.md) · [Lead details](../leads/lead-details.md)
