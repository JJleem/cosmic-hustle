import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const sqlite = new Database(path.join(process.cwd(), "cosmic-hustle.db"));
export const db = drizzle(sqlite, { schema });
