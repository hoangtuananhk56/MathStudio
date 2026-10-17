/** Whole-document file access: read the open document as .docx bytes, open bytes as a new document. */

/** The current document as a .docx (Office common API, available since Office 2013). */
export function readWholeDocument(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(Office.FileType.Compressed, { sliceSize: 4 * 1024 * 1024 }, (res) => {
      if (res.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error(res.error.message));
        return;
      }
      const file = res.value;
      const chunks: Uint8Array[] = [];
      let index = 0;
      const next = () => {
        file.getSliceAsync(index, (slice) => {
          if (slice.status !== Office.AsyncResultStatus.Succeeded) {
            file.closeAsync();
            reject(new Error(slice.error.message));
            return;
          }
          chunks.push(new Uint8Array(slice.value.data as ArrayLike<number>));
          index++;
          if (index < file.sliceCount) {
            next();
            return;
          }
          file.closeAsync();
          const total = chunks.reduce((n, c) => n + c.length, 0);
          const out = new Uint8Array(total);
          let at = 0;
          for (const c of chunks) {
            out.set(c, at);
            at += c.length;
          }
          resolve(out);
        });
      };
      next();
    });
  });
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Opens .docx bytes as a new, unsaved Word document (WordApi 1.3). */
export async function openAsNewDocument(docx: Uint8Array): Promise<void> {
  await Word.run(async (ctx) => {
    ctx.application.createDocument(toBase64(docx)).open();
    await ctx.sync();
  });
}
