import { getHome } from "@/lib/db";
import { WEDDING_PLACE } from "@/lib/mark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function icsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export async function GET() {
  const home = await getHome();
  const location = home.address.trim() || WEDDING_PLACE;
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ying and kel//Wedding//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:ying-kel-2027-04-10@wedding",
    "DTSTAMP:20261105T000000Z",
    "DTSTART;VALUE=DATE:20270410",
    "DTEND;VALUE=DATE:20270411",
    "SUMMARY:Ying & kel",
    `LOCATION:${icsText(location)}`,
    "DESCRIPTION:The wedding of Ying & kel. April 10\\, 2027.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="ying-kel.ics"',
      "Cache-Control": "no-store",
    },
  });
}
