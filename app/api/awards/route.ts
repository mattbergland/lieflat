const airportCode = /^[A-Z]{3}$/;
const dateValue = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const key = process.env.SEATS_AERO_API_KEY;
  if (!key) {
    return Response.json({ configured: false });
  }

  const incoming = new URL(request.url).searchParams;
  const origin = (incoming.get("origin") ?? "JFK").toUpperCase();
  const destination = (incoming.get("destination") ?? "NRT").toUpperCase();
  const start = incoming.get("start") ?? "";
  const end = incoming.get("end") ?? "";
  const cabin = incoming.get("cabin") === "first" ? "first" : "business";

  if (
    !airportCode.test(origin) ||
    !airportCode.test(destination) ||
    !dateValue.test(start) ||
    !dateValue.test(end) ||
    new Date(start) > new Date(end)
  ) {
    return Response.json({ error: "Enter a valid route and date range." }, { status: 400 });
  }

  const search = new URLSearchParams({
    origin_airport: origin,
    destination_airport: destination,
    start_date: start,
    end_date: end,
    cabin,
    order_by: "lowest_mileage",
    take: "200",
  });

  try {
    const response = await fetch(
      `https://seats.aero/partnerapi/search?${search.toString()}`,
      {
        headers: { "Partner-Authorization": key },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return Response.json(
        { error: "Seats.aero could not complete this search." },
        { status: response.status },
      );
    }

    const payload: unknown = await response.json();
    return Response.json(payload);
  } catch {
    return Response.json(
      { error: "Seats.aero is temporarily unavailable. Try again shortly." },
      { status: 502 },
    );
  }
}
