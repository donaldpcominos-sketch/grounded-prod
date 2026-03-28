export async function fetchBookRecommendations(books) {
  const response = await fetch("/.netlify/functions/book-recommendations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ books })
  });

  if (!response.ok) {
    throw new Error("Failed to fetch book recommendations");
  }

  return response.json();
}