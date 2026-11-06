export function selectableQuote(quote) {
  return (
    Boolean(quote) &&
    quote.is_currently_open !== false &&
    quote.shop_status !== "closed"
  );
}

export function selectedQuote(sortedQuotes, selectedId) {
  if (selectedId) {
    const quote = sortedQuotes.find((item) => item.shop_id === selectedId);
    return selectableQuote(quote) ? quote : null;
  }
  return sortedQuotes.find(selectableQuote) || null;
}
