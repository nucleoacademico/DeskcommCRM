const GENERIC_MIMES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/binary",
]);

const KNOWN_MIMES = new Set([
  "audio/aac",
  "audio/amr",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/3gpp",
  "video/mp4",
  "application/mp4",
  "application/pdf",
]);

const EXTENSION_MIME: Record<string, string> = {
  aac: "audio/aac",
  amr: "audio/amr",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  pdf: "application/pdf",
  png: "image/png",
  webm: "audio/webm",
  webp: "image/webp",
};

export class UnknownMediaMimeError extends Error {
  constructor() {
    super("media_mime_unknown");
    this.name = "UnknownMediaMimeError";
  }
}

function normalizedKnown(value: string | null | undefined): string | null {
  const mime = (value ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (GENERIC_MIMES.has(mime) || !KNOWN_MIMES.has(mime)) return null;
  return mime;
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  return signature.every((byte, index) => buffer[index] === byte);
}

function magicMime(buffer: Buffer, kind?: string | null): string | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return "audio/mpeg";
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0) return "audio/mpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return kind === "audio" ? "audio/mp4" : "video/mp4";
  }
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return kind === "video" ? "video/webm" : "audio/webm";
  }
  return null;
}

function mimeFromUrl(url: string | null | undefined, kind?: string | null): string | null {
  if (!url) return null;
  try {
    const pathname = new URL(url).pathname;
    const extension = pathname.split(".").pop()?.toLowerCase();
    const found = extension ? EXTENSION_MIME[extension] : undefined;
    if (found === "video/mp4" && kind === "audio") return "audio/mp4";
    return found ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve o tipo final que será persistido e entregue ao modelo. Tipos
 * genéricos nunca vencem sinais específicos e ausência de prova falha fechada.
 */
export function resolveInboundMediaMime(input: {
  providerMime?: string | null;
  metadataMime?: string | null;
  buffer: Buffer;
  sourceUrl?: string | null;
  kind?: string | null;
}): string {
  return (
    normalizedKnown(input.providerMime) ??
    normalizedKnown(input.metadataMime) ??
    magicMime(input.buffer, input.kind) ??
    mimeFromUrl(input.sourceUrl, input.kind) ??
    (() => {
      throw new UnknownMediaMimeError();
    })()
  );
}
