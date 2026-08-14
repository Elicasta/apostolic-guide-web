# Video Producer deployment

Production infrastructure for Apostolic Guide Video Producer.

## Private media storage

- Vercel Blob store: `apostolic-guide-video-producer`
- access: private
- region: `iad1` (Washington, D.C., USA East)
- connected project environment prefix: `BLOB`
- runtime write credential: `BLOB_READ_WRITE_TOKEN`
- companion connection variables: `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`

Raw source recordings, render manifests, and review masters must remain private. The application stores durable Blob pathnames and generates short-lived signed URLs for workers and authenticated preview access.

The Blob connection is attached to both Production and Preview Vercel environments. A fresh deployment is required after adding or changing project environment variables so the running functions receive the updated environment.

## AI isolation

Video Producer uses `VIDEO_PRODUCER_OPENAI_API_KEY` in Vercel and GitHub Actions. The existing application `OPENAI_API_KEY` remains isolated for the established publishing workloads.
