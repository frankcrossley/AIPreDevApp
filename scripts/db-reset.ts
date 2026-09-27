// `npm run db:reset`: drop the local Postgres database, apply migrations, and re-seed.
// Refuses anything that isn't a database on this machine (ADR-014, ADR-037).
import { localDatabase, reset } from "./local-db";

reset(localDatabase());
