# Troubleshooting

## Google sign-in returns `redirect_uri_mismatch`

The Google Cloud OAuth client must contain the exact callback URL used by the server. For the default local setup this is:

```text
http://localhost:3000/auth/google/callback
```

Set `GOOGLE_REDIRECT_URI` to the same value. For a deployed backend, use its HTTPS callback URL in both Google Cloud and the deployment environment.

## A Twilio call says "application error"

Twilio placed the call but could not fetch its next instruction. Check the call in Twilio Console under Monitor > Logs > Calls, then inspect the request URL and error code. Confirm that `NGROK_URL` or the deployed backend URL is reachable over HTTPS and that `GET /healthz` returns `200` publicly.

For local calls, keep both `npm run dev` and `ngrok http 3000` running. In production, set `NGROK_URL` to the deployed backend's public HTTPS URL and enable `REQUIRE_TWILIO_SIGNATURES=true`.

## Bill extraction returns `needs_confirmation`

The app could not obtain usable text from the upload. PDFs require `pdftotext`; PNG/JPEG uploads require Tesseract. Install the relevant local binary, upload a clearer file, or enter the bill details manually. The extractor supports PDF, PNG, JPEG, TXT, Markdown, and JSON up to 8 MB.

## No Maya call audio

Set `MAYA_API_KEY`, `RINGSIDE_VOICE_ID`, and `REP_VOICE_ID`, and ensure `ffmpeg` is available on `PATH`. Run `npm run test:tts` to exercise synthesis. When audio generation is unavailable, the Twilio path uses `<Say>` as its fallback.

## Production does not start

Production startup requires a valid `DATABASE_URL`, Google OAuth client configuration, and `AUTH_SESSION_SECRET`. Review `npm run preflight` and the deployment environment. `ALLOWED_ORIGINS` must list the frontend origin when the browser and API are hosted separately.
