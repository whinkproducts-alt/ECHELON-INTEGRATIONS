# Twilio SMS briefing setup

The briefing is a daily text to the owner with four lines: sales, build, blockers, revenue. It is off until you turn it on.

## 1. Twilio account

1. Create or open a Twilio account.
2. Buy an SMS capable number that can text Canada. Note it in E.164 form, for example +14035550123.
3. Copy the Account SID (starts with AC) and the Auth Token from the Twilio console.
4. Trial accounts can only text numbers you have verified. Verify Victor's phone in the console first.
5. Alphanumeric sender IDs do not work for Canada or the US. Use the number.

## 2. Environment

Put these in apps/web/.env.local. That file is ignored by git. Never put real values in .env.example.

```
BRIEFING_SMS_ENABLED=true
BRIEFING_USER_ID=<WHINK user id that owns the ledger rows>
BRIEFING_SMS_TO=<Victor's number, E.164>
BRIEFING_SEND_TIME=16:15
BRIEFING_TZ=America/Edmonton
BRIEFING_START_DATE=2026-10-18
BRIEFING_END_DATE=2026-11-19
BRIEFING_REPORTS_DIR=<absolute path to the reports folder>
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=<your Twilio number, E.164>
```

Restart the server after changing them. The worker starts with the app.

## 3. Permission

Sending is an external action, so it goes through the permission engine as capability `sms_briefing_send`, Class B. Without a delegation or autonomy level 2 or higher, the send is denied and one DENIED row lands in the ledger each day. Create an active delegation for `sms_briefing_send` for the briefing user to allow it.

## 4. Reports

Each directorate lead drops one JSON file in BRIEFING_REPORTS_DIR. Missing fields show as "n/a" or "no report". Reports older than 36 hours are ignored. Unknown keys are dropped.

```json
{
  "directorate": "Sales",
  "reportedAt": "2026-10-20T20:00:00Z",
  "pipeline": { "emailsSent": 40, "demosBooked": 3, "conversionRatePct": 7.5, "setupFeesCollected": 1200 },
  "engineering": { "items": [{ "name": "DB schema", "percentComplete": 100 }, { "name": "Twilio", "percentComplete": 60 }] },
  "blockers": ["Waiting on Stripe keys"],
  "revenue": { "mrr": 800, "setupFeesYtd": 2400 }
}
```

## 5. Testing without a live text

Twilio has no SMS sandbox. It has test credentials instead.

1. In the console, open Account Settings, API keys and credentials, and copy the Test Credentials (a separate SID and token).
2. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to the test values and TWILIO_FROM_NUMBER=+15005550006.
3. Set BRIEFING_SMS_TO to a valid looking number, for example +14155550100. Do not use +15005550006 as the recipient. Test credentials never deliver a message.
4. Check the ledger for a VALIDATED row with tool `sms_briefing_send`.

The automated tests (`npx vitest run lib/__tests__/sms-briefing.test.ts`) mock Twilio and never touch the network.

## 6. Message size

The body is plain GSM-7 text, capped at 459 characters (3 segments of 153). A message over 160 characters is sent as one concatenated text, which carriers join on the phone. Four lines of numbers do not fit in 160 characters, so expect 2 or 3 segments.

## 7. Monitoring

- Each send writes one ledger row: VALIDATED (sent), FAILED (Twilio error, with the reason and Twilio error code), or DENIED (no permission).
- A failure retries up to 3 times a day, 5 minutes apart, inside a 90 minute catch up window. A Twilio outage never crashes the app.
- The log never contains the auth token or the full phone number. Only the last two digits.
- To check the first week, filter the ledger for tool `sms_briefing_send` and status FAILED. The goal is zero.
