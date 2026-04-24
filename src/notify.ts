/**
 * notify.ts — Telegram notification for Williams Entry Radar
 *
 * Sends the weekly executive summary to a Telegram chat.
 * Only called at the end of the Friday scheduler run.
 *
 * Env vars required:
 *   TELEGRAM_BOT_TOKEN — bot token from @BotFather
 *   TELEGRAM_CHAT_ID   — target chat or group ID
 */

import type { ScanResult } from "./scanner.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

function fmt(n: number | undefined, d = 1): string {
  if (n === undefined || n === null) return "—";
  return n.toFixed(d);
}

/**
 * Build a concise Telegram message from scan results.
 * Telegram supports MarkdownV2 — we use simple Markdown (parse_mode=Markdown).
 */
export function buildTelegramMessage(
  results: ScanResult[],
  weekLabel: string,
  xpozLines: string[] = []
): string {
  const s2 = results.filter((r) => r.signalLevel === "S2");
  const s1 = results.filter((r) => r.signalLevel === "S1");

  const lines: string[] = [];

  lines.push(`📡 *Williams Entry Radar — ${weekLabel}*`);
  lines.push(`Escaneados: ${results.length} | S2: ${s2.length} | S1: ${s1.length}`);
  lines.push("");

  // S2 — ATENCIÓN
  if (s2.length > 0) {
    lines.push("▶▶ *NIVEL 2 — ATENCIÓN (S2)*");
    for (const r of s2) {
      const hr = r.hrHistorical ? `${fmt(r.hrHistorical)}%` : "—";
      lines.push(`  \`${r.ticker}\` ${r.sector} T${r.tier} | HR:${hr} | AO:${fmt(r.ao, 3)} | AC:${fmt(r.ac, 3)} | ${r.weeksActive}w desde ${r.signalDate ?? "?"}`);
    }
    // Xpoz enrichment (if any)
    if (xpozLines.length > 0) {
      lines.push("");
      lines.push("🔎 *Confluencia Reddit (Xpoz)*");
      for (const l of xpozLines) lines.push(`  ${l}`);
    }
  } else {
    lines.push("▶▶ *NIVEL 2 — ATENCIÓN (S2):* Sin señales activas");
  }

  lines.push("");

  // S1 — OBSERVACIÓN (top 10 by HR to keep message manageable)
  if (s1.length > 0) {
    const top = s1.slice(0, 10);
    lines.push(`▷ *NIVEL 1 — OBSERVACIÓN (S1)* ${s1.length > 10 ? `(top 10 de ${s1.length})` : ""}`);
    for (const r of top) {
      const hr = r.hrHistorical ? `${fmt(r.hrHistorical)}%` : "—";
      lines.push(`  \`${r.ticker}\` ${r.sector} T${r.tier} | HR:${hr} | AC:${r.acColor} | ${r.weeksActive}w`);
    }
  } else {
    lines.push("▷ *NIVEL 1 — OBSERVACIÓN (S1):* Sin señales activas");
  }

  return lines.join("\n");
}

/**
 * Send message to Telegram.
 * Returns true if sent, false if skipped (missing env vars) or failed.
 */
export async function sendTelegram(text: string): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log("[notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification");
    return false;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: CHAT_ID,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[notify] Telegram API error: ${res.status} — ${err}`);
      return false;
    }

    console.log("[notify] Telegram message sent ✓");
    return true;
  } catch (err) {
    console.error(`[notify] Failed to send Telegram message: ${(err as Error).message}`);
    return false;
  }
}
