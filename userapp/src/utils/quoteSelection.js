export function selectableQuote(quote) {
  return (
    Boolean(quote) &&
    quote.is_currently_open !== false &&
    quote.shop_status !== "closed"
  );
}

// Labels only a clear winner among orderable shops; ties get no label.
export function quoteTags(quotes) {
  const orderable = quotes.filter(selectableQuote);
  const tags = {};
  const award = (label, measure) => {
    const measured = orderable.filter((q) => Number.isFinite(measure(q)));
    if (measured.length < 2) return;
    const best = Math.min(...measured.map(measure));
    const winners = measured.filter((q) => measure(q) === best);
    if (winners.length === 1)
      tags[winners[0].shop_id] = [...(tags[winners[0].shop_id] || []), label];
  };
  award("Cheapest", (q) => q.total_amount);
  award("Closest", (q) => q.distance_km);
  return tags;
}

export function selectedQuote(sortedQuotes, selectedId) {
  if (selectedId) {
    const quote = sortedQuotes.find((item) => item.shop_id === selectedId);
    return selectableQuote(quote) ? quote : null;
  }
  return sortedQuotes.find(selectableQuote) || null;
}
