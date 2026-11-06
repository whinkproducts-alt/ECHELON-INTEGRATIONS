/** Every mark appears once per bag; bag boundaries never repeat a mark. */
export function logoBag(count: number, previous: number, random = Math.random): number[] {
  const bag = Array.from({length: count}, (_, index) => index);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  if (bag.length > 1 && bag[0] === previous) [bag[0], bag[1]] = [bag[1], bag[0]];
  return bag;
}
