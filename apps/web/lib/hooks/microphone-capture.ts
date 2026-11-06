/** A late permission result must never start capture after release, navigation or lockdown. */
export async function acquireMicrophone(
  request: () => Promise<MediaStream>,
  stillRequested: () => boolean,
): Promise<MediaStream | null> {
  const stream = await request();
  if (stillRequested()) return stream;
  stream.getTracks().forEach(track => track.stop());
  return null;
}
