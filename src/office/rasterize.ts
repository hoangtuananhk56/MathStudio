/** SVG -> base64 PNG via a canvas (the raster fallback Word stores next to the SVG). */
export function rasterizeSvg(svg: string, widthPx: number, heightPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, widthPx);
      canvas.height = Math.max(1, heightPx);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas is not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png').slice('data:image/png;base64,'.length));
    };
    img.onerror = () => reject(new Error('Could not rasterize the equation SVG'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
