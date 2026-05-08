export default async function handler(_request, response) {
  const sources = [
    "https://api.wheretheiss.at/v1/satellites/25544",
    "http://api.open-notify.org/iss-now.json"
  ];

  for (const source of sources) {
    try {
      const apiResponse = await fetch(source);

      if (!apiResponse.ok) {
        throw new Error(`${source} returned ${apiResponse.status}`);
      }

      const data = await apiResponse.json();

      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=15");
      response.status(200).json(data);
      return;
    } catch {
      // Keep trying sources so the client gets the best available live position.
    }
  }

  response.status(502).json({
    message: "Unable to fetch ISS position"
  });
}
