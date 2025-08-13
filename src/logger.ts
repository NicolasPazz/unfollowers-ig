import winston from "winston";
import { format } from "date-fns-tz";

const timezoned = () => {
  return format(new Date(), "yyyy-MM-dd HH:mm:ss", { timeZone: "America/Argentina/Buenos_Aires" });
};

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.printf(info => `${timezoned()} [${info.level.toUpperCase()}]: ${info.message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "app.log" })
  ]
});