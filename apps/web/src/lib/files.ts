/** File → raw base64 (without the data-URL prefix) for upload endpoints. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/** "13 KB" / "2.4 MB" — human-readable file size. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Document types accepted for customer documents (mirrors the API's list). */
export const DOC_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.txt,.doc,.docx,.xls,.xlsx";

const DOC_EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  csv: "text/csv",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Resolve a file's mime, falling back to its extension — browsers sometimes
 *  report an empty type for CSVs and Office files. Null = unsupported. */
export function docMime(file: File): string | null {
  if (Object.values(DOC_EXT_TO_MIME).includes(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return DOC_EXT_TO_MIME[ext] ?? null;
}
