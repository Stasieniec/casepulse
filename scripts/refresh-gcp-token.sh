#!/usr/bin/env bash
# Refresh the short-lived GCP access token used by the Document AI ingest beat.
# (This lab account blocks service-account key creation, so we use a 1h token.)
# Run this right before a demo. Requires: gcloud authed as the GCP user.
set -euo pipefail
GCLOUD="${GCLOUD:-$HOME/google-cloud-sdk/bin/gcloud}"
TOKEN="$("$GCLOUD" auth print-access-token)"
printf '%s' "$TOKEN" | npx wrangler secret put GCP_ACCESS_TOKEN
echo "✅ GCP_ACCESS_TOKEN refreshed (valid ~1h). Document AI ingest is live again."
