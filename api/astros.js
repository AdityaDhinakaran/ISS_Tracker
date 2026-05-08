export default async function handler(_request, response) {
  try {
    const apiResponse = await fetch("http://api.open-notify.org/astros.json");

    if (!apiResponse.ok) {
      throw new Error(`Open Notify returned ${apiResponse.status}`);
    }

    const data = await apiResponse.json();

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    response.status(200).json(data);
  } catch (error) {
    response.status(502).json({
      message: "Unable to fetch people in space",
      detail: error.message
    });
  }
}
