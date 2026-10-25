# Zetaris setup for RecallGuard

RecallGuard reads four tables through Zetaris's SQL REST API (`/api/v1.0/query/sql/start`, then `/page`, then `/close`):

| Table | Source | Rows (sample) |
|---|---|---|
| `recallguard.inventory` | Pharmacy shelf stock export (synthetic, 11-digit NDCs) | 19 |
| `recallguard.fda_ndc` | openFDA NDC directory | 18 |
| `recallguard.fda_recalls` | openFDA drug enforcement reports, 2025 onward | ~1,400 |
| `recallguard.fda_recall_ndc` | recall → product NDC links | ~2,400 |

These are four separate sources with different NDC formats. Zetaris federates them so the agents can join them in one SQL query.

## 1. Run Zetaris Freemium (core services only)

```bash
git clone https://github.com/zetaris/Freemium.git zetaris-freemium
cd zetaris-freemium
docker login                     # account must have Zetaris image access (request it first)
touch .env                       # compose file references it
docker compose up -d zetaris-db zetaris-server zetaris-api zetaris-gui
docker compose exec -it zetaris-server /home/zetaris/lightning/bin/dev-account.sh admin@zetaris.com 'P@55w0rd!' Zetaris
```

Start only these four services. The compose file also defines Ollama (it needs a GPU), OpenSearch, and an avatar service, which would overload a 16 GB machine. RecallGuard doesn't use them.

- GUI: http://localhost:9001
- REST API: http://localhost:8888

## 2. Stage the data

```bash
cd recallguard
npm run zetaris:stage            # copies data/sample/*.csv into zetaris-freemium/customer_data/<org>/file-store/recallguard/
```

## 3. Register the tables

In the Zetaris GUI, create a Lightning database named `recallguard`. Then register each staged CSV as a file-store table, using the file name without `.csv` as the table name and with "header row" enabled. Follow the steps in the HackOS **Participant Setup Guide** (DATA workshop). Optionally, register the live openFDA enforcement endpoint as a web-API table, as the guide shows.

Check the setup in the Zetaris SQL editor:

```sql
SELECT COUNT(*) FROM recallguard.inventory;
SELECT rn.product_ndc, r.recall_number, r.classification
FROM recallguard.fda_recall_ndc rn JOIN recallguard.fda_recalls r ON r.recall_number = rn.recall_number
LIMIT 5;
```

## 4. Point RecallGuard at Zetaris

In `.env`:

```
SAMPLE_MODE=false
ZETARIS_BASE_URL=http://localhost:8888
ZETARIS_ORG_ID=<your org id>
ZETARIS_USER=admin@zetaris.com
ZETARIS_PASSWORD=<password>
ZETARIS_DATABASE=recallguard
```

On startup, RecallGuard runs a health-check query. If Zetaris is unreachable, it falls back to the cached sample, and the trace and UI show "Data: sample".
