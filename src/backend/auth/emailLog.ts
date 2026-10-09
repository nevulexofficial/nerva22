import type { OutgoingEmail } from "@/backend/auth/sendEmail";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";

const LOG_PATH = `${RUNTIME_DATA_DIR}/email-log.json`;

interface LoggedEmail extends OutgoingEmail {
  timestamp: string;
}

/**
 * Dev fallback "delivery": prints the email to the console and appends it to
 * <runtime>/email-log.json. Used when no SMTP2GO_API_KEY is configured so local
 * development can read login codes without sending real mail.
 *
 * Never throws: a failed file write (read-only FS, weird paths on Windows)
 * must not break the login flow — the console log alone is enough.
 */
export async function logEmail(msg: OutgoingEmail): Promise<void> {
  console.log(`[email:dev] → ${msg.to} | ${msg.subject}`);
  console.log(msg.text);

  try {
    const entry: LoggedEmail = { timestamp: new Date().toISOString(), ...msg };

    let existing: LoggedEmail[] = [];
    const file = Bun.file(LOG_PATH);
    if (await file.exists()) {
      try {
        existing = (await file.json()) as LoggedEmail[];
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }
    }
    existing.push(entry);
    await Bun.write(LOG_PATH, JSON.stringify(existing, null, 2));
  } catch (err) {
    console.warn("[email:dev] could not persist email log:", err);
  }
}

