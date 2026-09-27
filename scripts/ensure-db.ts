// Used by `npm run dev`: reset and seed the local database if it doesn't exist yet.
import { exists, localDatabase, reset } from "./local-db";

const db = localDatabase();
if (!exists(db)) {
  console.log(`No database "${db.name}" yet. Creating and seeding it.`);
  reset(db);
}
