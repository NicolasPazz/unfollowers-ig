import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Session cookies live in the project root.
export const COOKIES_PATH = path.resolve(__dirname, "../cookies.json");

// Rate-limit knobs for the bulk unfollow (read from .env).
export const MAX_PER_DAY = Number(process.env.MAX_PER_DAY);
export const MAX_PER_HOUR = Number(process.env.MAX_PER_HOUR);
