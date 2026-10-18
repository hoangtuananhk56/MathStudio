/** Pictures handed from the document to a dialog. */

/** A picture as a JPEG data URL no larger than `maxSide` pixels (dialogs get it through localStorage). */
export async function shrinkPicture(dataUrl: string, maxSide = 2600): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  if (k === 1 && dataUrl.length < 3_000_000) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}
